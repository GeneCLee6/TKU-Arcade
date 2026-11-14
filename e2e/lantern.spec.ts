import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 宮燈點點 (owner's request 2026-11-14): two players through the real room on phones. Level 1 lit in
// order, level 2 with a moonlight, level 3 with a lantern lit too early

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Lantern Lane' }).locator('xpath=ancestor::li')
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

/** Each person's lanterns, as their own hand shows them */
async function hands(people: readonly Page[], level: number): Promise<number[][]> {
  const out: number[][] = []
  for (const person of people) {
    const lanterns = person.getByTestId('hand').getByTestId('hand-lantern')
    await expect(lanterns).toHaveCount(level)
    out.push((await lanterns.allTextContents()).map(Number))
  }
  return out
}

async function handsUp(people: readonly Page[], level: number) {
  for (const person of people) await expect(person.getByText(`Level ${level}: focus`)).toBeVisible()
  for (const person of people) await person.getByRole('button', { name: 'Hand up' }).click()
  for (const person of people) await expect(person.getByTestId('light')).toBeVisible()
}

/** Lights every lantern in order: whoever holds the lowest, each time */
async function lightInOrder(people: readonly Page[], held: number[][]) {
  const order = held.flatMap((cards, who) => cards.map((card) => ({ card, who }))).sort((a, b) => a.card - b.card)
  for (const { card, who } of order) {
    const button = people[who].getByRole('button', { name: `Light ${card}` })
    await button.click()
    await expect(button).toBeHidden()
  }
}

test('two players light three levels, with a moonlight and an early lantern, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [ann, bob] = people
  await ann.getByRole('button', { name: 'Start game' }).click()

  // Level 1: everyone focuses, then lights in order
  await expect(ann.getByText('Level 1 of 12').first()).toBeVisible()
  await expect(ann.getByText('Matches: 2')).toBeVisible()
  await expect(ann.getByRole('note')).toContainText('No numbers out loud')
  let held = await hands(people, 1)
  await handsUp(people, 1)
  const scan = await new AxeBuilder({ page: ann }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])
  await lightInOrder(people, held)

  // Level 2: both ask for moonlight, which shows each lowest lantern
  for (const person of people) await expect(person.getByText('Level 1 cleared!')).toBeVisible()
  held = await hands(people, 2)
  await handsUp(people, 2)
  await ann.getByRole('button', { name: 'Moonlight? 0/2' }).click()
  await expect(bob.getByTestId('seat-0')).toContainText('Wants moonlight')
  await bob.getByRole('button', { name: 'Moonlight? 1/2' }).click()
  await expect(ann.getByTestId('news')).toContainText('Moonlight shows:')
  await expect(ann.getByText('Moonlight: 0')).toBeVisible()
  await lightInOrder(people, [held[0].slice(1), held[1].slice(1)])

  // Level 3: the player without the lowest lantern lights first, too early, and burns the lower ones
  for (const person of people) await expect(person.getByText('Level 2 cleared! +1 moonlight.')).toBeVisible()
  held = await hands(people, 3)
  await handsUp(people, 3)
  const lowest = Math.min(...held.flat())
  const who = held.findIndex((cards) => !cards.includes(lowest))
  const card = held[who][0]
  await people[who].getByRole('button', { name: `Light ${card}` }).click()
  const other = people[1 - who]
  await expect(other.getByTestId('top-lantern')).toHaveText(String(card))
  await expect(other.getByText('Matches: 1')).toBeVisible()
  await expect(other.getByTestId('news')).toContainText(`${NAMES[who]} lit ${card} too early. One match gone.`)
  await expect(other.getByLabel(`${lowest}, burned in ${NAMES[1 - who]}’s hand`)).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese and asks not to say numbers', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/lantern/rules')
  await expect(person.getByRole('heading', { name: '宮燈點點是什麼？' })).toBeVisible()
  await expect(person.getByRole('heading', { name: '請不要說數字' })).toBeVisible()
  await close([person])
})
