import { expect, test, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// e9 (L1–L3): a race room with two people, each in their own browser. The room is made through the
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
  crossings: number
}

const race = (page: Page): Promise<RaceReading | null> =>
  page.evaluate(() => (window as unknown as { __kartRace?: RaceReading }).__kartRace ?? null)

test('two people race each other in one room, from the countdown to the results', async ({
  browser,
}) => {
  const viewport = { width: 640, height: 400 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1 } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  await ann.getByRole('button', { name: 'Start game' }).click()

  for (const page of [ann, bob]) await expect(page.getByTestId('kart-race')).toBeVisible()
  // Both on the grid: the room's clock counts down for both
  await Promise.all(
    [ann, bob].map((page) => expect(page.getByTestId('kart-countdown')).toBeVisible({ timeout: 60_000 })),
  )
  // Each sees the other's kart, from its frames
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await race(page))?.others ?? 0, { timeout: 30_000 }).toBe(1)
    await expect(page.getByTestId('kart-place')).toBeVisible()
  }
  // Off the line: the first crossing starts lap 1
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await race(page))?.crossings ?? 0, { timeout: 60_000 }).toBeGreaterThan(0)
  }
  const reading = await race(ann)
  expect(reading?.sent).toBeGreaterThan(20)
  expect(reading?.received).toBeGreaterThan(20)
  for (const page of [ann, bob]) await expect(page.getByTestId('kart-lap')).toHaveText('Lap 1/1')
  // One lap, then the room's results with both names and a time
  for (const page of [ann, bob]) {
    await expect(page.getByTestId('kart-finish').or(page.getByText('Race over'))).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText('Race over')).toBeVisible({ timeout: 180_000 })
  }
  await expect(ann.getByText(/Finished in \d:\d\d\.\d{3}/).first()).toBeVisible()
  await expect(ann.getByRole('button', { name: /rematch|play again/i })).toBeVisible()
})
