import { expect, test, type Page } from '@playwright/test'
import {
  createSilentTableRoom,
  newPerson,
  playSilentRound,
  setIntOption,
  setSelectOption,
  silentTablePlayers,
} from './helpers.ts'

// e4-t04 to e4-t07: three players and a spectator through the real room. The chips are whatever comes
// first, so levels pass or fail by chance: these tests look at what happens, not which way it goes.

const close = (people: readonly Page[]) =>
  Promise.all(people.map((person) => person.context().close()))

const seenCards = (page: Page, group: string) =>
  page.getByRole('group', { name: group }).getByRole('img')

test('three players and a spectator play to the result', async ({ browser }) => {
  test.setTimeout(120_000)
  const players = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], { reducedMotion: 'reduce' })
  const [host, guest] = players
  await setIntOption(host, players[1], 'Levels in a row to win', '1')
  await setIntOption(host, players[1], 'Failed levels that end the game', '1')
  await host.getByRole('button', { name: 'Start game' }).click()

  const watcher = await newPerson(browser, { reducedMotion: 'reduce' })
  await watchRoom(watcher, host.url(), 'Dee')

  // The first round: three shared cards, your own two, and chat closed
  await expect(seenCards(host, 'Shared cards')).toHaveCount(3)
  await expect(seenCards(host, 'Your cards')).toHaveCount(2)
  await expect(host.getByText('No talking now')).toBeVisible()
  await expect(host.getByRole('textbox', { name: 'Message to the room' })).toBeDisabled()

  // A spectator gets the chips and the shared cards, and nobody's hand
  await expect(watcher.getByText("You're watching this game.")).toBeVisible()
  await expect(seenCards(watcher, 'Shared cards')).toHaveCount(3)
  await expect(watcher.getByRole('group', { name: 'Your cards' })).toHaveCount(0)
  await expect(watcher.getByRole('button', { name: /^Take chip/ })).toHaveCount(0)
  await expect(watcher.locator('li [role="img"]')).toHaveCount(0)

  // Taking from the table, then from another player
  await host.getByRole('button', { name: 'Take chip 2', exact: true }).click()
  await expect(guest.getByRole('button', { name: 'Take chip 2 from Ann' })).toBeVisible()
  await guest.getByRole('button', { name: 'Take chip 2 from Ann' }).click()
  await expect(guest.getByRole('button', { name: 'Chip 2: you hold it' })).toBeVisible()
  await expect(host.getByRole('status').filter({ hasText: 'Bob took your chip 2' })).toBeVisible()
  await expect(host.getByText('Take a chip', { exact: true })).toBeVisible()

  // Ready waits for a chip
  const hostReady = host.getByRole('button', { name: 'Ready', exact: true })
  await expect(hostReady).toHaveAttribute('aria-disabled', 'true')
  await host.getByRole('button', { name: 'Take chip 1', exact: true }).click()
  await players[2].getByRole('button', { name: 'Take chip 3', exact: true }).click()
  for (const person of players) {
    await person.getByRole('button', { name: 'Ready', exact: true }).click()
  }

  // The next card, the chips back on the table
  await expect(host.getByText('Round 2/3')).toBeVisible()
  await expect(seenCards(host, 'Shared cards')).toHaveCount(4)
  await expect(host.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(3)
  await expect(host.getByText('Earlier: 1')).toBeVisible()
  await playSilentRound(players)
  await expect(host.getByText('Round 3/3')).toBeVisible()
  await expect(seenCards(host, 'Shared cards')).toHaveCount(5)
  await playSilentRound(players)

  // One level was the whole game, either way. Co-operative: nobody is "1st"
  const result = host.getByRole('region', { name: 'Result' })
  await expect(result).toBeVisible()
  await expect(result.getByText(/^The table (wins|loses)$/)).toBeVisible()
  await expect(result.getByText('1st')).toHaveCount(0)
  await expect(result.getByText(/Levels read right/)).toHaveCount(3)

  // Everyone sees every hand now, the spectator too, and chat is open again
  const cards = watcher.getByRole('region', { name: 'The cards' })
  await expect(cards.getByRole('listitem')).toHaveCount(3)
  await expect(cards.getByText(/^. (Right|Wrong)$/)).toHaveCount(3)
  await expect(watcher.getByRole('status').filter({ hasText: /^Level (cleared|failed)/ })).toBeVisible()
  await expect(host.getByRole('textbox', { name: 'Message to the room' })).toBeEnabled()

  // And again
  await result.getByRole('button', { name: 'Rematch' }).click()
  await expect(host.getByRole('group', { name: 'Rank chips' })).toBeVisible()
  await expect(host.getByRole('region', { name: 'The cards' })).toHaveCount(0)
  await close([...players, watcher])
})

