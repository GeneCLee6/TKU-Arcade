import {
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test'

/** A person with their own browser profile, so that the room sees them as somebody new */
export async function newPerson(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({ locale: 'en-US', ...options })
  if (options.colorScheme === 'light' || options.colorScheme === 'dark') {
    await pinTheme(context, options.colorScheme)
  }
  return context.newPage()
}

/**
 * The site is dark until someone picks otherwise (E1), whatever the system says: a test of a theme
 * picks it the way a person would, by the stored choice the theme switch writes
 */
export async function pinTheme(context: BrowserContext, theme: 'light' | 'dark'): Promise<void> {
  await context.addInitScript((value) => {
    localStorage.setItem('tku-arcade.theme', value)
  }, theme)
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

/** Silent Table is not in the lobby until the owner signs off: its rooms come from the API */
export async function createSilentTableRoom(page: Page, nickname: string): Promise<void> {
  const response = await page.request.post('/api/rooms', { data: { gameId: 'silent-table' } })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(page, `/r/${id}`, nickname)
}

/** Three of the same room's seats, for Silent Table's minimum game, up to the host pressing start */
export async function silentTablePlayers(
  browser: Browser,
  names: readonly string[],
  options: BrowserContextOptions = {},
): Promise<Page[]> {
  const people: Page[] = []
  for (const name of names) {
    const person = await newPerson(browser, options)
    if (people.length === 0) await createSilentTableRoom(person, name)
    else await joinRoom(person, people[0].url(), name)
    people.push(person)
  }
  return people
}

/**
 * A host's change of option, once a guest can see it. The form sends all the options each time, from
 * what the room last said: a second change before the first comes back would undo the first.
 */
export async function setRoomOption(
  host: Page,
  guest: Page,
  label: string,
  change: (host: Page) => Promise<void>,
  shown: string,
): Promise<void> {
  await change(host)
  await expect(guest.locator('dl > div', { hasText: label }).locator('dd')).toHaveText(shown)
}

export const setIntOption = (host: Page, guest: Page, label: string, value: string) =>
  setRoomOption(
    host,
    guest,
    label,
    async (page) => {
      const field = page.getByRole('spinbutton', { name: label })
      await field.fill(value)
      await field.press('Enter')
    },
    value,
  )

export const setSelectOption = (host: Page, guest: Page, label: string, value: string, shown: string) =>
  setRoomOption(
    host,
    guest,
    label,
    async (page) => {
      await page.getByRole('combobox', { name: label }).selectOption(value)
    },
    shown,
  )

/** Takes the first chip this person can. Again if somebody else's move had not reached them yet */
export async function takeFirstChip(person: Page): Promise<void> {
  await expect(async () => {
    await person.getByRole('button', { name: /^Take chip \d+$/ }).first().click()
    await expect(person.getByRole('button', { name: /you hold it$/ })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/** Everyone takes the first chip they can and says ready: one round of Silent Table */
export async function playSilentRound(people: readonly Page[]): Promise<void> {
  for (const person of people) await takeFirstChip(person)
  for (const person of people) {
    const ready = person.getByRole('button', { name: 'Ready', exact: true })
    await expect(ready).toHaveAttribute('aria-disabled', 'false')
    await ready.click()
  }
}

/**
 * A whole game of two, the shortest there is, up to the result on the host's screen. Give both
 * people `reducedMotion: 'reduce'`, or it takes as long as a game does.
 */
export async function playToResult(host: Page, guest: Page): Promise<Locator> {
  await createRoom(host, 'Ann')
  await joinRoom(guest, host.url(), 'Bob')
  const limit = host.getByRole('spinbutton', { name: 'Round limit' })
  await limit.fill('10')
  await limit.press('Enter')
  await expect(guest.getByText('10', { exact: true })).toBeVisible()
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('[data-cell]').first()).toBeVisible()

  const result = host.getByRole('region', { name: 'Result' })
  for (let turn = 0; turn < 60 && !(await result.isVisible()); turn++) {
    for (const page of [host, guest]) {
      const roll = page.getByRole('button', { name: 'Roll', exact: true })
      if ((await roll.isVisible()) && (await roll.getAttribute('aria-disabled')) === 'false') {
        await roll.click()
      }
    }
    await host.waitForTimeout(150)
  }
  await expect(result).toBeVisible({ timeout: 10_000 })
  return result
}
