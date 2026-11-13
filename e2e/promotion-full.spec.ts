import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { createRoom, joinRoom, newPerson } from './helpers.ts'

// e3-t14 (C7), e3-t15 (C8): the full edition of promotion in a real browser. The edition picked in
// the waiting room, four-player games played to their settlement and result with every kind of
// answer to their decisions (an offered post accepted, declined and left to the countdown; an office
// bought and the minor post taken), the whole board of 236 cells on one screen, a screen that holds
// still roll after roll and while a decision waits on a phone, the keyboard, axe in both themes, and
// the rules page with both editions.

const NAMES = ['Ann', 'Bob', 'Cy', 'Di']
const CELLS = 236

/** A full-edition room with these people seated, the host first, made the way the API allows */
async function fullRoom(
  browser: Browser,
  count: number,
  options: BrowserContextOptions = {},
  roomOptions: Record<string, unknown> = {},
): Promise<Page[]> {
  const people: Page[] = []
  const first = await newPerson(browser, options)
  const response = await first.request.post('/api/rooms', {
    data: { gameId: 'promotion', options: { edition: 'full', ...roomOptions } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(first, `/r/${id}`, NAMES[0])
  people.push(first)
  for (const name of NAMES.slice(1, count)) {
    const person = await newPerson(browser, options)
    await joinRoom(person, `/r/${id}`, name)
    people.push(person)
  }
  await first.getByRole('button', { name: 'Start game' }).click()
  for (const person of people) await expect(person.locator('[data-cell]')).toHaveCount(CELLS)
  return people
}

const close = async (people: Page[]) => {
  for (const person of people) await person.context().close()
}

const rollOf = (page: Page) => page.getByRole('button', { name: 'Roll', exact: true })
// The button goes when the game ends: never wait for one that has just gone
const free = async (page: Page) =>
  (await rollOf(page).count()) > 0 &&
  (await rollOf(page)
    .getAttribute('aria-disabled', { timeout: 1000 })
    .catch(() => null)) === 'false'

/** The decision card a seat sees when the game waits for its answer (C8) */
const promptOf = (page: Page) => page.locator('[data-decision="offer"], [data-decision="buy"]')

type Kind = 'offer' | 'buy'
/**
 * How to answer a decision: an answer's `data-answer` (`accept`, `buy`, ...), `timeout` to let the
 * countdown answer, or `hold` to leave it waiting and return
 */
type Policy = (kind: Kind, count: number) => string
const declineAll: Policy = (kind) => (kind === 'offer' ? 'decline' : 'skip')

/** Who acted in the last `stepOnce` */
let lastMover: Page | null = null

/**
 * One step by whoever is to act, with the element's own click (no scrolling, as a finger's tap): a
 * roll, or an answer to a decision by `policy`. Returns what was done
 */
async function stepOnce(
  people: Page[],
  policy: Policy = declineAll,
  counts: Record<Kind, number> = { offer: 0, buy: 0 },
): Promise<string> {
  let mover: Page | null = null
  let what: 'roll' | Kind = 'roll'
  const state = await expect
    .poll(
      async () => {
        if (await people[0].getByText('Game over').first().isVisible()) return 'over'
        for (const person of people) {
          const prompt = promptOf(person)
          const kind = (await prompt.count()) > 0 ? await prompt.getAttribute('data-decision', { timeout: 1000 }).catch(() => null) : null
          if (kind) {
            mover = person
            what = kind as Kind
            return 'decide'
          }
          if (await free(person)) {
            mover = person
            what = 'roll'
            return 'roll'
          }
        }
        return 'wait'
      },
      { timeout: 30_000 },
    )
    .not.toBe('wait')
  void state
  if (!mover) return 'over'
  const page = mover as Page
  lastMover = page
  if (what === 'roll') {
    await rollOf(page)
      .evaluate((button) => (button as HTMLElement).click(), undefined, { timeout: 2000 })
      .catch(() => {})
    return 'roll'
  }
  const kind = what as Kind
  counts[kind] += 1
  const answer = policy(kind, counts[kind])
  if (answer === 'hold') return `${kind}:hold`
  if (answer === 'timeout') {
    // Left to the countdown: the card goes when the room answers with the default
    await expect(promptOf(page)).toHaveCount(0, { timeout: 40_000 })
    return `${kind}:timeout`
  }
  await promptOf(page)
    .locator(`[data-answer="${answer}"]`)
    .first()
    .evaluate((button) => (button as HTMLElement).click())
  await expect(promptOf(page)).toHaveCount(0, { timeout: 10_000 })
  return `${kind}:${answer}`
}

/** After a game: the settlement closed, and the host starts another */
async function rematch(host: Page) {
  await host.getByRole('region', { name: 'Settlement' }).getByRole('button', { name: 'Close' }).click()
  await host.getByRole('button', { name: 'Rematch' }).click()
  await expect(host.getByText('Game over')).toHaveCount(0)
}

/** How many of the board's cells lie wholly on the screen, with the page where it opens */
async function cellsOnScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(0, 0)
    const [width, height] = [window.innerWidth, window.innerHeight]
    return [...document.querySelectorAll('[data-cell]')].filter((cell) => {
      const box = cell.getBoundingClientRect()
      return box.left >= 0 && box.top >= 0 && box.right <= width + 0.5 && box.bottom <= height + 0.5
    }).length
  })
}