test('a failed level comes back round with a new deal after a reveal everyone acknowledges', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const players = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], { reducedMotion: 'reduce' })
  const [host] = players
  await setIntOption(host, players[1], 'Levels in a row to win', '7')
  await setIntOption(host, players[1], 'Failed levels that end the game', '5')
  await host.getByRole('button', { name: 'Start game' }).click()
  for (let round = 0; round < 3; round++) await playSilentRound(players)

  await expect(host.getByRole('region', { name: 'The cards' })).toBeVisible()
  await expect(host.getByText(/In a row [01]\/7/)).toBeVisible()
  await expect(host.getByRole('textbox', { name: 'Message to the room' })).toBeEnabled()
  for (const person of players) {
    await person.getByRole('button', { name: 'Next level' }).click()
  }
  await expect(host.getByText('Level 2', { exact: true })).toBeVisible()
  await expect(host.getByText('Round 1/3')).toBeVisible()
  await expect(host.getByRole('region', { name: 'The cards' })).toHaveCount(0)
  await close(players)
})

test('the hands turn over one at a time, and the result waits for the last', async ({ browser }) => {
  test.setTimeout(120_000)
  const players = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'])
  const [host] = players
  await setIntOption(host, players[1], 'Levels in a row to win', '1')
  await setIntOption(host, players[1], 'Failed levels that end the game', '1')
  await host.getByRole('button', { name: 'Start game' }).click()
  for (let round = 0; round < 3; round++) await playSilentRound(players)

  const cards = host.getByRole('region', { name: 'The cards' })
  await expect(cards).toBeVisible()
  await expect(host.getByRole('region', { name: 'Result' })).toHaveCount(0)
  await expect(cards.getByText(/^. (Right|Wrong)$/)).toHaveCount(1, { timeout: 2000 })
  await expect(cards.getByText(/^. (Right|Wrong)$/)).toHaveCount(3, { timeout: 4000 })
  await expect(host.getByRole('region', { name: 'Result' })).toBeVisible()
  await close(players)
})

test('a round runs out of time: chips are dealt, the round moves on', async ({ browser }) => {
  test.setTimeout(120_000)
  const players = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], { reducedMotion: 'reduce' })
  const [host, guest] = players
  await setSelectOption(host, guest, 'Time for each round', '60', '60 seconds')
  await host.getByRole('button', { name: 'Start game' }).click()

  await expect(host.getByRole('timer')).toBeVisible()
  await expect(guest.getByRole('timer')).toBeVisible()
  await guest.getByRole('button', { name: 'Take chip 3', exact: true }).click()
  await expect(host.getByText('Round 1/3')).toBeVisible()
  await expect(host.getByText('Round 2/3')).toBeVisible({ timeout: 75_000 })

  // The chip Bob had stands, in his trail; the others got the lowest ones. A fresh clock for round 2
  await expect(guest.getByText('Earlier: 3')).toBeVisible()
  await expect(host.getByText('Earlier: 1')).toBeVisible()
  await expect(host.getByRole('timer').getByText(/^(5\d|60)s$/)).toBeVisible()
  await close(players)
})

test('the table theme shows on the table, and a guest sees it too', async ({ browser }) => {
  const players = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'])
  const [host, guest] = players
  await setSelectOption(host, guest, 'Table theme', 'climbing', 'Climbing team')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.locator('[data-skin="climbing"]')).toBeVisible()
  await close(players)
})

test('the rules are there for a game the lobby does not list yet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'How to play Silent Table' })).toHaveCount(0)
  await page.goto('/games/silent-table/rules')
  await expect(page.getByRole('heading', { name: 'The goal' })).toBeVisible()
  await createSilentTableRoom(page, 'Ann')
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'One level' })).toBeVisible()
})

/** Into a game under way: nobody gets a seat, so this is how a spectator comes in */
async function watchRoom(page: Page, url: string, nickname: string) {
  await page.goto(url)
  await page.getByRole('textbox', { name: 'Nickname' }).fill(nickname)
  await page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(page.getByRole('group', { name: 'Rank chips' })).toBeVisible()
}
