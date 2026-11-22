import { expect, test, type Page } from '@playwright/test'

// 2026-11-21 (docs/ARCHITECTURE.md §4.60): the challenge mode. /kart's menu opens it; the missions
// are listed by chapter, the later chapters shut; the medal wall shows every track's targets with
// the hidden one; and a mission, driven by the master's hands (`?autopilot`), is passed and its
// stars kept. Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(300_000)

const prepare = async (page: Page) => {
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    // The driving school's suggestion answered: not in the way of the menu
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
  })
}

test('/kart’s menu opens the challenges: chapters, and the medal wall', async ({ page }) => {
  await prepare(page)
  await page.goto('/kart')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-challenge-open').click()
  const home = page.getByTestId('kart-challenge')
  await expect(home).toBeVisible()
  await expect(page).toHaveURL(/challenge/)
  await expect(home.getByRole('listitem')).toHaveCount(26)
  await expect(page.getByTestId('kart-challenge-chapter-basics')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('kart-challenge-chapter-technique')).not.toHaveAttribute('data-open')
  await expect(page.getByTestId('kart-challenge-start-combo10')).toBeDisabled()

  await page.getByTestId('kart-challenge-tab-medals').click()
  const riverside = page.getByTestId('kart-challenge-medal-riverside')
  await expect(riverside).toContainText('Bronze')
  await expect(riverside).toContainText('???')
  await expect(page.getByTestId('kart-challenge-medals').getByRole('article')).toHaveCount(14)

  await page.getByTestId('kart-challenge-exit').click()
  await expect(page.locator('canvas')).toBeVisible()
})

test('a mission, driven by the master’s hands, is passed and its stars kept', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart?challenge&autopilot')
  await page.getByTestId('kart-challenge-start-perfects').click()
  const run = page.getByTestId('kart-challenge-run')
  await expect(run).toHaveAttribute('data-mission', 'perfects')
  // The track and the kart are fetched first
  await expect(page.getByTestId('kart-loading')).toHaveCount(0, { timeout: 120_000 })
  await expect(run.getByRole('heading', { name: 'Perfect Five' })).toBeVisible()
  await expect(page.getByTestId('kart-challenge-count')).toContainText('/ 5')

  const result = page.getByTestId('kart-challenge-result')
  await expect(result).toBeVisible({ timeout: 240_000 })
  await expect(result).toContainText('Passed!')
  await expect(result.locator('[data-stars]')).toHaveAttribute('data-stars', /[1-3]/)

  await result.getByTestId('kart-challenge-to-list').click()
  await expect(
    page.getByTestId('kart-challenge-mission-perfects').locator('[data-stars]'),
  ).not.toHaveAttribute('data-stars', '0')
  const kept = await page.evaluate(() => localStorage.getItem('tku-arcade.kart.challenge'))
  expect(Object.keys(JSON.parse(kept ?? '{}').stars)).toEqual(['perfects'])
  expect(errors).toEqual([])
})
