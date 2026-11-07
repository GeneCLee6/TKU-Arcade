import { expect, test, type Page } from '@playwright/test'

// e8-t01: the spike at /kart/spike. Headless Chromium draws with a software renderer here (the flag
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
  }
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

  await page.keyboard.down('ArrowRight')
  await page.keyboard.down('Shift')
  await expect.poll(async () => (await reading(page)).state.drifting, { timeout: 20_000 }).toBe(true)
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

  await page.keyboard.up('Shift')
  await expect.poll(async () => (await reading(page)).state.drifting, { timeout: 20_000 }).toBe(false)
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
      await expect(page.getByText('Arrows or WASD to drive.')).toBeVisible()
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

    const counts = () =>
      page.evaluate(() => (window as unknown as { __raf: number }).__raf)
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
