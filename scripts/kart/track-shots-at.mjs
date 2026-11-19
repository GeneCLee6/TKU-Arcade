// 2026-11-19: pictures of a track as one of the feel drivers passes each of a list of places (track-
// shot-at.mjs takes one, with the plain autopilot): for looking at the shortcuts of a track with a
// guide as the driver who takes them sees them. Not a test.
//   node scripts/kart/track-shots-at.mjs --base http://localhost:5510 --track wharf --pilot master \
//        --at "190,-60;218,160" [--within 14] [--out kart-shots] [--quality high]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const base = option('base', 'http://localhost:5263')
const track = option('track', 'wharf')
const pilot = option('pilot', 'master')
const places = option('at', '0,0')
  .split(';')
  .map((place) => place.split(',').map(Number))
const within = Number(option('within', '14'))
const out = option('out', 'kart-shots')

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.error(error.message))
await page.addInitScript((level) => {
  localStorage.setItem('tku-arcade.kart.quality', level)
}, option('quality', 'high'))
await page.goto(`${base}/kart/spike?track=${track}&autopilot=${pilot}`)
for (const [index, [x, z]] of places.entries()) {
  await page.waitForFunction(
    ([px, pz, near]) => {
      const state = window.__kartSpike?.state
      return state && Math.hypot(state.x - px, state.z - pz) < near
    },
    [x, z, within],
    { timeout: 120_000, polling: 30 },
  )
  const file = join(out, `${track}-${pilot}-${index}.png`)
  await page.screenshot({ path: file })
  console.log(file)
}
await browser.close()
