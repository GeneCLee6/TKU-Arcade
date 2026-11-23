import { writeFileSync } from 'node:fs'
import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.91): the drivers' skin, legs and fingers, and the race room's
// live 3D on a phone, on the GPU this runs on (this machine's own where it has one; the software
// renderer otherwise). Every picture is attached to the report: each driver close on the shoulder and
// the elbow in a drive, a turn and a win (no seam where the arm bends), standing in the race room (the
// knees), the race room held sideways and upright on a phone. The phone's pictures move (drawn live,
// not a still swayed by CSS), and keep their frame rate with the CPU slowed four times.
test.use({
  launchOptions: {
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  },
})
test.setTimeout(180_000)

function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** Attached to the report; also kept in test-results/ with KART_SKIN_SHOTS=1, to look at */
async function keep(info: TestInfo, name: string, png: Buffer) {
  await info.attach(name, { body: png, contentType: 'image/png' })
  if (process.env.KART_SKIN_SHOTS) writeFileSync(`test-results/kart-skin-${name}.png`, png)
}

const framesOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __kartSpike?: { frames: number } }).__kartSpike?.frames ?? 0)

test.describe("the drivers' skin", () => {
  test.use({ viewport: { width: 960, height: 540 }, locale: 'en-US' })
  for (const driver of ['spade', 'heart', 'diamond', 'club'] as const) {
    test(`${driver}: shoulders, elbows and hands close up, driving and winning`, async ({ page }, info) => {
      const errors = watchConsole(page)
      await page.addInitScript(
        ([who, body]) => {
          localStorage.setItem('tku-arcade.kart.driver', who)
          localStorage.setItem('tku-arcade.kart.body', body)
          localStorage.setItem('tku-arcade.kart.quality', 'high')
        },
        [driver, driver === 'club' ? 'comet' : 'tide'],
      )
      await page.goto('/kart/spike?track=riverside')
      await expect(page.locator('canvas')).toBeVisible()
      // The race's panels out of the picture
      await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important }' })
      await expect.poll(() => framesOf(page)).toBeGreaterThan(5)
      const shots: Record<string, string> = {}
      for (const [view, look] of [
        // Close on the shoulder and the elbow from the side; and on the driver from ahead
        ['joint', { orbit: 1.75, back: 1.05, up: 1.2 }],
        ['front', { orbit: 2.3, back: 2.0, up: 1.25 }],
      ] as const) {
        for (const [name, pose, gesture, wait] of [
          ['drive', { steer: 0, drift: 0, throttle: 1 }, null, 900],
          ['steer', { steer: 1, drift: 0, throttle: 1 }, null, 900],
          ['wave', { steer: 0, drift: 0 }, 'wave', 1000],
          ['cheer', { steer: 0, drift: 0 }, 'cheer', 1300],
          ['podium', { steer: 0, drift: 0 }, 'podium', 4400],
        ] as const) {
          await page.evaluate(
            ([wanted, act, at]) => {
              const spike = (window as unknown as { __kartSpike: Record<string, unknown> }).__kartSpike
              spike.pose = wanted
              spike.gesture = act
              spike.view = at
            },
            [pose, gesture, look] as const,
          )
          await page.waitForTimeout(wait)
          const png = await page.locator('canvas').screenshot()
          shots[`${name}-${view}`] = png.toString('base64')
          await keep(info, `${driver}-${name}-${view}`, png)
          await page.evaluate(() => {
            ;(window as unknown as { __kartSpike: Record<string, unknown> }).__kartSpike.gesture = null
          })
          await page.waitForTimeout(250)
        }
      }
      expect(shots['cheer-joint']).not.toBe(shots['drive-joint'])
      expect(shots['steer-joint']).not.toBe(shots['drive-joint'])
      expect(errors).toEqual([])
    })
  }
})

