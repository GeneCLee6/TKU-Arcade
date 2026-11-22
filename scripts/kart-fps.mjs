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
//
// 2026-11-23 (docs/KART-PERF.md §11): every line also says what the page holds on the GPU (`gpu`,
// MB: buffers, textures and render buffers as WebGL was asked for them, the canvas itself left out;
// counted by wrapping WebGL in the page, so any renderer is counted, the race's or another's).
// `--scene` picks what is measured besides the race:
//   race     (the default) as above; `--pause 4` then also counts two seconds of the race and four
//            paused (the pause menu over it)
//   podium   a one-lap race, then the podium after it (its own renderer), counted while it shows
//   lobby    a race room's waiting room with eight racers (the host and seven computer karts; needs
//            the Worker: `npm run preview`), counted on the host's page, then with the tab hidden
//   soak     `--races 5` one-lap races in a row (podium, results, "again"), the JS heap (after a
//            collection) and the GPU memory after each: what grows from one race to the next is not
//            freed
// Those other counts take frames from the page's own requestAnimationFrame, draw calls from the
// wrapped WebGL, and JS time from the DevTools protocol (`Performance.getMetrics`, ScriptDuration)
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
const pauseSeconds = Number(option('pause', '0'))
const sceneName = option('scene', 'race')
const races = Number(option('races', '5'))
const TRACKS = [
  'riverside', 'harbour', 'tamkang', 'oldstreet', 'guanyin', 'mangrove',
  'fort', 'danhai', 'datun', 'wharf', 'lanes', 'works', 'zhuwei', 'breakwater',
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

/**
 * Runs in the page before anything else: counts what WebGL holds (bytes by buffer, texture level and
 * render buffer, less what is deleted or goes with a lost context), the draw calls, and the frames
 */
function countWebGL() {
  const held = new Map() // object -> { context, bytes } or { context, levels: Map }
  const bound = new WeakMap()
  let calls = 0
  let frames = 0
  // Bytes a texel by internal format (RGBA16F, RGBA32F, R11F_G11F_B10F, RGBA8, RGB8, DEPTH24,
  // DEPTH24_STENCIL8, SRGB8_ALPHA8, R8, R16F, RG8, RG16F, ..., ALPHA, RGB, RGBA)
  const BYTES = {
    0x881a: 8, 0x8814: 16, 0x8c3a: 4, 0x8058: 4, 0x8051: 4, 0x81a6: 4, 0x88f0: 4, 0x8c43: 4,
    0x8229: 1, 0x822d: 2, 0x822b: 2, 0x822f: 4, 0x81a5: 2, 0x8cac: 4, 0x1906: 1, 0x1907: 4, 0x1908: 4,
  }
  const bytesPer = (format, type) => {
    if (BYTES[format]) return BYTES[format]
    if (type === 0x140b || type === 0x8d61) return 8 // HALF_FLOAT
    if (type === 0x1406) return 16 // FLOAT
    return 4
  }
  const state = (gl) => {
    let s = bound.get(gl)
    if (!s) bound.set(gl, (s = { buffers: {}, unit: 0x84c0, textures: {}, renderbuffer: null }))
    return s
  }
  const total = () => {
    let sum = 0
    for (const entry of held.values()) {
      if (entry.levels) for (const b of entry.levels.values()) sum += b
      else sum += entry.bytes
    }
    return sum
  }
  const textureFor = (gl, target) => {
    const cube = target >= 0x8515 && target <= 0x851a
    return state(gl).textures[`${state(gl).unit}:${cube ? 0x8513 : target}`]
  }
  const setLevel = (gl, target, level, bytes) => {
    const texture = textureFor(gl, target)
    if (!texture) return
    let entry = held.get(texture)
    if (!entry) held.set(texture, (entry = { context: gl, levels: new Map() }))
    entry.levels.set(`${target}:${level}`, bytes)
  }
  for (const Context of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
    if (!Context) continue
    const proto = Context.prototype
    const wrap = (name, after) => {
      const original = proto[name]
      if (!original) return
      proto[name] = function (...a) {
        const result = original.apply(this, a)
        after.call(this, a, result)
        return result
      }
    }
    wrap('bindBuffer', function ([target, buffer]) { state(this).buffers[target] = buffer })
    wrap('bufferData', function ([target, sizeOrData]) {
      const buffer = state(this).buffers[target]
      if (!buffer) return
      const bytes = typeof sizeOrData === 'number' ? sizeOrData : (sizeOrData?.byteLength ?? 0)
      held.set(buffer, { context: this, bytes })
    })
    wrap('activeTexture', function ([unit]) { state(this).unit = unit })
    wrap('bindTexture', function ([target, texture]) { state(this).textures[`${state(this).unit}:${target}`] = texture })
    wrap('texImage2D', function (a) {
      const [target, level, internal] = a
      let width
      let height
      let type
      if (a.length >= 8) {
        width = a[3]
        height = a[4]
        type = a[7]
      } else {
        const source = a[5]
        type = a[4]
        width = source?.width ?? source?.videoWidth ?? source?.displayWidth ?? 0
        height = source?.height ?? source?.videoHeight ?? source?.displayHeight ?? 0
      }
      setLevel(this, target, level, width * height * bytesPer(internal, type))
    })
    wrap('texImage3D', function ([target, level, internal, width, height, depth, , , type]) {
      setLevel(this, target, level, width * height * depth * bytesPer(internal, type))
    })
    wrap('texStorage2D', function ([target, levels, internal, width, height]) {
      const faces = target === 0x8513 ? 6 : 1
      for (let level = 0; level < levels; level++) {
        const w = Math.max(1, width >> level)
        const h = Math.max(1, height >> level)
        setLevel(this, target, level, w * h * bytesPer(internal, 0) * faces)
      }
    })
    wrap('compressedTexImage2D', function ([target, level, , , , , data]) {
      setLevel(this, target, level, data?.byteLength ?? 0)
    })
    wrap('generateMipmap', function ([target]) {
      const texture = textureFor(this, target)
      const entry = texture && held.get(texture)
      if (!entry?.levels) return
      let top = 0
      for (const [key, b] of entry.levels) if (key.endsWith(':0')) top += b
      entry.levels.set('mips', top / 3)
    })
    wrap('bindRenderbuffer', function ([, renderbuffer]) { state(this).renderbuffer = renderbuffer })
    wrap('renderbufferStorage', function ([, internal, width, height]) {
      const rb = state(this).renderbuffer
      if (rb) held.set(rb, { context: this, bytes: width * height * bytesPer(internal, 0) })
    })
    wrap('renderbufferStorageMultisample', function ([, samples, internal, width, height]) {
      const rb = state(this).renderbuffer
      if (rb) held.set(rb, { context: this, bytes: width * height * bytesPer(internal, 0) * Math.max(1, samples) })
    })
    for (const name of ['deleteBuffer', 'deleteTexture', 'deleteRenderbuffer']) {
      wrap(name, function ([object]) { held.delete(object) })
    }
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      wrap(name, function () { calls++ })
    }
    wrap('getExtension', function ([name], extension) {
      if (name !== 'WEBGL_lose_context' || !extension || extension.__counted) return
      extension.__counted = true
      const lose = extension.loseContext.bind(extension)
      const gl = this
      extension.loseContext = () => {
        for (const [object, entry] of held) if (entry.context === gl) held.delete(object)
        lose()
      }
    })
  }
  const tick = () => {
    frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__webgl = () => ({ bytes: total(), objects: held.size, calls, frames })
}

const MB = (bytes) => Number((bytes / 1e6).toFixed(1))

const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    // As fast as it can draw, not as fast as the screen shows
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--enable-precise-memory-info',
  ],
})

