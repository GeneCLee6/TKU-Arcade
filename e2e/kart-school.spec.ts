import { expect, test, type Page } from '@playwright/test'

// 2026-11-20 (docs/ARCHITECTURE.md §4.50): the driving school. /kart suggests it the first time and
// its menu opens it; a lesson shows its goal and the player's own keys; and, driven by the master's
// hands (`?autopilot`), the first two lessons are passed one after the other, their stars kept.
// Headless Chromium draws with a software renderer (the flag lets it).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

const prepare = async (page: Page) => {
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
}

test('/kart suggests the driving school the first time, and its menu opens it', async ({ page }) => {
  await prepare(page)
  await page.goto('/kart')
  const invite = page.getByTestId('kart-school-invite')
  await expect(invite).toBeVisible()
  await invite.getByTestId('kart-school-invite-go').click()
  const school = page.getByTestId('kart-school')
  await expect(school).toBeVisible()
  await expect(school.getByRole('listitem')).toHaveCount(11)
  await expect(page).toHaveURL(/school/)
  // Back on /kart the suggestion, once answered, is gone; the menu still has the school
  await page.getByTestId('kart-school-exit').click()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('kart-school-invite')).toHaveCount(0)
  // At this width the controls fold into the menu
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-school-open').click()
  await expect(page.getByTestId('kart-school')).toBeVisible()
})

test('the first two lessons, driven by the master’s hands, are passed and their stars kept', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepare(page)
  await page.goto('/kart?school&autopilot')
  await page.getByTestId('kart-school-start-drive').click()
  const lesson = page.getByTestId('kart-school-lesson')
  await expect(lesson).toHaveAttribute('data-lesson', 'drive')
  // The loading screen has the lesson's name as a heading too: past it first (§4.52)
  await expect(page.getByTestId('kart-loading')).toHaveCount(0, { timeout: 120_000 })
  await expect(lesson.getByRole('heading', { name: 'Gas and steering' })).toBeVisible()
  // How to do it, with the player's own keys
  await lesson.locator('details summary').click()
  await expect(lesson.getByTestId('kart-school-key').first()).toHaveText('Up arrow')
  await expect(page.getByTestId('kart-school-count')).toContainText('0 / 1')
  // 2026-11-23 (#152): the lesson's own row has a pause button, opening the same menu as Esc
  await page.getByTestId('kart-pause-button').click()
  await expect(page.getByTestId('kart-pause')).toHaveAttribute('data-paused', 'true')
  await page.getByTestId('kart-pause-resume').click()
  await expect(page.getByTestId('kart-pause')).toHaveCount(0)

  const result = page.getByTestId('kart-school-result')
  await expect(result).toBeVisible({ timeout: 150_000 })
  await expect(result).toContainText('Passed!')
  await result.getByTestId('kart-school-next').click()

  await expect(lesson).toHaveAttribute('data-lesson', 'drift')
  await expect(page.getByTestId('kart-school-count')).toContainText('/ 3')
  await expect(result).toBeVisible({ timeout: 150_000 })
  await expect(result).toContainText('Passed!')
  await expect(result.locator('[data-stars]')).toHaveAttribute('data-stars', /[1-3]/)

  await result.getByRole('button', { name: 'All lessons' }).click()
  await expect(page.getByTestId('kart-school-lesson-drive').locator('[data-stars]')).not.toHaveAttribute(
    'data-stars',
    '0',
  )
  await expect(page.getByTestId('kart-school-lesson-drift').locator('[data-stars]')).not.toHaveAttribute(
    'data-stars',
    '0',
  )
  const kept = await page.evaluate(() => localStorage.getItem('tku-arcade.kart.school'))
  expect(Object.keys(JSON.parse(kept ?? '{}'))).toEqual(['drive', 'drift'])
  expect(errors).toEqual([])
})
