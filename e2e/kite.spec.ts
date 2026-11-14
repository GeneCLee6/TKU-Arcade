import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 放風箏 (owner's request 2026-11-14): two players through the real room on phones, with a note in
// two taps, a kite flown (or its line snapped) and one set aside

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Kite Day' }).locator('xpath=ancestor::li')
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

test('two players pass a note, fly a kite and set one aside, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const [ann, bob] = await players(browser)
  await ann.getByRole('button', { name: 'Start game' }).click()

  // Each sees the other's five kites face up and their own five hidden
  await expect(ann.getByTestId('own-card')).toHaveCount(5)
  await expect(bob.getByTestId('own-card')).toHaveCount(5)
  await expect(ann.getByTestId('notes')).toHaveText(/Notes 8\/8/)
  const bobsFirst = (await ann.getByTestId('hand-1').getByRole('img').first().getAttribute('aria-label')) ?? ''
  expect(bobsFirst).toMatch(/^(Red|Gold|Jade|Blue|White) [1-5]\. Bob knows/)
  await expect(bob.getByTestId('own-card').first()).toHaveAccessibleName('Your card 1: Nothing known yet')

  const scan = await new AxeBuilder({ page: ann }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  // Ann's note: Bob, then the number of his first card (two taps)
  await ann.getByRole('button', { name: 'Pass Bob a note' }).click()
  const rank = bobsFirst.match(/ ([1-5])\./)?.[1] as string
  await ann.getByTestId('hint-pad').getByRole('button', { name: `Note: ${rank}` }).click()
  await expect(bob.getByTestId('notes')).toHaveText(/Notes 7\/8/)
  await expect(bob.getByTestId('own-card').first()).toHaveAccessibleName(new RegExp(`Known: ${rank}`))
  await expect(bob.getByTestId('log')).toContainText(`Ann → Bob: ${rank}`)

  // Bob flies that card: it goes up or its line snaps, and he draws a new one
  await bob.getByTestId('own-card').first().click()
  await bob.getByRole('button', { name: 'Fly it' }).click()
  await expect(ann.getByTestId('log')).toContainText(/Bob flew/)
  await expect(bob.getByTestId('own-card')).toHaveCount(5)

  // Ann sets one aside for the note back
  await ann.getByTestId('own-card').nth(4).click()
  await ann.getByRole('button', { name: 'Set aside' }).click()
  await expect(bob.getByTestId('notes')).toHaveText(/Notes 8\/8/)
  await expect(bob.getByTestId('discards').getByRole('img')).not.toHaveCount(0)
  await expect(bob.getByText('Your turn: tap a friend to pass a note, or one of your kites to fly or set aside.')).toBeVisible()
  await close([ann, bob])
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/kite/rules')
  await expect(person.getByRole('heading', { name: '放風箏是什麼？' })).toBeVisible()
  await expect(person.getByText('傳紙條').first()).toBeVisible()
  await close([person])
})
