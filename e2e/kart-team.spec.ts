import { expect, test, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-18: a team race (shared/kart/team.ts). Two people, one on each side, and a computer kart
// the host adds; the sides are picked in the waiting room, the race shows the team gauge and the
// running score, and one lap later the results say which side won and everyone's points. Both
// people drive with the test autopilot; headless Chromium draws with a software renderer.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

const others = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __kartRace?: { others: number } }).__kartRace?.others ?? 0,
  )

test('two people on opposite sides and a computer kart race a team race', async ({ browser }) => {
  const viewport = { width: 480, height: 320 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: {
      gameId: 'kart',
      options: { track: 'riverside', laps: 1, mode: 'race', teams: 'teams' },
    },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')

  // Nobody has chosen: Ann red, Bob blue. They swap, each picking their own side
  const annTeams = ann.getByTestId('kart-room-teams')
  const bobTeams = bob.getByTestId('kart-room-teams')
  await expect(annTeams.getByTestId('kart-team-sizes')).toHaveText('Sunset 1 v Estuary 1')
  await ann.getByRole('button', { name: 'Put Ann on Estuary' }).click()
  await bobTeams.getByRole('button', { name: 'Put Bob on Sunset' }).click()
  // Only the host can move someone else
  await expect(bobTeams.getByRole('button', { name: 'Put Ann on Sunset' })).toHaveCount(0)
  // The host adds a computer kart, which fills the smaller side, and then moves it to blue
  await ann.getByTestId('kart-room-bots-add').click()
  await expect(ann.getByTestId('bot-member')).toHaveText(/\(CPU\)$/)
  await expect(annTeams.locator('li')).toHaveCount(3)
  await annTeams.locator('li').nth(2).getByTestId('kart-team-blue').click()
  for (const teams of [annTeams, bobTeams]) {
    await expect(teams.getByTestId('kart-team-sizes')).toHaveText('Sunset 1 v Estuary 2')
    await expect(teams.locator('li').nth(0)).toHaveAttribute('data-team', 'blue')
    await expect(teams.locator('li').nth(1)).toHaveAttribute('data-team', 'red')
    await expect(teams.locator('li').nth(2)).toHaveAttribute('data-team', 'blue')
  }
  // 2026-11-21: the race waits for everyone to be ready (shared/protocol.ts 8.)
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
  await ann.getByRole('button', { name: 'Start game' }).click()

  for (const page of [ann, bob]) {
    await expect(page.getByTestId('kart-race')).toBeVisible()
    // The team HUD: the gauge, the kart's own charges (none yet, so none blue) and both sides' score
    await expect(page.getByTestId('kart-team-panel')).toBeVisible()
    await expect(page.getByRole('meter', { name: 'Team gauge' })).toBeVisible()
    await expect(page.getByTestId('kart-stored')).toHaveAttribute('data-blue', '0', {
      // GO first: the team's charges are counted from the start (6.5 s of countdown, §4.44)
      timeout: 20_000,
    })
    await expect(page.getByTestId('kart-team-score')).toBeVisible()
  }
  for (const page of [ann, bob]) {
    await expect.poll(() => others(page), { timeout: 90_000 }).toBe(2)
  }
  for (const page of [ann, bob]) {
    await expect(page.getByText(/(Sunset|Estuary) wins, \d+ to \d+/)).toBeVisible({
      timeout: 180_000,
    })
  }
  // Everyone with their side, and a time or the laps done (on a busy machine the software-drawn
  // karts may not all be home in the 30 seconds after the winner); the winner's points
  const results = bob.getByRole('region', { name: 'Results' })
  await expect(
    results.getByText(/(Sunset|Estuary) · (finished in \d:\d\d\.\d{3}|did not finish)/),
  ).toHaveCount(3)
  await expect(results.getByText(/(Sunset|Estuary) · finished in/).first()).toBeVisible()
  await expect(results.getByText('Score: 10', { exact: true })).toHaveCount(1)
})
