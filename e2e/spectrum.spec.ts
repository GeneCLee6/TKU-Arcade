import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson, setSelectOption } from './helpers.ts'

// e5-t05, e5-t07: four players through the real room, every round to the result. Spectrum is not in
// the lobby until the owner signs off, so its room comes from the API, as Silent Table's did.

const NAMES = ['Ann', 'Bob', 'Cy', 'Dee'] as const
/** No digits: the room refuses those */
const ANSWERS = ['cold rice', 'a warm bowl of soup', 'street food', 'a feast']

const close = (people: readonly Page[]) =>
  Promise.all(people.map((person) => person.context().close()))

async function createSpectrumRoom(page: Page, nickname: string): Promise<void> {
  const response = await page.request.post('/api/rooms', { data: { gameId: 'spectrum' } })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(page, `/r/${id}`, nickname)
}

async function spectrumPlayers(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Page[]> {
  const people: Page[] = []
  for (const name of NAMES) {
    const person = await newPerson(browser, options)
    if (people.length === 0) await createSpectrumRoom(person, name)
    else await joinRoom(person, people[0].url(), name)
    people.push(person)
  }
  return people
}

const youGuess = (page: Page) => page.getByRole('heading', { name: 'This round you are the guesser' })

/** Whoever's screen says they guess this round; the others answer */
async function rolesOf(people: readonly Page[]): Promise<{ guesser: Page; answerers: Page[] }> {
  let guesser: Page | null = null
  await expect(async () => {
    for (const person of people) {
      if (await youGuess(person).isVisible()) guesser = person
    }
    expect(guesser).not.toBeNull()
  }).toPass({ timeout: 15_000 })
  const found = guesser as unknown as Page
  return { guesser: found, answerers: people.filter((person) => person !== found) }
}

async function sendAnswer(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Your answer' })
  await input.fill(text)
  await page.getByRole('button', { name: /^(Send|Change) answer$/ }).click()
  await expect(page.getByRole('status').filter({ hasText: `Sent: “${text}”` })).toBeVisible()
}

test('four players play every round to the result', async ({ browser }) => {
  test.setTimeout(180_000)
  const people = await spectrumPlayers(browser, { reducedMotion: 'reduce' })
  const [host] = people
  await host.getByRole('button', { name: 'Start game' }).click()

  for (let round = 1; round <= NAMES.length; round++) {
    await expect(host.getByText(`Round ${round}/${NAMES.length}`).first()).toBeVisible()
    const { guesser, answerers } = await rolesOf(people)
    const topic = await host.getByTestId('topic-card').getByRole('heading').textContent()
    for (const person of people) {
      await expect(person.getByTestId('topic-card').getByRole('heading')).toHaveText(topic ?? '')
    }

    // Answering: the clock runs, chat is closed, and only answerers hold a number
    await expect(host.getByRole('timer')).toBeVisible()
    await expect(host.getByRole('textbox', { name: 'Message to the room' })).toBeDisabled()
    await expect(host.getByText('Chat is closed while the answers are written and guessed.')).toBeVisible()
    await expect(guesser.getByTestId('secret-number')).toHaveCount(0)
    await expect(guesser.getByRole('textbox', { name: 'Your answer' })).toHaveCount(0)
    for (const answerer of answerers) {
      await expect(answerer.getByTestId('secret-number')).toHaveText(/^([1-9]|10)$/)
    }

    if (round === 1) {
      // A number in the answer: warned while typing, and refused by the room in its own words
      const first = answerers[0]
      await first.getByRole('textbox', { name: 'Your answer' }).fill('7 cats')
      const refusal = 'No numbers in the answer: say it with a thing or a word.'
      await expect(first.getByRole('alert').filter({ hasText: refusal })).toBeVisible()
      await first.getByRole('button', { name: 'Send answer' }).click()
      await expect(first.getByText(refusal).last()).toBeVisible()
      await expect(guesser.getByText('0/3 in')).toBeVisible()

      // Hide the number from the person beside you, and back
      await first.getByRole('button', { name: 'Hide my number' }).click()
      await expect(first.getByTestId('secret-number')).toHaveText('Hidden')
      await first.getByRole('button', { name: 'Show my number' }).click()
      await expect(first.getByTestId('secret-number')).toHaveText(/^([1-9]|10)$/)
    }

    // Who has answered shows, what they answered does not
    await sendAnswer(answerers[0], ANSWERS[0])
    await expect(guesser.getByText('1/3 in')).toBeVisible()
    await expect(guesser.getByText(ANSWERS[0])).toHaveCount(0)
    await expect(answerers[1].getByText(ANSWERS[0])).toHaveCount(0)
    await sendAnswer(answerers[1], ANSWERS[1])
    // The last answer locks them all
    await answerers[2].getByRole('textbox', { name: 'Your answer' }).fill(ANSWERS[2])
    await answerers[2].getByRole('button', { name: 'Send answer' }).click()

    // Guessing: everyone sees every answer; only the guesser picks
    for (const person of people) {
      for (const text of ANSWERS.slice(0, 3)) {
        await expect(person.getByText(text, { exact: true })).toBeVisible()
      }
    }
    await expect(answerers[0].getByText(/is picking the largest and the smallest\.$/)).toBeVisible()
    await expect(answerers[0].getByRole('button', { name: /^Largest:/ })).toHaveCount(0)
    const confirm = guesser.getByRole('button', { name: 'Confirm guess' })
    await expect(confirm).toBeDisabled()
    const largest = guesser.getByRole('button', { name: /^Largest:/ })
    const smallest = guesser.getByRole('button', { name: /^Smallest:/ })
    await expect(largest).toHaveCount(3)
    await largest.nth(0).click()
    await smallest.nth(1).click()
    await expect(largest.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await confirm.click()

    // The reveal: every number on the line, right or wrong, chat open again
    const reveal = host.getByTestId('round-reveal')
    await expect(reveal).toBeVisible()
    await expect(reveal.getByRole('listitem').filter({ hasText: /(Largest|Smallest): .+\. Guessed (right|wrong)$/ })).toHaveCount(2)
    await expect(host.getByRole('textbox', { name: 'Message to the room' })).toBeEnabled()
    for (const person of people) {
      await expect(person.getByTestId(/^mark-/)).toHaveCount(3)
    }
    if (round < NAMES.length) {
      await expect(answerers[0].getByRole('button', { name: 'Next round' })).toHaveCount(0)
      await guesser.getByRole('button', { name: 'Next round' }).click()
    }
  }

  // Everyone guessed once: the result, with each player's points
  const result = host.getByRole('region', { name: 'Result' })
  await expect(result).toBeVisible()
  await expect(result.getByText(/as the guesser, \d+ as an answerer\.$/)).toHaveCount(4)
  await expect(host.getByText('Game over')).toBeVisible()
  await close(people)
})

test('the guesser puts every answer in order in the full-order mode', async ({ browser }) => {
  test.setTimeout(120_000)
  const people = await spectrumPlayers(browser, { reducedMotion: 'reduce' })
  const [host, guest] = people
  await setSelectOption(host, guest, 'The guesser picks', 'order', 'Everyone in order')
  await host.getByRole('button', { name: 'Start game' }).click()

  const { guesser, answerers } = await rolesOf(people)
  await sendAnswer(answerers[0], ANSWERS[0])
  await sendAnswer(answerers[1], ANSWERS[1])
  await answerers[2].getByRole('textbox', { name: 'Your answer' }).fill(ANSWERS[2])
  await answerers[2].getByRole('button', { name: 'Send answer' }).click()

  const order = guesser.getByRole('list', { name: 'Your order, smallest number first' })
  await expect(order.getByRole('listitem')).toHaveCount(3)
  const first = await order.getByRole('listitem').first().textContent()
  await order.getByRole('button', { name: /: move towards 10$/ }).first().click()
  const moved = ANSWERS.slice(0, 3).find((text) => first?.includes(text)) ?? ''
  await expect(order.getByRole('listitem').nth(1)).toContainText(moved)
  await expect(answerers[0].getByText(/is putting the answers in order\.$/)).toBeVisible()
  await guesser.getByRole('button', { name: 'Confirm guess' }).click()
  await expect(host.getByText(/^\d of 3 in the right place\.$/)).toBeVisible()
  await close(people)
})

test('the rules are there for a game the lobby does not list yet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'How to play Spectrum' })).toHaveCount(0)
  await page.goto('/games/spectrum/rules')
  await expect(page.getByRole('heading', { name: 'One round' })).toBeVisible()
  await createSpectrumRoom(page, 'Ann')
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Scoring' })).toBeVisible()
})

/** Everyone answers; the last answer locks them */
async function answerAll(answerers: readonly Page[]): Promise<void> {
  await sendAnswer(answerers[0], ANSWERS[0])
  await sendAnswer(answerers[1], ANSWERS[1])
  await answerers[2].getByRole('textbox', { name: 'Your answer' }).fill(ANSWERS[2])
  await answerers[2].getByRole('button', { name: 'Send answer' }).click()
  await expect(answerers[0].getByText(ANSWERS[2], { exact: true })).toBeVisible()
}

// DESIGN §6: no serious or critical problems, in both themes, at every step of a round (AC-7.6)
const BLOCKING = new Set(['serious', 'critical'])

/**
 * The page as tall as its content while axe looks: otherwise text that happens to sit behind the
 * sticky dock is measured against the dock (seen once on the preview, for the topic's category tag)
 */
async function expectNoSeriousProblems(page: Page, step: string) {
  const size = page.viewportSize() ?? { width: 1280, height: 720 }
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: size.width, height: Math.max(height, size.height) })
  const { violations } = await new AxeBuilder({ page }).analyze()
  await page.setViewportSize(size)
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking, step).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe, ${scheme} theme: every step of a round, the result and the rules`, async ({ browser }) => {
    test.setTimeout(180_000)
    const people = await spectrumPlayers(browser, { colorScheme: scheme, reducedMotion: 'reduce' })
    const [host] = people
    await host.getByRole('button', { name: 'Start game' }).click()
    for (let round = 1; round <= NAMES.length; round++) {
      await expect(host.getByText(`Round ${round}/${NAMES.length}`).first()).toBeVisible()
      const { guesser, answerers } = await rolesOf(people)
      if (round === 1) {
        await expectNoSeriousProblems(answerers[0], 'answering, an answerer')
        await expectNoSeriousProblems(guesser, 'answering, the guesser')
      }
      await answerAll(answerers)
      await guesser.getByRole('button', { name: /^Largest:/ }).first().click()
      await guesser.getByRole('button', { name: /^Smallest:/ }).nth(1).click()
      if (round === 1) {
        await expectNoSeriousProblems(guesser, 'guessing, the guesser')
        await expectNoSeriousProblems(answerers[0], 'guessing, an answerer')
      }
      await guesser.getByRole('button', { name: 'Confirm guess' }).click()
      await expect(host.getByTestId('round-reveal')).toBeVisible()
      if (round === 1) await expectNoSeriousProblems(answerers[0], 'the reveal')
      if (round < NAMES.length) await guesser.getByRole('button', { name: 'Next round' }).click()
    }
    await expect(host.getByRole('region', { name: 'Result' })).toBeVisible()
    await expectNoSeriousProblems(host, 'the result')
    await host.goto('/games/spectrum/rules')
    await expect(host.getByRole('heading', { name: 'One round' })).toBeVisible()
    await expectNoSeriousProblems(host, 'the rules')
    await close(people)
  })
}

test('an answer and a guess with the keyboard alone', async ({ browser }) => {
  test.setTimeout(120_000)
  const people = await spectrumPlayers(browser, { reducedMotion: 'reduce' })
  const [host] = people
  await host.getByRole('button', { name: 'Start game' }).click()
  const { guesser, answerers } = await rolesOf(people)

  // Into the answer, typed, sent with Enter
  const first = answerers[0]
  const input = first.getByRole('textbox', { name: 'Your answer' })
  await tabTo(first, input)
  await first.keyboard.type(ANSWERS[0])
  await first.keyboard.press('Enter')
  await expect(first.getByText(`Sent: “${ANSWERS[0]}”`, { exact: false })).toBeVisible()
  await sendAnswer(answerers[1], ANSWERS[1])
  await answerers[2].getByRole('textbox', { name: 'Your answer' }).fill(ANSWERS[2])
  await answerers[2].keyboard.press('Enter')

  // The picks and the confirmation, each a stop on the way
  const largest = guesser.getByRole('button', { name: /^Largest:/ }).first()
  await tabTo(guesser, largest)
  await guesser.keyboard.press('Space')
  await expect(largest).toHaveAttribute('aria-pressed', 'true')
  const smallest = guesser.getByRole('button', { name: /^Smallest:/ }).nth(1)
  await tabTo(guesser, smallest)
  await guesser.keyboard.press('Enter')
  const confirm = guesser.getByRole('button', { name: 'Confirm guess' })
  await tabTo(guesser, confirm)
  await guesser.keyboard.press('Enter')
  await expect(guesser.getByTestId('round-reveal')).toBeVisible()
  await close(people)
})

test('a phone at 360 px: nothing sideways, every button a finger high', async ({ browser }) => {
  test.setTimeout(120_000)
  const phone = { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true }
  const people = await spectrumPlayers(browser, { ...phone, reducedMotion: 'reduce' })
  const [host] = people
  await host.getByRole('button', { name: 'Start game' }).click()
  const { guesser, answerers } = await rolesOf(people)
  await expectFits(answerers[0], [/^Send answer$/, 'Hide my number'])
  await answerAll(answerers)
  await expectFits(guesser, [/^Largest:/, /^Smallest:/, 'Confirm guess'])
  await guesser.getByRole('button', { name: /^Largest:/ }).first().click()
  await guesser.getByRole('button', { name: /^Smallest:/ }).nth(1).click()
  await guesser.getByRole('button', { name: 'Confirm guess' }).click()
  await expect(guesser.getByTestId('round-reveal')).toBeVisible()
  await expectFits(guesser, ['Next round'])
  // Too narrow for a whole answer on each mark, so the list under the line shows them
  await expect(guesser.getByTestId('round-reveal').getByRole('listitem').first()).toBeVisible()
  await close(people)
})

async function expectFits(page: Page, buttons: (string | RegExp)[]) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  for (const name of buttons) {
    const box = await page.getByRole('button', { name }).first().boundingBox()
    expect(box?.height, String(name)).toBeGreaterThanOrEqual(44)
  }
}

/** Presses Tab until `target` has the focus: it must be reachable, and in a sane number of stops */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, limit = 60) {
  for (let stop = 0; stop < limit; stop++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`Not reached in ${limit} presses of Tab`)
}
