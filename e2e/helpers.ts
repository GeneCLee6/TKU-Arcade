import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'

/** A person with their own browser profile, so that the room sees them as somebody new */
export async function newPerson(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({ locale: 'en-US', ...options })
  return context.newPage()
}

/** From the lobby to a new room's waiting room; the room's address is then in `page.url()` */
export async function createRoom(page: Page, nickname: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'New room' }).first().click()
  await page.getByRole('textbox', { name: 'Nickname' }).fill(nickname)
  await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await page.waitForURL(/\/r\//)
  await expect(page.getByRole('heading', { name: 'Seats' })).toBeVisible()
}

/** Into someone else's room through its link, and seated: the room seats whoever joins */
export async function joinRoom(page: Page, url: string, nickname: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('textbox', { name: 'Nickname' }).fill(nickname)
  await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Seats' })).toBeVisible()
}

/** A running game of two, as seen by the host. Starts by clicking: other specs test the keyboard */
export async function startGame(host: Page, guest: Page): Promise<void> {
  await createRoom(host, 'Ann')
  await joinRoom(guest, host.url(), 'Bob')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('[data-cell]').first()).toBeVisible()
}
