// 2026-11-18: pictures of a track as it is driven, for looking at with one's own eyes: the page on
// this machine's GPU, the time trial's autopilot at the wheel, a picture every few seconds with the
// minimap in it. Not a test: nothing is compared.
//
//   npm run dev -- --port 5263           (in another terminal)
//   node scripts/kart/track-shots.mjs [--base http://localhost:5263] [--out kart-shots]
//        [--tracks riverside,harbour] [--shots 6] [--every 5000] [--quality high]
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
const tracks = option('tracks', 'riverside,harbour,tamkang,oldstreet,guanyin').split(',')
const shots = Number(option('shots', '6'))
const every = Number(option('every', '5000'))
const quality = option('quality', 'high')

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
for (const track of tracks) {
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`[${track}] ${error.message}`))
  await page.addInitScript((level) => {
    localStorage.setItem('tku-arcade.kart.quality', level)
  }, quality)
  await page.goto(`${base}/kart/spike?track=${track}&autopilot`)
  await page.waitForFunction(() => (window.__kartSpike?.frames ?? 0) > 20, undefined, {
    timeout: 60_000,
  })
  await page.waitForFunction(
    () => Math.hypot(window.__kartSpike.state.vx, window.__kartSpike.state.vz) > 30,
    undefined,
    { timeout: 60_000 },
  )
  for (let shot = 0; shot < shots; shot++) {
    await page.waitForTimeout(every)
    const file = join(out, `${track}-${shot}.png`)
    await page.screenshot({ path: file })
    const at = await page.evaluate(() => {
      const { x, z } = window.__kartSpike.state
      return `${x.toFixed(0)}, ${z.toFixed(0)}`
    })
    console.log(`${file} at ${at}`)
  }
  await page.close()
}
await browser.close()