test('the host picks the full edition in the waiting room, with a line on each edition', async ({
  browser,
}) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await createRoom(host, 'Ann')
  await joinRoom(guest, host.url(), 'Bob')
  const edition = host.getByRole('combobox', { name: 'Edition' })
  await expect(edition).toHaveAccessibleDescription(/79 offices/)
  await expect(host.getByRole('spinbutton', { name: 'Round limit' })).toBeVisible()
  await expect(host.getByRole('checkbox', { name: /Buying office/ })).toHaveCount(0)
  await edition.selectOption('full')
  await expect(edition).toHaveAccessibleDescription(/236 offices/)
  await expect(host.getByRole('spinbutton', { name: 'Round limit' })).toHaveCount(0)
  // The full edition's own options (C8)
  await expect(host.getByRole('spinbutton', { name: /Seconds to answer/ })).toHaveValue('30')
  await expect(host.getByRole('checkbox', { name: /Buying office/ })).toBeChecked()
  await expect(host.getByRole('checkbox', { name: /End at the first/ })).not.toBeChecked()
  await expect(guest.getByText(/236 offices/)).toBeVisible()
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('[data-full-board] [data-cell]')).toHaveCount(CELLS)
  await expect(guest.locator('[data-full-board] [data-cell]')).toHaveCount(CELLS)
  // The offered and minor posts are marked on the board, and the ladder of grades is on it
  await expect(host.locator('[data-choice="offer"]')).toHaveCount(5)
  await expect(host.locator('[data-choice="minor"]')).toHaveCount(4)
  await expect(host.locator('[data-grade]')).toHaveCount(14)
  // How to play opens the full edition's rules
  await host.getByRole('button', { name: 'How to play' }).click()
  await expect(host.getByRole('dialog').getByText(/four six-sided dice/i).first()).toBeVisible()
  await close([host, guest])
})

