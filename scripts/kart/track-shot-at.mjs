// 2026-11-18: one picture of a track as the autopilot passes a place (track-shots.mjs takes them by
// the clock): for looking at one landmark or one corner. Not a test.
//   node scripts/kart/track-shot-at.mjs --base http://localhost:5410 --track fort --at -75,-340 \
//        [--within 25] [--out shot.png] [--quality high]
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const base = option('base', 'http://localhost:5263')
const track = option('track', 'riverside')
const [x, z] = option('at', '0,0').split(',').map(Number)
const within = Number(option('within', '25'))
const out = option('out', `${track}.png`)

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.error(error.message))
await page.addInitScript((level) => {
  localStorage.setItem('tku-arcade.kart.quality', level)
}, option('quality', 'high'))
await page.goto(`${base}/kart/spike?track=${track}&autopilot`)
await page.waitForFunction(
  ([px, pz, near]) => {
    const state = window.__kartSpike?.state
    return state && Math.hypot(state.x - px, state.z - pz) < near
  },
  [x, z, within],
  { timeout: 120_000, polling: 50 },
)
await page.screenshot({ path: out })
console.log(out)
await browser.close()
