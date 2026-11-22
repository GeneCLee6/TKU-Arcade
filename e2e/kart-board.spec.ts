import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// 2026-11-23 (docs/ARCHITECTURE.md §4.81): the time trial's leaderboard, end to end through the real
// Worker and D1. A time trial driven by the autopilot (`?autopilot`) finishes; its results offer the
// upload, the nickname filled in; the run goes up and ranks; the leaderboard shows it; its replay
// downloads as a .tkureplay file; and its ghost races along in the time trial. Headless Chromium draws
// with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(420_000)

// A nickname of its own, so that a shared preview database's board does not get in the way
const NICK = `E2E${Math.floor(Math.random() * 1e6)}`
const TRACK = 'fort'

const prepare = async (page: Page) => {
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript((nick) => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
    localStorage.setItem('tku-arcade.nickname', nick)
  }, NICK)
}

test('a time trial goes up on the leaderboard, and its replay comes back as a ghost', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)

  // The menu's way in: the week's track first, then any track by the picker
  await page.goto('/kart')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-board-open').click()
  const board = page.getByTestId('kart-board')
  await expect(board).toBeVisible()
  await expect(page).toHaveURL(/board/)
  await page.getByTestId('kart-board-track').selectOption(TRACK)
  await expect(page.getByTestId('kart-board-you')).toBeVisible()
  await page.getByTestId('kart-board-exit').click()

  // A run, driven by the autopilot
  await page.goto(`/kart?track=${TRACK}&autopilot`)
  await expect(page.getByTestId('kart-loading')).toHaveCount(0, { timeout: 120_000 })
  const results = page.getByTestId('kart-results')
  await expect(results).toBeVisible({ timeout: 300_000 })
  const card = results.getByTestId('kart-board-upload')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('kart-board-nick')).toHaveValue(NICK)
  await card.getByTestId('kart-board-send').click()
  const placed = card.getByTestId('kart-board-placed')
  await expect(placed).toBeVisible({ timeout: 30_000 })
  await expect(placed).toContainText(/#\d+ of \d+/)

  // On the board, with its replay
  await card.getByTestId('kart-board-view').click()
  await expect(board).toBeVisible()
  await expect(page.getByTestId('kart-board-track')).toHaveValue(TRACK)
  const row = page.locator(`[data-testid="kart-board-row"][data-nick="${NICK}"]`)
  await expect(row).toBeVisible()
  await expect(page.getByTestId('kart-board-you')).toContainText('Your rank')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row.getByTestId('kart-board-download').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.tkureplay$/)
  const bytes = await readFile((await download.path())!)
  expect(bytes.byteLength).toBeGreaterThan(1000)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('TKUR')

  // Its ghost races along in the time trial on its track
  await row.getByTestId('kart-board-chase').click()
  await expect(board).toHaveCount(0)
  const chasing = page.getByTestId('kart-board-chasing')
  await expect(chasing).toBeVisible({ timeout: 60_000 })
  await expect(chasing).toContainText(NICK)
  await expect(page.getByTestId('kart-course')).toHaveValue(TRACK)
  await expect(page.getByTestId('kart-countdown')).toBeVisible({ timeout: 120_000 })
  await page.getByTestId('kart-board-stop-chase').click()
  await expect(chasing).toHaveCount(0)
  expect(errors).toEqual([])
})
