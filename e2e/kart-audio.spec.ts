import { expect, test, type Page } from '@playwright/test'

// 2026-11-23 (docs/ARCHITECTURE.md §4.97; #176's known limit): the kart's sound in Safari's engine
// (Playwright's WebKit; an iPhone's Safari is the same engine, its silent switch and its calls are
// not there to press), and in Chromium. Playwright's WebKit on Windows has no WebAudio at all: there
// the WebKit run is skipped and says so (on Linux and macOS it runs). What can be shown: the page
// sent to the background suspends the sound and coming back wakes it, no tap needed; where the browser will not let it wake (iOS after a call, or
// a long time away) the race asks for a tap, and the tap brings it back. Against the computer, from
// /kart's menu, so that the race screen (RaceView.tsx) is the one with "Tap for sound".
test.setTimeout(180_000)

const sound = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __kartSpike?: { sound?: { state: string }; groupAngle?: string } })
        .__kartSpike ?? null,
  )

/** The page as Safari has it when the phone locks or the app goes behind another, and back */
const showPage = (page: Page, shown: boolean) =>
  page.evaluate((visible) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (visible ? 'visible' : 'hidden'),
    })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible })
    document.dispatchEvent(new Event('visibilitychange'))
  }, shown)

for (const engine of ['webkit', 'chromium'] as const) {
  test.describe(engine, () => {
    test('the sound sleeps in the background, wakes coming back, and a tap brings it back when it cannot', async ({
      playwright,
      baseURL,
    }) => {
      // Each engine launched here (a project's browser is one per file)
      const browser = await playwright[engine].launch(
        engine === 'chromium' ? { args: ['--enable-unsafe-swiftshader'] } : {},
      )
      try {
        const page = await browser.newPage({
          baseURL: baseURL!,
          viewport: { width: 960, height: 600 },
          locale: 'en-US',
        })
        await page.goto('/')
        const webAudio = await page.evaluate(() => typeof window.AudioContext === 'function')
        test.skip(!webAudio, `${engine} here has no WebAudio (Playwright's WebKit on Windows)`)
        await page.addInitScript(() => {
          localStorage.setItem('tku-arcade.kart.quality', 'low')
          localStorage.setItem('tku-arcade.language', 'en')
        })
        await page.goto('/kart?autopilot')
        await page.getByTestId('kart-menu').click()
        await page.getByTestId('kart-bots-open').click()
        const setup = page.getByTestId('kart-bots-setup')
        await setup.getByTestId('kart-bots-track').selectOption('riverside')
        await setup.getByTestId('kart-bots-count').selectOption('1')
        await setup.getByTestId('kart-bots-laps').selectOption('1')
        await setup.getByTestId('kart-bots-start').click()
        await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 60_000 })
        await expect
          .poll(async () => (await sound(page))?.sound?.state, { timeout: 30_000 })
          .toBe('running')
        // 2026-11-23 (§4.97): the group shot stood somewhere clear of the scenery
        await expect
          .poll(async () => (await sound(page))?.groupAngle ?? null, { timeout: 30_000 })
          .not.toBeNull()

        // Away and back: suspended while hidden, running again without a tap
        await showPage(page, false)
        await expect
          .poll(async () => (await sound(page))?.sound?.state, { timeout: 10_000 })
          .not.toBe('running')
        await expect(page.getByTestId('kart-sound-tap')).toHaveCount(0)
        await showPage(page, true)
        await expect
          .poll(async () => (await sound(page))?.sound?.state, { timeout: 10_000 })
          .toBe('running')
        await expect(page.getByTestId('kart-sound-tap')).toHaveCount(0)

        // Back, but the browser will not let it play without a tap (as iOS after a call): the race asks
        await page.evaluate(() => {
          const own = AudioContext.prototype.resume
          ;(window as unknown as { __resume: typeof own }).__resume = own
          AudioContext.prototype.resume = () =>
            Promise.reject(new DOMException('not allowed', 'NotAllowedError'))
        })
        await showPage(page, false)
        await expect
          .poll(async () => (await sound(page))?.sound?.state, { timeout: 10_000 })
          .not.toBe('running')
        await showPage(page, true)
        const tap = page.getByTestId('kart-sound-tap')
        await expect(tap).toBeVisible({ timeout: 10_000 })
        // The tap: allowed again (a real gesture), running, and the button gone
        await page.evaluate(() => {
          AudioContext.prototype.resume = (
            window as unknown as { __resume: AudioContext['resume'] }
          ).__resume
        })
        await tap.click()
        await expect
          .poll(async () => (await sound(page))?.sound?.state, { timeout: 10_000 })
          .toBe('running')
        await expect(tap).toHaveCount(0)
      } finally {
        await browser.close()
      }
    })
  })
}