async function newPage(screenName, quality) {
  const screen = SCREENS[screenName]
  if (!screen) throw new Error(`No screen ${screenName}`)
  const context = await browser.newContext({
    viewport: screen.viewport,
    deviceScaleFactor: screen.deviceScaleFactor,
    hasTouch: screenName !== 'desktop',
    locale: 'en-US',
  })
  await context.addInitScript(countWebGL)
  await context.addInitScript((level) => {
    localStorage.setItem('tku-arcade.kart.quality', level)
    localStorage.setItem('tku-arcade.language', 'en')
  }, quality)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  return { context, page, cdp, screen }
}

/** Frames, draw calls and JS time over `ms`, by the page's own counters (any renderer) */
async function countFor(page, cdp, ms) {
  const metric = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics')
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]))
  }
  const fromGl = await page.evaluate(() => window.__webgl())
  const fromCdp = await metric()
  const started = Date.now()
  await page.waitForTimeout(ms)
  const toGl = await page.evaluate(() => window.__webgl())
  const toCdp = await metric()
  const frames = toGl.frames - fromGl.frames
  const elapsed = (Date.now() - started) / 1000
  const script = toCdp.ScriptDuration - fromCdp.ScriptDuration
  return {
    fps: Math.round(frames / elapsed),
    calls: Math.round((toGl.calls - fromGl.calls) / Math.max(1, frames)),
    callsPerSecond: Math.round((toGl.calls - fromGl.calls) / elapsed),
    jsMs: Number(((script * 1000) / Math.max(1, frames)).toFixed(2)),
    jsShare: Number((script / elapsed).toFixed(3)),
    gpuMB: MB(toGl.bytes),
    heapMB: MB(toCdp.JSHeapUsedSize),
  }
}

