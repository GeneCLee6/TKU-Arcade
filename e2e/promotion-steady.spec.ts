import { expect, test, type Browser, type Page } from '@playwright/test'

// The promotion screen holds still while it is played (an off-roadmap fix after C5). On a phone the
// dock's sentence wrapped to another number of lines on each roll, and its empty line while the top
// spun came and went: the dock changed height, the board's room with it, and the board was refitted,
// so the whole screen jumped on every roll. Here every frame of fifteen rolls is measured.

const WORDS = {
  en: {
    locale: 'en-US',
    names: ['Ann', 'Bob'],
    newRoom: 'New room',
    nickname: 'Nickname',
    seats: 'Seats',
    start: 'Start game',
    roll: 'Roll',
    fullScreen: 'Full screen',
  },
  zh: {
    locale: 'zh-TW',
    names: ['小安', '小博'],
    newRoom: '建立房間',
    nickname: '暱稱',
    seats: '座位',
    start: '開始遊戲',
    roll: '擲骰',
    fullScreen: '全螢幕',
  },
} as const

type Words = (typeof WORDS)[keyof typeof WORDS]

const ROLLS = 15

async function phone(browser: Browser, words: Words, viewport: { width: number; height: number }) {
  const context = await browser.newContext({
    locale: words.locale,
    viewport,
    hasTouch: true,
    isMobile: true,
  })
  return context.newPage()
}

async function enter(page: Page, words: Words, name: string) {
  await page.getByRole('textbox', { name: words.nickname }).fill(name)
  await page.getByRole('textbox', { name: words.nickname }).press('Enter')
}

/**
 * From here on, on every frame: the height of the bar the roll is told in (the dock, or the turn's
 * panel in full screen) and the board's box on the screen
 */
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as { steadyFrames: number[][] }
    record.steadyFrames = []
    const frame = () => {
      const panel = document.querySelector('[role="status"]')?.parentElement?.parentElement
      const bar = document.querySelector('[data-immersion="off"]') ? panel?.parentElement : panel
      const board = document.querySelector('[data-cell]')?.closest('svg')?.getBoundingClientRect()
      if (bar && board) {
        record.steadyFrames.push([
          bar.getBoundingClientRect().height,
          board.x,
          board.y,
          board.width,
          board.height,
        ])
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { steadyFrames: number[][] }).steadyFrames)

/** Host and guest in a running game, at a phone's size; focus mode on when `immersed` */
async function game(
  browser: Browser,
  words: Words,
  size: { width: number; height: number },
  immersed: boolean,
) {
  const host = await phone(browser, words, size)
  const guest = await phone(browser, words, size)
  if (immersed) {
    // As on an iPhone, where focus mode is what the button gives
    await host.context().addInitScript(() => {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined })
    })
  }
  await host.goto('/')
  await host.getByRole('button', { name: words.newRoom }).first().click()
  await enter(host, words, words.names[0])
  await host.waitForURL(/\/r\//)
  await guest.goto(host.url())
  await enter(guest, words, words.names[1])
  await expect(guest.getByRole('heading', { name: words.seats, exact: true })).toBeVisible()
  await host.getByRole('button', { name: words.start }).click()
  await expect(host.locator('[data-cell]')).toHaveCount(79)
  await expect(host.locator('[data-cell] use[href*="rankArt"]')).toHaveCount(79)
  if (immersed) {
    await host.getByRole('button', { name: words.fullScreen }).click()
    await expect(host.locator('[data-immersion="focus"]')).toBeVisible()
  }
  return { host, guest }
}

/** One roll by whoever is to move, once the last has landed on both screens; then its landing */
async function rollOnce(host: Page, guest: Page, words: Words): Promise<void> {
  const rollOf = (page: Page) => page.getByRole('button', { name: words.roll, exact: true })
  const free = async (page: Page) => (await rollOf(page).getAttribute('aria-disabled')) === 'false'
  await expect.poll(async () => (await free(host)) || (await free(guest))).toBe(true)
  // The element's own click, as a finger's tap: Playwright's would first scroll the page to bring the
  // button "into view" (it is already, in the dock stuck to the bottom), and the board with it
  await rollOf((await free(host)) ? host : guest).evaluate((button) =>
    (button as HTMLElement).click(),
  )
  await expect
    .poll(async () => (await free(host)) || (await free(guest)), { timeout: 10_000 })
    .toBe(true)
}

test('a roll leaves the zoom where it was', async ({ browser }) => {
  test.setTimeout(90_000)
  const words = WORDS.en
  const { host, guest } = await game(browser, words, { width: 390, height: 844 }, false)
  const board = host.locator('svg:has([data-cell])').first()
  const width = async () => (await board.boundingBox())?.width ?? 0
  const fitted = await width()
  await host.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(width).toBeGreaterThan(fitted * 1.2)
  const zoomed = await width()
  for (let roll = 0; roll < 5; roll++) await rollOnce(host, guest, words)
  await host.waitForTimeout(800)
  expect(Math.abs((await width()) - zoomed)).toBeLessThanOrEqual(1)
  await guest.context().close()
  await host.context().close()
})

for (const [language, words] of Object.entries(WORDS)) {
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    for (const immersed of [false, true]) {
      const mode = immersed ? 'focus mode' : 'the page'
      test(`${language}, ${size.width}x${size.height}, ${mode}: ${ROLLS} rolls move neither the dock nor the board`, async ({
        browser,
      }) => {
        test.setTimeout(150_000)
        const { host, guest } = await game(browser, words, size, immersed)
        // Settled before the first roll: the board's font and the fit come in once
        await host.waitForTimeout(500)
        await startRecording(host)

        const told = new Set<string>()
        for (let roll = 0; roll < ROLLS; roll++) {
          await rollOnce(host, guest, words)
          told.add((await host.getByRole('status').textContent()) ?? '')
        }
        // The last flight lands on the host's screen too
        await host.waitForTimeout(800)

        // Something really happened: the sentence said other things as the game went on
        expect(told.size).toBeGreaterThan(3)
        const frames = await recorded(host)
        expect(frames.length).toBeGreaterThan(100)
        const spread = (at: number) => {
          const values = frames.map((frame) => frame[at])
          return Math.max(...values) - Math.min(...values)
        }
        expect(spread(0), 'the bar the roll is told in').toBeLessThanOrEqual(1)
        expect(spread(1), "the board's left").toBeLessThanOrEqual(1)
        expect(spread(2), "the board's top").toBeLessThanOrEqual(1)
        expect(spread(3), "the board's width").toBeLessThanOrEqual(1)
        expect(spread(4), "the board's height").toBeLessThanOrEqual(1)
        await guest.context().close()
        await host.context().close()
      })
    }
  }
}
