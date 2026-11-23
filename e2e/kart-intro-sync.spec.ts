import { expect, test, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-23 (#152): every screen in a room shows the same moment of the opening. Two people and two
// computer karts; Bob's page is made slow on purpose: its socket is 20 ms out and 120 ms back (not
// the same each way), and the first few clock answers come in while the page is busy (held up 1.4 s
// and 0.5 s, as when it is still building the race). Each screen settles the room's clock (shared/
// kart/net.ts's `clockSettled`) before telling the room it has loaded, so the two clocks, and the 3,
// 2, 1 each shows, agree to well within 150 ms. (Until #174 it was each driver presented in turn;
// now one group shot, then the count.) Both screens run on this machine, as does the room, so
// Date.now() is the same clock for all three.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(240_000)

interface Reading {
  offset: number | null
  settled: boolean
  countdown: number | null
}
const reading = (page: Page): Promise<Reading | null> =>
  page.evaluate(() => (window as unknown as { __kartRace?: Reading }).__kartRace ?? null)

/** How far this page's reckoning of the room's clock is out, ms (null before an answer) */
const clockError = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const race = (window as unknown as { __kartRace?: Reading }).__kartRace
    if (!race || race.offset === null || !race.settled) return null
    return performance.now() + race.offset - Date.now()
  })

/** Every change of the countdown's number on this page, with when (Date.now()) */
const watchCards = (page: Page) =>
  page.addInitScript(() => {
    const seen: { at: number; text: string }[] = []
    ;(window as unknown as { __cards: typeof seen }).__cards = seen
    let last = ''
    const look = () => {
      const card = document.querySelector('[data-testid="kart-countdown"]')
      const text = card?.textContent?.match(/^[123]$/)?.[0] ?? ''
      if (text !== last) {
        last = text
        seen.push({ at: Date.now(), text })
      }
    }
    new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true })
  })

const cards = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cards: { at: number; text: string }[] }).__cards)

test('two screens count 3, 2, 1 at the same moment, one of them slow', async ({ browser }) => {
  const viewport = { width: 480, height: 320 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
    await watchCards(page)
  }
  // Ann: some latency from the browser's own network emulation
  const cdp = await ann.context().newCDPSession(ann)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  // Bob: his socket slow and lopsided, and the first clock answers read late by a busy page
  await bob.addInitScript(() => {
    const UP_MS = 20
    const DOWN_MS = 120
    const busy = [1_400, 500]
    const send = WebSocket.prototype.send
    WebSocket.prototype.send = function (this: WebSocket, data) {
      setTimeout(() => {
        if (this.readyState === WebSocket.OPEN) send.call(this, data)
      }, UP_MS)
    }
    const handlers = new WeakMap<WebSocket, ((event: MessageEvent) => void) | null>()
    Object.defineProperty(WebSocket.prototype, 'onmessage', {
      configurable: true,
      get(this: WebSocket) {
        return handlers.get(this) ?? null
      },
      set(this: WebSocket, handler: ((event: MessageEvent) => void) | null) {
        handlers.set(this, handler)
        this.addEventListener('message', (event) => {
          if (handlers.get(this) !== handler || !handler) return
          setTimeout(() => {
            const data = (event as MessageEvent).data
            if (data instanceof ArrayBuffer && data.byteLength === 17 && new Uint8Array(data)[0] === 255) {
              const hold = busy.shift()
              if (hold !== undefined) {
                const until = performance.now() + hold
                while (performance.now() < until) {
                  // the page busy building the race
                }
              }
            }
            handler.call(this, event as MessageEvent)
          }, DOWN_MS)
        })
      },
    })
  })

  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'race' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  await ann.getByTestId('kart-lobby-settings').click()
  await ann.getByTestId('kart-room-bots-level').selectOption('easy')
  // Two computer karts: four on the grid
  await ann.getByTestId('kart-room-bots-add').click()
  await ann.getByTestId('kart-room-bots-add').click()
  await ann.getByRole('button', { name: 'Close' }).click()
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
  await ann.getByRole('button', { name: 'Start game' }).click()

  for (const page of [ann, bob]) await expect(page.getByTestId('kart-race')).toBeVisible()
  // Each screen settles its clock (quick pings until the answers agree)
  for (const page of [ann, bob]) {
    await expect.poll(async () => (await reading(page))?.settled ?? false, { timeout: 60_000 }).toBe(true)
  }
  // Through the opening: how far each reckons the room's clock out
  const errors: number[] = []
  for (let i = 0; i < 20; i++) {
    const [a, b] = await Promise.all([clockError(ann), clockError(bob)])
    if (a !== null && b !== null) errors.push(Math.abs(a - b))
    await ann.waitForTimeout(150)
  }
  for (const page of [ann, bob]) {
    await expect(page.getByTestId('kart-countdown')).toBeHidden({ timeout: 30_000 })
  }
  const [annCards, bobCards] = await Promise.all([cards(ann), cards(bob)])
  // When each screen first showed each number, ms apart (a screen draws a few frames a second here)
  const apart: number[] = []
  for (const shown of annCards) {
    if (!shown.text) continue
    const other = bobCards.find((one) => one.text === shown.text)
    // Only a number both showed from its start (not the one on when the page first looked)
    if (other && shown !== annCards.find((one) => one.text) && other !== bobCards.find((one) => one.text)) {
      apart.push(Math.abs(shown.at - other.at))
    }
  }
  console.log(
    `clock apart (ms): max ${Math.max(...errors).toFixed(0)} of ${errors.length};`,
    `counts apart (ms): ${apart.map((one) => one.toFixed(0)).join(', ') || 'none'}`,
  )
  expect(errors.length).toBeGreaterThan(5)
  expect(Math.max(...errors)).toBeLessThan(150)
  // The 2 and the 1 on both screens, each begun on both within the clocks' difference and a frame
  expect(apart.length).toBeGreaterThanOrEqual(2)
  for (const one of apart) expect(one).toBeLessThan(200)
})
