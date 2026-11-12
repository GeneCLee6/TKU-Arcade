import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  createRoom,
  everyoneReady,
  joinRoom,
  newPerson,
  pinTheme,
  playSilentRound,
  playToResult,
  setIntOption,
  silentTablePlayers,
  startGame,
  takeFirstChip,
} from './helpers.ts'

// e7-t06 (AC-7.6): the skeleton. A new screen gets a line here. Dev-only: nothing of axe reaches the
// site's bundle. "No serious errors" per DESIGN §6, so the two worst of axe's four levels fail a test.
const BLOCKING = new Set(['serious', 'critical'])

async function expectNoSeriousProblems(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking).toEqual([])
}

test('the lobby in Traditional Chinese', async ({ browser }) => {
  const page = await newPerson(browser, { locale: 'zh-TW' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '建立房間' }).first()).toBeVisible()
  await expectNoSeriousProblems(page)
  await page.context().close()
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })
    test.beforeEach(async ({ context }) => pinTheme(context, scheme))

    test('the lobby', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'New room' }).first()).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the rules page', async ({ page }) => {
      await page.goto('/games/promotion/rules')
      await expect(page.getByRole('table')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('how to play, over the room', async ({ page }) => {
      await createRoom(page, 'Ann')
      await page.getByRole('button', { name: 'How to play' }).click()
      await expect(page.getByRole('dialog').getByRole('table')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the result', async ({ page, browser }) => {
      test.setTimeout(90_000)
      const guest = await newPerson(browser, { colorScheme: scheme, reducedMotion: 'reduce' })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await playToResult(page, guest)
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })

    test('the nickname dialog', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'New room' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the waiting room and joining it', async ({ page, browser }) => {
      await createRoom(page, 'Ann')
      await expectNoSeriousProblems(page)

      const guest = await newPerson(browser, { colorScheme: scheme })
      await guest.goto(page.url())
      await expect(guest.getByRole('textbox', { name: 'Nickname' })).toBeVisible()
      await expectNoSeriousProblems(guest)

      await joinRoom(guest, page.url(), 'Bob')
      await expectNoSeriousProblems(guest)
      // The host's view of someone else has more on it
      await expect(page.getByText('Bob')).toBeVisible()
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })

    test('a game of promotion', async ({ page, browser }) => {
      const guest = await newPerson(browser, { colorScheme: scheme })
      await startGame(page, guest)
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })

    test('the rules of Silent Table', async ({ page }) => {
      await page.goto('/games/silent-table/rules')
      await expect(page.getByRole('heading', { name: 'The goal' })).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('a game of Silent Table: the table, the reveal, the result', async ({ browser }) => {
      test.setTimeout(90_000)
      const people = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], {
        colorScheme: scheme,
        reducedMotion: 'reduce',
      })
      const [host] = people
      await setIntOption(host, people[1], 'Failed levels that end the game', '1')
      await setIntOption(host, people[1], 'Levels in a row to win', '1')
      await host.getByRole('button', { name: 'Start game' }).click()
      await expect(host.getByRole('group', { name: 'Rank chips' })).toBeVisible()
      await expectNoSeriousProblems(host)

      await takeFirstChip(host, 3)
      await expect(people[1].getByRole('button', { name: /^Take chip \d+ from Ann$/ })).toBeVisible()
      await expectNoSeriousProblems(people[1])

      await takeFirstChip(people[1], 2)
      await takeFirstChip(people[2], 1)
      await everyoneReady(people)
      await expect(host.getByText('Round 2/3')).toBeVisible()
      await playSilentRound(people)
      await expect(host.getByText('Round 3/3')).toBeVisible()
      await playSilentRound(people)
      await expect(host.getByRole('region', { name: 'Result' })).toBeVisible()
      await expectNoSeriousProblems(host)
      for (const person of people) await person.context().close()
    })
  })
}
