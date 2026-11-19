import { expect, test, type Page } from '@playwright/test'

// 2026-11-19 (docs/ARCHITECTURE.md §4.38, docs/KART-FEEL.md §11): the two tracks to learn by heart.
// Each opens from /kart's course picker as a time trial with its minimap (its walls on it) and draws
// without a complaint; the race against the computer and the Grand Prix offer them (the Backstreet
// Cup); the driver who knows the wharf (`?autopilot=master`) lands a drift jump on it; and the rules
// page explains the techniques.
// Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface SpikeReading {
  frames: number
  state: { driftJumps?: number }
}

const spike = (page: Page): Promise<SpikeReading | null> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: SpikeReading }).__kartSpike ?? null)

const TRACKS = [
  ['wharf', 'Wharf Warehouses'],
  ['lanes', 'Hillside Lanes'],
] as const

const prepare = async (page: Page, small = true) => {
  if (small) await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
}

for (const [id, name] of TRACKS) {
  test(`${name} opens from the course picker as a time trial, its walls on the map`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepare(page, false)
    await page.goto('/kart')
    await expect(page.locator('canvas')).toBeVisible()
    await page.getByTestId('kart-course').selectOption(id)
    await expect(page).toHaveURL(new RegExp(`track=${id}`))
    await expect(page.getByTestId('kart-course').locator('option:checked')).toHaveText(name)
    const map = page.getByRole('img', { name: 'Track map' })
    await expect(map).toBeVisible()
    // The sheds, the rows and the fences are drawn on the map, over the road
    await expect.poll(() => map.locator('line').count()).toBeGreaterThan(40)
    await expect(page.getByTestId('kart-race-clock')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await spike(page))?.frames ?? 0, { timeout: 40_000 })
      .toBeGreaterThan(10)
    expect(errors).toEqual([])
  })
}

test('the race against the computer and the Backstreet Cup offer the two tracks', async ({
  page,
}) => {
  await prepare(page)
  await page.goto('/kart')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await expect(setup).toBeVisible()
  for (const [id, name] of TRACKS) {
    await expect(setup.getByTestId('kart-bots-track').locator(`option[value="${id}"]`)).toHaveText(
      name,
    )
  }
  await page.getByTestId('kart-cup-open').click()
  const cup = page.getByTestId('kart-cup-setup')
  await expect(cup).toBeVisible()
  await cup.getByTestId('kart-cup-cup').selectOption('backstreet')
  await expect(cup.getByRole('listitem')).toHaveText([
    'Danhai Night Circuit',
    'Wharf Warehouses',
    'Hillside Lanes',
  ])
})

test('the driver who knows the wharf lands a drift jump on it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart/spike?track=wharf&autopilot=master')
  await expect(page.locator('canvas')).toBeVisible()
  // The loading ramp is ten seconds or so from GO; a slow machine drives the same steps, later
  await expect
    .poll(async () => (await spike(page))?.state.driftJumps ?? 0, { timeout: 150_000 })
    .toBeGreaterThanOrEqual(1)
  expect(errors).toEqual([])
})

test('the rules explain the advanced techniques', async ({ page }) => {
  await prepare(page)
  await page.goto('/games/kart/rules')
  await expect(page.getByRole('heading', { name: 'Advanced techniques' })).toBeVisible()
  await expect(page.getByText('Drift jump', { exact: true })).toBeVisible()
  await expect(page.getByText('Through the slot', { exact: true })).toBeVisible()
})
