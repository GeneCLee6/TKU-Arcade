import { expect, test, type Page } from '@playwright/test'
import { trackLedges } from '../shared/kart/ledges.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.72): high platforms. The Breakwater Roofs open from /kart's
// course picker; the master driver (`?autopilot=master`, the one who knows the shortcuts) flies off
// the first ramp onto the breakwater's crown, up at its height, while the expert keeps to the road
// round it. Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface SpikeReading {
  frames: number
  state?: { x: number; z: number; y?: number }
}

const spike = (page: Page): Promise<SpikeReading | null> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: SpikeReading }).__kartSpike ?? null)

const prepare = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
}

test('the Breakwater Roofs open from the course picker', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByTestId('kart-course').selectOption('breakwater')
  await expect(page).toHaveURL(/track=breakwater/)
  await expect(page.getByTestId('kart-course').locator('option:checked')).toHaveText(
    'Breakwater Roofs',
  )
  await expect
    .poll(async () => (await spike(page))?.frames ?? 0, { timeout: 40_000 })
    .toBeGreaterThan(10)
  expect(errors).toEqual([])
})

test('the master flies onto the crown; the expert drives round it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  const track = raceTrack('breakwater')!
  const [crown] = trackLedges(track)
  const fork = track.forks![crown!.fork]!
  // Halfway along the crown's own stretch, up at its height
  const high = fork.path.filter((point, index) => index >= fork.rise! && (point.y ?? 0) >= crown!.top - 0.1)
  const middle = high[Math.floor(high.length / 2)]!
  const near = async () => {
    const state = (await spike(page))?.state
    if (!state || Math.hypot(state.x - middle.x, state.z - middle.z) > 14) return null
    return state.y ?? 0
  }
  await page.goto('/kart/spike?track=breakwater&autopilot=master')
  await expect
    .poll(async () => ((await near()) ?? 0) > crown!.top - 1, { timeout: 120_000, intervals: [50] })
    .toBe(true)
  // The expert never comes near the middle of the crown: it goes round the breakwater's shed
  await page.goto('/kart/spike?track=breakwater&autopilot=expert')
  await expect
    .poll(
      async () => {
        const state = (await spike(page))?.state
        return state ? Math.hypot(state.x - crown!.lip.x, state.z - crown!.lip.z) : Infinity
      },
      { timeout: 120_000, intervals: [50] },
    )
    .toBeLessThan(20)
  for (let at = 0; at < 60; at++) {
    expect(await near()).toBeNull()
    await page.waitForTimeout(50)
  }
  expect(errors).toEqual([])
})
