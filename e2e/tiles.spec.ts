import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 社辦牌陣 (owner's request 2026-11-14): two players through the real room on phones. The player
// on turn lays a tile, the other watches it happen, undo and reset take it back, and a few turns of
// drawing go round.

const NAMES = ['Ann', 'Bob'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function players(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Clubroom Tiles' }).locator('xpath=ancestor::li')
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

/** Whoever has the Draw button: the player on turn, and the other one */
async function turnOrder(people: readonly Page[]): Promise<[Page, Page]> {
  await expect
    .poll(async () => {
      const counts = await Promise.all(people.map((person) => person.getByRole('button', { name: 'Draw' }).count()))
      return counts.filter((count) => count > 0).length
    })
    .toBe(1)
  const onTurn = (await people[0].getByRole('button', { name: 'Draw' }).count()) > 0 ? people[0] : people[1]
  return [onTurn, people.find((person) => person !== onTurn) as Page]
}

const rackTiles = (person: Page) => person.getByTestId('rack').locator('button[data-tile]')

test('two players lay, undo, reset and draw, on phones', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await players(browser)
  await people[0].getByRole('button', { name: 'Start game' }).click()

  await expect(people[0].getByText('Round 1 of 1')).toBeVisible()
  for (const person of people) await expect(person.getByTestId('pool')).toHaveText('Pool: 78')
  let [mover, watcher] = await turnOrder(people)
  await expect(rackTiles(mover)).toHaveCount(14)
  await expect(mover.getByText('Your turn. Your first play must be 30 points from your rack alone.')).toBeVisible()
  await expect(mover.getByRole('button', { name: 'Done' })).toBeDisabled()

  // Fits a 360-pixel phone without scrolling sideways
  const overflow = await mover.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  const scan = await new AxeBuilder({ page: mover }).analyze()
  expect(scan.violations.map((violation) => violation.id)).toEqual([])

  // A tile into a new set: the other player sees it on the table as it happens
  const first = rackTiles(mover).first()
  const name = (await first.getAttribute('aria-label')) as string
  await first.click()
  await mover.getByTestId('new-set').click()
  await expect(rackTiles(mover)).toHaveCount(13)
  await expect(watcher.getByText(`${NAMES[people.indexOf(mover)]} is moving tiles.`)).toBeVisible()
  await expect(watcher.getByTestId('table').getByRole('img', { name: `${name}, just laid` })).toBeVisible()
  await expect(mover.getByText('Every set must be a group or a run.')).toBeVisible()

  // Undo takes it back, for everyone
  await mover.getByRole('button', { name: 'Undo' }).click()
  await expect(rackTiles(mover)).toHaveCount(14)
  await expect(watcher.getByTestId('table-set')).toHaveCount(0)

  // Two tiles, then Reset turn
  await rackTiles(mover).nth(0).click()
  await rackTiles(mover).nth(1).click()
  await mover.getByTestId('new-set').click()
  await expect(watcher.getByTestId('table-set')).toHaveCount(1)
  await mover.getByRole('button', { name: 'Reset turn' }).click()
  await expect(watcher.getByTestId('table-set')).toHaveCount(0)
  await expect(rackTiles(mover)).toHaveCount(14)

  // Sorting is the rack's own business
  await mover.getByRole('button', { name: 'By suit' }).click()
  await expect(mover.getByRole('button', { name: 'By suit' })).toHaveAttribute('aria-pressed', 'true')

  // A few turns of drawing go round
  for (let turn = 0; turn < 4; turn++) {
    await mover.getByRole('button', { name: 'Draw' }).click()
    for (const person of people) await expect(person.getByTestId('pool')).toHaveText(`Pool: ${77 - turn}`)
    await expect(watcher.getByTestId('event')).toHaveText(`${NAMES[people.indexOf(mover)]} drew a tile.`)
    ;[mover, watcher] = [watcher, mover]
    await expect(mover.getByRole('button', { name: 'Draw' })).toBeVisible()
  }
  for (const person of people) await expect(rackTiles(person).or(person.getByTestId('rack').getByRole('img'))).toHaveCount(16)
  await close(people)
})

test('the rules page is in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/tiles/rules')
  await expect(person.getByRole('heading', { name: '社辦牌陣是什麼？' })).toBeVisible()
  await expect(person.getByText('萬用牌').first()).toBeVisible()
  await close([person])
})
