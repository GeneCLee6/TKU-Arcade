import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// e8-t01: the spike at /kart/spike; e8-t02a and e8-t12 add the gauge, boosts, gamepad and remapping. Headless Chromium draws with a software renderer here (the flag
// lets it), so these tests say nothing about speed on a real device.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })

interface KartReading {
  running: boolean
  tick: number
  frames: number
  state: {
    x: number
    z: number
    heading: number
    vx: number
    vz: number
    drifting: boolean
    driftDirection: number
    gauge: number
    storedBoosts: number
    boostSeconds: number
    chain: number
  }
  input: { throttle: boolean; brake: boolean; steer: number; drift: boolean; boost: boolean }
  gamepad: string | undefined
}

const reading = (page: Page): Promise<KartReading> =>
  page.evaluate(() => (window as unknown as { __kartSpike: KartReading }).__kartSpike)

/** Fails the test on anything red in the console or any uncaught error */
function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function openSpike(page: Page) {
  await page.goto('/kart/spike?fps=1')
  await expect(page.locator('canvas')).toBeVisible()
  await expect.poll(async () => (await reading(page)).frames).toBeGreaterThan(5)
}

/** What share of the screenshot is the commonest colour, and how many colours there are */
async function screenshotColours(page: Page) {
  const png = (await page.locator('canvas').screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const counts = new Map<number, number>()
    for (let i = 0; i < pixels.length; i += 4) {
      const key = (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return {
      colours: counts.size,
      commonest: Math.max(...counts.values()) / (pixels.length / 4),
    }
  }, png)
}

const speedOf = async (page: Page) => {
  const { state } = await reading(page)
  return Math.hypot(state.vx, state.vz)
}

const LONG = { timeout: 30_000 }

async function drive(page: Page) {
  const start = await reading(page)
  expect(start.state.x).toBe(0)
  expect(start.state.z).toBe(0)

  await page.keyboard.down('ArrowUp')
  await expect
    .poll(
      async () => {
        const { state } = await reading(page)
        return Math.hypot(state.vx, state.vz)
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(12)
  const moved = await reading(page)
  expect(moved.state.z).toBeLessThan(-1)

  // Z, not Shift: five Shift presses open Windows' Sticky Keys prompt
  await page.keyboard.down('ArrowRight')
  await page.keyboard.down('z')
  await expect
    .poll(async () => (await reading(page)).state.drifting, { timeout: 20_000 })
    .toBe(true)
  await expect
    .poll(
      async () => {
        const { state } = await reading(page)
        const forward = state.vx * Math.sin(state.heading) - state.vz * Math.cos(state.heading)
        const side = state.vx * Math.cos(state.heading) + state.vz * Math.sin(state.heading)
        return Math.abs(Math.atan2(side, forward) * (180 / Math.PI))
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(10)
  const drifting = await reading(page)
  expect(drifting.state.driftDirection).toBe(1)
  expect(drifting.state.heading).not.toBe(moved.state.heading)

  await page.keyboard.up('z')
  await expect
    .poll(async () => (await reading(page)).state.drifting, { timeout: 20_000 })
    .toBe(false)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.up('ArrowUp')
}

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['375 px', { width: 375, height: 667 }],
] as const) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, locale: 'en-US' })

    test('draws a real scene, drives and drifts, with a clean console', async ({ page }) => {
      const errors = watchConsole(page)
      await openSpike(page)

      const scene = await screenshotColours(page)
      expect(scene.colours).toBeGreaterThan(10)
      expect(scene.commonest).toBeLessThan(0.9)
      await expect(page.getByText('Up arrow to accelerate')).toBeVisible()
      await expect(page.getByTestId('kart-hud')).toBeVisible()
      await expect(page.getByTestId('kart-fps')).toHaveText(/^\d+$/)

      const before = (await page.locator('canvas').screenshot()).toString('base64')
      await drive(page)
      const after = (await page.locator('canvas').screenshot()).toString('base64')
      expect(after).not.toBe(before)

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      expect(errors).toEqual([])
    })
  })
}

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
    locale: 'zh-TW',
  })

  test('says plainly that it cannot be driven by touch', async ({ page }) => {
    await page.goto('/kart/spike')
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByText('這個測試沒有觸控操作')).toBeVisible()

    await page.locator('canvas').tap()
    await expect.poll(async () => (await reading(page)).frames).toBeGreaterThan(5)
    const { state } = await reading(page)
    expect(state.x).toBe(0)
    expect(state.z).toBe(0)
  })
})

