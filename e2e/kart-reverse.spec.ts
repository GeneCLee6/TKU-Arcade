import { expect, test, type Page } from '@playwright/test'

// 2026-11-23 (#131, docs/ARCHITECTURE.md §4.87): a track driven the other way round. Hobe Fort Hill
// reversed is on /kart's course picker under its own name; the time trial on it starts from the
// grid on the far side of the line, and the autopilot drives its first lap round (the jump turned
// round, the gates the other way) with nobody going the wrong way. Headless Chromium draws with a
// software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(300_000)

interface SpikeReading {
  frames: number
  crossings: number
  resets: number
  takeoffs: number
}

const spike = (page: Page): Promise<SpikeReading | null> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: SpikeReading }).__kartSpike ?? null)

const prepare = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
  })
}

test('a reversed track is on the course picker, and the autopilot drives a lap of it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByTestId('kart-course').selectOption('fort-rev')
  await expect(page).toHaveURL(/track=fort-rev/)
  await expect(page.getByTestId('kart-course').locator('option:checked')).toHaveText(
    'Hobe Fort Hill (Reverse)',
  )

  // The time trial on it, driven by the autopilot: past the first lap, never the wrong way
  await page.goto('/kart?track=fort-rev&autopilot')
  await expect(page.getByTestId('kart-loading')).toHaveCount(0, { timeout: 120_000 })
  const lap = page.getByTestId('kart-lap')
  await expect(lap).toHaveText('Lap 1/3', { timeout: 60_000 })
  await expect(lap).toHaveText('Lap 2/3', { timeout: 200_000 })
  await expect(page.getByText('Wrong way!')).toHaveCount(0)
  const reading = await spike(page)
  expect(reading?.resets ?? -1).toBe(0)
  // Its one jump, turned round, was flown
  expect(reading?.takeoffs ?? 0).toBeGreaterThan(0)
  expect(errors).toEqual([])
})
