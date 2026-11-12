import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { createRoom, joinRoom, newPerson } from './helpers.ts'

// e3-t14 (C7): the full edition of promotion in a real browser. The edition picked in the waiting
// room, a four-player game played to its settlement and result, the whole board of 182 cells on one
// screen, a screen that holds still roll after roll on a phone, the keyboard, axe in both themes, and
// the rules page with both editions.

const NAMES = ['Ann', 'Bob', 'Cy', 'Di']

/** A full-edition room with these people seated, the host first, made the way the API allows */
async function fullRoom(
  browser: Browser,
  count: number,
  options: BrowserContextOptions = {},
): Promise<Page[]> {
  const people: Page[] = []
  const first = await newPerson(browser, options)
  const response = await first.request.post('/api/rooms', {
    data: { gameId: 'promotion', options: { edition: 'full' } },
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
  for (const person of people) await expect(person.locator('[data-cell]')).toHaveCount(182)
  return people
}

const close = async (people: Page[]) => {
  for (const person of people) await person.context().close()
}

const rollOf = (page: Page) => page.getByRole('button', { name: 'Roll', exact: true })
const free = async (page: Page) =>
  (await rollOf(page).count()) > 0 && (await rollOf(page).getAttribute('aria-disabled')) === 'false'

/** One roll by whoever is to move, with the element's own click (no scrolling, as a finger's tap) */
async function rollOnce(people: Page[]): Promise<boolean> {
  let mover: Page | null = null
  await expect
    .poll(
      async () => {
        if (await people[0].getByText('Game over').first().isVisible()) return 'over'
        for (const person of people) {
          if (await free(person)) {
            mover = person
            return 'roll'
          }
        }
        return 'wait'
      },
      { timeout: 20_000 },
    )
    .not.toBe('wait')
  if (!mover) return false
  await rollOf(mover).evaluate((button) => (button as HTMLElement).click())
  return true
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
  await edition.selectOption('full')
  await expect(edition).toHaveAccessibleDescription(/182 offices/)
  await expect(host.getByRole('spinbutton', { name: 'Round limit' })).toHaveCount(0)
  await expect(guest.getByText(/182 offices/)).toBeVisible()
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('[data-full-board] [data-cell]')).toHaveCount(182)
  await expect(guest.locator('[data-full-board] [data-cell]')).toHaveCount(182)
  // How to play opens the full edition's rules
  await host.getByRole('button', { name: 'How to play' }).click()
  await expect(host.getByRole('dialog').getByText(/four six-sided dice/i).first()).toBeVisible()
  await close([host, guest])
})

test('four players play a full game to the end: settlement, then the result by silver', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  // Without the animation the turns go as fast as the room answers
  const people = await fullRoom(browser, 4, { reducedMotion: 'reduce' })
  const [host] = people
  // The birth roll first: an origin and a household for everyone
  for (let turn = 0; turn < 4; turn++) await rollOnce(people)
  await expect(host.getByRole('status').filter({ hasText: /is born/ })).toBeVisible()
  for (let turn = 0; turn < 600; turn++) {
    if (await host.getByText('Game over').first().isVisible()) break
    if (!(await rollOnce(people))) break
  }
  await expect(host.getByText('Game over').first()).toBeVisible({ timeout: 20_000 })
  const settlement = host.getByRole('region', { name: 'Settlement' })
  await expect(settlement).toBeVisible()
  await expect(settlement.getByRole('row')).toHaveCount(5)
  await expect(host.getByText(/ended with the most silver/)).toBeVisible()
  // Silver adds up: everyone's final silver is all of it, 100 each and 100 each in the pot
  const finals = await settlement
    .locator('tbody tr td:last-child')
    .allTextContents()
  expect(finals.map(Number).reduce((sum, value) => sum + value, 0)).toBe(800)
  await close(people)
})

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`at ${size.width}x${size.height} all 182 cells, the turn and the roll are on one screen`, async ({
    browser,
  }) => {
    const people = await fullRoom(browser, 2, { viewport: size })
    const [host] = people
    await expect(host.locator('[data-cell] use[href*="rankArt"]')).toHaveCount(182)
    await expect.poll(() => cellsOnScreen(host)).toBe(182)
    await expect(rollOf(host)).toBeInViewport({ ratio: 1 })
    const sideways = await host.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
    for (let turn = 0; turn < 3; turn++) await rollOnce(people)
    await expect.poll(() => cellsOnScreen(host)).toBe(182)
    await close(people)
  })
}

/** Every frame from here on: the height of the bar the turn is in, and the board's box */
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as { frames: number[][] }
    record.frames = []
    const frame = () => {
      const panel = document.querySelector('[role="status"]')?.parentElement?.parentElement
      const bar = document.querySelector('[data-immersion="off"]') ? panel?.parentElement : panel
      const board = document.querySelector('[data-full-board]')?.getBoundingClientRect()
      if (bar && board) {
        record.frames.push([bar.getBoundingClientRect().height, board.x, board.y, board.width, board.height])
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
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
      await expect.poll(() => cellsOnScreen(host)).toBe(182)
      await startRecording(host)
      for (let turn = 0; turn < 10; turn++) await rollOnce(people)
      // The last turn plays out too
      await expect.poll(() => free(host).then(async (mine) => mine || free(people[1])), { timeout: 20_000 }).toBe(true)
      const frames = await host.evaluate(() => (window as unknown as { frames: number[][] }).frames)
      expect(frames.length).toBeGreaterThan(100)
      for (let at = 0; at < 5; at++) {
        const values = frames.map((frame) => frame[at])
        expect(Math.max(...values) - Math.min(...values), `measure ${at}`).toBeLessThanOrEqual(1)
      }
      await close(people)
    })
  }
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
  await expect(host.locator('[data-cell="shuli"]')).toBeFocused()
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
    for (let turn = 0; turn < 4; turn++) await rollOnce(people)
    const { violations } = await new AxeBuilder({ page: host }).analyze()
    expect(violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([])
    await host.locator('[data-cell="dahe"]').click()
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
})
