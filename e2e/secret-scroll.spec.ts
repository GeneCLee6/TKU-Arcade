import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 奪祕笈 (owner's brief 2026-11-14): two players through the real room on phones, playing whatever
// the hand allows until a round ends, then into the next round

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Secret Scroll' }).locator('xpath=ancestor::li')
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

/** Whoever can play now */
async function playerToMove(people: readonly Page[]): Promise<Page | null> {
  for (const person of people) {
    if ((await person.getByRole('button', { name: 'Play', exact: true }).count()) > 0) return person
  }
  return null
}

/** One turn: the first card that can be played, the first player, the first name */
async function playOnce(person: Page): Promise<void> {
  const hand = person.getByTestId('your-hand')
  await hand.locator('button:enabled').first().click()
  const players = person.getByRole('group', { name: 'Pick a player' })
  if ((await players.count()) > 0) await players.getByRole('button').first().click()
  const guesses = person.getByRole('group', { name: 'Name a card' })
  if ((await guesses.count()) > 0) await guesses.getByRole('button').first().click()
  const play = person.getByRole('button', { name: 'Play', exact: true }).first()
  await expect(play).toBeEnabled()
  await play.click()
}

test('two players play a round to its end and deal the next, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [ann, bob] = people
  await ann.getByRole('button', { name: 'Start game' }).click()
  await expect(ann.getByText('Round 1').first()).toBeVisible()
  await expect(bob.getByText('Round 1').first()).toBeVisible()
  // Two players: three cards set aside face up for both to see
  await expect(ann.getByText('Set aside face up').first()).toBeVisible()

  const scan = await new AxeBuilder({ page: ann }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  for (let turn = 0; turn < 20; turn++) {
    if ((await ann.getByTestId('round-end').count()) > 0) break
    await expect.poll(() => playerToMove(people).then((person) => person !== null)).toBe(true)
    const mover = (await playerToMove(people)) as Page
    // The one waiting holds one card; the mover two
    const other = mover === ann ? bob : ann
    await expect(other.getByTestId('your-hand').locator('[data-card]')).toHaveCount(1)
    const before = await ann.getByTestId('scroll-log').getByRole('listitem').count()
    await playOnce(mover)
    await expect
      .poll(async () =>
        (await ann.getByTestId('round-end').count()) > 0 ||
        (await ann.getByTestId('scroll-log').getByRole('listitem').count()) > before,
      )
      .toBe(true)
  }

  await expect(ann.getByTestId('round-end')).toBeVisible()
  await expect(bob.getByTestId('round-end')).toBeVisible()
  await bob.getByRole('button', { name: 'Next round' }).first().click()
  await expect(ann.getByText('Round 2').first()).toBeVisible()
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/secret-scroll/rules')
  await expect(person.getByRole('heading', { name: '奪祕笈是什麼？' })).toBeVisible()
  await expect(person.getByText('醉俠').first()).toBeVisible()
  await close([person])
})
