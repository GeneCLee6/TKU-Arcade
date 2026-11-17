import { expect, test, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// e9 (L1–L5): an item race room with two people, each in their own browser. The room is made through the
// API on the shortest setting (one lap), both drive with the test autopilot (`?autopilot`), and the
// race has to count down, show each the other's kart, and finish with both in the results. Headless
// Chromium draws with a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface RaceReading {
  seat: number
  offset: number | null
  sent: number
  received: number
  others: number
  countdown: number | null
  counted: boolean
  crossings: number
  pickups: number
  uses: number
}

const race = (page: Page): Promise<RaceReading | null> =>
  page.evaluate(() => (window as unknown as { __kartRace?: RaceReading }).__kartRace ?? null)

test('two people race each other in one room, from the countdown to the results', async ({
  browser,
}) => {
  const viewport = { width: 480, height: 320 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  // The least to draw: two software-rendered races share one machine
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  // e10-t05: Bob picks a kart and a driver in the waiting room, and Ann sees it
  await bob.getByTestId('kart-room-garage').getByRole('radio', { name: /Egret/ }).click()
  await bob.getByTestId('kart-room-garage').getByRole('radio', { name: 'Club' }).click()
  await expect(ann.getByTestId('kart-picks')).toContainText('Egret with Club')
  await ann.getByRole('button', { name: 'Start game' }).click()

  for (const page of [ann, bob]) await expect(page.getByTestId('kart-race')).toBeVisible()
  // Both on the grid: the room's clock counts down for both
  for (const page of [ann, bob]) {
    await expect
      .poll(async () => (await race(page))?.counted ?? false, { timeout: 60_000 })
      .toBe(true)
  }
  // Each sees the other's kart, from its frames
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await race(page))?.others ?? 0, { timeout: 30_000 }).toBe(1)
    await expect(page.getByTestId('kart-place')).toBeVisible()
  }
  // Off the line: the first crossing starts lap 1
  for (const page of [ann, bob]) {
    await expect
      .poll(async () => (await race(page))?.crossings ?? 0, { timeout: 60_000 })
      .toBeGreaterThan(0)
  }
  // e9-t10: someone who comes in during the race watches it live, and can change kart
  const cara = await newPerson(browser, { viewport })
  await cara.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  await cara.goto(`/r/${id}`)
  await cara.getByRole('textbox', { name: 'Nickname' }).fill('Cara')
  await cara.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(cara.getByTestId('kart-spectate')).toBeVisible({ timeout: 30_000 })
  const watched = cara.getByTestId('kart-watched')
  await expect(watched).toContainText(/Watching (Ann|Bob)/, { timeout: 30_000 })
  const first = (await watched.textContent())?.match(/Watching (Ann|Bob)/)?.[1]
  await cara.getByRole('button', { name: 'Next kart' }).click()
  await expect(watched).toContainText(`Watching ${first === 'Ann' ? 'Bob' : 'Ann'}`)
  // Back to the standings: one less software-rendered scene on this machine
  await cara.getByTestId('kart-watch-close').click()
  await expect(cara.getByRole('button', { name: 'Watch live' })).toBeVisible()
  const reading = await race(ann)
  expect(reading?.sent).toBeGreaterThan(20)
  expect(reading?.received).toBeGreaterThan(20)
  for (const page of [ann, bob]) await expect(page.getByTestId('kart-lap')).toHaveText('Lap 1/1')
  // e9-t05: an item race. The autopilot drives through the middle box of a row and taps the item key
  for (const page of [ann, bob]) await expect(page.getByTestId('kart-item')).toBeVisible()
  await expect
    .poll(async () => (await race(ann))?.pickups ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => (await race(ann))?.uses ?? 0, { timeout: 30_000 })
    .toBeGreaterThan(0)
  // One lap, then the room's results with both names and a time
  for (const page of [ann, bob]) {
    await expect(page.getByText('Race over')).toBeVisible({ timeout: 180_000 })
  }
  await expect(ann.getByText(/Finished in \d:\d\d\.\d{3}/).first()).toBeVisible()
  await expect(ann.getByRole('button', { name: 'Rematch' })).toBeVisible()
  // e9-t10: the whole race again, from what Ann's browser recorded
  await ann.getByTestId('kart-replay-open').click()
  await expect(ann.getByTestId('kart-replay')).toBeVisible()
  const timeline = ann.getByTestId('kart-replay-timeline')
  await expect
    .poll(async () => Number(await timeline.inputValue()), { timeout: 30_000 })
    .toBeGreaterThan(60)
  await ann.getByTestId('kart-replay-play').click()
  await expect(ann.getByTestId('kart-replay-play')).toHaveAttribute('data-playing', 'false')
})
