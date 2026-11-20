import AxeBuilder from '@axe-core/playwright'
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { applyPatch, jsonEqual, type JsonValue } from '../shared/patch.ts'
import type { RoomView, ServerMessage } from '../shared/protocol.ts'
import { joinRoom, newPerson } from './helpers.ts'

// The site QA sweep (2026-11): every board game through the real room, from the waiting room to the
// result and a rematch. The people are real pages; their moves are the room's own legal actions
// (GameProjection.legal), sent on each page's socket through a relay, so the pages render every
// position a game can reach without a driver per game. Clicking through a game's own buttons is what
// each game's spec does; this one is about getting every game to its end on every screen size.

/** One person's room socket, followed through a relay: the room as their page has it */
export class Seat {
  view: RoomView | null = null
  rev = -1
  /** Welcomes seen: a reload makes one more */
  welcomes = 0
  /** The countdowns running now, as the room last said */
  timerMs = 0
  refusals: string[] = []
  private server: { send(message: string): void } | null = null

  readonly page: Page
  readonly name: string

  constructor(page: Page, name: string) {
    this.page = page
    this.name = name
  }

  async relay(): Promise<void> {
    await this.page.routeWebSocket(/\/ws\//, (client) => {
      const server = client.connectToServer()
      this.server = server
      client.onMessage((message) => server.send(message))
      server.onMessage((message) => {
        client.send(message)
        if (typeof message === 'string' && message !== 'pong') this.take(JSON.parse(message) as ServerMessage)
      })
    })
  }

  private take(message: ServerMessage): void {
    if (message.t === 'welcome' || message.t === 'snapshot') {
      this.view = message.state
      this.rev = message.rev
      if (message.t === 'welcome') this.welcomes++
    } else if (message.t === 'patch' && this.view !== null) {
      this.view = applyPatch(this.view as unknown as JsonValue, message.ops) as unknown as RoomView
      this.rev = message.rev
    } else if (message.t === 'timer') {
      this.timerMs = Math.max(0, ...message.timers.map((timer) => timer.remainingMs))
    } else if (message.t === 'error') {
      this.refusals.push('error' in message ? `${message.code}:${message.error.gameError}` : message.code)
    }
  }

  send(action: JsonValue): void {
    this.server?.send(JSON.stringify({ t: 'action', action }))
  }

  get legal(): JsonValue[] {
    return this.view?.room.status === 'playing' ? ((this.view.game?.legal ?? []) as JsonValue[]) : []
  }
}

/**
 * A small seeded stream (mulberry32), so that a failing game can be played again with the same seed.
 * Not a bare LCG: its low bits alternate, and `% 2` would pick the same of two moves every time
 */
export function seeded(seed: number): (n: number) => number {
  let state = seed >>> 0
  return (n) => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32) * n)
  }
}

export type Problems = { hard: string[]; soft: string[] }

