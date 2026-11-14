import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 滬尾商行 (working title Tamsui Traders, owner's request 2026-11-14): two players through the real
// room on phones. A take that is not legal yet keeps its button off; three different goods, a
// reservation with its gold, two of one good and a token count everyone sees

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Tamsui Traders' }).locator('xpath=ancestor::li')
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

const YOUR_TURN = 'Your turn: take goods, or tap a card to buy or reserve.'

/** Whoever the dock tells it is their turn */
async function inTurn(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByText(YOUR_TURN).count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  for (const person of people) if ((await person.getByText(YOUR_TURN).count()) > 0) return person
  throw new Error('nobody is in turn')
}

const take = (page: Page) => page.getByRole('button', { name: 'Take', exact: true })

test('two players take goods, reserve and take a pair, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  await people[0].getByRole('button', { name: 'Start game' }).click()

  // Turn 1: two goods are not a take while all five are on the wharf; three are
  const first = await inTurn(people)
  const second = people.find((person) => person !== first) as Page
  await expect(first.getByTestId('market').getByRole('button', { name: /costs/ })).toHaveCount(12)
  await first.getByTestId('pile-0').click()
  await first.getByTestId('pile-1').click()
  await expect(first.getByText('Not a legal take yet.')).toBeVisible()
  await expect(take(first)).toBeDisabled()
  await first.getByTestId('pile-2').click()
  await expect(take(first)).toBeEnabled()

  const scan = await new AxeBuilder({ page: first }).analyze()
  expect(scan.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(' | ')}`)).toEqual([])

  await take(first).click()
  const firstName = NAMES[people.indexOf(first)]
  await expect(second.getByTestId('last-move')).toHaveText(`${firstName} took Tea, Camphor, Indigo.`)
  await expect(second.getByTestId(`rival-${people.indexOf(first)}`)).toContainText('3 tokens')

  // Turn 2: a face-up card into the hand, with a gold token; it cannot be bought with nothing
  await expect(second.getByText(YOUR_TURN)).toBeVisible()
  await second.getByTestId('market').getByRole('button', { name: /costs/ }).first().click()
  await expect(second.getByRole('button', { name: 'Buy', exact: true })).toBeDisabled()
  await second.getByRole('button', { name: 'Reserve', exact: true }).click()
  await expect(second.getByText('Reserved (1/3)')).toBeVisible()
  await expect(second.getByTestId('my-stock').getByRole('listitem', { name: 'Gold: 1 held' })).toBeVisible()
  await expect(first.getByTestId('wharf').getByRole('img', { name: 'Gold: 4 on the wharf' })).toBeVisible()

  // Turn 3: the same good tapped twice is two of it, from a pile of four
  await expect(first.getByText(YOUR_TURN)).toBeVisible()
  await first.getByTestId('pile-3').click()
  await first.getByTestId('pile-3').click()
  await take(first).click()
  await expect(second.getByTestId('last-move')).toHaveText(`${firstName} took two Sugar.`)
  await expect(second.getByTestId('wharf').getByRole('button', { name: 'Sugar: 2 on the wharf' })).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/traders/rules')
  await expect(person.getByRole('heading', { name: '滬尾商行是什麼？' })).toBeVisible()
  await expect(person.getByText('貴客').first()).toBeVisible()
  await close([person])
})
