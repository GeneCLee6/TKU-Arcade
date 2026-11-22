import { expect, test, type Page } from '@playwright/test'
import { raceTrack } from '../shared/kart/tracks/registry.ts'

// 2026-11-22 (docs/ARCHITECTURE.md §4.64): the technical showcase, a road over a road. It opens from
// /kart's course picker with the viaduct drawn over the underpass on its minimap; the autopilot
// drives it through the underpass and then over the viaduct, the same place on the plan, each at
// its own height; and the editor offers the viaduct, the underpass and the banked bends.
// Headless Chromium draws with a software renderer (the flag lets it).
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

test('the Zhuwei Flyover opens from the course picker, its viaduct drawn over the underpass on the map', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByTestId('kart-course').selectOption('zhuwei')
  await expect(page).toHaveURL(/track=zhuwei/)
  await expect(page.getByTestId('kart-course').locator('option:checked')).toHaveText(
    'Zhuwei Flyover',
  )
  await expect(page.getByTestId('kart-minimap-overpass')).toHaveCount(1)
  await expect
    .poll(async () => (await spike(page))?.frames ?? 0, { timeout: 40_000 })
    .toBeGreaterThan(10)
  expect(errors).toEqual([])
})

test('the autopilot goes through the underpass and over the viaduct, the same place at two heights', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  const crossing = raceTrack('zhuwei')!.crossings![0]!
  await page.goto('/kart/spike?track=zhuwei&autopilot')
  const heights: number[] = []
  // Under first (the underpass comes before the viaduct in a lap), then over
  for (const want of ['under', 'over'] as const) {
    await expect
      .poll(
        async () => {
          const state = (await spike(page))?.state
          if (!state || Math.hypot(state.x - crossing.x, state.z - crossing.z) > 12) return 'away'
          heights.push(state.y ?? 0)
          return (state.y ?? 0) < -3 ? 'under' : (state.y ?? 0) > 3 ? 'over' : 'between'
        },
        { timeout: 120_000, intervals: [50] },
      )
      .toBe(want)
  }
  expect(Math.min(...heights)).toBeLessThan(-4)
  expect(Math.max(...heights)).toBeGreaterThan(4)
  expect(errors).toEqual([])
})

test('the editor offers the viaduct, the underpass and the banked bends', async ({ page }) => {
  await prepare(page)
  await page.goto('/kart/editor')
  for (const id of ['overpass', 'underpass', 'bankedLeft', 'bankedRight']) {
    await expect(page.getByTestId(`kart-editor-add-${id}`)).toBeVisible()
  }
  await page.getByTestId('kart-editor-add-bankedRight').click()
  await expect(page.getByTestId('kart-editor-bank')).toBeVisible()
  await page.getByTestId('kart-editor-add-overpass').click()
  await expect(page.getByTestId('kart-editor-overpass-rise')).toBeVisible()
})
