import { expect, test, type Page } from '@playwright/test'
import {
  createRoom,
  joinRoom,
  newPerson,
  playSilentRound,
  playToResult,
  silentTablePlayers,
  startGame,
} from './helpers.ts'

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

/** Tap targets are a finger's height */
async function expectFingerSizedControls(page: Page, names: (string | RegExp)[]) {
  for (const name of names) {
    const box = await page.getByRole('button', { name }).first().boundingBox()
    expect(box?.height, String(name)).toBeGreaterThanOrEqual(44)
  }
}

test.describe('the lobby at 375 px', () => {
  for (const [locale, newRoom, theme] of [
    ['en-US', 'New room', 'Dark'],
    ['zh-TW', '建立房間', '深色'],
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
    const join = looker.getByRole('button', { name: /WWWW/ }).first()
    // A room is listed once its host has joined, and the home page asks only every 15 s
    await expect(async () => {
      await looker.goto('/')
      await expect(join).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
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

test.describe('the rules at 375 px', () => {
  test('the page fits, table included, and the card links to it with a finger-sized link', async ({
    page,
  }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: 'How to play Promotion' })
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await link.tap()
    await expect(page.getByRole('table')).toBeVisible()
    await expectNoSidewaysScroll(page)
    const table = await page.getByRole('table').boundingBox()
    expect((table?.x ?? 0) + (table?.width ?? Infinity)).toBeLessThanOrEqual(PHONE.width)
    const back = await page.getByRole('link', { name: 'Back to the lobby' }).boundingBox()
    expect(back?.height).toBeGreaterThanOrEqual(44)
  })

  test('how to play is a sheet that scrolls inside the screen', async ({ page }) => {
    await createRoom(page, 'Ann')
    await expectFingerSizedControls(page, ['How to play'])
    await page.getByRole('button', { name: 'How to play' }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('table')).toBeVisible()
    await expectNoSidewaysScroll(page)
    const box = await dialog.boundingBox()
    expect((box?.y ?? -1) >= 0).toBe(true)
    expect((box?.y ?? 0) + (box?.height ?? Infinity)).toBeLessThanOrEqual(PHONE.height)
    await expectFingerSizedControls(page, ['Close'])
    // The last line of a long text can be reached
    const last = dialog.getByRole('table')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
  })
})

test.describe('the game at 375 px', () => {
  test('its controls are finger-sized and the page does not scroll sideways', async ({
    page,
    browser,
  }) => {
    const guest = await newPerson(browser, device)
    await startGame(page, guest)
    await expectNoSidewaysScroll(page)
    await expectFingerSizedControls(page, [/^Roll$/, /^Members$/, /^Chat$/, 'Zoom in', 'Zoom out', /^Fit$/])
    await expectFingerSizedControls(page, [/^Ann$/, /^Bob$/])
    await guest.context().close()
  })

  test('the result fits, and is on the screen when the game ends', async ({ page, browser }) => {
    test.setTimeout(90_000)
    const guest = await newPerson(browser, { ...device, reducedMotion: 'reduce' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const result = await playToResult(page, guest)
    await expect(result.getByRole('heading', { name: 'Result' })).toBeInViewport()
    await expectNoSidewaysScroll(page)
    await expectFingerSizedControls(page, ['Rematch'])
    const back = await result.getByRole('link', { name: 'Back to the lobby' }).boundingBox()
    expect(back?.height).toBeGreaterThanOrEqual(44)
    await guest.context().close()
  })
})

test.describe('Silent Table at 375 px', () => {
  test('six seats fit, with finger-sized chips and the chips on the first screen', async ({ browser }) => {
    test.setTimeout(90_000)
    const names = ['W'.repeat(16), 'M'.repeat(16), 'Cy', 'Di', 'Ed', 'Flo']
    const people = await silentTablePlayers(browser, names, { ...device, reducedMotion: 'reduce' })
    const [host] = people
    await host.getByRole('button', { name: 'Start game' }).click()
    await expect(host.getByRole('group', { name: 'Rank chips' })).toBeVisible()

    await expectNoSidewaysScroll(host)
    await expectFingerSizedControls(host, [/^Take chip 1$/, /^Take chip 6$/, /^Ready$/, /^Members$/, /^Chat$/])
    const six = await host.getByRole('button', { name: 'Take chip 6' }).boundingBox()
    expect((six?.x ?? 0) + (six?.width ?? Infinity)).toBeLessThanOrEqual(PHONE.width)
    expect((six?.y ?? 0) + (six?.height ?? Infinity)).toBeLessThanOrEqual(PHONE.height)

    await playSilentRound(people)
    await expect(host.getByText('Round 2/3')).toBeVisible()
    await expectNoSidewaysScroll(host)
    for (const person of people) await person.context().close()
  })

  test('the reveal fits too', async ({ browser }) => {
    test.setTimeout(90_000)
    const people = await silentTablePlayers(browser, ['W'.repeat(16), 'Bob', 'Cy'], {
      ...device,
      reducedMotion: 'reduce',
    })
    await people[0].getByRole('button', { name: 'Start game' }).click()
    for (let round = 0; round < 3; round++) await playSilentRound(people)
    await expect(people[0].getByRole('region', { name: 'The cards' })).toBeVisible()
    await expectNoSidewaysScroll(people[0])
    await expectFingerSizedControls(people[0], [/^Next level$/])
    for (const person of people) await person.context().close()
  })
})
