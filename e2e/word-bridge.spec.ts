import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 搭橋 (owner's request 2026-11-14): a co-op game of two and a team game of four, through the real
// room on phones

const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser, names: readonly string[]): Promise<Page[]> {
  const people: Page[] = []
  for (const name of names) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Word Bridge' }).locator('xpath=ancestor::li')
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

/** Whoever has the clue form */
async function giverOf(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => (await Promise.all(people.map((p) => p.getByTestId('clue-form').count()))).filter(Boolean).length)
    .toBe(1)
  for (const person of people) if ((await person.getByTestId('clue-form').count()) > 0) return person
  throw new Error('nobody gives the clue')
}

/** The words the giver's key marks this way, as the giver sees them */
async function wordsMarked(giver: Page, hint: string): Promise<string[]> {
  return giver.locator(`[data-testid="word-cell"][data-hint="${hint}"] > span:first-child`).allTextContents()
}

async function giveClue(giver: Page, text: string) {
  await giver.getByRole('textbox', { name: 'Your clue' }).fill(text)
  await giver.getByRole('button', { name: 'Give the clue' }).click()
}

async function pick(person: Page, word: string) {
  await person.getByTestId('word-cell').filter({ hasText: word }).first().click()
  await person.getByRole('button', { name: `Turn “${word}”` }).click()
}

test('two players find words together, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser, ['Ann', 'Bob'])
  await people[0].getByRole('button', { name: 'Start game' }).click()
  for (const person of people) await expect(person.getByTestId('word-grid')).toBeVisible()
  await expect(people[0].getByTestId('wb-score')).toContainText('To find: 15')

  const giver = await giverOf(people)
  const picker = people.find((person) => person !== giver) as Page
  const targets = await wordsMarked(giver, 'target')
  expect(targets).toHaveLength(9)
  // The other key holder sees their own side: 9 targets of their own
  expect(await wordsMarked(picker, 'target')).toHaveLength(9)

  const scan = await new AxeBuilder({ page: giver }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  await giveClue(giver, 'kiwi')
  await expect(picker.getByTestId('clue-banner')).toContainText('kiwi')
  await pick(picker, targets[0])
  await expect(people[0].getByTestId('wb-score')).toContainText('To find: 14')
  await picker.getByRole('button', { name: 'End our turn' }).click()
  await expect(people[0].getByTestId('wb-score')).toContainText('Clues left: 9')
  // The other side clues now
  expect(await giverOf(people)).toBe(picker)
  await close(people)
})

test('four players split into partnerships, and the trap ends it', async ({ browser }) => {
  test.setTimeout(240_000)
  const people = await players(browser, ['Ann', 'Bob', 'Cy', 'Di'])
  await people[0].getByRole('button', { name: 'Start game' }).click()
  await expect(people[0].getByTestId('wb-setup')).toBeVisible()
  await expect(people[0].getByTestId('team-ns')).toContainText('Ann')
  await expect(people[0].getByTestId('team-ew')).toContainText('Bob')
  await people[2].getByRole('button', { name: 'Deal the words' }).click()

  const giver = await giverOf(people)
  const trap = await wordsMarked(giver, 'mine')
  expect(trap).toHaveLength(1)
  await giveClue(giver, 'kiwi')
  // The giver's partner: the other one on the same side
  const sides = [
    [people[0], people[2]],
    [people[1], people[3]],
  ]
  const partner = sides.find((side) => side.includes(giver))?.find((person) => person !== giver) as Page
  await pick(partner, trap[0])
  await expect(people[0].getByText(/hit the trap/).first()).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/word-bridge/rules')
  await expect(person.getByRole('heading', { name: '搭橋是什麼？' })).toBeVisible()
  await close([person])
})
