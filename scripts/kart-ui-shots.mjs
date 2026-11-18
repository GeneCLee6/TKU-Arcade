// 2026-11-18: screenshots of the kart's interface (the HUD, the garage, a race against the computer
// and its results), for looking at with one's own eyes, as kart-shots.mjs is for the karts. Drives
// the real page in Chromium on this machine's GPU, at three sizes and in both languages.
//
//   npm run dev -- --port 5263           (in another terminal)
//   node scripts/kart-ui-shots.mjs [--base http://localhost:5263] [--out kart-ui-shots]
//        [--sizes desktop,landscape,portrait] [--langs en,zh-TW] [--only trial,garage,race]
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
const out = option('out', 'kart-ui-shots')
const sizes = option('sizes', 'desktop,landscape,portrait').split(',')
const langs = option('langs', 'en,zh-TW').split(',')
const only = option('only', 'trial,garage,race').split(',')

const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
for (const size of sizes) {
  for (const lang of langs) {
    const context = await browser.newContext(SIZES[size])
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error(`[${size} ${lang}] ${error.message}`))
    await page.addInitScript(
      ([language]) => {
        localStorage.setItem('tku-arcade.language', language)
        localStorage.setItem('tku-arcade.kart.quality', 'medium')
      },
      [lang],
    )
    const shot = async (name) => {
      const file = join(out, `${name}-${size}-${lang}.png`)
      await page.screenshot({ path: file })
      console.log(file)
    }
    const menu = async (testId) => {
      await page.getByTestId('kart-hud').waitFor({ timeout: 60_000 })
      const target = page.getByTestId(testId)
      if (!(await target.isVisible())) await page.getByTestId('kart-menu').click()
      await target.click()
    }
    try {
      if (only.includes('trial')) {
        await page.goto(`${base}/kart?autopilot`)
        await page.getByTestId('kart-countdown').waitFor({ timeout: 60_000 })
        await page.waitForTimeout(300)
        await shot('countdown')
        await page.getByTestId('kart-countdown').waitFor({ state: 'detached', timeout: 20_000 })
        await page.waitForTimeout(5000)
        await shot('trial')
      }
      if (only.includes('garage')) {
        if (!only.includes('trial')) await page.goto(`${base}/kart?autopilot`)
        await menu('kart-garage-open')
        await page.getByTestId('kart-garage').waitFor()
        await page.waitForTimeout(1500)
        await shot('garage')
      }
      if (only.includes('race')) {
        await page.goto(`${base}/kart?autopilot`)
        await menu('kart-bots-open')
        const setup = page.getByTestId('kart-bots-setup')
        await setup.waitFor()
        await setup.getByTestId('kart-bots-track').selectOption('riverside')
        await setup.getByTestId('kart-bots-count').selectOption('3')
        await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
        await setup.getByTestId('kart-bots-mode').selectOption('items')
        await setup.getByTestId('kart-bots-laps').selectOption('1')
        await shot('setup')
        await setup.getByTestId('kart-bots-start').click()
        await page.getByTestId('kart-race').waitFor({ timeout: 30_000 })
        await page.waitForTimeout(1200)
        await shot('race-countdown')
        await page.waitForFunction(() => window.__kartRace?.counted, undefined, { timeout: 30_000 })
        await page.waitForTimeout(9000)
        await shot('race')
        await page.getByTestId('kart-bots-results').waitFor({ timeout: 200_000 })
        await page.waitForTimeout(800)
        await shot('results')
      }
    } catch (error) {
      console.error(`[${size} ${lang}] ${error.message.split('\n')[0]}`)
      await shot('failed')
    }
    await context.close()
  }
}
await browser.close()
