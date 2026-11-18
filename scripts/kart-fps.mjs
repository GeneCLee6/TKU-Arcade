// 2026-11-18: how many frames a second the kart draws on this machine's GPU with the frame rate
// uncapped, one line per quality: a race against seven computer karts on Riverside, the player on
// the test autopilot, counted over ten seconds from the start. For comparing a branch with another
// (run each on its own port); it says nothing about a phone.
//
//   node scripts/kart-fps.mjs [--base http://localhost:5263] [--qualities low,medium,high]
//        [--bots 7] [--seconds 10] [--mobile]
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const base = option('base', 'http://localhost:5263')
const qualities = option('qualities', 'low,medium,high').split(',')
const bots = option('bots', '7')
const seconds = Number(option('seconds', '10'))
const mobile = args.includes('--mobile')

const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    // As fast as it can draw, not as fast as the screen shows
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
  ],
})
for (const quality of qualities) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    deviceScaleFactor: mobile ? 3 : 1,
  })
  const page = await context.newPage()
  await page.addInitScript((level) => {
    localStorage.setItem('tku-arcade.kart.quality', level)
    localStorage.setItem('tku-arcade.language', 'en')
  }, quality)
  await page.goto(`${base}/kart?autopilot`)
  // The top row is there once the page has loaded: only then is it known whether it is a menu
  await page.getByTestId('kart-hud').waitFor({ timeout: 60_000 })
  if (await page.getByTestId('kart-menu').isVisible()) await page.getByTestId('kart-menu').click()
  await page.getByTestId('kart-bots-open').click()
  const setup = page.getByTestId('kart-bots-setup')
  await setup.getByTestId('kart-bots-track').selectOption('riverside')
  await setup.getByTestId('kart-bots-count').selectOption(bots)
  await setup.getByTestId('kart-bots-difficulty').selectOption('hard')
  await setup.getByTestId('kart-bots-mode').selectOption('items')
  await setup.getByTestId('kart-bots-laps').selectOption('3')
  await setup.getByTestId('kart-bots-start').click()
  await page.getByTestId('kart-race').waitFor({ timeout: 60_000 })
  await page.waitForFunction(() => (window.__kartSpike?.tick ?? 0) > 60, undefined, {
    timeout: 60_000,
  })
  const frames = () => page.evaluate(() => window.__kartSpike.frames)
  const from = await frames()
  const started = Date.now()
  await page.waitForTimeout(seconds * 1000)
  const drawn = (await frames()) - from
  const fps = drawn / ((Date.now() - started) / 1000)
  console.log(`${quality.padEnd(6)} ${fps.toFixed(0)} fps (${bots} bots, ${mobile ? '844x390@3' : '1280x720'})`)
  await context.close()
}
await browser.close()
