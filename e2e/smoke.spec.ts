import { expect, test } from '@playwright/test'

// e12-t01: the app loads at all
test('the home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('TKU Arcade')
})