async function room(browser: Browser, options: BrowserContextOptions) {
  const ann = await newPerson(browser, options)
  const bob = await newPerson(browser, options)
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'high'))
  }
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}`, 'Ann')
  await joinRoom(bob, `/r/${id}`, 'Bob')
  return { ann, bob }
}

/** How much of a canvas is drawn (not see-through), and a fingerprint of what is on it */
const canvasReading = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context || canvas.width === 0) return { drawn: 0, print: 0 }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let drawn = 0
    let print = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) drawn++
      print = (print * 31 + data[i - 3]! + data[i - 2]! * 7 + data[i - 1]! * 13) % 1_000_003
    }
    return { drawn: drawn / (data.length / 4), print }
  })

test('the race room on a phone held sideways: the cards are live 3D, the drivers standing as each does', async ({
  browser,
}, info) => {
  const options = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
  const { ann, bob } = await room(browser, options)
  const errors = watchConsole(ann)
  for (let count = 3; count <= 8; count++) {
    await ann.getByTestId('kart-lobby-add-bot').click()
    await expect(ann.getByTestId('kart-lobby-count')).toHaveText(`${count}/8 racers`)
  }
  const card = '[data-testid="kart-lobby-place"] canvas'
  await expect.poll(async () => (await canvasReading(ann, card)).drawn, { timeout: 30_000 }).toBeGreaterThan(0.02)
  // Live: the same card a moment later is another picture (not a still with CSS swaying it)
  const first = await canvasReading(ann, card)
  await ann.waitForTimeout(700)
  const later = await canvasReading(ann, card)
  expect(later.print).not.toBe(first.print)
  expect(
    await ann.locator(card).first().evaluate((canvas) => getComputedStyle(canvas).animationName),
  ).toBe('none')
  await keep(info, 'phone-sideways-standing', await ann.screenshot())
  // Bob gets ready: a cheer, then ready (a thumb up, bouncing)
  await bob.getByTestId('kart-lobby-ready').click()
  await ann.waitForTimeout(900)
  await keep(info, 'phone-sideways-cheer', await ann.screenshot())
  await ann.waitForTimeout(2200)
  await keep(info, 'phone-sideways-ready', await ann.screenshot())
  // A mid-range phone: the CPU four times slower, the pictures still drawn at a steady rate
  const cdp = await ann.context().newCDPSession(ann)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const rate = await ann.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0
        const began = performance.now()
        const tick = (now: number) => {
          frames++
          if (now - began < 3000) requestAnimationFrame(tick)
          else resolve((frames * 1000) / (now - began))
        }
        requestAnimationFrame(tick)
      }),
  )
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await info.attach('phone-throttled-fps', { body: `${rate.toFixed(1)} frames a second`, contentType: 'text/plain' })
  if (process.env.KART_SKIN_SHOTS) writeFileSync('test-results/kart-skin-phone-throttled-fps.txt', rate.toFixed(1))
  // The page keeps up (its own frames; the pictures are drawn at most 18 a second among them)
  expect(rate).toBeGreaterThan(20)
  expect(errors).toEqual([])
  await ann.context().close()
  await bob.context().close()
})

test('the race room on a phone held upright: your racer big in live 3D over the list', async ({ browser }, info) => {
  const { ann, bob } = await room(browser, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  const errors = watchConsole(bob)
  const hero = bob.getByTestId('kart-lobby-hero')
  await expect(hero).toBeVisible()
  await expect(bob.getByTestId('kart-lobby-place')).toHaveCount(2)
  const picture = '[data-testid="kart-lobby-hero"] canvas'
  await expect.poll(async () => (await canvasReading(bob, picture)).drawn, { timeout: 30_000 }).toBeGreaterThan(0.05)
  const first = await canvasReading(bob, picture)
  await bob.waitForTimeout(600)
  expect((await canvasReading(bob, picture)).print).not.toBe(first.print)
  await keep(info, 'phone-upright', await bob.screenshot())
  await bob.getByTestId('kart-lobby-ready').click()
  await bob.waitForTimeout(3200)
  await keep(info, 'phone-upright-ready', await bob.screenshot())
  expect(errors).toEqual([])
  await ann.context().close()
  await bob.context().close()
})

test('the race room on a computer: the drivers standing, each in their own way', async ({ browser }, info) => {
  const { ann, bob } = await room(browser, { viewport: { width: 1280, height: 720 } })
  for (let count = 3; count <= 8; count++) {
    await ann.getByTestId('kart-lobby-add-bot').click()
    await expect(ann.getByTestId('kart-lobby-count')).toHaveText(`${count}/8 racers`)
  }
  await ann.waitForTimeout(2500)
  await keep(info, 'computer-standing', await ann.screenshot())
  await ann.waitForTimeout(2500)
  await keep(info, 'computer-standing-later', await ann.screenshot())
  await bob.getByTestId('kart-lobby-ready').click()
  await ann.waitForTimeout(800)
  await keep(info, 'computer-cheer', await ann.screenshot())
  await ann.context().close()
  await bob.context().close()
})