test.describe('the numbers', () => {
  test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

  test('toggle with F and with the button', async ({ page }) => {
    await page.goto('/kart/spike')
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByTestId('kart-numbers')).toBeHidden()

    await page.keyboard.press('f')
    await expect(page.getByTestId('kart-numbers')).toBeVisible()
    await page.keyboard.press('f')
    await expect(page.getByTestId('kart-numbers')).toBeHidden()

    await page.getByRole('button', { name: 'Show numbers' }).click()
    await expect(page.getByTestId('kart-numbers')).toBeVisible()
  })
})

test.describe('without WebGL', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type.startsWith('webgl')) return null
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof original
    })
  })

  for (const [locale, message] of [
    ['en-US', "This browser can't run WebGL 2"],
    ['zh-TW', '這個瀏覽器無法執行 WebGL 2'],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale })

      test('shows a translated message instead of crashing', async ({ page }) => {
        const errors = watchConsole(page)
        await page.goto('/kart/spike')
        await expect(page.getByRole('alert')).toContainText(message)
        await expect(page.locator('canvas')).toHaveCount(0)
        expect(errors).toEqual([])
      })
    })
  }
})

test.describe('leaving the route', () => {
  test.use({ locale: 'en-US' })

  test('stops the loop and gives the graphics context back', async ({ page }) => {
    // Watches from outside the code under test: every context handed out, every frame asked for
    await page.addInitScript(() => {
      const watched = window as unknown as { __contexts: WebGL2RenderingContext[]; __raf: number }
      watched.__contexts = []
      watched.__raf = 0
      const getContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: unknown[]
      ) {
        const context = (getContext as (...a: unknown[]) => unknown).apply(this, args)
        if (context && String(args[0]).startsWith('webgl')) {
          watched.__contexts.push(context as WebGL2RenderingContext)
        }
        return context
      } as typeof getContext
      const requestFrame = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback) => {
        watched.__raf++
        return requestFrame(callback)
      }
    })
    const errors = watchConsole(page)
    await openSpike(page)
    await expect(page.locator('canvas')).toHaveCount(1)

    await page.getByRole('link', { name: 'Back to the lobby' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('canvas')).toHaveCount(0)

    const stopped = await reading(page)
    expect(stopped.running).toBe(false)

    const counts = () => page.evaluate(() => (window as unknown as { __raf: number }).__raf)
    const before = await counts()
    await page.waitForTimeout(600)
    expect(await counts()).toBe(before)
    expect((await reading(page)).tick).toBe(stopped.tick)

    const lost = await page.evaluate(() =>
      (window as unknown as { __contexts: WebGL2RenderingContext[] }).__contexts.map((context) =>
        context.isContextLost(),
      ),
    )
    expect(lost.length).toBeGreaterThan(0)
    expect(lost.every(Boolean)).toBe(true)
    expect(errors).toEqual([])
  })
})

test.describe('the lobby', () => {
  test.use({ locale: 'en-US' })

  test('neither links to the spike nor loads its code', async ({ page }) => {
    const scripts: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url())
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('a[href*="kart"]')).toHaveCount(0)
    await expect(page.getByText(/kart/i)).toHaveCount(0)
    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.filter((url) => /SpikePage|three|Scene/i.test(url))).toEqual([])
  })
})

