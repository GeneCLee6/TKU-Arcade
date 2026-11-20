// 2026-11-20: screenshots of the item race's things (docs/ARCHITECTURE.md §4.45), for looking at with
// one's own eyes: a mirror's ring, a bank of sea fog, a fake box beside a real one's look, the hits'
// bursts (a mirror turning a shot back, fog closing in, a skip's splash, a rally's cheer, static).
// Drives the real page in Chromium on this machine's GPU through the debug hook spikeLoop.ts leaves
// on `window.__kartSpike` (`items` places things relative to the kart, `view` turns the camera).
//
//   npm run dev -- --port 6301           (in another terminal)
//   node scripts/kart-item-shots.mjs [--base http://localhost:6301] [--out kart-shots]
//        [--kart pelican] [--track riverside]
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
const base = option('base', 'http://localhost:6301')
const out = option('out', 'kart-shots')
const kart = option('kart', 'pelican')
const track = option('track', 'riverside')

/** What each picture shows, placed relative to the kart: metres ahead, metres to its right */
const SCENES = {
  mirror: { items: { mirrors: [{ ahead: 0, right: 0 }] }, view: { orbit: 0.55, back: 4.2, up: 2.2 } },
  'shield-mirror': {
    items: { shields: [{ ahead: 0, right: 0 }], mirrors: [{ ahead: 0, right: 0 }] },
    view: { orbit: 0.9, back: 4.6, up: 2.2 },
  },
  fog: { items: { shots: [{ item: 'fog', ahead: 22, right: 0 }] }, view: null },
  decoy: {
    items: {
      shots: [
        { item: 'decoy', ahead: 6, right: -2.2 },
        { item: 'puddle', ahead: 9, right: 2.5 },
        { item: 'hail', ahead: 12, right: 0 },
      ],
    },
    view: { orbit: 0.3, back: 4.5, up: 2 },
  },
  'burst-bounce': { burst: 'bounce' },
  'burst-fog': { burst: 'fog' },
  'burst-splash': { burst: 'splash' },
  'burst-cheer': { burst: 'cheer' },
  'burst-static': { burst: 'static' },
}

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
page.on('pageerror', (error) => console.error(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.error(message.text())
})
await page.addInitScript((body) => {
  localStorage.setItem('tku-arcade.kart.body', body)
  localStorage.setItem('tku-arcade.kart.quality', 'high')
}, kart)
await page.goto(`${base}/kart/spike?track=${track}`)
await page.addStyleTag({
  content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important }',
})
await page.waitForFunction(() => (window.__kartSpike?.frames ?? 0) > 20, undefined, {
  timeout: 60_000,
})
const renderer = await page.evaluate(() => {
  const gl = document.querySelector('canvas')?.getContext('webgl2')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(`GPU: ${renderer}`)
let sceneN = 0
for (const [name, scene] of Object.entries(SCENES)) {
  // Each scene's shots numbered afresh, as the room numbers each use
  sceneN += 10
  const numbered = scene.items?.shots
    ? { ...scene.items, shots: scene.items.shots.map((one, i) => ({ ...one, n: sceneN + i })) }
    : scene.items
  if (scene.burst) {
    await page.evaluate((kind) => {
      window.__kartSpike.view = { orbit: 0.7, back: 5, up: 2.4 }
      window.__kartSpike.items = { bursts: [{ kind, ahead: 0, right: 0 }] }
    }, scene.burst)
    // Caught in the middle of the burst
    await page.waitForTimeout(kindDelay(scene.burst))
  } else {
    await page.evaluate(
      ([items, view]) => {
        window.__kartSpike.items = items
        window.__kartSpike.view = view
      },
      [numbered, scene.view],
    )
    await page.waitForTimeout(700)
  }
  const file = join(out, `item-${name}.png`)
  await page.locator('canvas').first().screenshot({ path: file })
  console.log(file)
}
await browser.close()

function kindDelay(kind) {
  return kind === 'fog' ? 260 : 120
}
