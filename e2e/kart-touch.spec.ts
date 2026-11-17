import AxeBuilder from '@axe-core/playwright'
import { expect, test, type CDPSession, type Page } from '@playwright/test'

// Touch controls (owner 2026-11-17; docs/ARCHITECTURE.md §4.25): a phone drives with buttons on the
// screen. Real touches through the Chrome DevTools Protocol, several fingers at once, on two phone
// sizes held sideways: a whole time trial on the test oval by touch alone, the buttons in reach and
// clear of the HUD, the page never scrolling or zooming, the drift gesture, the settings, and the
// buttons giving way to a keyboard. Headless Chromium draws with a software renderer (the flag lets
// it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })

interface Reading {
  frames: number
  crossings: number
  state: {
    x: number
    z: number
    heading: number
    vx: number
    vz: number
    drifting: boolean
    miniSeconds: number
    releaseWindow: number
    burstReady: boolean
    slideDirection: number
  }
  input: { throttle: boolean; brake: boolean; steer: number; drift: boolean; boost: boolean }
}

const reading = (page: Page): Promise<Reading> =>
  page.evaluate(() => (window as unknown as { __kartSpike: Reading }).__kartSpike)

interface Point {
  x: number
  y: number
}

/** Fingers on the touch screen, each with its own id, through the DevTools Protocol */
class Fingers {
  private readonly on = new Map<number, Point>()
  private readonly client: CDPSession
  constructor(client: CDPSession) {
    this.client = client
  }

  private points() {
    return [...this.on].map(([id, at]) => ({ ...at, id }))
  }

  async down(id: number, at: Point) {
    this.on.set(id, at)
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: this.points(),
    })
  }

  async move(id: number, at: Point) {
    this.on.set(id, at)
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: this.points(),
    })
  }

  async up(id: number) {
    const at = this.on.get(id)
    if (!at) return
    this.on.delete(id)
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ ...at, id }],
    })
  }

  async tap(id: number, at: Point) {
    await this.down(id, at)
    await this.up(id)
  }

  has(id: number) {
    return this.on.has(id)
  }
}

async function centre(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`${testId} is not on the screen`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

type Box = { x: number; y: number; width: number; height: number }
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** The test oval's centre line (shared/kart/tracks/testOval.ts), to steer at */
function ovalLine(): Point[] {
  const points: { x: number; z: number }[] = []
  const radius = 50
  const half = 80
  const arcSteps = Math.round((Math.PI * radius) / 8)
  for (let z = half; z > -half; z -= 8) points.push({ x: -radius, z })
  for (let i = 0; i < arcSteps; i++) {
    const angle = Math.PI - (Math.PI * i) / arcSteps
    points.push({ x: radius * Math.cos(angle), z: -half - radius * Math.sin(angle) })
  }
  for (let z = -half; z < half; z += 8) points.push({ x: radius, z })
  for (let i = 0; i < arcSteps; i++) {
    const angle = (Math.PI * i) / arcSteps
    points.push({ x: radius * Math.cos(angle), z: half + radius * Math.sin(angle) })
  }
  return points.map(({ x, z }) => ({ x, y: z }))
}

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

async function openTrial(
  page: Page,
  locale: 'en' | 'zh-TW',
  settings?: object,
  path = '/kart?track=oval',
) {
  await page.addInitScript(
    ({ locale, settings }) => {
      localStorage.setItem('tku-arcade.kart.quality', 'low')
      localStorage.setItem('tku-arcade.language', locale)
      if (settings) localStorage.setItem('tku-arcade.kart.touch', JSON.stringify(settings))
    },
    { locale, settings },
  )
  await page.goto(path)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('kart-touch')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as { __kartSpike?: Reading }).__kartSpike?.frames ?? 0))
    .toBeGreaterThan(5)
}

const noScroll = (page: Page) =>
  page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    wide: document.documentElement.scrollWidth - window.innerWidth,
    tall: document.documentElement.scrollHeight - window.innerHeight,
    zoom: window.visualViewport?.scale ?? 1,
  }))

