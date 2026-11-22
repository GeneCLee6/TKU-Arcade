import { expect, test, type Page } from '@playwright/test'

// Slopes and jumps (2026-11-17, docs/ARCHITECTURE.md §4.26): Guanyin Hill Road, the first track with
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

/**
 * 2026-11-22 (#129): each name tag shown and its kart's wheels as drawn, in page pixels: the tag's
 * bottom centre and how far above the wheels it is. On a hill a tag at a fixed height sat metres
 * under (or over) its kart, off towards the distance
 */
const tagGaps = (page: Page) =>
  page.evaluate(() => {
    const race = (window as unknown as { __kartRace?: { wheels: { seat: number; x: number; y: number }[] } })
      .__kartRace
    const stage = document.querySelector('[data-testid="kart-race"] > [role="img"]')?.getBoundingClientRect()
    if (!race || !stage) return []
    return race.wheels.flatMap((wheel) => {
      const tag = document.querySelector<HTMLElement>(`[data-tag="${wheel.seat}"]`)
      if (!tag || tag.style.display === 'none') return []
      const box = tag.getBoundingClientRect()
      return [{ across: box.x + box.width / 2 - (stage.x + wheel.x), above: stage.y + wheel.y - box.bottom }]
    })
  })

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
  // Both jumps on the lap: off the ground and back on it, twice; meanwhile, the computer kart's
  // name tag stays right over it, up the hill and down
  const gaps: { across: number; above: number }[] = []
  await expect
    .poll(
      async () => {
        gaps.push(...(await tagGaps(page)))
        return (await spike(page))?.landings ?? 0
      },
      { timeout: 150_000 },
    )
    .toBeGreaterThanOrEqual(2)
  expect(gaps.length).toBeGreaterThan(0)
  for (const gap of gaps) {
    // Over the wheels, never under them; sideways only as much as a pitched camera leans an upright
    // line off the middle of the screen (about a tenth of its height)
    expect(Math.abs(gap.across)).toBeLessThan(3 + 0.2 * Math.abs(gap.above))
    expect(gap.above).toBeGreaterThan(-1)
  }
  expect((await spike(page))?.takeoffs).toBeGreaterThanOrEqual(2)
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 180_000 })
  await expect(results.getByTestId('kart-standings').locator('li')).toHaveCount(2)
  expect(errors).toEqual([])
})
