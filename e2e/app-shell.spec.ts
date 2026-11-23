import { expect, test, type Page } from '@playwright/test'
import { GAME_META } from '../shared/games/lobby.ts'
import { joinRoom, newPerson } from './helpers.ts'
import { table, type Problems, type Screen } from './sweep.ts'

// 2026-11-23 (the owner: "once full screen it must not scroll; make it like an online game installed
// on the desktop, not a web page"): every board game's room is one screen (docs/DESIGN.md §4.1). For
// each game, at its fewest players, the waiting room and the first turn at four sizes (a laptop, a
// big monitor, a phone on its side and upright): the page cannot be scrolled either way, the game's
// stage and the dock are on the screen, and the panels behind the buttons open and close from the
// keyboard with the focus going in and coming back. The result is the sweep's (e2e/smoke-games.spec.ts,
// whose layout check fails a room page that scrolls).
//
//   SHELL_GAMES=holdem,palace E2E_PORT=10901 npx playwright test app-shell --workers=1

// The race draws in software here (as e2e/kart-race.spec.ts)
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })

export const SIZES = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '844x390', width: 844, height: 390 },
  { name: '390x844', width: 390, height: 844 },
] as const

const GAMES = Object.entries(GAME_META)
  .filter(([id, meta]) => id !== 'kart' && !('unlisted' in meta && meta.unlisted))
  .map(([id, meta]) => ({ id, players: meta.minPlayers as number }))
const SHOTS = process.env.SHELL_SHOTS === '1'
const picked = process.env.SHELL_GAMES?.split(',').filter(Boolean)

const DESKTOP: Screen = { name: 'desktop', options: { viewport: { width: 1280, height: 720 } }, zh: false }

/** What the page and the room's parts measure: the page's scroll and where the parts are */
async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    // A try at scrolling the page itself, as a wheel or a finger would
    window.scrollTo(0, 10_000)
    const scrolled = window.scrollY
    window.scrollTo(0, 0)
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        overflow: element.scrollHeight - element.clientHeight,
        zoom: (element.firstElementChild as HTMLElement | null)?.style.zoom ?? '',
        inner: element.firstElementChild?.getBoundingClientRect().height ?? 0,
        client: element.clientHeight,
      }
    }
    return {
      shell: root.hasAttribute('data-app-shell'),
      scrollY: scrolled,
      tall: root.scrollHeight - root.clientHeight,
      wide: root.scrollWidth - root.clientWidth,
      width: innerWidth,
      height: innerHeight,
      stage: box('[data-game-stage]'),
      dock: box('[data-dock]'),
      body: box('[data-room-body]'),
    }
  })
}

type Measured = Awaited<ReturnType<typeof measure>>

function checkFits(m: Measured, where: string, problems: Problems, parts: ('stage' | 'dock' | 'body')[]) {
  if (!m.shell) problems.hard.push(`${where}: no app shell`)
  if (m.scrollY > 0 || m.tall > 0) problems.hard.push(`${where}: the page scrolls down (${m.tall}px, scrollY ${m.scrollY})`)
  if (m.wide > 0) problems.hard.push(`${where}: the page scrolls sideways (${m.wide}px)`)
  for (const part of parts) {
    const box = m[part]
    if (!box) {
      problems.hard.push(`${where}: no ${part}`)
      continue
    }
    if (box.top < -1 || box.bottom > m.height + 1 || box.left < -1 || box.right > m.width + 1) {
      problems.hard.push(`${where}: ${part} off the screen (${JSON.stringify(box)})`)
    }
  }
  if (m.stage && m.stage.overflow > 0) problems.soft.push(`${where}: the stage scrolls inside by ${m.stage.overflow}px (zoom ${m.stage.zoom || 1}, ${m.stage.inner} in ${m.stage.client})`)
}

/** A panel behind a button: Enter opens it with the focus inside, Esc closes it and gives the focus back */
async function panelRoundTrip(page: Page, where: string, problems: Problems) {
  const dock = page.locator('[data-dock]').last()
  const button = dock.getByRole('button', { name: /^(Chat|Members|Invite)/ }).first()
  if ((await button.count()) === 0) {
    // Wide: the side column is the panel, on the screen all along
    const side = await page.locator('[data-side-panel], [data-room-columns] > div:last-child').first().boundingBox()
    if (!side || side.y + 4 > (page.viewportSize()?.height ?? 0)) problems.hard.push(`${where}: no side panel on the screen`)
    return
  }
  await button.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const inside = await sheet.evaluate((element) => element.contains(document.activeElement))
  if (!inside) problems.hard.push(`${where}: the focus did not go into the panel`)
  const m = await measure(page)
  if (m.scrollY > 0 || m.tall > 0) problems.hard.push(`${where}: the page scrolls with the panel open`)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(button).toBeFocused()
}

