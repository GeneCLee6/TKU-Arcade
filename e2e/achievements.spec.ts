import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { newPerson } from './helpers.ts'

// e11-t06 (AC-11.3, docs/ARCHITECTURE.md §4.82): achievements kept in the browser. A time trial on the
// test oval, driven to the finish by the autopilot, unlocks "Chequered Debut": its badge waits for
// the finish (never over the race), then the profile page shows it unlocked. And the lobby's way in,
// the wall's filter and the hidden ones, in both languages, with no serious axe problems. Headless
// Chromium draws with a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

const BLOCKING = new Set(['serious', 'critical'])

async function expectNoSeriousProblems(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking).toEqual([])
}

test('a first time trial to the finish unlocks its badge, then the profile shows it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    // No driving school suggestion over the race
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
  })
  await page.goto('/kart?track=oval&autopilot')
  await expect(page.locator('canvas')).toBeVisible()
  // While the race runs nothing is shown: the badge waits for the finish
  await expect(page.getByTestId('kart-countdown')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByTestId('achievement-popup')).toHaveCount(0)
  await expect(page.getByTestId('kart-results')).toBeVisible({ timeout: 200_000 })
  const badge = page.getByTestId('achievement-popup')
  await expect(badge).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status', { name: 'Achievements' })).toContainText('Achievement unlocked')
  await expect(page.locator('#achievement-popups')).toContainText('Chequered Debut')
  // Kept in this browser, as the store's format says
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('tku-arcade.achievements') ?? '{}'))
  expect(kept.format).toBe(1)
  expect(kept.unlocked['kart-first-finish']).toBeGreaterThan(0)
  expect(kept.stats.n['kart.finishes']).toBe(1)

  // The badge's link goes to the profile without a reload
  await page.locator('#achievement-popups').getByRole('link', { name: 'Open my profile' }).first().click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeAttached()
  const tile = page.getByTestId('achievement-kart-first-finish')
  await expect(tile).toHaveAttribute('data-unlocked', 'true')
  await expect(tile).toContainText('Chequered Debut')
  await expect(page.getByTestId('achievement-kart-finish-25')).toContainText('1 / 25')
})

test('the lobby leads to the profile; the wall filters, hides the hidden ones and passes axe', async ({ browser }) => {
  const page = await newPerson(browser, { locale: 'zh-TW', viewport: { width: 390, height: 844 } })
  await page.goto('/')
  await page.getByTestId('profile-link').click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { level: 1, name: '我的檔案' })).toBeAttached()
  await expect(page.getByTestId('profile-card')).toContainText('訪客選手')
  await expect(page.getByTestId('profile-percent')).toHaveText('0%')
  await expect(page.getByTestId('achievement-kart-combo-15')).toContainText('隱藏成就')
  await page.getByRole('button', { name: '桌遊' }).click()
  await expect(page.getByTestId('achievement-wall').getByRole('listitem').first()).toContainText('牌桌首勝')
  await expect(page.getByTestId('achievement-kart-first-finish')).toHaveCount(0)
  // No sideways scroll on a phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expectNoSeriousProblems(page)
  await page.context().close()
})
