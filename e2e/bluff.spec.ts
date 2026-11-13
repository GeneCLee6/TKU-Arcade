import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// e6-t04, e6-t05: four players through the real room, every round to the result, on a phone-sized
// screen (the game is played face to face, each on their own phone)

const NAMES = ['Ann', 'Bob', 'Cy', 'Dee'] as const
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }

const close = (people: readonly Page[]) => Promise.all(people.map((person) => person.context().close()))

async function bluffPlayers(browser: Browser): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, PHONE)
    if (people.length === 0) {
      // From the lobby's card, as anyone would: listed with its screen (I2)
      await person.goto('/')
      const card = person.getByRole('heading', { level: 3, name: 'Bluff Reader' }).locator('xpath=ancestor::li')
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

const roleOf = (page: Page) => page.getByTestId('role').textContent()

/** Each person's role this round, by what their own card says */
async function roles(people: readonly Page[]) {
  const found = { judge: null as Page | null, honest: null as Page | null, mole: null as Page | null, others: [] as Page[] }
  for (const person of people) {
    await expect(person.getByTestId('role')).toBeVisible()
    const role = await roleOf(person)
    if (role === 'You are the judge') found.judge = person
    else if (role === 'You are the honest reader') found.honest = person
    else if (role === 'You are the mole') found.mole = person
    else found.others.push(person)
  }
  expect(found.judge).not.toBeNull()
  expect(found.honest).not.toBeNull()
  expect(found.mole).not.toBeNull()
  return found as { judge: Page; honest: Page; mole: Page; others: Page[] }
}

const dockButton = (page: Page, name: string | RegExp) => page.getByRole('button', { name })

test('four players play every round to the result, on phones', async ({ browser }) => {
  test.setTimeout(240_000)
  const people = await bluffPlayers(browser)
  const [host] = people
  await host.getByRole('button', { name: 'Start game' }).click()

  for (let round = 1; round <= NAMES.length; round++) {
    await expect(host.getByText(`Round ${round} of ${NAMES.length}`).first()).toBeVisible()
    const { judge, honest, mole } = await roles(people)

    // The cards: only the honest reader has the meaning, only the mole has words, chat is closed
    await expect(honest.getByTestId('explanation')).toBeVisible()
    const explanation = (await honest.getByTestId('explanation').textContent()) ?? ''
    for (const person of people) {
      if (person !== honest) await expect(person.getByTestId('explanation')).toHaveCount(0)
      if (person !== mole) await expect(person.getByTestId('words')).toHaveCount(0)
    }
    await expect(mole.getByTestId('words').getByRole('listitem')).toHaveCount(3)
    // On a phone the chat is in a drawer: the stage says it is closed
    await expect(judge.getByText(/Chat is closed until the reveal/)).toBeVisible()
    await expect(judge.getByRole('timer')).toBeVisible()

    if (round === 1) {
      const scan = await new AxeBuilder({ page: honest }).analyze()
      expect(scan.violations.map((violation) => violation.id)).toEqual([])
    }

    // The judge starts; each reader reads in turn (the reader ends their own, the last by the judge)
    await dockButton(judge, 'Start reading').click()
    await expect(judge.getByTestId('reading-order')).toBeVisible()
    const order = await judge.getByTestId('reading-order').getByRole('listitem').allTextContents()
    expect(order).toHaveLength(3)
    for (let index = 0; index < order.length; index++) {
      const name = NAMES.find((candidate) => order[index].includes(candidate)) as string
      const reader = people[NAMES.indexOf(name as (typeof NAMES)[number])]
      await expect(reader.getByText('Your turn: read aloud').first()).toBeVisible()
      if (index < order.length - 1) await dockButton(reader, 'Done reading').click()
      else await dockButton(judge, 'End this reading').click()
    }

    // The vote: every reader keeps or gives a sticker; the judge votes for the honest reader
    await expect(judge.getByTestId('vote')).toBeVisible()
    const honestName = NAMES[people.indexOf(honest)]
    for (const reader of people.filter((person) => person !== judge)) {
      const sticker = reader.getByTestId('sticker')
      await expect(sticker).toBeVisible()
      await sticker.getByRole('button', { name: 'No sticker' }).click()
      await dockButton(reader, 'Keep my sticker').click()
      await expect(reader.getByText('You kept your sticker.')).toBeVisible()
    }
    await expect(judge.getByText(`3 of 4 decided`)).toBeVisible()
    await judge.getByTestId('vote').getByRole('button', { name: honestName }).click()
    await dockButton(judge, `Vote for ${honestName}`).click()

    // The reveal, the same for everyone
    for (const person of people) {
      const reveal = person.getByTestId('round-reveal')
      await expect(reveal.getByTestId('honest-was')).toContainText(`The honest reader was ${honestName}`)
      await expect(reveal.getByText(explanation.replace(/^The real meaning/, ''))).toBeVisible()
      await expect(reveal.getByTestId('mole-was')).toBeVisible()
    }
    await expect(judge.getByText(/Chat is closed until the reveal/)).toHaveCount(0)
    if (round < NAMES.length) await dockButton(judge, 'Next round').click()
  }

  // Every judge found the honest reader: 2 for each judge and honest reader, 2 for each unstuck mole
  await expect(host.getByText(/Top score|share the top score/).first()).toBeVisible()
  await close(people)
})

test('the screen and its rules page are in Chinese', async ({ browser }) => {
  const person = await newPerson(browser, { ...PHONE, locale: 'zh-TW' })
  await person.goto('/games/bluff/rules')
  await expect(person.getByRole('heading', { name: '真假朗讀是什麼？' })).toBeVisible()
  await expect(person.getByText('暗樁').first()).toBeVisible()
  await close([person])
})
