import { expect, test } from '@playwright/test'
import { createRoom, newPerson } from './helpers.ts'

// 2026-11-22 (owner: "let the web page and the app be played full screen"): the full-screen button
// in a room's heading (src/lib/fullscreen.ts). Chromium has the Fullscreen API, so the page itself
// goes full screen; a browser without it (an iPhone's Safari, made here by taking the API away) gets
// focus mode, the page's own top bar gone, and Esc leaves that.

test('a room goes full screen from its heading, and back', async ({ browser }) => {
  const page = await newPerson(browser)
  await createRoom(page, 'Ann')
  const button = page.getByTestId('fullscreen-button')
  await expect(button).toHaveAccessibleName('Full screen')
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'fullscreen')
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)
  await expect(button).toHaveAccessibleName('Leave full screen')
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'off')
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await page.context().close()
})

test('without the Fullscreen API the room covers its own bar instead, and Esc leaves', async ({ browser }) => {
  const page = await newPerson(browser)
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined })
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false })
  })
  await createRoom(page, 'Ann')
  await expect(page.getByRole('banner')).toBeVisible()
  const button = page.getByTestId('fullscreen-button')
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'focus')
  await expect(page.getByRole('banner')).toBeHidden()
  await expect(page.getByText(/cannot go full screen/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(button).toHaveAttribute('data-mode', 'off')
  await expect(page.getByRole('banner')).toBeVisible()
  await page.context().close()
})

// 2026-11-23 (QA follow-up, docs/NEXT.md §5): the first Esc of a race in full screen. Chromium keeps
// Esc for the page (Keyboard Lock), so it opens the pause menu; where a browser cannot (Firefox,
// Safari), its Esc ends full screen without the page hearing the key, and the menu opens then. Here
// the browser's way out is made by ending full screen from outside the page's own code
test('in a race in full screen, the first Esc opens the pause menu either way', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
    localStorage.setItem('tku-arcade.kart.schoolInvite', 'answered')
    const record = window as unknown as { locks: string[][] }
    record.locks = []
    const keyboard = (navigator as unknown as { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard
    if (keyboard?.lock) {
      const lock = keyboard.lock.bind(keyboard)
      keyboard.lock = (keys?: string[]) => {
        record.locks.push(keys ?? [])
        return lock(keys)
      }
    }
  })
  await page.goto('/kart?track=oval')
  await expect
    .poll(() => page.evaluate(() => (window as { __kartSpike?: { frames: number } }).__kartSpike?.frames ?? 0), {
      timeout: 45_000,
    })
    .toBeGreaterThan(5)
  const button = page.getByTestId('fullscreen-button')
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'fullscreen')
  // Esc kept for the page while full screen
  expect(await page.evaluate(() => (window as unknown as { locks: string[][] }).locks)).toContainEqual(['Escape'])
  // With the key kept, Esc reaches the race: its menu, still full screen
  await page.keyboard.press('Escape')
  const menu = page.getByTestId('kart-pause')
  await expect(menu).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await menu.getByTestId('kart-pause-resume').click()
  await expect(menu).toHaveCount(0)
  // A browser that cannot keep it: its Esc ends full screen, and the menu opens all the same
  await page.evaluate(() => document.exitFullscreen())
  await expect(button).toHaveAttribute('data-mode', 'off')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('data-paused', 'true')
  await page.close()
})