test.describe('the boost gauge', () => {
  test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

  test('fills while drifting, fires a boost on X, and chains one when the drift is let go', async ({
    page,
  }) => {
    const errors = watchConsole(page)
    await openSpike(page)
    await expect(page.getByTestId('kart-stored')).toHaveText('Boosts ready: 0 of 2')

    await page.keyboard.down('ArrowUp')
    await expect.poll(() => speedOf(page), LONG).toBeGreaterThan(20)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('z')
    await expect.poll(async () => (await reading(page)).state.drifting, LONG).toBe(true)
    await expect.poll(async () => (await reading(page)).state.gauge, LONG).toBeGreaterThan(20)
    await expect(page.getByTestId('kart-gauge')).not.toHaveAttribute('aria-valuenow', '0')

    // 2.5 s of drifting fills the gauge into a stored boost
    await expect.poll(async () => (await reading(page)).state.storedBoosts, LONG).toBe(1)
    await expect(page.getByTestId('kart-stored')).toHaveText('Boosts ready: 1 of 2')

    // Fired while still drifting: a quick press is enough
    await page.keyboard.press('x')
    await expect.poll(async () => (await reading(page)).state.boostSeconds, LONG).toBeGreaterThan(0)
    const boosted = await reading(page)
    expect(boosted.state.storedBoosts).toBe(0)
    expect(boosted.state.chain).toBe(0)

    // Let go of the drift while the boost runs: a chained boost
    await page.keyboard.up('z')
    await expect.poll(async () => (await reading(page)).state.chain, LONG).toBe(1)
    await page.keyboard.up('ArrowRight')
    // Boosting raises the top speed past the plain 30 m/s
    await expect.poll(() => speedOf(page), LONG).toBeGreaterThan(30.5)
    await page.keyboard.up('ArrowUp')
    expect(errors).toEqual([])
  })
})

/** A gamepad the test drives, in place of navigator.getGamepads: headless browsers have no pads */
async function fakeGamepad(page: Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
    const pad = {
      id: 'Test gamepad (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons,
      axes: [0, 0, 0, 0],
    }
    ;(window as unknown as { __pad: unknown }).__pad = {
      press(index: number, down: boolean) {
        buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 }
      },
      axis(index: number, value: number) {
        pad.axes[index] = value
      },
    }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
  })
}

interface FakePad {
  press(index: number, down: boolean): void
  axis(index: number, value: number): void
}

const padPress = (page: Page, index: number, down: boolean) =>
  page.evaluate(
    ([button, isDown]) =>
      (window as unknown as { __pad: FakePad }).__pad.press(button as number, isDown as boolean),
    [index, down] as const,
  )

const padAxis = (page: Page, index: number, value: number) =>
  page.evaluate(
    ([axis, amount]) => (window as unknown as { __pad: FakePad }).__pad.axis(axis, amount),
    [index, value] as const,
  )

test.describe('a gamepad (simulated: a real pad cannot be tested headless)', () => {
  test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

  test('drives, steers in proportion, drifts and boosts through the standard mapping', async ({
    page,
  }) => {
    const errors = watchConsole(page)
    await fakeGamepad(page)
    await openSpike(page)
    await expect(page.getByTestId('kart-gamepad')).toHaveText('Test gamepad (STANDARD GAMEPAD)')

    await padPress(page, 0, true) // A
    await expect.poll(() => speedOf(page), LONG).toBeGreaterThan(20)
    // 0.6 on the stick is half way from the dead zone (0.2) to full
    await padAxis(page, 0, 0.6)
    await expect.poll(async () => (await reading(page)).input.steer, LONG).toBeCloseTo(0.5, 5)
    await padPress(page, 5, true) // RB
    await expect.poll(async () => (await reading(page)).state.drifting, LONG).toBe(true)
    expect((await reading(page)).state.driftDirection).toBe(1)
    await expect.poll(async () => (await reading(page)).state.storedBoosts, LONG).toBe(1)

    await padPress(page, 2, true) // X
    await expect.poll(async () => (await reading(page)).state.boostSeconds, LONG).toBeGreaterThan(0)
    await padPress(page, 2, false)
    await padPress(page, 5, false)
    await expect.poll(async () => (await reading(page)).state.chain, LONG).toBe(1)
    await padAxis(page, 0, 0)
    await padPress(page, 0, false)
    expect(errors).toEqual([])
  })

  test('can be remapped: Start as the boost', async ({ page }) => {
    await fakeGamepad(page)
    await openSpike(page)
    await page.getByRole('button', { name: 'Controls' }).click()
    await page.getByRole('button', { name: 'Boost, Gamepad 1: X' }).click()
    await expect(page.getByTestId('kart-controls-status')).toContainText('Press a gamepad button')
    await padPress(page, 9, true)
    await expect(page.getByRole('button', { name: 'Boost, Gamepad 1: Start' })).toBeVisible()
    await padPress(page, 9, false)
    await page.getByRole('button', { name: 'Close' }).click()

    await padPress(page, 9, true)
    await expect.poll(async () => (await reading(page)).input.boost, LONG).toBe(true)
    await padPress(page, 9, false)
    // X no longer boosts
    await padPress(page, 2, true)
    await page.waitForTimeout(300)
    expect((await reading(page)).input.boost).toBe(false)
  })
})

