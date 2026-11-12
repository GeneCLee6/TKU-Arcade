import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { newPerson, startGame } from './helpers.ts'

// e3-t10 (C5): the whole promotion board on one screen, full screen and its fallback, the keyboard
// on the fitted board; e3-t11: the rank watermarks. Against a real browser, at real sizes

/** How many of the board's cells lie wholly on the screen, with the page where it opens */
async function cellsOnScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(0, 0)
    const [width, height] = [window.innerWidth, window.innerHeight]
    return [...document.querySelectorAll('[data-cell]')].filter((cell) => {
      const box = cell.getBoundingClientRect()
      return box.left >= 0 && box.top >= 0 && box.right <= width + 0.5 && box.bottom <= height + 0.5
    }).length
  })
}

async function expectWhollyOnScreen(page: Page, name: string | RegExp) {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox()
  const viewport = page.viewportSize()
  expect(box, String(name)).not.toBeNull()
  expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= (viewport?.height ?? 0)).toBe(
    true,
  )
}

/** Whoever is to move, of the two: the turn is drawn by lot */
async function roller(host: Page, guest: Page): Promise<Page> {
  return (await host.getByText('Your turn').isVisible()) ? host : guest
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`at ${size.width}x${size.height} all 79 cells, the turn and the roll are on one screen`, async ({
    browser,
  }) => {
    const host = await newPerson(browser, { viewport: size })
    const guest = await newPerson(browser, { viewport: size })
    await startGame(host, guest)
    await expect(host.locator('[data-cell]')).toHaveCount(79)
    // The watermarks have arrived: every office has one
    await expect(host.locator('[data-cell] use[href*="rankArt"]')).toHaveCount(79)
    await expect.poll(() => cellsOnScreen(host)).toBe(79)
    await expectWhollyOnScreen(host, 'Roll')
    await expect(host.getByText(/Your turn|'s turn$/)).toBeInViewport({ ratio: 1 })
    // Nothing sideways either
    const sideways = await host.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)

    // Still all of it after a roll moves a piece
    const mover = await roller(host, guest)
    await mover.getByRole('button', { name: 'Roll', exact: true }).click()
    await expect(mover.getByRole('status').filter({ hasText: /rolled/ })).toBeVisible({
      timeout: 10_000,
    })
    await expect.poll(() => cellsOnScreen(host)).toBe(79)
    await guest.context().close()
    await host.context().close()
  })
}

test('on a phone held upright the whole board is on the screen too, and a tip says to turn it', async ({
  browser,
}) => {
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
  const host = await newPerson(browser, phone)
  const guest = await newPerson(browser, phone)
  await startGame(host, guest)
  await expect.poll(() => cellsOnScreen(host)).toBe(79)
  await expect(host.getByText(/Turn sideways/)).toBeVisible()
  await expectWhollyOnScreen(host, 'Roll')
  await guest.context().close()
  await host.context().close()
})

test('full screen covers the screen with the board and the roll, and Esc or the button leave', async ({
  browser,
}) => {
  const host = await newPerson(browser, { viewport: { width: 1280, height: 720 } })
  const guest = await newPerson(browser)
  await startGame(host, guest)
  const frame = host.locator('[data-immersion]')

  await host.getByRole('button', { name: 'Full screen' }).click()
  // Headless Chromium may grant real fullscreen or refuse it; either way the board covers the screen
  await expect(frame).toHaveAttribute('data-immersion', /^(fullscreen|focus)$/)
  await expect.poll(() => cellsOnScreen(host)).toBe(79)
  await expectWhollyOnScreen(host, 'Roll')
  await expect(host.getByRole('button', { name: 'Roll', exact: true })).toHaveCount(1)
  await host.getByRole('button', { name: 'Exit full screen' }).click()
  await expect(frame).toHaveAttribute('data-immersion', 'off')
  await expect(host.getByRole('button', { name: 'Full screen' })).toBeVisible()
  await guest.context().close()
  await host.context().close()
})

