import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 撞詞 (owner's request 2026-11-14): three players through the real room on phones: two clues each,
// a clash, a right guess, then a wrong one the clue-givers count as right

const NAMES = ['Ann', 'Bob', 'Cy'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Clue Clash' }).locator('xpath=ancestor::li')
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

/** The guesser and the two clue-givers of the current card */
async function roles(people: readonly Page[]): Promise<{ guesser: Page; givers: Page[] }> {
  await expect
    .poll(async () => (await Promise.all(people.map((p) => p.getByTestId('guesser-note').count()))).filter(Boolean).length)
    .toBe(1)
  const notes = await Promise.all(people.map((p) => p.getByTestId('guesser-note').count()))
  return { guesser: people[notes.indexOf(1)], givers: people.filter((_, at) => notes[at] === 0) }
}

async function writeClues(giver: Page, first: string, second: string) {
  const form = giver.getByTestId('clue-form')
  await form.getByRole('textbox', { name: 'Clue 1' }).fill(first)
  await form.getByRole('textbox', { name: 'Clue 2' }).fill(second)
  await form.getByRole('button', { name: 'Send' }).click()
}

test('three players clash, guess right, and count a near miss as right, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  await people[0].getByRole('button', { name: 'Start game' }).click()

  let { guesser, givers } = await roles(people)
  const word = ((await givers[0].getByTestId('mystery-word').textContent()) ?? '').trim()
  expect(word).not.toBe('')
  await expect(guesser.getByText(word, { exact: true })).toHaveCount(0)

  const scan = await new AxeBuilder({ page: givers[0] }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  await writeClues(givers[0], 'kiwi', 'oasis')
  await writeClues(givers[1], 'KIWI', 'zebra')
  // The review: the clash is struck already; nothing more to cross out
  for (const giver of givers) {
    await expect(giver.getByText('Clash', { exact: true })).toHaveCount(2)
    await giver.getByRole('button', { name: 'Done' }).click()
  }
  const left = guesser.getByTestId('clue-line')
  await expect(left).toHaveCount(2)
  await expect(guesser.getByText('Cancelled: 2')).toBeVisible()
  await guesser.getByRole('textbox', { name: 'Your guess' }).fill(word)
  await guesser.getByRole('button', { name: 'Guess', exact: true }).click()
  await expect(guesser.getByTestId('cc-reveal')).toContainText('Right!')
  await guesser.getByRole('button', { name: 'Next card' }).click()
  await expect(people[0].getByText('Score 1').first()).toBeVisible()

  // Card 2: a wrong guess the givers accept
  ;({ guesser, givers } = await roles(people))
  await writeClues(givers[0], 'kiwi', 'oasis')
  await writeClues(givers[1], 'zebra', 'quartz')
  for (const giver of givers) await giver.getByRole('button', { name: 'Done' }).click()
  await guesser.getByRole('textbox', { name: 'Your guess' }).fill('不是這個')
  await guesser.getByRole('button', { name: 'Guess', exact: true }).click()
  await expect(givers[0].getByTestId('cc-reveal')).toContainText('Not quite')
  await givers[0].getByRole('button', { name: 'Count it as right' }).click()
  await expect(guesser.getByText('The clue-givers counted it as right.')).toBeVisible()
  await guesser.getByRole('button', { name: 'Next card' }).click()
  await expect(people[0].getByText('Score 2').first()).toBeVisible()
  await expect(people[0].getByText('Card 3 of 13').first()).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/clue-clash/rules')
  await expect(person.getByRole('heading', { name: '撞詞是什麼？' })).toBeVisible()
  await close([person])
})
