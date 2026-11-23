import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-22 (owner: "the waiting room like the racing games: the whole screen is the host and the
// racers, one page, wide, full"): the race room's waiting room covers the screen and never scrolls,
// on a computer (1280 x 720) and on a phone on its side (844 x 390); all eight places are on it, the
// ready flow works, and axe finds nothing serious. A phone held upright gets the list and a word
// about turning it. Screenshots go to test-results/ (KART_LOBBY_SHOTS=1).
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
// (2026-11-23, QA follow-up: two pages of eight 3D racers each and four axe scans under software
// drawing took most of two minutes on a busy machine, and now and then more)
test.setTimeout(240_000)

const BLOCKING = new Set(['serious', 'critical'])

async function room(browser: Browser, options: BrowserContextOptions) {
  const ann = await newPerson(browser, options)
  const bob = await newPerson(browser, options)
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}`, 'Ann')
  await joinRoom(bob, `/r/${id}`, 'Bob')
  return { ann, bob }
}

/** The host fills the six open places with computer karts, one tap each */
async function fill(ann: Page) {
  for (let count = 3; count <= 8; count++) {
    await ann.getByTestId('kart-lobby-add-bot').click()
    await expect(ann.getByTestId('kart-lobby-count')).toHaveText(`${count}/8 racers`)
  }
}

/** One page: nothing scrolls, and every place is whole on the screen */
async function expectOnePage(page: Page) {
  // The page behind does not move under a wheel or a swipe
  await page.mouse.move(200, 200)
  await page.mouse.wheel(0, 600)
  await page.mouse.wheel(300, 0)
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0])
  const sizes = await page.evaluate(() => {
    const lobby = document.querySelector<HTMLElement>('[data-testid="kart-lobby"]')!
    return {
      lobby: lobby.scrollHeight - lobby.clientHeight,
      lobbyWide: lobby.scrollWidth - lobby.clientWidth,
    }
  })
  expect(sizes.lobby).toBeLessThanOrEqual(0)
  expect(sizes.lobbyWide).toBeLessThanOrEqual(0)
  const viewport = page.viewportSize()!
  const places = page.locator('[data-testid="kart-picks"] > li')
  await expect(places).toHaveCount(8)
  for (const place of await places.all()) {
    const box = (await place.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5)
    // Big enough to be the racers' screen, not a list of chips
    expect(box.height).toBeGreaterThan(viewport.height / 3)
  }
}

async function expectNoSeriousProblems(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking).toEqual([])
}

const shot = async (page: Page, name: string) => {
  if (process.env.KART_LOBBY_SHOTS) await page.screenshot({ path: `test-results/kart-lobby-${name}.png` })
}

for (const { name, options } of [
  { name: 'computer', options: { viewport: { width: 1280, height: 720 } } },
  {
    name: 'phone-sideways',
    options: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  },
] as const) {
  test(`the waiting room is one page with eight big places: ${name}`, async ({ browser }) => {
    const { ann, bob } = await room(browser, options)
    await fill(ann)
    await expectOnePage(ann)
    await expectOnePage(bob)
    await expect(ann.getByTestId('kart-lobby-place')).toHaveCount(8)
    // 2026-11-23 (#151): every name whole, a computer's tag too (shrunk, or on two lines)
    for (const page of [ann, bob]) {
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-testid="kart-lobby-place"] [data-name]')]
          // (The display face reaches a few pixels over its line: a third line would be a dozen)
          .filter((name) => name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 6)
          .map((name) => name.textContent),
      )
      expect(cut).toEqual([])
    }
    // The ready flow: Start waits on Bob, Bob presses Ready, Ann starts
    await expect(ann.getByRole('button', { name: 'Start game' })).toBeDisabled()
    await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Waiting for Bob to get ready')
    await bob.getByTestId('kart-lobby-ready').click()
    await expect(bob.getByTestId('kart-lobby-ready')).toHaveAttribute('aria-pressed', 'true')
    const bobs = ann.getByTestId('kart-lobby-place').filter({ has: ann.getByText('Bob', { exact: true }) })
    await expect(bobs).toHaveAttribute('data-state', 'ready')
    await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
    await expect(ann.getByRole('button', { name: 'Start game' })).toBeEnabled()
    // Let the 3D pictures come before the screenshot and the scan
    await ann.waitForTimeout(2500)
    await shot(ann, `${name}-host`)
    await shot(bob, `${name}-racer`)
    await expectNoSeriousProblems(ann)
    await expectNoSeriousProblems(bob)
    // The tools are behind buttons, and come back out of the way
    await ann.getByTestId('kart-lobby-settings').click()
    await expect(ann.getByTestId('kart-room-bots')).toBeVisible()
    await expectNoSeriousProblems(ann)
    await ann.getByRole('button', { name: 'Close' }).click()
    await ann.getByTestId('kart-lobby-chat').click()
    await ann.getByRole('textbox', { name: /message/i }).fill('Ready when you are')
    // (On a touch screen Enter is a new line: the button sends)
    await ann.getByRole('button', { name: 'Send' }).click()
    await ann.getByRole('button', { name: 'Close' }).click()
    await expect(bob.getByTestId('kart-lobby-chat')).toHaveAccessibleName(/1 new/)
    await ann.context().close()
    await bob.context().close()
  })
}

test('the waiting room goes full screen with the race room around it, and back', async ({ browser }) => {
  const { ann, bob } = await room(browser, { viewport: { width: 1280, height: 720 } })
  const button = ann.getByTestId('kart-lobby').getByTestId('fullscreen-button')
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'fullscreen')
  expect(await ann.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)
  await expectOnePage(ann)
  await button.click()
  await expect(button).toHaveAttribute('data-mode', 'off')
  await ann.context().close()
  await bob.context().close()
})

test('a phone held upright gets the list of racers and is asked to turn sideways', async ({ browser }) => {
  const { ann, bob } = await room(browser, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  await expect(bob.getByText('Turn your phone sideways to see the whole line-up.')).toBeVisible()
  await expect(bob.getByTestId('kart-lobby-place')).toHaveCount(2)
  await expect(bob.getByTestId('kart-lobby-ready')).toBeVisible()
  await shot(bob, 'phone-upright')
  await expectNoSeriousProblems(bob)
  await ann.context().close()
  await bob.context().close()
})