/** Console errors, page errors and failed requests, from now on */
export function watchConsole(page: Page, name: string, problems: Problems): void {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const { url, lineNumber } = message.location()
      problems.hard.push(`${name} console error: ${message.text()} (${url.replace(/^.*\/src\//, 'src/')}:${lineNumber})`)
    }
    else if (message.type() === 'warning') problems.soft.push(`${name} console warning: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.hard.push(`${name} uncaught: ${error.message}`))
}

/** A whole page scrolling sideways, or a raw i18n key on screen */
export async function checkLayout(page: Page, where: string, problems: Problems, zh: boolean): Promise<void> {
  const found = await page.evaluate((zhPage) => {
    const out: { hard: string[]; soft: string[] } = { hard: [], soft: [] }
    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth + 1) {
      // The widest culprit, to name in the report
      let widest = ''
      let right = root.clientWidth
      for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
        const box = element.getBoundingClientRect()
        if (box.right > right + 1 && box.width > 0) {
          right = box.right
          widest = `${element.tagName.toLowerCase()}${element.className ? '.' + String(element.className).split(' ')[0] : ''} "${(element.textContent ?? '').trim().slice(0, 30)}"`
        }
      }
      out.hard.push(`scrolls sideways: ${root.scrollWidth} > ${root.clientWidth} (${widest})`)
    }
    const text = document.body.innerText
    const keys = text.match(/\b(?:games|room|kart|lobby|ui)\.[a-z][\w-]*\.[\w.-]+/g)
    if (keys) out.hard.push(`raw i18n keys: ${[...new Set(keys)].slice(0, 5).join(', ')}`)
    if (zhPage) {
      const english = text.match(/\b[A-Za-z]{3,}(?: [A-Za-z']{2,}){3,}/g)
      if (english) out.soft.push(`English in the Chinese page: ${[...new Set(english)].slice(0, 3).join(' | ')}`)
    }
    // Buttons in view that something else covers at their centre
    for (const button of document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')) {
      const box = button.getBoundingClientRect()
      if (box.width < 4 || box.height < 4) continue
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
      const style = getComputedStyle(button)
      if (style.visibility === 'hidden' || style.pointerEvents === 'none' || Number(style.opacity) === 0) continue
      const top = document.elementFromPoint(x, y)
      // A sticky bar over a button scrolled under it is only where the page is scrolled to
      let pinned = false
      for (let up: Element | null = top; up && up !== document.body; up = up.parentElement) {
        const position = getComputedStyle(up).position
        if (position === 'sticky' || position === 'fixed') pinned = true
      }
      if (top && !pinned && top !== button && !button.contains(top) && !top.contains(button)) {
        const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().slice(0, 30)
        const over = `${top.tagName.toLowerCase()} "${(top.textContent ?? '').trim().slice(0, 20)}"`
        out.soft.push(`button "${label}" covered by ${over}`)
      }
    }
    // Text cut short with an ellipsis
    for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
      if (element.children.length > 0 || element.clientWidth === 0) continue
      if (getComputedStyle(element).textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1) {
        out.soft.push(`text cut short: "${(element.textContent ?? '').trim().slice(0, 30)}"`)
      }
    }
    return out
  }, zh)
  problems.hard.push(...found.hard.map((line) => `${where}: ${line}`))
  problems.soft.push(...found.soft.map((line) => `${where}: ${line}`))
}

const BLOCKING = new Set(['serious', 'critical'])

export async function checkAxe(page: Page, where: string, problems: Problems): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze()
  for (const violation of violations) {
    if (!BLOCKING.has(violation.impact ?? '')) continue
    const nodes = violation.nodes
      .slice(0, 3)
      .map((node) => `${node.html.slice(0, 80)} (${(node.failureSummary ?? '').split('\n').slice(1).join(' ').slice(0, 160)})`)
      .join('; ')
    problems.hard.push(`${where}: axe ${violation.impact} ${violation.id} at ${nodes}`)
  }
}

export type Screen = { name: string; options: BrowserContextOptions; zh: boolean }

export const SCREENS: readonly Screen[] = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 } }, zh: false },
  { name: 'phone360', options: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }, zh: false },
  {
    name: 'phone390-zh',
    options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-TW' },
    zh: true,
  },
]

/** `count` people in a new room of `gameId`, each with a followed socket, everyone seated */
export async function table(
  browser: Browser,
  gameId: string,
  count: number,
  screen: Screen,
  problems: Problems,
  options?: Record<string, unknown>,
): Promise<Seat[]> {
  const seats: Seat[] = []
  const names = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay']
  for (let index = 0; index < count; index++) {
    const page = await newPerson(browser, { reducedMotion: 'reduce', ...screen.options })
    const seat = new Seat(page, names[index])
    watchConsole(page, seat.name, problems)
    await seat.relay()
    if (index === 0) {
      const response = await page.request.post('/api/rooms', { data: options ? { gameId, options } : { gameId } })
      expect(response.ok(), `create a ${gameId} room`).toBe(true)
      const { id } = (await response.json()) as { id: string }
      await page.goto(`/r/${id}`)
    } else {
      await page.goto(seats[0].page.url())
    }
    await joinNamed(page, seat.name, screen.zh)
    seats.push(seat)
  }
  await expect.poll(() => Object.values(seats[0].view?.members ?? {}).filter((m) => m.seat !== null).length).toBe(count)
  return seats
}

/** joinRoom, in either language */
async function joinNamed(page: Page, name: string, zh: boolean): Promise<void> {
  if (!zh) return joinRoom(page, page.url(), name)
  const field = page.getByRole('textbox', { name: '暱稱' })
  await field.fill(name)
  await field.press('Enter')
  await expect(page.getByRole('heading', { name: '座位' })).toBeVisible()
}

export type PlayLog = { actions: number; refused: number }

/**
 * Plays random legal moves until the game is over or `until` says stop. Each move waits for the
 * mover's next patch. With nobody able to move, waits on the room's countdown, and calls the game
 * stuck past it.
 */
export async function playOn(
  seats: readonly Seat[],
  pick: (n: number) => number,
  log: PlayLog,
  until: (log: PlayLog) => boolean = () => false,
  maxActions = 1500,
): Promise<void> {
  const host = seats[0]
  let idleSince = Date.now()
  while (!host.view?.game?.over && !until(log)) {
    if (log.actions >= maxActions) throw new Error(`no end after ${maxActions} moves`)
    const able = seats.filter((seat) => seat.legal.length > 0)
    if (able.length === 0) {
      const allowed = Math.max(...seats.map((seat) => seat.timerMs)) + 15_000
      if (Date.now() - idleSince > allowed) {
        throw new Error(`stuck: nobody can move and no countdown ends (status ${host.view?.room.status})`)
      }
      await host.page.waitForTimeout(100)
      continue
    }
    const seat = able[pick(able.length)]
    const legal = seat.legal
    const action = legal[pick(legal.length)]
    const rev = seat.rev
    const refusals = seat.refusals.length
    seat.send(action)
    log.actions++
    await expect
      .poll(() => seat.rev > rev || seat.refusals.length > refusals, { timeout: 10_000, intervals: [10, 20, 50] })
      .toBe(true)
    if (seat.refusals.length > refusals) log.refused++
    // Everyone's page catches up before the next move is chosen from it
    await expect.poll(() => seats.every((other) => other.rev >= seat.rev), { timeout: 5_000, intervals: [10, 20] })
      .toBe(true)
      .catch(() => {})
    idleSince = Date.now()
  }
}

/** The game as `seat`'s page has it */
export const gameOf = (seat: Seat): JsonValue => (seat.view?.game ?? null) as unknown as JsonValue

export { jsonEqual }
