import { expect, test } from '@playwright/test'
import { silentTablePlayers } from './helpers.ts'

// Owner, 2026-11-13: in Silent Table some players were stuck for a long time after taking a chip or
// saying ready. A phone back from another app, or on a network that dropped, keeps a socket that
// looks open and carries nothing; until this, the page found out only after 45 s of silent pings.

test('a tap into a dead connection is noticed in seconds, reconnects, and the tap can be made again', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const people = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], { reducedMotion: 'reduce' })
  const [host, guest] = people
  await host.getByRole('button', { name: 'Start game' }).click()
  const take = guest.getByRole('button', { name: /^Take chip \d+$/ })
  await expect(take).toHaveCount(3)

  // The network goes away under an open socket: no close event, nothing gets through
  await guest.context().setOffline(true)
  await take.first().click()
  await guest.context().setOffline(false)

  // Within a few seconds the page knows, says the tap may be lost, and is back in the room
  const started = Date.now()
  await expect(guest.getByText(/your last move may not have arrived/)).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByText('Connection lost, reconnecting…')).toHaveCount(0, { timeout: 15_000 })
  expect(Date.now() - started).toBeLessThan(15_000)

  // The tap again, and everyone sees it
  await expect(take).toHaveCount(3)
  await take.first().click()
  await expect(guest.getByRole('button', { name: /you hold it$/ })).toBeVisible()
  await expect(host.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(2)
  for (const person of people) await person.context().close()
})

test('coming back to the page checks the connection at once', async ({ browser }) => {
  test.setTimeout(60_000)
  const people = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'], { reducedMotion: 'reduce' })
  const [host, guest] = people
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(3)

  await guest.context().setOffline(true)
  await guest.evaluate(() => window.dispatchEvent(new Event('focus')))
  // The check finds no answer and the page starts over: the banner says so well before 45 s
  await expect(guest.getByText('Connection lost, reconnecting…')).toBeVisible({ timeout: 10_000 })
  await guest.context().setOffline(false)
  await expect(guest.getByText('Connection lost, reconnecting…')).toHaveCount(0, { timeout: 15_000 })
  await expect(guest.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(3)
  for (const person of people) await person.context().close()
})
