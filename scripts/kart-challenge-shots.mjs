// 2026-11-21 (docs/ARCHITECTURE.md §4.60): screenshots of the challenge mode, for looking at with
// one's own eyes: the missions by chapter, the medal wall, a medal's setup, and a few missions a
// few seconds in (driven by the master's hands, `?autopilot`). Drives the real page in Chromium on
// this machine's GPU.
//
//   npm run dev -- --port 7311           (in another terminal)
//   node scripts/kart-challenge-shots.mjs [--base http://localhost:7311] [--out tmp/kart-challenge-shots]
//        [--lang en|zh-TW] [--only combo5,needle,...] [--wait 9000]
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
const base = option('base', 'http://localhost:7311')
const out = option('out', 'tmp/kart-challenge-shots')
const lang = option('lang', 'zh-TW')
const wait = Number(option('wait', '9000'))
const only = option('only', 'combo5,needle,fog,hopyard,podium,knockout').split(',')

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
await context.addInitScript(
  ([language]) => {
    localStorage.setItem('tku-arcade.language', language)
    // Every chapter open and a few medals won, to show the wall as it fills
    localStorage.setItem(
      'tku-arcade.kart.challenge',
      JSON.stringify({
        medals: { riverside: 'gold', harbour: 'silver', lanes: 'bronze', wharf: 'platinum' },
        best: { riverside: 91.4, harbour: 113.2, lanes: 104.9, wharf: 77.1 },
        stars: {
          clean: 2, combo5: 3, perfects: 3, launch: 1, podium: 2, bike: 3,
          combo10: 2, hops: 1, slots: 3, dry: 2, cover: 1,
          branches: 1, fog: 2, hopyard: 1, knockout: 2,
        },
      }),
    )
  },
  [lang],
)
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.goto(`${base}/kart?challenge`)
await page.getByTestId('kart-challenge').waitFor()
await page.screenshot({ path: join(out, 'missions.png'), fullPage: true })
await page.getByTestId('kart-challenge-tab-medals').click()
await page.getByTestId('kart-challenge-medals').waitFor()
await page.screenshot({ path: join(out, 'medals.png'), fullPage: true })
await page.getByTestId('kart-challenge-medal-go-riverside').click()
await page.getByTestId('kart-challenge-medal-setup').waitFor()
await page.screenshot({ path: join(out, 'medal-setup.png') })
await page.getByTestId('kart-challenge-medal-start').click()
await page.locator('canvas').waitFor({ timeout: 60_000 })
await page.waitForTimeout(wait)
await page.screenshot({ path: join(out, 'medal-run.png') })

for (const id of only) {
  await page.goto(`${base}/kart?challenge=${id}&autopilot`)
  await page.locator('canvas').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: join(out, `mission-${id}.png`) })
}
await browser.close()
console.log(`shots in ${out}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`)
