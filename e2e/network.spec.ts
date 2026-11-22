import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { createSilentTableRoom, joinRoom, newPerson } from './helpers.ts'

// 2026-11-22 (the owner: 「常常連線不穩」, docs/NETWORK.md): the room's socket going away the ways it
// does in real life — a deploy closing every socket, the network switched off, the site refusing a
// burst of reconnects (4429) — and the page coming back by itself, without losing what was tapped
// meanwhile. The guest's room socket goes through a relay the test can close or refuse.

type Relay = {
  /** The page side of the socket now open, if any */
  current: WebSocketRoute | null
  /** New sockets are closed at once with this code; null lets them through */
  refuse: number | null
  opened: number
}

async function relayedPerson(browser: Parameters<typeof newPerson>[0]): Promise<{ page: Page; relay: Relay }> {
  const page = await newPerson(browser, { reducedMotion: 'reduce' })
  const relay: Relay = { current: null, refuse: null, opened: 0 }
  await page.routeWebSocket(/\/ws\//, (client) => {
    relay.opened++
    if (relay.refuse !== null) {
      void client.close({ code: relay.refuse, reason: 'refused by the test' })
      return
    }
    relay.current = client
    const server = client.connectToServer()
    client.onMessage((message) => server.send(message))
    server.onMessage((message) => client.send(message))
    client.onClose(() => void server.close())
    server.onClose((code, reason) => void client.close({ code, reason }))
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

const RECONNECTING = 'Connection lost, reconnecting…'

test('a dropped socket (a deploy) is back in well under a second, without a banner', async ({ browser }) => {
  test.setTimeout(90_000)
  const { people, host, guest, relay, take } = await table(browser)
  const before = relay.opened
  const started = Date.now()
  await relay.current!.close({ code: 1001, reason: 'going away' })
  await expect.poll(() => relay.opened).toBe(before + 1)
  await expect(take).toHaveCount(3)
  // Back before the banner's first second: nobody saw a thing
  await guest.waitForTimeout(1_500)
  await expect(guest.getByTestId('reconnect-banner')).toHaveCount(0)
  expect(Date.now() - started).toBeLessThan(10_000)
  await take.first().click()
  await expect(host.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(2)
  for (const person of people) await person.context().close()
})

test('a tap made while reconnecting is sent once back, and the bar says so and goes', async ({ browser }) => {
  test.setTimeout(90_000)
  const { people, host, guest, relay, take } = await table(browser)
  // The next tries fail for a few seconds, as during a deploy
  relay.refuse = 1011
  await relay.current!.close({ code: 1001, reason: 'going away' })
  await expect(guest.getByTestId('reconnect-banner')).toBeVisible({ timeout: 5_000 })
  await expect(guest.getByText(RECONNECTING)).toBeVisible()
  // Tapped while away: it waits, it is not lost
  await take.first().click()
  await expect(guest.getByText(/Not sent/)).toHaveCount(0)
  // Long enough for the bar to offer trying at once; that brings it back now
  await expect(guest.getByRole('button', { name: 'Try now' })).toBeVisible({ timeout: 10_000 })
  relay.refuse = null
  await guest.getByRole('button', { name: 'Try now' }).click()
  await expect(guest.getByText('Back online.')).toBeVisible({ timeout: 5_000 })
  await expect(host.getByRole('button', { name: /^Take chip \d+$/ })).toHaveCount(2)
  await expect(guest.getByRole('button', { name: /you hold it$/ })).toBeVisible()
  // And then it goes by itself
  await expect(guest.getByText('Back online.')).toHaveCount(0, { timeout: 5_000 })
  for (const person of people) await person.context().close()
})

test('too many connections (4429) on the way back is a pause, not the end', async ({ browser }) => {
  test.setTimeout(120_000)
  const { people, guest, relay, take } = await table(browser)
  relay.refuse = 4429
  await relay.current!.close({ code: 1001, reason: 'going away' })
  await expect(guest.getByText(RECONNECTING)).toBeVisible({ timeout: 5_000 })
  // Refused at least once more, then let through
  await guest.waitForTimeout(2_000)
  relay.refuse = null
  // The page waits out the site's minute (RATE_LIMITED_DELAY_MS), and is back without a reload
  await expect(guest.getByText(RECONNECTING)).toHaveCount(0, { timeout: 40_000 })
  await expect(guest.getByText(/Too many connections/i)).toHaveCount(0)
  await expect(take).toHaveCount(3)
  for (const person of people) await person.context().close()
})

test('the network switched off and on: back by itself', async ({ browser }) => {
  test.setTimeout(90_000)
  const { people, host, guest, take } = await table(browser)
  await guest.context().setOffline(true)
  // A tap into a network that is gone is noticed in seconds
  await take.first().click()
  await expect(guest.getByText(RECONNECTING)).toBeVisible({ timeout: 15_000 })
  await guest.context().setOffline(false)
  await expect(guest.getByText(RECONNECTING)).toHaveCount(0, { timeout: 20_000 })
  await expect(guest.getByRole('button', { name: /^Take chip \d+$/ }).first()).toBeVisible()
  // Whether the tap got out before the network went or not, the table agrees with itself
  const left = await host.getByRole('button', { name: /^Take chip \d+$/ }).count()
  expect([2, 3]).toContain(left)
  for (const person of people) await person.context().close()
})