/** /kart's menu to a race against the computer, counting down or running */
async function startBotRace(page, { track, laps }) {
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
  await setup.getByTestId('kart-bots-laps').selectOption(String(laps))
  await setup.getByTestId('kart-bots-start').click()
  await page.getByTestId('kart-race').waitFor({ timeout: 60_000 })
  await page.waitForFunction(() => (window.__kartSpike?.tick ?? 0) > 60, undefined, { timeout: 60_000 })
}

function print(row) {
  const parts = [
    `${row.quality.padEnd(6)} ${String(row.fps).padStart(4)} fps  ${String(row.label ?? row.track ?? row.scene).padEnd(10)} ${row.screen.padEnd(10)}`,
    row.calls !== undefined && `calls ${row.calls}`,
    row.triangles !== undefined && `tris ${(row.triangles / 1000).toFixed(0)}k`,
    row.geometries !== undefined && `geo ${row.geometries}`,
    row.textures !== undefined && `tex ${row.textures}`,
    row.programs !== undefined && `prog ${row.programs}`,
    row.pixelRatio !== undefined && `pr ${row.pixelRatio}`,
    row.jsMs !== null && row.jsMs !== undefined && `js ${row.jsMs} ms`,
    row.gpuMB !== undefined && `gpu ${row.gpuMB} MB`,
    row.heapMB !== null && row.heapMB !== undefined && `heap ${row.heapMB} MB`,
    row.callsPerSecond !== undefined && `${row.callsPerSecond} calls/s`,
    row.jsShare !== undefined && `js ${Math.round(row.jsShare * 100)}% of the time`,
  ].filter(Boolean)
  console.log(parts.join('  '))
}

async function measureRace(screenName, track, quality) {
  const { context, page, cdp, screen } = await newPage(screenName, quality)
  await startBotRace(page, { track, laps: 3 })
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
    gpu: window.__webgl().bytes,
  }))
  const r = stats.render && { ...stats.render, calls: Math.round(mean('calls') ?? stats.render.calls), triangles: mean('triangles') ?? stats.render.triangles }
  if (mean('jsMs') !== undefined) stats.jsMs = mean('jsMs')
  const row = {
    scene: 'race', screen: screen.label, track, quality, fps: Math.round(fps),
    calls: r?.calls, triangles: r?.triangles, geometries: r?.geometries, textures: r?.textures,
    programs: r?.programs, pixelRatio: r?.pixelRatio,
    jsMs: stats.jsMs === null ? null : Number(stats.jsMs.toFixed(2)),
    gpuMB: MB(stats.gpu),
    heapMB: stats.heap === null ? null : Number(stats.heap.toFixed(0)),
  }
  rows.push(row)
  print(row)
  if (pauseSeconds > 0) {
    // The pause menu (Esc): the race stands still behind its blur
    const running = await countFor(page, cdp, 2000)
    await page.keyboard.press('Escape')
    await page.getByTestId('kart-pause').waitFor()
    await page.waitForTimeout(500)
    const paused = await countFor(page, cdp, pauseSeconds * 1000)
    for (const [scene, counted] of [['running', running], ['paused', paused]]) {
      const one = { scene, screen: screen.label, track, quality, ...counted }
      rows.push(one)
      print({ ...one, label: `${track}:${scene}` })
    }
  }
  await context.close()
}

