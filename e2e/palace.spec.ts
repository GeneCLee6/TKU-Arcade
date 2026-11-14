import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 朝堂暗鬥 (owner's request 2026-11-14): three players through the real room on phones, with a
// stipend, a claim that is challenged, a lost backer and the response window's clock

const NAMES = ['Ann', 'Bob', 'Cy'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Palace Bluff' }).locator('xpath=ancestor::li')
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

/** Whoever sees the action picker: the player whose turn it is */
async function onTurn(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByTestId('action-picker').count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  for (const person of people) {
    if ((await person.getByTestId('action-picker').count()) > 0) return person
  }
  throw new Error('nobody is on turn')
}

test('three players take a stipend, challenge a claim and lose a backer, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [first] = people
  await first.getByRole('button', { name: 'Start game' }).click()

  // Everyone has two face-down backers of their own and sees two card backs of everyone
  for (const person of people) {
    await expect(person.getByTestId('hand')).toBeVisible()
    await expect(person.getByTestId('court').getByText('2 face down')).toHaveCount(3)
  }

  // A stipend: nobody can answer it, the turn moves on
  let actor = await onTurn(people)
  const scan = await new AxeBuilder({ page: actor }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])
  await actor.getByTestId('action-picker').getByRole('button', { name: /Stipend/ }).click()
  await expect(first.getByTestId('action-log')).toContainText('takes a stipend.')

  // A levy: everyone else may challenge, and one does
  actor = await onTurn(people)
  await actor.getByTestId('action-picker').getByRole('button', { name: /Levy/ }).click()
  const others = people.filter((person) => person !== actor)
  for (const person of others) await expect(person.getByRole('button', { name: 'Challenge' })).toBeVisible()
  await expect(actor.getByTestId('palace-prompt')).toHaveText('Waiting for the others to answer.')
  await others[0].getByRole('button', { name: 'Challenge' }).click()
  await expect(first.getByTestId('action-log')).toContainText('challenges')

  // Whoever was wrong picks a backer to turn face up
  await expect
    .poll(async () => (await Promise.all(people.map((person) => person.getByTestId('lose-card').count()))).some((n) => n > 0))
    .toBe(true)
  const loser = (
    await Promise.all(people.map(async (person) => ((await person.getByTestId('lose-card').count()) > 0 ? person : null)))
  ).find((person) => person !== null) as Page
  await loser.getByTestId('lose-card').first().click()
  await expect(first.getByTestId('action-log')).toContainText('loses a backer')
  await expect(first.getByTestId('court').getByText('1 face down')).toHaveCount(1)

  // A royal grant nobody blocks: the window's clock runs out and everyone left passes
  actor = await onTurn(people)
  await actor.getByTestId('action-picker').getByRole('button', { name: /Royal grant/ }).click()
  await expect(first.getByTestId('action-log')).toContainText('Time is up: the rest pass.', { timeout: 25_000 })
  await expect(first.getByTestId('action-log')).toContainText('gains 2 silver.')
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/palace/rules')
  await expect(person.getByRole('heading', { name: '朝堂暗鬥是什麼？' })).toBeVisible()
  await expect(person.getByText('錦衣衛').first()).toBeVisible()
  await close([person])
})
