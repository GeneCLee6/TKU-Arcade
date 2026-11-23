import { expect, test, type Page } from '@playwright/test'
import { newPerson } from './helpers.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.83): the kart's online races, end to end through the real Worker,
// LobbyDO and RoomDO. Ann opens the online page from /kart's top-left links and quick joins: an open public room,
// or (none open, as on a fresh dev server) a new public one with a computer kart waiting. Bob, in his
// own browser, finds that room in the list and joins it from there; both are in its waiting room.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(180_000)

const prepare = async (page: Page, nick: string) => {
  await page.addInitScript((name) => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
    localStorage.setItem('tku-arcade.nickname', name)
  }, nick)
}

test('one quick joins from the kart page, the other finds that room in the list and joins it', async ({
  browser,
}) => {
  const viewport = { width: 1100, height: 720 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport: { width: 390, height: 844 } })
  const errors: string[] = []
  for (const page of [ann, bob]) page.on('pageerror', (error) => errors.push(error.message))
  await prepare(ann, 'Ann')
  await prepare(bob, 'Bob')

  // Ann: /kart → Online (top left, beside the track editor) → Quick join, with one computer kart should a room open
  await ann.goto('/kart')
  await ann.getByTestId('kart-online-open').click()
  await expect(ann.getByTestId('kart-online')).toBeVisible()
  await expect(ann).toHaveURL(/online/)
  await ann.getByTestId('kart-online-quick-bots').selectOption('1')
  await ann.getByTestId('kart-online-quick').click()
  await ann.waitForURL(/\/r\/[A-Za-z0-9]{10}/)
  const id = new URL(ann.url()).pathname.split('/')[2]!
  await expect(ann.getByRole('heading', { name: 'Starting line-up' })).toBeVisible({ timeout: 60_000 })

  // Bob (a phone): the online page lists Ann's room, waiting and open, and he joins from its row
  await bob.goto('/kart?online')
  await expect(bob.getByTestId('kart-online')).toBeVisible()
  const row = bob.locator(`[data-testid="kart-online-room"][data-room="${id}"]`)
  // The list asks every 10 s (and the Worker reuses an answer for 2 s): Refresh to be sure
  await expect
    .poll(
      async () => {
        if ((await row.count()) > 0) return true
        await bob.getByTestId('kart-online-refresh').click()
        return false
      },
      { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(true)
  await expect(row).toHaveAttribute('data-state', 'open')
  await expect(row).toContainText('Waiting')
  await row.getByTestId('kart-online-go').click()
  await bob.waitForURL(new RegExp(`/r/${id}`))
  await expect(bob.getByRole('heading', { name: 'Starting line-up' })).toBeVisible({ timeout: 60_000 })

  // Both in the one waiting room
  await expect(ann.locator('[data-testid="kart-lobby-place"]', { hasText: 'Bob' })).toBeVisible({ timeout: 30_000 })
  await expect(bob.locator('[data-testid="kart-lobby-place"]', { hasText: 'Ann' }).first()).toBeAttached()
  expect(errors).toEqual([])
})
