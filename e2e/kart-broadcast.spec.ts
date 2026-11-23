import { expect, test, type Locator, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): a room where one person races a computer
// kart and another watches. The watcher turns the broadcast on: the director cuts between the karts
// and the shots by itself, and the standings and the kart on screen keep up; H hides the interface
// and brings it back. Once the race is over the racer watches its highlights, played with the
// broadcast, and the overlay keeps its share of the picture at 1080p and 1440p. Headless Chromium
// draws with a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(300_000)

interface RaceReading {
  counted: boolean
  crossings: number
}

const race = (page: Page): Promise<RaceReading | null> =>
  page.evaluate(() => (window as unknown as { __kartRace?: RaceReading }).__kartRace ?? null)

const attribute = async (locator: Locator, name: string) => (await locator.getAttribute(name)) ?? ''

test('a watcher turns the broadcast on: it cuts by itself, the overlay keeps up; then the highlights', async ({
  browser,
}) => {
  const ann = await newPerson(browser, { viewport: { width: 480, height: 320 } })
  await ann.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await ann.getByTestId('kart-lobby-settings').click()
  await ann.getByTestId('kart-room-bots-level').selectOption('easy')
  await ann.getByTestId('kart-room-bots-add').click()
  await ann.getByRole('button', { name: 'Close' }).click()
  await expect(ann.getByTestId('bot-member')).toHaveText(/\(CPU\)$/)
  await ann.getByRole('button', { name: 'Start game' }).click()
  await expect(ann.getByTestId('kart-race')).toBeVisible()
  await expect
    .poll(async () => (await race(ann))?.crossings ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0)

  // Bob comes in during the race and watches it live, with the broadcast on
  const bob = await newPerson(browser, { viewport: { width: 960, height: 540 } })
  await bob.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  await bob.goto(`/r/${id}`)
  await bob.getByRole('textbox', { name: 'Nickname' }).fill('Bob')
  await bob.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(bob.getByTestId('kart-spectate')).toBeVisible({ timeout: 30_000 })
  await bob.getByTestId('kart-broadcast-toggle').click()
  await expect(bob.getByTestId('kart-broadcast-toggle')).toHaveAttribute('aria-pressed', 'true')
  const overlay = bob.getByTestId('kart-broadcast')
  await expect(overlay).toBeVisible({ timeout: 30_000 })
  // The standings: both karts, the leader first
  const tower = bob.getByTestId('kart-broadcast-standings')
  await expect(tower.getByRole('listitem')).toHaveCount(2)
  await expect(tower.getByRole('listitem').first()).toContainText('Leader')
  await expect(bob.getByTestId('kart-broadcast-focus')).toContainText('km/h')
  // The director cuts by itself: more cuts, more than one kind of shot, the speed moving
  const firstCuts = Number(await attribute(overlay, 'data-cuts'))
  const shots = new Set<string>([await attribute(overlay, 'data-shot')])
  const speeds = new Set<string>()
  await expect
    .poll(
      async () => {
        shots.add(await attribute(overlay, 'data-shot'))
        speeds.add((await bob.getByTestId('kart-broadcast-focus').textContent()) ?? '')
        return Number(await attribute(overlay, 'data-cuts')) > firstCuts + 1 && shots.size >= 2
      },
      { timeout: 60_000, intervals: [250] },
    )
    .toBe(true)
  expect(speeds.size).toBeGreaterThan(1)
  // H: the interface hidden, a clean picture; H again, back
  await bob.keyboard.press('KeyH')
  await expect(bob.getByTestId('kart-spectate')).toHaveAttribute('data-clean', 'true')
  await expect(overlay).toBeHidden()
  await expect(bob.getByTestId('kart-watch-close')).toBeHidden()
  await bob.keyboard.press('KeyH')
  await expect(overlay).toBeVisible()
  // Choosing a kart oneself ends the broadcast
  await bob.getByRole('button', { name: 'Next kart' }).click()
  await expect(bob.getByTestId('kart-broadcast-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(overlay).toHaveCount(0)
  await expect(bob.getByTestId('kart-watched')).toBeVisible()
  // One less software-rendered scene on this machine
  await bob.getByTestId('kart-watch-close').click()

  // The race over: Ann watches its highlights, played with the broadcast
  await expect(ann.getByText('Race over')).toBeVisible({ timeout: 200_000 })
  await ann.setViewportSize({ width: 960, height: 540 })
  await ann.getByTestId('kart-highlights-results').click()
  await expect(ann.getByTestId('kart-replay')).toBeVisible()
  const banner = ann.getByTestId('kart-highlight-banner')
  await expect(banner).toContainText(/Highlight 1\/\d/, { timeout: 30_000 })
  await expect(ann.getByTestId('kart-broadcast')).toHaveAttribute('data-shot', /\w+/)
  await expect(ann.getByTestId('kart-replay-play')).toHaveAttribute('data-playing', 'true')

  // A projector and a big monitor: the standings cover the same share of the picture
  const share: number[] = []
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    await ann.setViewportSize({ width, height })
    await expect
      .poll(async () => ((await ann.getByTestId('kart-broadcast-standings').boundingBox())?.width ?? 0) / width, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.15)
    const box = (await ann.getByTestId('kart-broadcast-standings').boundingBox())!
    share.push(box.width / width)
  }
  expect(Math.abs(share[0]! - share[1]!)).toBeLessThan(0.01)
})
