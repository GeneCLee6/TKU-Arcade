import { expect, test, type Page } from '@playwright/test'

// 2026-11-18 (docs/ARCHITECTURE.md §4.37): the four technical tracks. Each opens from /kart's course
// picker as a time trial with its own minimap and scenery and draws without a complaint; the race
// against the computer and the Grand Prix offer them (the new cup has all four); and one of them,
// the expert's, is raced for a lap against a computer kart from the menu, over both of its jumps.
// Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface SpikeReading {
  frames: number
  takeoffs: number
  landings: number
}

const spike = (page: Page): Promise<SpikeReading | null> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: SpikeReading }).__kartSpike ?? null)

const TRACKS = [
  ['mangrove', 'Mangrove Channel'],
  ['fort', 'Hobe Fort Hill'],
  ['danhai', 'Danhai Night Circuit'],
  ['datun', 'Datun Ridgeline'],
] as const

/** The menu's panels are tested small, as the other kart tests do; the course picker needs the room */
const prepare = async (page: Page, small = true) => {
  if (small) await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
}

for (const [id, name] of TRACKS) {
  test(`${name} opens from the course picker as a time trial, with its minimap`, async ({ page }) => {
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
    // The roundabout's island is drawn on the night circuit's map, over the road
    if (id === 'danhai') await expect.poll(() => map.locator('line').count()).toBeGreaterThan(40)
    await expect(page.getByTestId('kart-race-clock')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await spike(page))?.frames ?? 0, { timeout: 40_000 })
      .toBeGreaterThan(10)
    expect(errors).toEqual([])
  })
}

test('the race against the computer and the Grand Prix offer the four tracks', async ({ page }) => {
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
  await expect(cup.getByTestId('kart-cup-cup').locator('option')).toHaveText([
    'Ebb Tide Cup',
    'Hilltop Cup',
    'Rivermouth Cup',
    'Flood Tide Cup',
    'Backstreet Cup',
  ])
  await cup.getByTestId('kart-cup-cup').selectOption('flood')
  // In racing order: the easiest first, the expert's last
  await expect(cup.getByRole('listitem')).toHaveText([
    'Mangrove Channel',
    'Danhai Night Circuit',
    'Hobe Fort Hill',
    'Datun Ridgeline',
  ])
})

test('Datun Ridgeline: one lap against the computer, over both jumps', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart?autopilot')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await expect(setup).toBeVisible()
  await setup.getByTestId('kart-bots-track').selectOption('datun')
  await setup.getByTestId('kart-bots-count').selectOption('1')
  await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
  await setup.getByTestId('kart-bots-mode').selectOption('race')
  await setup.getByTestId('kart-bots-laps').selectOption('1')
  await setup.getByTestId('kart-bots-start').click()

  await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => (await spike(page))?.landings ?? 0, { timeout: 150_000 })
    .toBeGreaterThanOrEqual(2)
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 180_000 })
  await expect(results.getByTestId('kart-standings').locator('li')).toHaveCount(2)
  expect(errors).toEqual([])
})
