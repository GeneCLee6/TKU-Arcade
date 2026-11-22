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
