import { expect, test, type Page } from '@playwright/test'

// 2026-11-22 (docs/ARCHITECTURE.md §4.64): watching on a phone held upright follows the race's rules
// since #140: the item slot in the middle of the screen, the map on the left under it, none of the
// panel, the slot, the map and the controls over another. A one-lap item race against the computer
// (the player's kart on `?autopilot`) is kept as a file and opened again at 390×844 and 360×740, where
// a replay and a spectator share the same top (WatchParts.tsx's WatchTop). Headless Chromium draws
// with a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })

type Box = { x: number; y: number; width: number; height: number }
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function box(page: Page, testId: string): Promise<Box> {
  const found = await page.getByTestId(testId).boundingBox()
  if (!found) throw new Error(`${testId} is not on the screen`)
  return found
}

test('a replay on a phone held upright: the item slot in the middle, the map on the left', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'zh-TW')
  })
  await page.goto('/kart?autopilot')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await expect(setup).toBeVisible()
  await setup.getByTestId('kart-bots-track').selectOption('riverside')
  await setup.getByTestId('kart-bots-count').selectOption('1')
  await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
  await setup.getByTestId('kart-bots-mode').selectOption('items')
  await setup.getByTestId('kart-bots-laps').selectOption('1')
  await setup.getByTestId('kart-bots-start').click()
  await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('kart-intro')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('KeyM')
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 200_000 })
  const save = results.getByTestId('kart-replay-download')
  await expect(save).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  const file = testInfo.outputPath('race.tkureplay')
  await download.saveAs(file)

  for (const [width, height] of [
    [390, 844],
    [360, 740],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/kart/replay')
    await page.getByTestId('kart-replay-file-input').setInputFiles(file)
    await expect(page.getByTestId('kart-replay')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('kart-item')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('kart-minimap')).toBeVisible()

    const slot = await box(page, 'kart-item')
    expect(Math.abs(slot.x + slot.width / 2 - width / 2), 'centred').toBeLessThan(6)
    const map = await box(page, 'kart-minimap')
    const panel = await box(page, 'kart-watched')
    expect(map.x, 'the map on the left').toBeLessThan(width / 2 - map.width / 2)
    expect(map.x).toBeGreaterThanOrEqual(0)
    expect(map.y, 'the map under the slot').toBeGreaterThanOrEqual(slot.y + slot.height)
    expect(overlap(slot, map), 'the slot over the map').toBe(false)
    expect(overlap(slot, panel), 'the slot over the panel').toBe(false)
    expect(overlap(map, panel), 'the map over the panel').toBe(false)
    const close = (await page.getByTestId('kart-watch-close').boundingBox())!
    for (const [name, other] of [
      ['slot', slot],
      ['map', map],
      ['panel', panel],
    ] as const) {
      expect(overlap(other, close), `the ${name} over the close button`).toBe(false)
    }
    expect(slot.x + slot.width).toBeLessThanOrEqual(width)
    const shot = testInfo.outputPath(`watch-portrait-${width}.png`)
    await page.screenshot({ path: shot })
    await testInfo.attach(`watch-portrait-${width}`, { path: shot, contentType: 'image/png' })
  }
})
