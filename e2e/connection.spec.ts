import { expect, test, type Page } from '@playwright/test'
import { createSilentTableRoom, joinRoom, newPerson } from './helpers.ts'

// Owner, 2026-11-13: in Silent Table some players were stuck for a long time after taking a chip or
// saying ready. A phone back from another app, or on a network that dropped, keeps a socket that
// looks open and carries nothing; until this, the page found out only after 45 s of silent pings.
// Here the room's socket goes through a relay that can swallow everything, both ways, without
// closing: what such a phone's socket does.

type Relay = { dead: boolean }

/** A person whose room socket runs through `relay`: set `dead` and nothing gets through */
async function relayedPerson(browser: Parameters<typeof newPerson>[0]): Promise<{ page: Page; relay: Relay }> {
  const page = await newPerson(browser, { reducedMotion: 'reduce' })
  const relay: Relay = { dead: false }
  await page.routeWebSocket(/\/ws\//, (client) => {
    const server = client.connectToServer()
    client.onMessage((message) => {
      if (!relay.dead) server.send(message)
    })
    server.onMessage((message) => {
      if (!relay.dead) client.send(message)
    })
  })
  return { page, relay }
}

async function table(browser: Parameters<typeof newPerson>[0]) {
  const host = await newPerson(browser, { reducedMotion: 'reduce' })
  await createSilentTableRoom(host, 'Ann')
  const { page: guest, relay } = await relayedPerson(browser)
  await joinRoom(guest, host.url(), 'Bob')
  const third = await newPerson(browser, { reducedMotion: 'reduce' })
  await joinRoom(third, host.url(), 'Cy')
  await host.getByRole('button', { name: 'Start game' }).click()
  const take = guest.getByRole('button', { name: /^Take chip \d+$/ })
  await expect(take).toHaveCount(3)
  return { people: [host, guest, third], host, guest, relay, take }
}

test('a tap into a dead connection is noticed in seconds, reconnects, and the tap can be made again', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { people, host, guest, relay, take } = await table(browser)

  // The socket goes dead without closing: the tap is lost
  relay.dead = true
  await take.first().click()
  const started = Date.now()
  await expect(guest.getByText('Connection lost, reconnecting…')).toBeVisible({ timeout: 15_000 })
  // Noticed in seconds (3 s for an answer, 4 s for the check), where it used to take 45
  expect(Date.now() - started).toBeLessThan(12_000)
  await expect(guest.getByText(/your last move may not have arrived/)).toBeVisible()

  // The relay lets the new socket through: back in the room, and the tap again works
  relay.dead = false
  await expect(guest.getByText('Connection lost, reconnecting…')).toHaveCount(0, { timeout: 15_000 })
  await expect(take).toHaveCount(3)
  await take.first().click()
  await expect(guest.getByRole('button', { name: /you hold it$/ })).toBeVisible()
  await expect(host.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(2)
  for (const person of people) await person.context().close()
})

test('coming back to the page checks the connection at once', async ({ browser }) => {
  test.setTimeout(60_000)
  const { people, guest, relay, take } = await table(browser)

  relay.dead = true
  await guest.evaluate(() => window.dispatchEvent(new Event('focus')))
  const started = Date.now()
  await expect(guest.getByText('Connection lost, reconnecting…')).toBeVisible({ timeout: 10_000 })
  expect(Date.now() - started).toBeLessThan(8_000)
  // Nothing was tapped, so nothing to make again
  await expect(guest.getByText(/your last move may not have arrived/)).toHaveCount(0)
  relay.dead = false
  await expect(guest.getByText('Connection lost, reconnecting…')).toHaveCount(0, { timeout: 15_000 })
  await expect(take).toHaveCount(3)
  for (const person of people) await person.context().close()
})
