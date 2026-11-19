import { expect, test, type Page } from '@playwright/test'
import { newPerson, startGame } from './helpers.ts'

// The Content-Security-Policy blocks nothing a page needs (e12-t13, docs/SECURITY.md §3): the
// lobby, a rules page, the owner's page, a board game being played and the kart racing in WebGL,
// with its sound, the web fonts and the room's WebSocket. Only a built site sends the policy
// (`_headers`, written by the build): against `npm run dev` this passes without proving anything,
// so run it against a preview (BASE_URL).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(180_000)

/** Every violation the page reports, from the start of each document */
async function watch(page: Page): Promise<string[]> {
  const seen: string[] = []
  page.on('console', (message) => {
    if (/Content.Security.Policy/i.test(message.text())) seen.push(message.text())
  })
  await page.exposeFunction('__cspViolation', (line: string) => seen.push(line))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __cspViolation(line: string): void }).__cspViolation
      report(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`)
    })
  })
  return seen
}

test('the lobby, a rules page and the owner’s page', async ({ page }) => {
  const seen = await watch(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New room' }).first()).toBeVisible()
  // The display faces come from Google Fonts
  await page.evaluate(() => document.fonts.ready)
  await page.goto('/games/promotion/rules')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/stats')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(seen).toEqual([])
})

test('a board game over its WebSocket', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  const hostSeen = await watch(host)
  const guestSeen = await watch(guest)
  await startGame(host, guest)
  await host.waitForTimeout(1_000)
  expect([...hostSeen, ...guestSeen]).toEqual([])
})

test('the kart in WebGL, with its sound', async ({ page }) => {
  const seen = await watch(page)
  await page.setViewportSize({ width: 960, height: 600 })
  await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  await page.goto('/kart/spike?track=riverside&autopilot=expert')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 })
  // A key press starts the Web Audio context; then a few seconds of driving
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(6_000)
  expect(seen).toEqual([])
})
