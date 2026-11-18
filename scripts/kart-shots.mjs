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
const karts = option('karts', 'tide,comet,ray,crab,heron,flyfish').split(',')
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
}

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
