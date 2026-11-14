import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 慘度排排站 (owner's request 2026-11-14): two players through the real room on phones, steals on and
// the clock off; a card is placed (and stolen when the first try misses), revealed to both, and the
// next card drawn

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Misery Line' }).locator('xpath=ancestor::li')
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

/** Whoever has the slots in their line: the one placing the card now */
async function placer(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByTestId('gap-0').count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  for (const person of people) {
    if ((await person.getByTestId('gap-0').count()) > 0) return person
  }
  throw new Error('nobody can place the card')
}

test('two players place, steal, reveal and draw, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [first] = people
  await first.getByRole('combobox', { name: 'Time to guess' }).selectOption({ label: 'No clock' })
  await first.getByRole('button', { name: 'Start game' }).click()

  // Card 1: everyone sees the same event, nobody its index; three starting cards each
  await expect(first.getByText('Card 1').first()).toBeVisible()
  const title = ((await first.getByTestId('table-title').textContent()) ?? '').trim()
  expect(title.length).toBeGreaterThan(0)
  for (const person of people) {
    await expect(person.getByTestId('table-title')).toHaveText(title)
    await expect(person.getByRole('img', { name: 'Misery index hidden' }).first()).toBeVisible()
    await expect(person.getByTestId('your-line').getByTestId('line-card')).toHaveCount(3)
  }

  const guesser = await placer(people)
  await expect(guesser.getByTestId('your-line').getByRole('button', { name: /^Put it / })).toHaveCount(4)
  const scan = await new AxeBuilder({ page: guesser }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  // The first gap: right, or a steal for the other player, who then places it too
  await guesser.getByTestId('gap-0').click()
  const other = people.find((person) => person !== guesser) as Page
  await expect
    .poll(async () => (await other.getByTestId('gap-0').count()) + (await other.getByTestId('reveal-card').count()))
    .toBeGreaterThan(0)
  if ((await other.getByTestId('gap-0').count()) > 0) {
    await expect(other.getByText('Wrong').first()).toBeVisible()
    await other.getByTestId('gap-0').click()
  }

  // The index, the same for both; the next player in seat order draws
  for (const person of people) {
    await expect(person.getByTestId('reveal-index')).toHaveText(/^Misery index \d+$/)
  }
  const index = await first.getByTestId('reveal-index').textContent()
  await expect(people[1].getByTestId('reveal-index')).toHaveText(index ?? '')
  await expect(other.getByRole('button', { name: 'Draw a card' })).toBeVisible()
  await expect(guesser.getByRole('button', { name: 'Draw a card' })).toHaveCount(0)
  await other.getByRole('button', { name: 'Draw a card' }).click()
  await expect(first.getByText('Card 2').first()).toBeVisible()
  expect(await placer(people)).toBe(other)
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/misery/rules')
  await expect(person.getByRole('heading', { name: '慘度排排站是什麼？' })).toBeVisible()
  await expect(person.getByText('慘度線').first()).toBeVisible()
  await close([person])
})