test('without the Fullscreen API (an iPhone) the button gives focus mode, which Esc leaves', async ({
  browser,
}) => {
  const host = await newPerson(browser, {
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  await host.context().addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined })
  })
  const guest = await newPerson(browser)
  await startGame(host, guest)
  const frame = host.locator('[data-immersion]')
  await host.getByRole('button', { name: 'Full screen' }).click()
  await expect(frame).toHaveAttribute('data-immersion', 'focus')
  await expect.poll(() => cellsOnScreen(host)).toBe(79)
  await expectWhollyOnScreen(host, 'Exit full screen')
  // The page's own chrome is covered: the board's frame fills the screen
  const box = await frame.boundingBox()
  expect(box).toEqual({ x: 0, y: 0, width: 844, height: 390 })
  await host.keyboard.press('Escape')
  await expect(frame).toHaveAttribute('data-immersion', 'off')
  await guest.context().close()
  await host.context().close()
})

test('the keyboard still walks the fitted board by what is on the screen', async ({ browser }) => {
  const host = await newPerson(browser, { viewport: { width: 1440, height: 900 } })
  const guest = await newPerson(browser)
  await startGame(host, guest)
  const stop = host.locator('[data-cell][tabindex="0"]')
  await expect(stop).toHaveCount(1)
  await stop.focus()
  const start = await stop.getAttribute('data-cell')
  const seen = new Set([start])
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    const before = await host.evaluate(() => document.activeElement?.getAttribute('data-cell'))
    const from = await host.locator(`[data-cell="${before}"]`).boundingBox()
    await host.keyboard.press(key)
    const after = await host.evaluate(() => document.activeElement?.getAttribute('data-cell'))
    expect(after, key).toBeTruthy()
    seen.add(after ?? null)
    const to = await host.locator(`[data-cell="${after}"]`).boundingBox()
    if (after !== before && from && to) {
      // Each step goes the way of the arrow on the screen
      if (key === 'ArrowUp') expect(to.y).toBeLessThan(from.y)
      if (key === 'ArrowDown') expect(to.y).toBeGreaterThan(from.y)
      if (key === 'ArrowRight') expect(to.x).toBeGreaterThan(from.x)
      if (key === 'ArrowLeft') expect(to.x).toBeLessThan(from.x)
    }
  }
  expect(seen.size).toBeGreaterThan(3)
  await expect(host.locator('[data-cell][tabindex="0"]')).toHaveCount(1)
  await host.keyboard.press('End')
  await expect(host.locator('[data-cell="ronggui"]')).toBeFocused()
  await host.keyboard.press('Enter')
  await expect(host.getByRole('dialog').getByRole('heading')).toContainText('Ronggui')
  await host.keyboard.press('Escape')
  await expect(host.locator('[data-cell="ronggui"]')).toBeFocused()
  await guest.context().close()
  await host.context().close()
})

const BLOCKING = new Set(['serious', 'critical'])

async function expectNoSeriousProblems(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe, ${scheme} theme: the fitted board, a cell's details and full screen`, async ({
    browser,
  }) => {
    const host = await newPerson(browser, {
      colorScheme: scheme,
      viewport: { width: 1280, height: 720 },
    })
    const guest = await newPerson(browser)
    await startGame(host, guest)
    await expect(host.locator('[data-cell] use[href*="rankArt"]')).toHaveCount(79)
    await expectNoSeriousProblems(host)

    await host.locator('[data-cell="zhixian"]').click()
    await expect(host.getByRole('dialog')).toContainText('illustrative')
    await expectNoSeriousProblems(host)
    await host.keyboard.press('Escape')

    await host.getByRole('button', { name: 'Full screen' }).click()
    await expect(host.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
    await expectNoSeriousProblems(host)
    await guest.context().close()
    await host.context().close()
  })
}
