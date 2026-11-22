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
  // 2026-11-21: the garage opens over the waiting room; Ann sees the pick on Bob's place card
  await bob.getByTestId('kart-lobby-garage').click()
  await bob.getByTestId('kart-room-garage').getByRole('radio', { name: /Egret/ }).click()
  await bob.getByTestId('kart-room-garage').getByRole('radio', { name: 'Clover' }).click()
  await bob.getByRole('button', { name: 'Close' }).click()
  const bobsPlace = ann.locator('[data-testid="kart-lobby-place"]', { hasText: 'Bob' })
  await expect(bobsPlace).toContainText('Egret')
  await expect(bobsPlace).toContainText('Clover')
  // Not ready yet: Ann's Start waits and says for whom
  await expect(ann.getByRole('button', { name: 'Start game' })).toBeDisabled()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Waiting for Bob to get ready')
  // 2026-11-21: the race waits for everyone to be ready (shared/protocol.ts 8.)
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
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

// 2026-11-17: a computer kart in a room of two. The host adds it in the waiting room; the host's
// browser drives it and its frames go through the room like anyone's, so both see it, and it is in
// the results with its name.
test('two people and a computer kart race one lap in one room', async ({ browser }) => {
  const viewport = { width: 480, height: 320 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'race' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  // Only the host gets the computer karts' panel
  await expect(bob.getByTestId('kart-room-bots')).toHaveCount(0)
  // 2026-11-22: the computer karts are in the waiting room's Room panel
  await ann.getByTestId('kart-lobby-settings').click()
  await ann.getByTestId('kart-room-bots-level').selectOption('normal')
  await ann.getByTestId('kart-room-bots-add').click()
  await ann.getByRole('button', { name: 'Close' }).click()
  for (const page of [ann, bob]) {
    await expect(page.getByTestId('bot-member')).toHaveText(/\(CPU\)$/)
  }
  const botName = (await ann.getByTestId('bot-member').textContent()) ?? ''
  // 2026-11-21: the race waits for everyone to be ready (shared/protocol.ts 8.)
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
  await ann.getByRole('button', { name: 'Start game' }).click()

  for (const page of [ann, bob]) await expect(page.getByTestId('kart-race')).toBeVisible()
  // Each sees the other person's kart and the computer's, from their frames
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await race(page))?.others ?? 0, { timeout: 90_000 }).toBe(2)
  }
  for (const page of [ann, bob]) {
    await expect(page.getByText('Race over')).toBeVisible({ timeout: 180_000 })
  }
  // The computer kart is in the results by name, with a time: the room judged its lap
  const results = bob.getByRole('region', { name: 'Results' })
  await expect(results).toContainText(botName)
  await expect(results.getByText(/Finished in \d:\d\d\.\d{3}/)).toHaveCount(3)
})
