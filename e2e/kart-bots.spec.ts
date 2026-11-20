import { expect, test, type Page } from '@playwright/test'

// Racing the computer (owner 2026-11-17; docs/ARCHITECTURE.md §4.20): /kart's menu starts an item
// race against a computer kart, run by the race room's own rules in this browser. The player drives
// with the test autopilot (`?autopilot`); the race counts down, the bot's kart is drawn from its
// frames, both pick up boxes, and the results come up with both names. Headless Chromium draws with
// a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface RaceReading {
  counted: boolean
  countdown: number | null
  others: number
  crossings: number
  pickups: number
}

const race = (page: Page): Promise<RaceReading | null> =>
  page.evaluate(() => (window as unknown as { __kartRace?: RaceReading }).__kartRace ?? null)

test('one person races a computer kart in an item race, from the menu to the results', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
  await page.goto('/kart?autopilot')
  // Below 1180 px the top row's controls are in its menu
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await expect(setup).toBeVisible()
  await setup.getByTestId('kart-bots-track').selectOption('riverside')
  await setup.getByTestId('kart-bots-count').selectOption('1')
  // 2026-11-20 (§4.40): four levels, the expert the fourth
  await expect(setup.getByTestId('kart-bots-difficulty').locator('option')).toHaveText([
    'Easy',
    'Normal',
    'Hard',
    'Expert',
  ])
  await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
  await setup.getByTestId('kart-bots-mode').selectOption('items')
  await setup.getByTestId('kart-bots-laps').selectOption('1')
  await setup.getByTestId('kart-bots-start').click()

  await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 30_000 })
  // 2026-11-20 (§4.43): the fly round the grid first, with the track and the laps, skipped by a key
  const intro = page.getByTestId('kart-intro')
  await expect(intro).toBeVisible({ timeout: 30_000 })
  await expect(intro).toContainText('Laps: 1')
  await page.keyboard.press('KeyM')
  await expect(intro).toBeHidden()
  await expect
    .poll(async () => (await race(page))?.counted ?? false, { timeout: 30_000 })
    .toBe(true)
  // 2026-11-20: on its place on the grid and drawn there during the countdown, before GO
  await expect
    .poll(
      async () => {
        const reading = await race(page)
        return (reading?.countdown ?? 0) > 0 ? (reading?.others ?? 0) : -1
      },
      { timeout: 30_000 },
    )
    .toBe(1)
  // The bot's kart, drawn from the frames it sends the room
  await expect.poll(async () => (await race(page))?.others ?? 0, { timeout: 30_000 }).toBe(1)
  await expect(page.getByTestId('kart-item')).toBeVisible()
  // The item slot is at the top of the screen, in the middle (owner 2026-11-18), clear of the place
  // and of the button that leaves the race
  const slot = (await page.getByTestId('kart-item').boundingBox())!
  expect(Math.abs(slot.x + slot.width / 2 - 480)).toBeLessThan(8)
  expect(slot.y + slot.height).toBeLessThan(150)
  expect(slot.width).toBeGreaterThan(120)
  const place = (await page.getByTestId('kart-place').boundingBox())!
  const quit = (await page.getByRole('button', { name: 'Quit the race' }).boundingBox())!
  expect(place.x + place.width).toBeLessThanOrEqual(quit.x)
  expect(quit.x + quit.width).toBeLessThan(slot.x)
  await expect
    .poll(async () => (await race(page))?.pickups ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0)
  // One lap: the finish's show (the place, the confetti), then the results with both karts
  await expect(page.getByTestId('kart-celebration')).toBeVisible({ timeout: 180_000 })
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 180_000 })
  await expect(results.getByTestId('kart-standings').locator('li')).toHaveCount(2)
  await expect(results).toContainText('(CPU)')
  await expect(results.getByTestId('kart-bots-again')).toBeVisible()

  // 2026-11-20 (docs/KART-NETCODE.md §11.4): the race kept as a file, and opened again from it
  const save = results.getByTestId('kart-replay-download')
  await expect(save).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  expect(download.suggestedFilename()).toMatch(/^tku-kart-riverside-\d{8}-\d{4}\.tkureplay$/)
  const file = testInfo.outputPath('race.tkureplay')
  await download.saveAs(file)
  await page.goto('/kart/replay')
  const picker = page.getByTestId('kart-replay-file')
  await picker.getByTestId('kart-replay-file-input').setInputFiles({
    name: 'nonsense.tkureplay',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a replay at all'),
  })
  await expect(picker.getByTestId('kart-replay-problem')).toHaveAttribute('data-problem', 'notReplay')
  await picker.getByTestId('kart-replay-file-input').setInputFiles(file)
  await expect(page.getByTestId('kart-replay')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('kart-replay')).toContainText('(CPU)')
  await expect(page.getByTestId('kart-replay-notice')).toHaveCount(0)
})
