import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 芥末餃子 (owner's brief 2026-11-14): three players through the real room on phones. Everyone hides
// a plain dumpling, the first player bids them all and eats them, and wins a gold chopstick

const NAMES = ['Ann', 'Bob', 'Cy'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Wasabi Dumplings' }).locator('xpath=ancestor::li')
      await card.getByRole('button', { name: 'New room' }).click()
      await person.getByRole('textbox', { name: 'Nickname' }).fill(name)
      await person.getByRole('textbox', { name: 'Nickname' }).press('Enter')
      await person.waitForURL(/\/r\//)
      await expect(person.getByRole('heading', { name: 'Seats' })).toBeVisible()
    } else {
      await joinRoom(person, people[0].url(), name)
    }
    people.push(person)
  }
  return people
}

/** Whoever can bid now (the round's first player, in the adding phase) */
async function firstPlayer(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(
        people.map((person) => person.getByTestId('ladder').getByRole('button', { name: 'Eat 3' }).isEnabled()),
      )
      return counts.filter(Boolean).length
    })
    .toBe(1)
  for (const person of people) {
    if (await person.getByTestId('ladder').getByRole('button', { name: 'Eat 3' }).isEnabled()) return person
  }
  throw new Error('nobody can bid')
}

test('three players hide, bid, eat and win a gold chopstick, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  await people[0].getByRole('button', { name: 'Start game' }).click()
  await expect(people[0].getByText('Round 1').first()).toBeVisible()

  for (const person of people) await person.getByRole('button', { name: 'Hide a plain one' }).first().click()
  await expect(people[0].getByTestId('on-table')).toHaveText('On the table: 3')

  const bidder = await firstPlayer(people)
  const scan = await new AxeBuilder({ page: bidder }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  await bidder.getByTestId('ladder').getByRole('button', { name: 'Eat 3' }).click()
  for (let bite = 0; bite < 3; bite++) {
    const eat = bidder.getByRole('button', { name: /^Eat from / }).first()
    await expect(eat).toBeVisible()
    await eat.click()
    // Each one eaten turns face up for everyone
    if (bite < 2) await expect(bidder.getByText(`Eaten ${bite + 1} of 3`)).toBeVisible()
  }
  for (const person of people) {
    await expect(person.getByTestId('round-end')).toContainText('ate all 3 and wins a gold chopstick!')
  }
  await people[1].getByRole('button', { name: 'Next round' }).first().click()
  await expect(people[0].getByText('Round 2').first()).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/wasabi/rules')
  await expect(person.getByRole('heading', { name: '芥末餃子是什麼？' })).toBeVisible()
  await expect(person.getByText('金筷子').first()).toBeVisible()
  await close([person])
})
