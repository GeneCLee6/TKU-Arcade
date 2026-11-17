import { expect, test } from '@playwright/test'

// The Grand Prix (owner 2026-11-17; docs/ARCHITECTURE.md §4.22): /kart's menu (through the race
// against the computer's panel) starts the tests' own
// one-race cup (shown only with `?autopilot`) against one computer kart, one lap. A reload before
// the race finds the cup where it was; the race runs to the finish on the test autopilot; the
// standings go on to the podium, which a reload keeps too; done, the menu shows the cup's best.
// Headless Chromium draws with a software renderer (the flag lets it): slow, but the physics keeps
// time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

test('a one-race cup from the menu to the podium, kept across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
  await page.goto('/kart?autopilot')
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  await page.getByTestId('kart-cup-open').click()
  const setup = page.getByTestId('kart-cup-setup')
  await expect(setup).toBeVisible()
  await setup.getByTestId('kart-cup-cup').selectOption('sprint')
  await setup.getByTestId('kart-cup-count').selectOption('1')
  await setup.getByTestId('kart-cup-difficulty').selectOption('easy')
  await setup.getByTestId('kart-cup-mode').selectOption('race')
  await setup.getByTestId('kart-cup-laps').selectOption('1')
  await expect(setup.getByTestId('kart-cup-best')).toHaveText('Not won a place yet')
  await setup.getByTestId('kart-cup-start').click()

  const ready = page.getByTestId('kart-cup-ready')
  await expect(ready).toBeVisible({ timeout: 30_000 })
  await expect(ready.getByTestId('kart-cup-race')).toHaveText('Race 1 of 1: Riverside (graybox)')
  await expect(ready).toContainText('(CPU)')
  // A reload finds the cup where it was
  await page.reload()
  await expect(ready).toBeVisible({ timeout: 30_000 })
  await ready.getByTestId('kart-cup-start-race').click()

  await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 30_000 })
  const results = page.getByTestId('kart-bots-results')
  await expect(results).toBeVisible({ timeout: 180_000 })
  await expect(results.getByTestId('kart-bots-again')).toHaveCount(0)
  await results.getByTestId('kart-cup-next').click()

  const podium = page.getByTestId('kart-cup-podium')
  await expect(podium).toBeVisible()
  await expect(podium.getByTestId('kart-cup-trophy')).toBeVisible()
  await expect(podium.locator('[data-place]')).toHaveCount(2)
  await expect(podium.getByTestId('kart-cup-standings').locator('tbody tr')).toHaveCount(2)
  const outcome = await podium.getByTestId('kart-cup-outcome').textContent()
  expect(outcome).toMatch(/^You took place [12] of 2, with [35] points$/)
  // The podium stays for a reload, until it is left
  await page.reload()
  await expect(podium).toBeVisible({ timeout: 30_000 })
  await podium.getByTestId('kart-cup-done').click()

  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  await page.getByTestId('kart-cup-open').click()
  await setup.getByTestId('kart-cup-cup').selectOption('sprint')
  await expect(setup.getByTestId('kart-cup-best')).toHaveText(
    /^Your best: place [12], [35] points$/,
  )
  await expect(setup.getByTestId('kart-cup-continue')).toHaveCount(0)
})