async function measurePodium(screenName, track, quality) {
  const { context, page, cdp, screen } = await newPage(screenName, quality)
  await startBotRace(page, { track, laps: 1 })
  await page.getByTestId('kart-podium').waitFor({ timeout: 240_000 })
  await page.waitForTimeout(800)
  const counted = await countFor(page, cdp, Math.min(seconds, 5) * 1000)
  const row = { scene: 'podium', screen: screen.label, track, quality, ...counted }
  rows.push(row)
  print({ ...row, label: 'podium' })
  await context.close()
}

async function measureLobby(screenName, quality) {
  const host = await newPage(screenName, quality)
  const response = await host.page.request.post(`${base}/api/rooms`, {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'items' } },
  })
  const { id } = await response.json()
  await host.page.goto(`${base}/r/${id}`)
  await host.page.getByRole('textbox', { name: 'Nickname' }).fill('Ann')
  await host.page.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await host.page.getByTestId('kart-lobby').waitFor({ timeout: 60_000 })
  for (let count = 2; count <= 8; count++) {
    await host.page.getByTestId('kart-lobby-add-bot').click()
    await host.page.getByTestId('kart-lobby-count').filter({ hasText: `${count}/8` }).waitFor()
  }
  await host.page.waitForTimeout(3000)
  const counted = await countFor(host.page, host.cdp, seconds * 1000)
  const row = { scene: 'lobby', screen: host.screen.label, quality, ...counted }
  rows.push(row)
  print({ ...row, label: 'lobby' })
  await host.context.close()
}

async function soak(screenName, quality) {
  const { context, page, cdp, screen } = await newPage(screenName, quality)
  const sample = async (label) => {
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(500)
    await cdp.send('HeapProfiler.collectGarbage')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const value = (name) => metrics.find((one) => one.name === name).value
    const gl = await page.evaluate(() => window.__webgl())
    const row = {
      scene: 'soak', screen: screen.label, quality, at: label, heapMB: MB(value('JSHeapUsedSize')),
      gpuMB: MB(gl.bytes), glObjects: gl.objects, nodes: value('Nodes'), listeners: value('JSEventListeners'),
    }
    rows.push(row)
    console.log(
      `soak ${String(label).padEnd(8)} heap ${row.heapMB} MB  gpu ${row.gpuMB} MB (${gl.objects} objects)  nodes ${row.nodes}  listeners ${row.listeners}`,
    )
  }
  await startBotRace(page, { track: tracks[0], laps: 1 })
  for (let race = 1; race <= races; race++) {
    await page.getByTestId('kart-podium').waitFor({ timeout: 300_000 })
    await page.getByTestId('kart-podium-skip').click()
    await page.getByTestId('kart-bots-results').waitFor({ timeout: 60_000 })
    await sample(`race ${race}`)
    if (race === races) break
    await page.getByTestId('kart-bots-again').click()
    await page.getByTestId('kart-race').waitFor({ timeout: 60_000 })
  }
  await context.close()
}

for (const screenName of screens) {
  for (const quality of qualities) {
    if (sceneName === 'lobby') await measureLobby(screenName, quality)
    else if (sceneName === 'soak') await soak(screenName, quality)
    else {
      for (const track of tracks) {
        if (sceneName === 'podium') await measurePodium(screenName, track, quality)
        else await measureRace(screenName, track, quality)
      }
    }
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2))
await browser.close()