for (const [width, height] of [
  [844, 390],
  [667, 375],
]) {
  test.describe(`a phone held sideways, ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true })

    test('the buttons are in reach, at least 48 px, clear of the HUD and the map', async ({
      page,
    }, testInfo) => {
      await openTrial(page, 'en')
      const ids = [
        'kart-touch-left',
        'kart-touch-right',
        'kart-touch-gas',
        'kart-touch-brake',
        'kart-touch-drift',
        'kart-touch-boost',
        'kart-touch-reset',
        'kart-touch-settings',
      ]
      const hud = (await page.getByTestId('kart-hud').boundingBox())!
      const map = (await page.getByRole('img', { name: 'Track map' }).boundingBox())!
      const clock = (await page.getByTestId('kart-race-clock').boundingBox())!
      for (const id of ids) {
        const box = (await page.getByTestId(id).boundingBox())!
        expect(box.width, id).toBeGreaterThanOrEqual(48)
        expect(box.height, id).toBeGreaterThanOrEqual(48)
        expect(box.x, id).toBeGreaterThanOrEqual(0)
        expect(box.y, id).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, id).toBeLessThanOrEqual(width)
        expect(box.y + box.height, id).toBeLessThanOrEqual(height)
        expect(overlap(box, hud), `${id} over the HUD`).toBe(false)
        expect(overlap(box, map), `${id} over the map`).toBe(false)
        expect(overlap(box, clock), `${id} over the clock`).toBe(false)
      }
      // Time trials have no items
      await expect(page.getByTestId('kart-touch-item')).toHaveCount(0)
      // Nothing for axe, with the buttons and with their settings open
      const problems = async () => {
        const { violations } = await new AxeBuilder({ page }).analyze()
        return violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))
      }
      expect(await problems()).toEqual([])
      await page.getByTestId('kart-touch-settings').tap()
      await expect(page.getByTestId('kart-touch-panel')).toBeVisible()
      expect(await problems()).toEqual([])
      await page.getByTestId('kart-touch-panel').getByRole('button', { name: 'Close' }).tap()
      await testInfo.attach(`touch-${width}-en`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    })

    test('several fingers at once: drift, steer and gas; the page never scrolls or zooms', async ({
      page,
    }) => {
      await openTrial(page, 'en', { autoThrottle: false })
      const fingers = new Fingers(await page.context().newCDPSession(page))
      await fingers.down(1, await centre(page, 'kart-touch-gas'))
      await fingers.down(2, await centre(page, 'kart-touch-left'))
      await fingers.down(3, await centre(page, 'kart-touch-drift'))
      await expect
        .poll(async () => (await reading(page)).input)
        .toMatchObject({ throttle: true, drift: true, steer: -1 })
      await expect(page.locator('[data-pressed="true"]')).toHaveCount(3)
      // The steering thumb slides over to the right button: it steers right without lifting
      await fingers.move(2, await centre(page, 'kart-touch-right'))
      await expect.poll(async () => (await reading(page)).input.steer).toBe(1)
      await fingers.up(2)
      await fingers.up(3)
      await expect
        .poll(async () => (await reading(page)).input)
        .toMatchObject({ throttle: true, drift: false, steer: 0 })
      await fingers.up(1)
      await expect.poll(async () => (await reading(page)).input.throttle).toBe(false)

      // Swipes and double taps on the race and on the buttons: no scroll, no zoom
      const middle = { x: width / 2, y: height / 3 }
      for (const at of [middle, await centre(page, 'kart-touch-boost')]) {
        await fingers.down(4, at)
        await fingers.move(4, { x: at.x, y: at.y - 120 })
        await fingers.move(4, { x: at.x - 120, y: at.y + 60 })
        await fingers.up(4)
        await fingers.tap(4, at)
        await fingers.tap(4, at)
      }
      // A long press on a button: no text picked, no menu
      await fingers.down(5, await centre(page, 'kart-touch-gas'))
      await page.waitForTimeout(900)
      await fingers.up(5)
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
      expect(await noScroll(page)).toEqual({ x: 0, y: 0, wide: 0, tall: 0, zoom: 1 })
    })
  })
}

test.describe('a whole time trial by touch', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('three laps of the oval: steering buttons and gas, no keys', async ({ page }) => {
    test.setTimeout(240_000)
    await openTrial(page, 'en', { autoThrottle: false })
    const fingers = new Fingers(await page.context().newCDPSession(page))
    const at = {
      left: await centre(page, 'kart-touch-left'),
      right: await centre(page, 'kart-touch-right'),
      gas: await centre(page, 'kart-touch-gas'),
    }
    const line = ovalLine()
    const STEER = 1
    const GAS = 2
    let steering: 'left' | 'right' | null = null
    const deadline = Date.now() + 200_000
    while (Date.now() < deadline) {
      if (await page.getByTestId('kart-results').isVisible()) break
      const { state } = await reading(page)
      let nearest = 0
      let best = Infinity
      line.forEach((point, index) => {
        const distance = Math.hypot(point.x - state.x, point.y - state.z)
        if (distance < best) {
          best = distance
          nearest = index
        }
      })
      const target = line[(nearest + 4) % line.length]!
      const turn = wrap(Math.atan2(target.x - state.x, -(target.y - state.z)) - state.heading)
      const speed = Math.hypot(state.vx, state.vz)
      const want = turn > 0.06 ? 'right' : turn < -0.06 ? 'left' : null
      if (want !== steering) {
        if (want === null) await fingers.up(STEER)
        else if (steering === null) await fingers.down(STEER, at[want])
        // Slid across, as a thumb would
        else await fingers.move(STEER, at[want])
        steering = want
      }
      const gas = speed < (Math.abs(turn) > 0.3 ? 20 : 32)
      if (gas && !fingers.has(GAS)) await fingers.down(GAS, at.gas)
      if (!gas && fingers.has(GAS)) await fingers.up(GAS)
      await page.waitForTimeout(30)
    }
    await expect(page.getByTestId('kart-results')).toBeVisible()
    expect((await reading(page)).crossings).toBeGreaterThanOrEqual(4)
    expect(await noScroll(page)).toEqual({ x: 0, y: 0, wide: 0, tall: 0, zoom: 1 })
  })
})

test.describe('the drift by touch, the settings and the keyboard', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true })

  test('hold drift and steer, let go, steer back: an instant boost', async ({ page }) => {
    test.setTimeout(90_000)
    // The test yard, room to drift in circles. The automatic throttle: the engine runs once a button
    // has been pressed
    await openTrial(page, 'en', undefined, '/kart/spike')
    const fingers = new Fingers(await page.context().newCDPSession(page))
    const speed = async () => {
      const { state } = await reading(page)
      return Math.hypot(state.vx, state.vz)
    }
    await fingers.tap(1, await centre(page, 'kart-touch-gas'))
    await expect.poll(speed, { timeout: 30_000 }).toBeGreaterThan(20)
    // Hold DRIFT with the steering: the right thumb holds no gas, the drift keeps it on
    await fingers.down(2, await centre(page, 'kart-touch-right'))
    await fingers.down(3, await centre(page, 'kart-touch-drift'))
    await expect.poll(async () => (await reading(page)).state.drifting).toBe(true)
    await page.waitForTimeout(700)
    // Let go of DRIFT: the kart slides out
    await fingers.up(3)
    await expect.poll(async () => (await reading(page)).state.slideDirection).toBe(1)
    // The steering thumb slides across: the counter-steer. The automatic throttle stays on while the
    // kart slides (the classic feel, 2026-11-17), so the counter-steer alone fires the instant boost
    await fingers.move(2, await centre(page, 'kart-touch-left'))
    await expect.poll(async () => (await reading(page)).state.miniSeconds).toBeGreaterThan(0)
    await expect(page.getByTestId('kart-callout')).toHaveAttribute('data-kind', 'release')
    await fingers.up(2)
  })

  test('the settings: slider steering, left-handed, kept after a reload; keys hide the buttons', async ({
    page,
  }, testInfo) => {
    await openTrial(page, 'zh-TW')
    await page.getByTestId('kart-touch-settings').tap()
    const panel = page.getByTestId('kart-touch-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('觸控怎麼開')
    await testInfo.attach('touch-settings-zh', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    await panel.getByTestId('kart-touch-steer-slider').tap()
    await panel.getByTestId('kart-touch-lefty').tap()
    await panel.getByRole('button', { name: '關閉' }).tap()
    await expect(panel).toHaveCount(0)
    const slider = page.getByTestId('kart-touch-slider')
    await expect(slider).toBeVisible()
    // Left-handed: the steering on the right, the gas on the left
    expect((await slider.boundingBox())!.x).toBeGreaterThan(667 / 2)
    expect((await page.getByTestId('kart-touch-gas').boundingBox())!.x).toBeLessThan(667 / 2)
    // Dragging the slider steers in proportion
    const fingers = new Fingers(await page.context().newCDPSession(page))
    const start = await centre(page, 'kart-touch-slider')
    await fingers.down(1, start)
    await fingers.move(1, { x: start.x - 40, y: start.y })
    await expect.poll(async () => (await reading(page)).input.steer).toBeLessThan(-0.3)
    await expect.poll(async () => (await reading(page)).input.steer).toBeGreaterThan(-1)
    await fingers.up(1)
    await expect.poll(async () => (await reading(page)).input.steer).toBe(0)
    await testInfo.attach('touch-lefty-slider-zh', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await page.reload()
    await expect(page.getByTestId('kart-touch-slider')).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('tku-arcade.kart.touch'))
    expect(JSON.parse(stored!)).toMatchObject({ steer: 'slider', leftHanded: true })

    // A driving key: this player has a keyboard, the buttons go; a touch brings them back
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('kart-touch')).toHaveCount(0)
    await page.locator('canvas').tap()
    await expect(page.getByTestId('kart-touch')).toBeVisible()
  })
})

test.describe('a mouse and keyboard', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('show no buttons', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
    await page.goto('/kart?track=oval')
    await expect(page.locator('canvas')).toBeVisible()
    await page.locator('canvas').click()
    await expect(page.getByTestId('kart-touch')).toHaveCount(0)
  })
})
