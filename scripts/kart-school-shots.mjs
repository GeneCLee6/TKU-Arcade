// 2026-11-20 (docs/ARCHITECTURE.md §4.50): screenshots of the driving school, for looking at with
// one's own eyes, as kart-ui-shots.mjs is for the rest of the kart's interface: the list of lessons,
// the suggestion on a first visit to /kart, every lesson a few seconds in (driven by the master's hands, `?autopilot`), and a lesson passed.
// Drives the real page in Chromium on this machine's GPU, on a desktop and a phone held sideways.
//
//   npm run dev -- --port 6601           (in another terminal)
//   node scripts/kart-school-shots.mjs [--base http://localhost:6601] [--out tmp/kart-school-shots]
//        [--sizes desktop,landscape] [--lang en|zh-TW] [--only drive,drift,...]
//
// Not a test: nothing is compared. The pictures go to `--out` (tmp/ is ignored by git).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const base = option('base', 'http://localhost:6601')
const out = option('out', 'tmp/kart-school-shots')
const sizes = option('sizes', 'desktop,landscape').split(',')
const lang = option('lang', 'zh-TW')
const LESSONS = ['drive', 'drift', 'dash', 'perfect', 'combo', 'n2o', 'start', 'jump', 'gap', 'final']
const only = option('only', LESSONS.join(',')).split(',')

const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  landscape: {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
}

/** How long into each lesson to take its picture, ms after the canvas shows */
const WAIT = { start: 2600, jump: 9000, gap: 9500, final: 9000 }

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
for (const size of sizes) {
  // A first visit to /kart: the suggestion to start at the school
  const fresh = await browser.newContext(SIZES[size])
  const first = await fresh.newPage()
  await first.addInitScript(
    ([language]) => localStorage.setItem('tku-arcade.language', language),
    [lang],
  )
  await first.goto(`${base}/kart`)
  await first.getByTestId('kart-school-invite').waitFor()
  await first.waitForTimeout(3000)
  await first.screenshot({ path: join(out, `invite-${size}.png`) })
  console.log(join(out, `invite-${size}.png`))
  await fresh.close()
  const context = await browser.newContext(SIZES[size])
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`[${size}] ${error.message}`))
  await page.addInitScript(
    ([language]) => {
      localStorage.setItem('tku-arcade.language', language)
      localStorage.setItem('tku-arcade.kart.quality', 'medium')
      localStorage.setItem('tku-arcade.kart.school', JSON.stringify({ drive: 3, drift: 2, dash: 0 }))
    },
    [lang],
  )
  const shot = async (name) => {
    const file = join(out, `${name}-${size}.png`)
    await page.screenshot({ path: file })
    console.log(file)
  }
  await page.goto(`${base}/kart?school`)
  await page.getByTestId('kart-school').waitFor()
  await shot('list')
  for (const id of only) {
    await page.goto(`${base}/kart?school=${id}&autopilot`)
    await page.locator('canvas').waitFor()
    // The "how" folded open, so that its key caps show
    if (size === 'desktop') await page.locator('details summary').click()
    await page.waitForTimeout(WAIT[id] ?? 6000)
    await shot(`lesson-${id}`)
  }
  // A lesson passed: its result card with the stars
  await page.goto(`${base}/kart?school=drift&autopilot`)
  await page.getByTestId('kart-school-result').waitFor({ timeout: 120_000 })
  await page.waitForTimeout(600)
  await shot('passed')
  await context.close()
}
await browser.close()
