import { expect, test } from '@playwright/test'
import { newPerson } from './helpers.ts'

// 2026-11-21: the lobby's "Play the computer". One tap (and a nickname) from the lobby to a game of
// hold'em already dealt, against five computer players (2026-11-22: as many as the person picks, five
// first), on a phone; and the kart's two ways straight in.

const PHONE = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' as const }

test('one tap from the lobby to a hand of hold’em against five computers, on a phone', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await newPerson(browser, PHONE)
  await page.goto('/')
  const quick = page.getByTestId('quick-play')
  await expect(quick.getByRole('heading', { name: 'Play the computer' })).toBeVisible()
  // The level, Normal unless picked; Easy here
  await quick.getByRole('button', { name: 'Easy' }).click()
  await expect(quick.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')
  // Five computer players unless the person picks another number
  await expect(quick.locator('[data-quick-count="holdem"]')).toHaveText('5')
  await quick.getByRole('button', { name: "Play now: Texas Hold'em against the computer" }).click()
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
  // The five computer players are at the table with Ann, and on screen
  const summary = (await (await page.request.get(`/api/rooms/${id}`)).json()) as { seated: number }
  expect(summary.seated).toBe(6)
  await page.context().close()
})

test('a full table: eight computer players, each at the level picked for it', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await newPerson(browser)
  await page.goto('/')
  const quick = page.getByTestId('quick-play')
  const more = quick.getByRole('button', { name: "One computer player more: Texas Hold'em" })
  for (let i = 0; i < 3; i++) await more.click()
  await expect(more).toBeDisabled()
  await expect(quick.locator('[data-quick-count="holdem"]')).toHaveText('8')
  await quick.getByRole('button', { name: 'Pick each' }).click()
  await quick.locator('[data-quick-bot="holdem-1"]').click()
  await expect(quick.locator('[data-quick-bot="holdem-1"]')).toHaveText('1 Easy')
  await quick.getByRole('button', { name: "Play now: Texas Hold'em against the computer" }).click()
  await page.getByRole('textbox', { name: 'Nickname' }).fill('Ann')
  await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await page.waitForURL(/\/r\//)
  await expect(page.getByTestId('your-hand').getByRole('img')).toHaveCount(2, { timeout: 20_000 })
  const id = new URL(page.url()).pathname.split('/')[2]
  const summary = (await (await page.request.get(`/api/rooms/${id}`)).json()) as { seated: number }
  expect(summary.seated).toBe(9)
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
