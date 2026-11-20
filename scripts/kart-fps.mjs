// 2026-11-18: how many frames a second the kart draws on this machine's GPU with the frame rate
// uncapped, one line per quality: a race against seven computer karts on Riverside, the player on
// the test autopilot, counted over ten seconds from the start. For comparing a branch with another
// (run each on its own port); it says nothing about a phone.
//
//   node scripts/kart-fps.mjs [--base http://localhost:5263] [--qualities low,medium,high]
//        [--bots 7] [--seconds 10] [--warmup 0] [--mobile] [--track riverside]
//
// 2026-11-20: `--track danhai` (or oldstreet) measures a night track, its headlights and street
// lamps (ARCHITECTURE.md §4.47)
//
// 2026-11-20 (docs/KART-PERF.md): `--track all` runs every built-in track; `--screens
// desktop,phone,small` picks the sizes (1280x720@1, 844x390@3, 667x375@2; `--mobile` is `phone`);
// each line also says the frame's draw calls, triangles, the geometries and textures held on the GPU
// and the JS time of a frame (window.__kartSpike.render / jsMs). `--json out.json` keeps the rows.
import { writeFileSync } from 'node:fs'
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
// Seconds of the race let run before counting: the grid spreads out (docs/KART-PERF.md)
const warmup = Number(option('warmup', '0'))
const TRACKS = [
  'riverside', 'harbour', 'tamkang', 'oldstreet', 'guanyin', 'mangrove',
  'fort', 'danhai', 'datun', 'wharf', 'lanes', 'works',
]
const SCREENS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, label: '1280x720@1' },
  phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, label: '844x390@3' },
  small: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, label: '667x375@2' },
}
const trackOption = option('track', 'riverside')
const tracks = trackOption === 'all' ? TRACKS : trackOption.split(',')
const screens = option('screens', args.includes('--mobile') ? 'phone' : 'desktop').split(',')
const jsonOut = option('json', '')
const rows = []

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
for (const screenName of screens) {
for (const track of tracks) {
for (const quality of qualities) {
  const screen = SCREENS[screenName]
  if (!screen) throw new Error(`No screen ${screenName}`)
  const context = await browser.newContext({
    viewport: screen.viewport,
    deviceScaleFactor: screen.deviceScaleFactor,
    hasTouch: screenName !== 'desktop',
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
  await setup.getByTestId('kart-bots-track').selectOption(track)
  await setup.getByTestId('kart-bots-count').selectOption(bots)
  await setup.getByTestId('kart-bots-difficulty').selectOption('hard')
  await setup.getByTestId('kart-bots-mode').selectOption('items')
  await setup.getByTestId('kart-bots-laps').selectOption('3')
  await setup.getByTestId('kart-bots-start').click()
  await page.getByTestId('kart-race').waitFor({ timeout: 60_000 })
  await page.waitForFunction(() => (window.__kartSpike?.tick ?? 0) > 60, undefined, {
    timeout: 60_000,
  })
  if (warmup > 0) await page.waitForTimeout(warmup * 1000)
  const totals = () => page.evaluate(() => ({ ...window.__kartSpike.totals }))
  const from = await totals()
  const started = Date.now()
  await page.waitForTimeout(seconds * 1000)
  const to = await totals()
  const drawn = to.frames - from.frames
  const fps = drawn / ((Date.now() - started) / 1000)
  // Averaged over the frames counted, where the build keeps totals (2026-11-20)
  const mean = (key) => (to[key] === undefined ? undefined : (to[key] - from[key]) / drawn)
  const stats = await page.evaluate(() => ({
    render: window.__kartSpike.render ?? null,
    jsMs: window.__kartSpike.jsMs ?? null,
    heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null,
  }))
  const r = stats.render && { ...stats.render, calls: Math.round(mean('calls') ?? stats.render.calls), triangles: mean('triangles') ?? stats.render.triangles }
  if (mean('jsMs') !== undefined) stats.jsMs = mean('jsMs')
  const row = {
    screen: screen.label, track, quality, fps: Math.round(fps),
    calls: r?.calls, triangles: r?.triangles, geometries: r?.geometries, textures: r?.textures,
    programs: r?.programs, pixelRatio: r?.pixelRatio,
    jsMs: stats.jsMs === null ? null : Number(stats.jsMs.toFixed(2)),
    heapMB: stats.heap === null ? null : Number(stats.heap.toFixed(0)),
  }
  rows.push(row)
  console.log(
    `${quality.padEnd(6)} ${String(row.fps).padStart(4)} fps  ${track.padEnd(9)} ${screen.label.padEnd(10)}` +
      (r ? `  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k  geo ${r.geometries}  tex ${r.textures}  prog ${r.programs}  pr ${r.pixelRatio}` : '') +
      (row.jsMs !== null ? `  js ${row.jsMs} ms` : '') + (row.heapMB !== null ? `  heap ${row.heapMB} MB` : ''),
  )
  await context.close()
}
}
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2))
await browser.close()