test('four players play full games to the end, answering every kind of decision', async ({
  browser,
}) => {
  test.setTimeout(900_000)
  // Without the animation the turns go as fast as the room answers; ten seconds to decide
  const people = await fullRoom(browser, 4, { reducedMotion: 'reduce' }, { decisionSeconds: 10 })
  const [host] = people
  const done = new Set<string>()
  // Round and round: accept, decline, the countdown; buy, take the post
  const policy: Policy = (kind, count) =>
    kind === 'offer' ? ['accept', 'decline', 'timeout'][(count - 1) % 3] : ['buy', 'skip'][(count - 1) % 2]
  const counts = { offer: 0, buy: 0 }
  const wanted = ['offer:accept', 'offer:decline', 'offer:timeout', 'buy:buy', 'buy:skip']
  let games = 0
  while (games < 8) {
    games += 1
    for (let step = 0; step < 900; step++) {
      const did = await stepOnce(people, policy, counts)
      if (did === 'over') break
      done.add(did)
      if (did === 'offer:timeout') {
        await expect(host.getByRole('status').filter({ hasText: /time ran out/ })).toBeVisible()
      }
    }
    await expect(host.getByText('Game over').first()).toBeVisible({ timeout: 20_000 })
    const settlement = host.getByRole('region', { name: 'Settlement' })
    await expect(settlement).toBeVisible()
    await expect(settlement.getByRole('row')).toHaveCount(5)
    // Silver adds up: everyone's final silver is all of it, 100 each and 100 each in the pot
    const finals = await settlement.locator('tbody tr td:last-child').allTextContents()
    expect(finals.map(Number).reduce((sum, value) => sum + value, 0)).toBe(800)
    if (wanted.every((key) => done.has(key))) break
    await rematch(host)
  }
  test.info().annotations.push({ type: 'games', description: `${games}: ${[...done].sort().join(', ')}` })
  for (const key of wanted) expect(done, `${key} after ${games} games`).toContain(key)
  await close(people)
})

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`at ${size.width}x${size.height} all ${CELLS} cells, the turn and the roll are on one screen`, async ({
    browser,
  }) => {
    const people = await fullRoom(browser, 2, { viewport: size })
    const [host] = people
    await expect(host.locator('[data-cell] use[href*="rankArt"]')).toHaveCount(CELLS)
    await expect.poll(() => cellsOnScreen(host)).toBe(CELLS)
    await expect(rollOf(host)).toBeInViewport({ ratio: 1 })
    const sideways = await host.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
    // A square board (C9): four rings round the pot
    await expect(host.locator('[data-rings="4"]')).toHaveCount(1)
    await expect(host.locator('[data-centre-pot="200"]')).toHaveCount(1)
    for (let turn = 0; turn < 3; turn++) await stepOnce(people)
    await expect.poll(() => cellsOnScreen(host)).toBe(CELLS)
    await close(people)
  })
}

// A phone on its side in focus mode (C9): the square board, the turn and the roll with no scrolling
test('at 844x390 in focus mode the square board fits with nothing to scroll', async ({ browser }) => {
  const people = await fullRoom(browser, 2, {
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  const [host] = people
  await host.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined })
  })
  await host.getByRole('button', { name: 'Full screen' }).click()
  await expect(host.locator('[data-immersion="focus"]')).toBeVisible()
  await expect(host.locator('[data-rings="4"]')).toHaveCount(1)
  await expect.poll(() => cellsOnScreen(host)).toBe(CELLS)
  await expect(rollOf(host)).toBeInViewport({ ratio: 1 })
  const scroll = await host.evaluate(() => {
    const page = document.documentElement
    return [page.scrollWidth - page.clientWidth, page.scrollHeight - page.clientHeight]
  })
  expect(scroll[0]).toBeLessThanOrEqual(0)
  expect(scroll[1]).toBeLessThanOrEqual(0)
  for (let turn = 0; turn < 3; turn++) await stepOnce(people)
  await expect.poll(() => cellsOnScreen(host)).toBe(CELLS)
  await close(people)
})

/** Every frame from here on: the height of the bar the turn is in, the board's box, and a prompt */
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as { frames: number[][] }
    record.frames = []
    const frame = () => {
      // The dock's sentence (not the status line over the board a watcher sees while someone decides)
      const panel = document.querySelector('[data-roll-line]')?.parentElement?.parentElement
      const bar = document.querySelector('[data-immersion="off"]') ? panel?.parentElement : panel
      const board = document.querySelector('[data-full-board]')?.getBoundingClientRect()
      const prompt = document.querySelector('[data-decision]') ? 1 : 0
      if (bar && board) {
        record.frames.push([bar.getBoundingClientRect().height, board.x, board.y, board.width, board.height, prompt])
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as { frames: number[][] }).frames)

