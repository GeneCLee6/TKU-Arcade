import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinRoom, newPerson } from './helpers.ts'

// e7-t05 (AC-7.4): the lobby and the waiting room on a phone held upright
const PHONE = { width: 375, height: 667 }
const device = { viewport: PHONE, hasTouch: true, isMobile: true }

test.use(device)

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** The page's own tap targets are a finger's height. The in-game dock is out of this spec's scope */
async function expectFingerSizedControls(page: Page, names: (string | RegExp)[]) {
  for (const name of names) {
    const box = await page.getByRole('button', { name }).first().boundingBox()
    expect(box?.height, String(name)).toBeGreaterThanOrEqual(44)
  }
}

test.describe('the lobby at 375 px', () => {
  for (const [locale, newRoom, theme] of [
    ['en-US', 'New room', 'Dark'],
    ['zh-TW', '開新房', '深色'],
  ]) {
    test(`${locale}: fits, and "New room" is on the first screen`, async ({ browser }) => {
      const page = await newPerson(browser, { ...device, locale })
      await page.goto('/')
      const button = page.getByRole('button', { name: newRoom }).first()
      await expect(button).toBeVisible()
      await expectNoSidewaysScroll(page)
      await expectFingerSizedControls(page, [newRoom, theme])
      const box = await button.boundingBox()
      expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(PHONE.height)
      await page.context().close()
    })
  }

  test('the top bar stays one row, down to a 360 px phone', async ({ browser }) => {
    for (const locale of ['en-US', 'zh-TW']) {
      const page = await newPerson(browser, {
        ...device,
        viewport: { width: 360, height: 640 },
        locale,
      })
      await page.goto('/')
      const bar = await page.locator('header').boundingBox()
      expect(bar?.height, locale).toBeLessThanOrEqual(70)
      await page.context().close()
    }
  })

  test('a public room with the longest of names stays inside its row', async ({ page, browser }) => {
    await page.goto('/')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'New room' }).first().click()
    await page.getByRole('textbox', { name: 'Nickname' }).fill('W'.repeat(16))
    await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
    await page.waitForURL(/\/r\//)

    const looker = await newPerson(browser, device)
    await looker.goto('/')
    const join = looker.getByRole('button', { name: /WWWW/ }).first()
    await expect(join).toBeVisible()
    await expectNoSidewaysScroll(looker)
    expect((await join.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await looker.context().close()
  })

  test('the nickname dialog fits above the keyboard edge, with a reachable Close', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New room' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box?.width).toBe(PHONE.width)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(PHONE.height)
    await expectFingerSizedControls(page, ['Close', 'Continue'])
  })
})

test.describe('the waiting room at 375 px', () => {
  test('fits with the longest names, for the host and a guest', async ({ page, browser }) => {
    await createRoom(page, 'W'.repeat(16))
    const guest = await newPerson(browser, device)
    await joinRoom(guest, page.url(), 'M'.repeat(16))
    await expect(page.getByText('M'.repeat(16))).toBeVisible()

    await expectNoSidewaysScroll(page)
    await expectNoSidewaysScroll(guest)
    await expectFingerSizedControls(page, ['Start game', 'Copy link', /^Make host/])
    await guest.context().close()
  })

  test('the invitation comes before the game setup', async ({ page }) => {
    await createRoom(page, 'Ann')
    const invite = await page.getByRole('heading', { name: 'Invite friends' }).boundingBox()
    const setup = await page.getByRole('heading', { name: 'Game and rules' }).boundingBox()
    expect(invite?.y ?? Infinity).toBeLessThan(setup?.y ?? 0)
  })

  test('nothing stays stuck behind the chat bar at the end of the page', async ({ page }) => {
    await createRoom(page, 'Ann')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const back = page.getByRole('link', { name: 'Back to the lobby' })
    await expect(back).toBeInViewport({ ratio: 1 })
    await back.click({ trial: true })
    const box = await back.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })
})
