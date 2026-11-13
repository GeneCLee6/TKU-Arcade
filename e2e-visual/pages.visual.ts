import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// e7-t10 (AC-7.8): the pages that look the same every time, screenshotted and scanned with axe.
// playwright.visual.config.ts says how the baselines are made (on Linux, in CI)

/** Everything the page asks the API for, answered the same way every time */
async function fixtures(page: Page) {
  // The display faces come from Google Fonts: blocked, so that every run falls back to the same
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
  await page.route('**/api/lobby', (route) => route.fulfill({ json: { rooms: [] } }))
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { configured: false, account: null } }),
  )
  await page.route('**/api/voice', (route) => route.fulfill({ json: { available: false } }))
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  // Lazy parts (the Coming soon card, the cards' pictures) have arrived
  await page.waitForLoadState('networkidle')
}

async function noAxeViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual(
    [],
  )
}

const PAGES = [
  { name: 'lobby', path: '/' },
  { name: 'rules-promotion', path: '/games/promotion/rules' },
  { name: 'rules-silent-table', path: '/games/silent-table/rules' },
  { name: 'rules-spectrum', path: '/games/spectrum/rules' },
  { name: 'rules-bluff', path: '/games/bluff/rules' },
  { name: 'not-found', path: '/no/such/page' },
] as const

const LOOKS = [
  {
    name: 'desktop-en-dark',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    scheme: 'dark',
  },
  { name: 'phone-zh-dark', viewport: { width: 375, height: 812 }, locale: 'zh-TW', scheme: 'dark' },
  {
    name: 'desktop-en-light',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    scheme: 'light',
  },
] as const

for (const look of LOOKS) {
  test.describe(look.name, () => {
    test.use({ viewport: look.viewport, locale: look.locale })
    for (const shown of PAGES) {
      // The light theme only for the lobby: the rules pages share its parts
      if (look.scheme === 'light' && shown.name !== 'lobby') continue
      test(shown.name, async ({ page }) => {
        await fixtures(page)
        if (look.scheme === 'light') {
          await page.addInitScript(() => localStorage.setItem('tku-arcade.theme', 'light'))
        }
        await page.goto(shown.path)
        await ready(page)
        await expect(page).toHaveScreenshot(`${look.name}-${shown.name}.png`, { fullPage: true })
        await noAxeViolations(page)
      })
    }
  })
}