function expectStill(frames: number[][]) {
  expect(frames.length).toBeGreaterThan(100)
  for (let at = 0; at < 5; at++) {
    const values = frames.map((frame) => frame[at])
    expect(Math.max(...values) - Math.min(...values), `measure ${at}`).toBeLessThanOrEqual(1)
  }
}

for (const size of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  for (const immersed of [false, true]) {
    test(`at ${size.width}x${size.height}${immersed ? ' in focus mode' : ''} nothing moves over many rolls`, async ({
      browser,
    }) => {
      test.setTimeout(240_000)
      const options = { viewport: size, hasTouch: true, isMobile: true }
      const people = await fullRoom(browser, 2, options)
      const [host] = people
      if (immersed) {
        await host.evaluate(() => {
          Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined })
        })
        await host.getByRole('button', { name: 'Full screen' }).click()
        await expect(host.locator('[data-immersion="focus"]')).toBeVisible()
      }
      await expect.poll(() => cellsOnScreen(host)).toBe(CELLS)
      await startRecording(host)
      for (let turn = 0; turn < 10; turn++) await stepOnce(people)
      // The last turn plays out too
      await expect
        .poll(async () => (await free(host)) || (await free(people[1])) || (await promptOf(host).count()) + (await promptOf(people[1]).count()) > 0, { timeout: 20_000 })
        .toBe(true)
      expectStill(await recorded(host))
      await close(people)
    })
  }
}

