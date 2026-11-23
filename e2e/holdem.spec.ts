import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson, inPanel } from './helpers.ts'

// 德州撲克 (owner's request 2026-11-14): three players through the real room on phones: a call, a raise
// with the quick sizes, two folds, the uncalled raise back, and the next hand dealt with the button moved

const NAMES = ['Ann', 'Bob', 'Cy'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: "Texas Hold'em" }).locator('xpath=ancestor::li')
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

/** Whoever sees the bet buttons: the player whose turn it is */
async function onTurn(people: readonly Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByTestId('bet-bar').count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  for (const person of people) {
    if ((await person.getByTestId('bet-bar').count()) > 0) return person
  }
  throw new Error('nobody is on turn')
}

test('three players call, raise with the quick sizes and fold, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  const [first] = people
  await first.getByRole('button', { name: 'Start game' }).click()

  // Everyone has two cards of their own, face up, and the pot holds the blinds
  for (const person of people) {
    await expect(person.getByTestId('your-hand').getByRole('img')).toHaveCount(2)
    await expect(person.getByTestId('pot')).toHaveText('Pot 30')
    // 200 big blinds deep by default: 4,000 chips, less the blinds
    await expect(person.getByTestId('table')).toContainText('3980')
  }

  // Three players: the button acts first before the flop, and calls the big blind
  let actor = await onTurn(people)
  const scan = await new AxeBuilder({ page: actor }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])
  await actor.getByRole('button', { name: 'Call 20' }).click()
  await inPanel(first, 'Log', () => expect(first.getByTestId('hand-log')).toContainText('calls 20.'))

  // The small blind raises the pot: 50 in the middle and 10 to call, so the pot raise goes to 20 + 60
  actor = await onTurn(people)
  await actor.getByRole('button', { name: 'Raise' }).click()
  // Five quick sizes in one row on a 360 px phone, every label whole
  const quick = actor.getByTestId('raise-panel').getByRole('button', { name: /^(Min|½ pot|⅔ pot|Pot|All in)$/ })
  await expect(quick).toHaveCount(5)
  const boxes = await quick.evaluateAll((buttons) =>
    buttons.map((button) => ({ ...button.getBoundingClientRect().toJSON(), clipped: button.scrollWidth > button.clientWidth })),
  )
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1)
  for (const box of boxes) expect(box).toMatchObject({ clipped: false })
  expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(360)
  await actor.getByTestId('raise-panel').getByRole('button', { name: 'Pot', exact: true }).click()
  await expect(actor.getByTestId('raise-amount')).toHaveText('80')
  await actor.getByRole('button', { name: 'Raise to 80' }).click()
  await inPanel(first, 'Log', () => expect(first.getByTestId('hand-log')).toContainText('raises to 80.'))

  // The other two fold: the raise nobody called comes back, and nothing is shown
  for (let fold = 0; fold < 2; fold++) {
    actor = await onTurn(people)
    await actor.getByRole('button', { name: 'Fold' }).click()
  }
  await expect(first.getByTestId('hand-result')).toContainText('everyone else folded')
  await inPanel(first, 'Log', () => expect(first.getByTestId('hand-log')).toContainText('nobody called goes back'))

  // A few seconds later the next hand is dealt
  await inPanel(first, 'Log', () => expect(first.getByTestId('hand-log')).toContainText('Hand 2:', { timeout: 15_000 }))
  await expect(first.getByTestId('your-hand').getByRole('img')).toHaveCount(2)
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/holdem/rules')
  await expect(person.getByRole('heading', { name: '德州撲克是什麼？' })).toBeVisible()
  await expect(person.getByText('皇家同花順').first()).toBeVisible()
  await close([person])
})
