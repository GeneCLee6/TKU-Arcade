import { expect, test } from '@playwright/test'
import { newPerson } from './helpers.ts'

// 2026-11-21: the lobby's "Play the computer". One tap (and a nickname) from the lobby to a game of
// hold'em already dealt, against a computer player, on a phone; and the kart's two ways straight in.

const PHONE = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' as const }

test('one tap from the lobby to a hand of hold’em against the computer, on a phone', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await newPerson(browser, PHONE)
  await page.goto('/')
  const quick = page.getByTestId('quick-play')
  await expect(quick.getByRole('heading', { name: 'Play the computer' })).toBeVisible()
  // The level, Normal unless picked; Easy here
  await quick.getByRole('button', { name: 'Easy' }).click()
  await expect(quick.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')
  await quick.getByRole('button', { name: "Play Texas Hold'em against the computer now" }).click()
  await page.getByRole('textbox', { name: 'Nickname' }).fill('Ann')
  await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await page.waitForURL(/\/r\//)
  // No waiting room, no start button: the cards are dealt
  await expect(page.getByTestId('your-hand').getByRole('img')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0)
  // The room is nobody else's business: not on the lobby's public list
  const id = new URL(page.url()).pathname.split('/')[2]
  const lobby = (await (await page.request.get('/api/lobby')).json()) as { rooms: { id: string }[] }
  expect(lobby.rooms.map((room) => room.id)).not.toContain(id)
  // The computer player is at the table, at the level picked
  const summary = (await (await page.request.get(`/api/rooms/${id}`)).json()) as { seated: number }
  expect(summary.seated).toBe(2)
  await page.context().close()
})

test('the game cards say which games play the computer', async ({ page }) => {
  await page.goto('/')
  const card = (name: string) =>
    page.getByRole('heading', { level: 3, name }).locator('xpath=ancestor::li').first()
  await expect(card("Texas Hold'em")).toContainText('Plays the computer')
  await expect(card('Spectrum')).not.toContainText('Plays the computer')
})

test('the kart’s race against the computer and its driving school, one tap each', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.locator('[data-quick="kart-bots"]').click()
  await page.waitForURL(/\/kart$/)
  await expect(page.getByTestId('kart-bots-start')).toBeVisible({ timeout: 60_000 })
  await page.goto('/')
  await page.locator('[data-quick="kart-school"]').click()
  await page.waitForURL(/\/kart\?school/)
})