// A decision on a phone (C8) and a laptop (C9): the card comes over the board; the dock and the
// board hold still. Where the board has room (focus mode, a laptop) the card leaves the cell it asks
// about in sight; a phone on its side outside focus mode has too little board for that
for (const { width, height, immersed, phone } of [
  { width: 844, height: 390, immersed: false, phone: true },
  { width: 844, height: 390, immersed: true, phone: true },
  { width: 1280, height: 720, immersed: false, phone: false },
]) {
  const uncovered = immersed || !phone
  test(`at ${width}x${height}${immersed ? ' in focus mode' : ''} a decision waits without moving anything`, async ({
    browser,
  }) => {
    test.setTimeout(900_000)
    const options = {
      viewport: { width, height },
      ...(phone ? { hasTouch: true, isMobile: true } : {}),
      reducedMotion: 'reduce' as const,
    }
    const people = await fullRoom(browser, 4, options, { decisionSeconds: 60 })
    const [host] = people
    if (immersed) {
      for (const person of people) {
        await person.evaluate(() => {
          Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined })
        })
        await person.getByRole('button', { name: 'Full screen' }).click()
        await expect(person.locator('[data-immersion="focus"]')).toBeVisible()
      }
    }
    for (const person of people) await startRecording(person)
    // Roll until one of the four has a decision: a game or two at most, in practice
    let decider: Page | null = null
    for (let step = 0; step < 3000 && !decider; step++) {
      const did = await stepOnce(people, () => 'hold')
      if (did.endsWith(':hold')) decider = lastMover
      else if (did === 'over') await rematch(host)
    }
    expect(decider, 'a decision came up').not.toBeNull()
    const page = decider as Page
    await expect(promptOf(page)).toBeInViewport()
    // The card does not hide the cell it asks about, where the board has room for that (C9)
    const asked = await page.locator('[data-pending-cell]').getAttribute('data-pending-cell')
    const [card, cell] = [
      await promptOf(page).boundingBox(),
      await page.locator(`[data-cell="${asked}"]`).boundingBox(),
    ]
    expect(card && cell).toBeTruthy()
    if (uncovered && card && cell) {
      const covers =
        card.x < cell.x + cell.width &&
        cell.x < card.x + card.width &&
        card.y < cell.y + cell.height &&
        cell.y < card.y + card.height
      expect(covers, `the card over ${asked}`).toBe(false)
    }
    for (const button of await promptOf(page).locator('button').all()) {
      const box = await button.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    // The card stays a while, then is answered; nothing under it moved
    await page.waitForTimeout(1500)
    const { violations } = await new AxeBuilder({ page }).include('[data-decision]').analyze()
    expect(violations.map((violation) => violation.id)).toEqual([])
    const kind = await promptOf(page).getAttribute('data-decision')
    await promptOf(page)
      .locator(`[data-answer="${kind === 'offer' ? 'decline' : 'skip'}"]`)
      .evaluate((button) => (button as HTMLElement).click())
    await expect(promptOf(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    const frames = await recorded(page)
    expect(frames.filter((frame) => frame[5] === 1).length).toBeGreaterThan(30)
    // Over the frames with the card, and a second either side of it
    const first = frames.findIndex((frame) => frame[5] === 1)
    expectStill(frames.slice(Math.max(0, first - 60)))
    await close(people)
  })
}

test('the keyboard: one Tab stop for the board, arrows by what is on the screen, Enter for details', async ({
  browser,
}) => {
  const people = await fullRoom(browser, 2)
  const [host] = people
  const stops = host.locator('[data-cell][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  await stops.focus()
  await host.keyboard.press('Home')
  await expect(host.locator('[data-cell="baiding"]')).toBeFocused()
  await host.keyboard.press('ArrowRight')
  await expect(host.locator('[data-cell="tongsheng"]')).toBeFocused()
  await host.keyboard.press('End')
  await expect(host.locator('[data-cell="dahe"]')).toBeFocused()
  await host.keyboard.press('Enter')
  const sheet = host.getByRole('dialog')
  await expect(sheet).toContainText('Dahe')
  await host.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(host.locator('[data-cell="dahe"]')).toBeFocused()
  await close(people)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`axe finds nothing on the full board in the ${scheme} theme`, async ({ browser }) => {
    const people = await fullRoom(browser, 2, { colorScheme: scheme, reducedMotion: 'reduce' })
    const [host] = people
    for (let turn = 0; turn < 4; turn++) await stepOnce(people)
    const { violations } = await new AxeBuilder({ page: host }).analyze()
    expect(violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([])
    await host.locator('[data-cell="jingcha"]').click()
    const sheet = await new AxeBuilder({ page: host }).analyze()
    expect(sheet.violations.map((violation) => violation.id)).toEqual([])
    await close(people)
  })
}

test('the rules page has both editions', async ({ page }) => {
  await page.goto('/games/promotion/rules')
  await expect(page.getByRole('link', { name: 'Simple edition' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('link', { name: 'Full edition' }).click()
  await expect(page).toHaveURL(/edition=full/)
  await expect(page.getByRole('link', { name: 'Full edition' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/four six-sided dice/i).first()).toBeVisible()
  await expect(page.getByText(/謄錄/).first()).toBeVisible()
})

// 2026-11-13 (擁有者): every turn has a result, and the end shows each player's way through the game
test('a two-player game ends with every career route, each turn with a result', async ({ browser }) => {
  test.setTimeout(600_000)
  const people = await fullRoom(browser, 2, { reducedMotion: 'reduce' }, { decisionSeconds: 10 })
  const [host] = people
  for (let step = 0; step < 900; step++) {
    if ((await stepOnce(people)) === 'over') break
  }
  await expect(host.getByText('Game over').first()).toBeVisible({ timeout: 20_000 })
  await host.getByRole('region', { name: 'Settlement' }).getByRole('button', { name: 'Close' }).click()
  const routes = host.getByRole('region', { name: 'Career routes' })
  await expect(routes).toBeVisible()
  const seats = routes.locator('[data-route-seat]')
  await expect(seats).toHaveCount(2)
  await seats.first().locator('summary').click()
  await expect(seats.first().locator('li').first()).toContainText('Birth roll')
  await expect(routes).not.toContainText('No combination')
  await routes.screenshot({ path: test.info().outputPath('career-routes-full.png') })
  await close(people)
})
