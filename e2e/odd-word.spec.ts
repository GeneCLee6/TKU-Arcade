import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 誰的詞不一樣 (owner's request 2026-11-14): three players through the real room on phones, with a
// redeal, two reveals and the round host ending the game

const NAMES = ['Ann', 'Bob', 'Cy'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Odd Word Out' }).locator('xpath=ancestor::li')
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

/** Each person's word, as their own card shows it */
async function words(people: readonly Page[]): Promise<string[]> {
  const out: string[] = []
  for (const person of people) {
    await expect(person.getByTestId('word')).toBeVisible()
    out.push(((await person.getByTestId('word').textContent()) ?? '').trim())
  }
  return out
}

/** Whoever has the Reveal button: the round's first speaker */
async function roundHost(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByRole('button', { name: 'Reveal' }).count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  for (const person of people) {
    if ((await person.getByRole('button', { name: 'Reveal' }).count()) > 0) return person
  }
  throw new Error('nobody can reveal')
}

test('three players deal, redeal, reveal and end the game, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [first] = people
  await first.getByRole('button', { name: 'Start game' }).click()

  // Round 1: two share a word, one has the other; only the first speaker can reveal
  await expect(first.getByText('Round 1 of 8').first()).toBeVisible()
  let dealt = await words(people)
  expect(new Set(dealt).size).toBe(2)
  const host = await roundHost(people)
  await expect(host.getByText('You speak first. Reveal once everyone has described.')).toBeVisible()
  await expect(host.getByTestId('speaking-order').getByRole('listitem')).toHaveCount(3)

  const scan = await new AxeBuilder({ page: host }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  // Covering the word with a tap
  const other = people.find((person) => person !== host) as Page
  await other.getByTestId('word').click()
  await expect(other.getByTestId('word-covered')).toBeVisible()
  await other.getByRole('button', { name: 'Show my word' }).click()
  await expect(other.getByTestId('word')).toBeVisible()

  // New words for everyone
  await host.getByRole('button', { name: 'New words' }).click()
  await expect(host.getByText('New words were dealt this round.')).toBeVisible()
  dealt = await words(people)
  expect(new Set(dealt).size).toBe(2)

  // The reveal, the same for everyone
  await host.getByRole('button', { name: 'Reveal' }).click()
  const common = dealt.find((word) => dealt.filter((other) => other === word).length > 1) as string
  const odd = dealt.find((word) => word !== common) as string
  for (const person of people) {
    const reveal = person.getByTestId('round-reveal')
    await expect(reveal.getByTestId('common-word')).toHaveText(common)
    await expect(reveal.getByTestId('odd-word')).toHaveText(odd)
    await expect(reveal.getByTestId('odd-were')).toContainText(NAMES[dealt.indexOf(odd)])
  }

  // Round 2 has its own first speaker, who ends the game after the reveal
  await host.getByRole('button', { name: 'Next round' }).click()
  await expect(first.getByText('Round 2 of 8').first()).toBeVisible()
  const second = await roundHost(people)
  await second.getByRole('button', { name: 'Reveal' }).click()
  await second.getByRole('button', { name: 'End game' }).click()
  await expect(first.getByText('Ended after 2 rounds.').first()).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/odd-word/rules')
  await expect(person.getByRole('heading', { name: '誰的詞不一樣是什麼？' })).toBeVisible()
  await expect(person.getByText('白板').first()).toBeVisible()
  await close([person])
})
