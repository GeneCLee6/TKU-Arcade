import { chromium, expect, test, webkit, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { checkAxe, checkLayout, watchConsole, type Problems } from './sweep.ts'

// 2026-11-23: the phones friends hold, before anyone tries a real one. An iPhone (WebKit, 375 x 812 and
// 390 x 844) and an Android phone (Chromium, 412 x 915) each walk the lobby, "Play the computer", a
// board game against the computer, the race room's waiting room and a race's opening, and check for
// a page scrolling sideways, raw keys, buttons something covers, text cut short and axe's serious
// findings (e2e/sweep.ts). Not in CI (WebKit is another browser to install); run it with
//   E2E_PORT=5199 npx playwright test phones.spec.ts --workers=1
// The board game is hold'em: its table is the widest of the board games on a phone.

const PHONES = [
  { name: 'iphone-375', browserName: 'webkit', viewport: { width: 375, height: 812 }, locale: 'en-US' },
  { name: 'iphone-390-zh', browserName: 'webkit', viewport: { width: 390, height: 844 }, locale: 'zh-TW' },
  { name: 'android-412', browserName: 'chromium', viewport: { width: 412, height: 915 }, locale: 'en-US' },
] as const

const SHOTS = process.env.PHONE_SHOTS === '1'

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.setTimeout(180_000)

    const options: BrowserContextOptions = {
      viewport: phone.viewport,
      locale: phone.locale,
      hasTouch: true,
      // WebKit has no isMobile; Chromium's is the phone's own viewport and touch behaviour
      ...(phone.browserName === 'chromium' ? { isMobile: true } : {}),
      reducedMotion: 'reduce',
    }
    const zh = phone.locale === 'zh-TW'

    // Each phone its own engine, launched here: a describe group cannot pick the browser
    let browser: Browser
    test.beforeAll(async () => {
      browser =
        phone.browserName === 'webkit'
          ? await webkit.launch()
          : // The race's WebGL without a GPU (as kart-lobby.spec.ts)
            await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
    })
    test.afterAll(async () => browser?.close())

    const person = async (problems: Problems) => {
      const context = await browser.newContext({ ...options, baseURL: test.info().project.use.baseURL })
      await context.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
      const page = await context.newPage()
      watchConsole(page, phone.name, problems)
      return page
    }

    const look = async (page: Page, where: string, problems: Problems) => {
      await page.waitForTimeout(500)
      await checkLayout(page, `${phone.name} ${where}`, problems, zh)
      await checkAxe(page, `${phone.name} ${where}`, problems)
      if (SHOTS) await page.screenshot({ path: `test-results/phones/${phone.name}-${where}.png` })
    }

    const report = (problems: Problems) => {
      // On Vite's dev server React mounts every room twice (StrictMode): the first socket is closed
      // while still connecting, which Safari reports as an error and Chrome as a warning. Not in a build
      const devOnly = (line: string) => /WebSocket is closed before the connection is established/.test(line)
      problems.soft.push(...problems.hard.filter(devOnly))
      if (problems.soft.length > 0) console.log(problems.soft.join('\n'))
      expect(problems.hard.filter((line) => !devOnly(line))).toEqual([])
    }

    test('the lobby, Play the computer and a hand of hold’em', async () => {
      const problems: Problems = { hard: [], soft: [] }
      const page = await person(problems)
      await page.goto('/')
      const newRoom = page.getByRole('button', { name: zh ? '建立房間' : 'New room' }).first()
      await expect(newRoom).toBeVisible()
      // The first game's New room is on the first screen
      const box = await newRoom.boundingBox()
      expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(phone.viewport.height)
      await look(page, 'lobby', problems)

      const quick = page.getByTestId('quick-play')
      await quick.locator('[data-quick-toggle]').click()
      await expect(quick.locator('[data-quick="holdem"]')).toBeVisible()
      await look(page, 'quick-play', problems)

      await quick.locator('[data-quick="holdem"]').click()
      const nickname = page.getByRole('textbox', { name: zh ? '暱稱' : 'Nickname' })
      await nickname.fill('Ann')
      await nickname.press('Enter')
      await page.waitForURL(/\/r\//)
      await expect(page.getByTestId('your-hand').getByRole('img')).toHaveCount(2, { timeout: 30_000 })
      await look(page, 'holdem', problems)
      await page.context().close()
      report(problems)
    })

    test('the race room’s waiting room and a race’s opening', async () => {
      const problems: Problems = { hard: [], soft: [] }
      const ann = await person(problems)
      const response = await ann.request.post('/api/rooms', {
        data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
      })
      const { id } = (await response.json()) as { id: string }
      await ann.goto(`/r/${id}`)
      const nickname = ann.getByRole('textbox', { name: zh ? '暱稱' : 'Nickname' })
      await nickname.fill('Ann')
      await nickname.press('Enter')
      await expect(ann.getByTestId('kart-lobby')).toBeVisible({ timeout: 30_000 })
      await look(ann, 'kart-lobby-upright', problems)
      // Held sideways, as a race is
      await ann.setViewportSize({ width: phone.viewport.height, height: phone.viewport.width })
      await look(ann, 'kart-lobby-sideways', problems)

      // A race against the computer from the kart's own page, sideways
      await ann.goto('/kart?bots')
      await ann.getByTestId('kart-bots-start').click({ timeout: 60_000 })
      await expect(ann.getByTestId('kart-race')).toBeVisible({ timeout: 60_000 })
      await expect(ann.getByTestId('kart-driver-card')).toBeVisible({ timeout: 60_000 })
      await look(ann, 'kart-intro', problems)
      await ann.context().close()
      report(problems)
    })
  })
}