test.describe('remapping keys', () => {
  test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

  /** Gets up to speed, holds `key` while steering, and says whether the car was drifting */
  async function driftsWith(page: Page, key: string) {
    await page.keyboard.down('ArrowUp')
    await expect.poll(() => speedOf(page), LONG).toBeGreaterThan(15)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down(key)
    await page.waitForTimeout(500)
    const { drifting } = (await reading(page)).state
    await page.keyboard.up(key)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.up('ArrowUp')
    return drifting
  }

  test('a new drift key works at once and after a reload, and the old one stops', async ({
    page,
  }) => {
    // Three drives and two reloads with a software renderer
    test.setTimeout(120_000)
    const errors = watchConsole(page)
    await openSpike(page)
    await page.getByRole('button', { name: 'Controls' }).click()
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeFocused()
    await page.getByRole('button', { name: 'Drift, Keyboard 1: Z' }).click()
    await page.keyboard.press('q')
    await expect(page.getByRole('button', { name: 'Drift, Keyboard 1: Q' })).toBeVisible()
    await expect(page.getByTestId('kart-controls-status')).toHaveText('Drift: Q.')

    // A key another action has moves, and the panel says where from
    await page.getByRole('button', { name: 'Boost, Keyboard 2: E' }).click()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('kart-controls-status')).toContainText(
      'It was taken from Drift, Keyboard 2',
    )
    await expect(page.getByRole('button', { name: 'Drift, Keyboard 2: None' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('kart-controls')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Controls' })).toBeFocused()
    await expect(page.getByText('Hold Q while steering to drift')).toBeVisible()

    expect(await driftsWith(page, 'q')).toBe(true)
    expect(await driftsWith(page, 'z')).toBe(false)

    await page.reload()
    await expect.poll(async () => (await reading(page)).frames).toBeGreaterThan(5)
    await expect(page.getByText('Hold Q while steering to drift')).toBeVisible()
    expect(await driftsWith(page, 'q')).toBe(true)

    await page.getByRole('button', { name: 'Controls' }).click()
    await page.getByRole('button', { name: 'Reset to defaults' }).click()
    await expect(page.getByRole('button', { name: 'Drift, Keyboard 1: Z' })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Hold Z while steering to drift')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('works without localStorage, keeping the change until the page closes', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    })
    const errors = watchConsole(page)
    await openSpike(page)
    await page.getByRole('button', { name: 'Controls' }).click()
    await page.getByRole('button', { name: 'Drift, Keyboard 1: Z' }).click()
    await page.keyboard.press('q')
    await expect(page.getByTestId('kart-controls-status')).toContainText("won't keep the change")
    await expect(page.getByRole('button', { name: 'Drift, Keyboard 1: Q' })).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await driftsWith(page, 'q')).toBe(true)
    expect(errors).toEqual([])
  })

  test('Space drifts instead of pressing the focused button; Enter still presses it', async ({
    page,
  }) => {
    await openSpike(page)
    const hide = page.getByRole('button', { name: 'Hide numbers' })
    await hide.focus()
    await page.keyboard.press('Space')
    await expect(hide).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Show numbers' })).toBeVisible()
  })

  test('the panel works from the keyboard alone', async ({ page }) => {
    await openSpike(page)
    await page.getByRole('link', { name: 'Back to the lobby' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Controls' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const accelerate = page.getByRole('button', { name: 'Accelerate, Keyboard 1: Up arrow' })
    await expect(accelerate).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('i')
    await expect(page.getByRole('button', { name: 'Accelerate, Keyboard 1: I' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('kart-controls')).toBeHidden()
  })
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme, locale: 'en-US', viewport: { width: 375, height: 667 } })

    test('the spike page and its controls panel have no problems', async ({ page }) => {
      await openSpike(page)
      const problems = async () => {
        const { violations } = await new AxeBuilder({ page }).analyze()
        return violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))
      }
      expect(await problems()).toEqual([])
      await page.getByRole('button', { name: 'Controls' }).click()
      await page.getByRole('button', { name: 'Drift, Keyboard 1: Z' }).click()
      expect(await problems()).toEqual([])
      // Nothing sticks out sideways at phone width
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  })
}
