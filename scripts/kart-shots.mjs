// 2026-11-18: screenshots of the karts and their boosts, for looking at with one's own eyes (the
// visual work of docs/ARCHITECTURE.md "Kart visuals"). Drives the real page in Chromium on this
// machine's GPU, through the debug hooks spikeLoop.ts leaves on `window.__kartSpike` (`fx` draws a
// boost of a kind, `view` turns the camera round the kart).
//
//   npm run dev -- --port 5263           (in another terminal)
//   node scripts/kart-shots.mjs [--base http://localhost:5263] [--out kart-shots]
//        [--karts tide,comet] [--kinds none,mini,n2o,team,start] [--quality high]
//        [--track riverside] [--views rear,side,front] [--mobile] [--drive] [--hud]
//
// 2026-11-23 (docs/ARCHITECTURE.md §4.85): `--poses drive,steer,drift,boost,daze,idle,cheer` instead
// shoots the drivers' skeleton, each of `--drivers spade,heart,diamond,club` in each pose, from
// `--views` (`driver` is close on the cockpit), through `__kartSpike.pose` and `.gesture`.
//
// Not a test: nothing is compared. The pictures go to `--out` (ignored by git).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const base = option('base', 'http://localhost:5263')
const out = option('out', 'kart-shots')
const karts = option(
  'karts',
  'tide,comet,ray,crab,heron,flyfish,dolphin,skipper,shrimp,marlin,eel,squid,hermit,whale,swift,hornet,petrel',
).split(',')
const kinds = option('kinds', 'none,n2o').split(',')
const quality = option('quality', 'high')
const track = option('track', 'riverside')
const views = option('views', 'rear').split(',')
const mobile = args.includes('--mobile')
const driver = option('driver', 'spade')
// Driving itself round the track (the time trial's autopilot) rather than standing on the grid
const drive = args.includes('--drive')
// With the page's own panels left in the picture
const hud = args.includes('--hud')

const VIEWS = {
  // The chase camera, as played
  chase: null,
  rear: { orbit: 0.55, back: 3.1, up: 1.7 },
  side: { orbit: 1.5, back: 3.4, up: 1.0 },
  front: { orbit: 2.55, back: 3.2, up: 1.5 },
  top: { orbit: 0.2, back: 2.2, up: 5.5 },
  // 2026-11-22: close in on the body, for its fine detail (art/bodyDetail.ts)
  close: { orbit: 1.1, back: 1.6, up: 0.9 },
  // 2026-11-23: close on the driver from ahead and to the side, and from behind
  driver: { orbit: 2.3, back: 2.0, up: 1.25 },
  cockpit: { orbit: 0.35, back: 1.9, up: 1.5 },
  portrait: { orbit: 2.5, back: 1.5, up: 1.1 },
  over: { orbit: 0.2, back: 1.3, up: 2.1 },
}

// 2026-11-23 (§4.85): what each pose sets on the look (spikeLoop.ts's debug `pose`, `gesture`, `fx`)
const POSES = {
  drive: { pose: { steer: 0, drift: 0, throttle: 1 } },
  steer: { pose: { steer: 1, drift: 0, throttle: 1 } },
  left: { pose: { steer: -1, drift: 0, throttle: 1 } },
  drift: { pose: { steer: 1, drift: 1, throttle: 1 } },
  boost: { pose: { steer: 0, drift: 0, throttle: 1 }, fx: 'n2o' },
  daze: { pose: { steer: 0, drift: 0, dazed: 1, throttle: 0 } },
  idle: { gesture: 'idle', wait: 2600 },
  wave: { gesture: 'wave' },
  pump: { gesture: 'pump', wait: 450 },
  cheer: { gesture: 'cheer', wait: 1400 },
  trophy: { gesture: 'trophy' },
}
const poses = option('poses', '').split(',').filter(Boolean)
const drivers = option('drivers', 'spade,heart,diamond,club').split(',')

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  // The machine's own GPU rather than the software renderer
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
})
const context = await browser.newContext({
  viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
  deviceScaleFactor: mobile ? 3 : 1,
  hasTouch: mobile,
  isMobile: mobile,
})
if (poses.length > 0) {
  for (const kart of karts) {
    for (const who of drivers) {
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error(`[${kart}/${who}] ${error.message}`))
      await page.addInitScript(
        ([body, person, level]) => {
          localStorage.setItem('tku-arcade.kart.body', body)
          localStorage.setItem('tku-arcade.kart.driver', person)
          localStorage.setItem('tku-arcade.kart.quality', level)
        },
        [kart, who, quality],
      )
      await page.goto(`${base}/kart/spike?track=${track}`)
      await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important }' })
      await page.waitForFunction(() => (window.__kartSpike?.frames ?? 0) > 20, undefined, { timeout: 60_000 })
      for (const name of poses) {
        const set = POSES[name]
        for (const view of views) {
          await page.evaluate(
            ([wanted, look]) => {
              window.__kartSpike.pose = wanted.pose ?? { steer: 0, drift: 0 }
              window.__kartSpike.gesture = wanted.gesture ?? null
              window.__kartSpike.fx = wanted.fx ?? null
              window.__kartSpike.view = look
            },
            [set, VIEWS[view] ?? null],
          )
          await page.waitForTimeout(set.wait ?? 900)
          const file = join(out, `${kart}-${who}-${name}-${view}-${quality}.png`)
          await page.locator('canvas').first().screenshot({ path: file })
          console.log(file)
          // Back to rest between poses, so that a gesture starts from its beginning
          await page.evaluate(() => {
            window.__kartSpike.gesture = null
            window.__kartSpike.fx = null
          })
          await page.waitForTimeout(250)
        }
      }
      await page.close()
    }
  }
  await browser.close()
  process.exit(0)
}
for (const kart of karts) {
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`[${kart}] ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[${kart}] ${message.text()}`)
  })
  await page.addInitScript(
    ([body, who, level]) => {
      localStorage.setItem('tku-arcade.kart.body', body)
      localStorage.setItem('tku-arcade.kart.driver', who)
      localStorage.setItem('tku-arcade.kart.quality', level)
    },
    [kart, driver, quality],
  )
  await page.goto(`${base}/kart/spike?track=${track}${drive ? '&autopilot' : ''}`)
  if (!hud) {
    await page.addStyleTag({
      content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important }',
    })
  }
  await page.waitForFunction(() => (window.__kartSpike?.frames ?? 0) > 20, undefined, {
    timeout: 60_000,
  })
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  if (kart === karts[0]) console.log(`GPU: ${renderer}`)
  if (drive) {
    await page.waitForFunction(
      () => Math.hypot(window.__kartSpike.state.vx, window.__kartSpike.state.vz) > 40,
      undefined,
      { timeout: 60_000 },
    )
  }
  for (const kind of kinds) {
    for (const view of views) {
      await page.evaluate(
        ([fx, look]) => {
          window.__kartSpike.fx = fx === 'none' ? null : fx
          window.__kartSpike.view = look
        },
        [kind, VIEWS[view] ?? null],
      )
      // Long enough for the shape to open and the burst to settle
      await page.waitForTimeout(kind === 'none' ? 500 : 650)
      const file = join(out, `${kart}-${kind}-${view}-${quality}${mobile ? '-mobile' : ''}.png`)
      await page.locator('canvas').first().screenshot({ path: file })
      console.log(file)
    }
  }
  await page.close()
}
await browser.close()
