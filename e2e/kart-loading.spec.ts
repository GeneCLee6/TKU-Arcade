import { expect, test, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-21 (docs/ARCHITECTURE.md §4.52): a race's engine, its track's own scenery, the karts and
// the song are lazy chunks, fetched behind a loading screen. On a slow network the screen shows the
// track and a bar until the scene is built; a race in a room counts down only once everyone's scene
// is up; a chunk that fails to come can be asked for again.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

/** The engine's chunk (or, in `vite dev`, its module), held back `ms` before it goes */
async function slowEngine(page: Page, ms: number): Promise<void> {
  await page.route(/spikeLoop/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await route.continue()
  })
}

const race = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __kartRace?: { counted: boolean; countdown: number | null } })
        .__kartRace ?? null,
  )

test.describe('the loading screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  })

  test('/kart shows the track, a tip and the bar until the scene is up', async ({ page }) => {
    await slowEngine(page, 2500)
    await page.goto('/kart?track=harbour')
    const loading = page.getByTestId('kart-loading')
    await expect(loading).toBeVisible()
    await expect(loading).toContainText('Harbour Hairpins')
    await expect(loading).toContainText('Tip')
    await expect(loading.getByRole('progressbar')).toBeVisible()
    // Nothing drawn underneath meanwhile
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(loading).toBeHidden({ timeout: 60_000 })
    await expect(page.locator('canvas').first()).toBeVisible()
  })

  test('a track whose scenery does not come can be tried again', async ({ page }) => {
    let refused = 0
    await page.route(/harbourArt/, async (route) => {
      if (refused++ === 0) await route.abort('internetdisconnected')
      else await route.continue()
    })
    await page.goto('/kart?track=harbour')
    const loading = page.getByTestId('kart-loading')
    await expect(loading).toHaveAttribute('data-failed', 'true', { timeout: 60_000 })
    await expect(loading.getByRole('alert')).toContainText('could not load')
    await page.getByTestId('kart-loading-retry').click()
    await expect(loading).toBeHidden({ timeout: 60_000 })
    await expect(page.locator('canvas').first()).toBeVisible()
    expect(refused).toBe(2)
  })
})

// Two people and a computer kart; Bob's network is slow. The room waits for his scene: Ann's race
// shows who is on the grid, and the countdown starts only once Bob's loading screen is gone.
test('a room counts down only once everyone has built the scene', async ({ browser }) => {
  const viewport = { width: 480, height: 320 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'works', laps: 1, mode: 'race' } },
  })
  const { id } = (await response.json()) as { id: string }
  // (Bob's waiting room already fetches the race in the background: held back from the start)
  await slowEngine(bob, 15_000)
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  await ann.getByTestId('kart-room-bots-add').click()
  await expect(ann.getByTestId('bot-member')).toHaveText(/\(CPU\)$/)
  // 2026-11-21: the race waits for everyone to be ready (shared/protocol.ts 8.)
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
  await ann.getByRole('button', { name: 'Start game' }).click()

  // Bob is still loading: Ann is on the grid, waiting, and nothing counts down
  await expect(bob.getByTestId('kart-loading')).toBeVisible()
  await expect(bob.getByTestId('kart-loading')).toContainText('Viaduct Works')
  await expect(ann.getByTestId('kart-loading')).toBeHidden({ timeout: 60_000 })
  await expect(ann.getByTestId('kart-waiting')).toContainText(/2 of 3/, { timeout: 30_000 })
  expect((await race(ann))?.counted ?? false).toBe(false)
  await expect(bob.getByTestId('kart-loading-note')).toContainText(/of 3/)
  // Bob's scene comes: both count down
  await expect(bob.getByTestId('kart-loading')).toBeHidden({ timeout: 60_000 })
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await race(page))?.counted ?? false, { timeout: 60_000 }).toBe(true)
  }
})