for (const game of GAMES.filter((g) => !picked || picked.includes(g.id))) {
  test(`${game.id}: one screen at four sizes, waiting room and game`, async ({ browser }) => {
    test.setTimeout(150_000)
    const problems: Problems = { hard: [], soft: [] }
    const seats = await table(browser, game.id, game.players, DESKTOP, problems)
    const host = seats[0].page
    try {
      for (const size of SIZES) {
        await host.setViewportSize(size)
        await host.waitForTimeout(150)
        const where = `${game.id} waiting ${size.name}`
        checkFits(await measure(host), where, problems, ['body'])
        await expect(host.getByRole('button', { name: 'Start game' })).toBeInViewport()
        await panelRoundTrip(host, where, problems)
      }
      await host.setViewportSize(SIZES[0])
      await host.getByRole('button', { name: 'Start game' }).click()
      await expect.poll(() => seats[0].view?.room.status).toBe('playing')
      await expect(host.locator('[data-game-stage]')).toBeVisible()
      for (const size of SIZES) {
        await host.setViewportSize(size)
        await host.waitForTimeout(1200)
        const where = `${game.id} playing ${size.name}`
        checkFits(await measure(host), where, problems, ['stage', 'dock'])
        if (SHOTS) await host.screenshot({ path: `test-results/shell/${game.id}-${size.name}.png` })
        await panelRoundTrip(host, where, problems)
      }
    } finally {
      if (problems.soft.length > 0) console.log(problems.soft.join('\n'))
      for (const seat of seats) await seat.page.context().close()
    }
    expect(problems.hard).toEqual([])
  })
}

// The race room: its waiting room, the race and the standings someone watching sees beside it (a
// GameLayout, as the results are)
test.describe('kart', () => {
  test('the race room is one screen: waiting room, race and standings', async ({ browser }) => {
    test.setTimeout(240_000)
    if (picked && !picked.includes('kart')) test.skip()
    const problems: Problems = { hard: [], soft: [] }
    const people = await Promise.all(['Ann', 'Bob', 'Cy'].map(() => newPerson(browser, { viewport: SIZES[0] })))
    for (const page of people) await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
    const [ann, bob, cy] = people
    try {
      const response = await ann.request.post('/api/rooms', {
        data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
      })
      const { id } = (await response.json()) as { id: string }
      await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
      await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
      for (const size of SIZES) {
        await ann.setViewportSize(size)
        await ann.waitForTimeout(300)
        checkFits(await measure(ann), `kart waiting ${size.name}`, problems, [])
      }
      await ann.setViewportSize(SIZES[0])
      await bob.getByTestId('kart-lobby-ready').click()
      await ann.getByRole('button', { name: 'Start game' }).click()
      await expect(ann.getByTestId('kart-race')).toBeVisible({ timeout: 60_000 })
      for (const size of [SIZES[0], SIZES[2]]) {
        await ann.setViewportSize(size)
        await ann.waitForTimeout(500)
        await ann.mouse.wheel(0, 600)
        checkFits(await measure(ann), `kart race ${size.name}`, problems, [])
      }
      // Someone who comes in during the race: the standings, in the room's layout
      await cy.goto(`/r/${id}`)
      await cy.getByRole('textbox', { name: 'Nickname' }).fill('Cy')
      await cy.getByRole('textbox', { name: 'Nickname' }).press('Enter')
      await expect(cy.getByTestId('kart-spectate')).toBeVisible({ timeout: 60_000 })
      await cy.getByTestId('kart-watch-close').click({ timeout: 30_000 }).catch(() => {})
      await expect(cy.locator('[data-game-stage]')).toBeVisible({ timeout: 30_000 })
      for (const size of SIZES) {
        await cy.setViewportSize(size)
        await cy.waitForTimeout(500)
        checkFits(await measure(cy), `kart standings ${size.name}`, problems, ['stage'])
      }
    } finally {
      if (problems.soft.length > 0) console.log(problems.soft.join('\n'))
      for (const page of people) await page.context().close()
    }
    expect(problems.hard).toEqual([])
  })
})

