import { expect, test, type Page } from '@playwright/test'

// Slopes and jumps (2026-11-17, docs/ARCHITECTURE.md §4.25): Guanyin Hill Road, the first track with
// them, raced against a computer kart for one lap from /kart's menu. The player drives with the test
// autopilot (`?autopilot`), which takes both jumps like anyone crossing a lip; the page counts the
// take-offs and landings, the bot's kart is drawn from its frames (in the air when they say so), and
// the results come up. Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface SpikeReading {
  takeoffs: number
  landings: number
}

const spike = (page: Page): Promise<SpikeReading | null> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: SpikeReading }).__kartSpike ?? null)

test('Guanyin Hill Road: one lap against the computer, over both jumps', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
  await page.goto('/kart?autopilot')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await expect(setup).toBeVisible()
  await expect(setup.getByTestId('kart-bots-track').locator('option[value="guanyin"]')).toHaveText(
    'Guanyin Hill Road',
  )
  await setup.getByTestId('kart-bots-track').selectOption('guanyin')
  await setup.getByTestId('kart-bots-count').selectOption('1')
  await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
  await setup.getByTestId('kart-bots-mode').selectOption('race')
  await setup.getByTestId('kart-bots-laps').selectOption('1')
  await setup.getByTestId('kart-bots-start').click()

  await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 30_000 })
  // Both jumps on the lap: off the ground and back on it, twice
  await expect
    .poll(async () => (await spike(page))?.landings ?? 0, { timeout: 150_000 })
    .toBeGreaterThanOrEqual(2)
  expect((await spike(page))?.takeoffs).toBeGreaterThanOrEqual(2)
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 180_000 })
  await expect(results.getByTestId('kart-standings').locator('li')).toHaveCount(2)
  expect(errors).toEqual([])
})
