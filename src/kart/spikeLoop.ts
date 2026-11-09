import { advanceClock } from '../../shared/kart/clock.ts'
import { boostKeys, isBoundKey, readInput, type Bindings } from '../../shared/kart/input.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  poseBetween,
  stepKart,
  type KartInput,
  type KartRules,
  type KartState,
} from '../../shared/kart/physics.ts'
import { readGamepad } from './devices.ts'
import { createKartScene } from './Scene.ts'

const STATS_EVERY_MS = 500

export interface SpikeStats {
  readonly fps: number
  readonly slowestMs: number
  readonly speed: number
  readonly slipDegrees: number
  readonly drifting: boolean
  readonly drawingBuffer: string
  readonly rendererName: string
  /** The gamepad being read, by the name the browser gives it */
  readonly gamepad: string | undefined
}

/** What the gauge display shows; sent only when it changes */
export interface SpikeHud {
  /** Whole points, 0 to 100 */
  readonly gauge: number
  readonly storedBoosts: number
  readonly boosting: boolean
  readonly chain: number
}

/** What tests and a curious owner can read from the console. It stays after the loop stops. */
export interface SpikeDebug {
  running: boolean
  tick: number
  frames: number
  state: KartState
  /** The input the last step ran with */
  input: KartInput
  gamepad: string | undefined
}

declare global {
  interface Window {
    __kartSpike?: SpikeDebug
  }
}

/** Read every frame, so that a remap or a rule switch applies at once */
export interface SpikeControls {
  readonly bindings: Bindings
  readonly rules: KartRules
  /** False while the controls panel is open: the panel has the keyboard and the gamepad */
  readonly enabled: boolean
}

export interface SpikeOptions {
  readonly controls: () => SpikeControls
  readonly onStats: (stats: SpikeStats) => void
  readonly onHud: (hud: SpikeHud) => void
  readonly onContextLost: () => void
}

const sameHud = (a: SpikeHud | undefined, b: SpikeHud): boolean =>
  !!a &&
  a.gauge === b.gauge &&
  a.storedBoosts === b.storedBoosts &&
  a.boosting === b.boosting &&
  a.chain === b.chain

/**
 * The game loop, outside React (docs/ARCHITECTURE.md §4): rendering follows the display, the physics
 * runs in fixed steps. Returns the function that stops everything; it may be called more than once.
 * Throws when WebGL is unavailable.
 */
export function startSpikeLoop(container: HTMLElement, options: SpikeOptions): () => void {
  const scene = createKartScene(container)
  const held = new Set<string>()
  // A boost key pressed and let go between two steps still fires
  let boostTapped = false
  const debug: SpikeDebug = {
    running: true,
    tick: 0,
    frames: 0,
    state: INITIAL_KART,
    input: NO_INPUT,
    gamepad: undefined,
  }
  window.__kartSpike = debug

  let previous = INITIAL_KART
  let current = INITIAL_KART
  let accumulator = 0
  let lastFrame: number | undefined
  let handle = 0
  let lastHud: SpikeHud | undefined

  let statsFrom: number | undefined
  let statsFrames = 0
  let slowest = 0

  const frame = (now: number) => {
    handle = requestAnimationFrame(frame)
    const frameMs = lastFrame === undefined ? 0 : now - lastFrame
    lastFrame = now

    const { bindings, rules, enabled } = options.controls()
    const pad = readGamepad()
    if (!enabled) {
      held.clear()
      boostTapped = false
    }
    const clock = advanceClock(accumulator, frameMs / 1000)
    accumulator = clock.accumulator
    for (let step = 0; step < clock.steps; step++) {
      const input = enabled
        ? readInput(bindings, { held, pad: pad?.snapshot, boostTapped })
        : NO_INPUT
      boostTapped = false
      previous = current
      current = stepKart(current, input, KART_TUNING, rules)
      debug.input = input
    }
    debug.tick += clock.steps
    debug.frames++
    debug.state = current
    debug.gamepad = pad?.id
    scene.draw(poseBetween(previous, current, clock.alpha), frameMs / 1000)

    const hud: SpikeHud = {
      gauge: Math.floor(current.gauge),
      storedBoosts: current.storedBoosts,
      boosting: current.boostSeconds > 0,
      chain: current.chain,
    }
    if (!sameHud(lastHud, hud)) {
      lastHud = hud
      options.onHud(hud)
    }

    statsFrom ??= now
    statsFrames++
    slowest = Math.max(slowest, frameMs)
    const span = now - statsFrom
    if (span >= STATS_EVERY_MS) {
      options.onStats({
        fps: ((statsFrames - 1) * 1000) / span,
        slowestMs: slowest,
        speed: kartSpeed(current),
        slipDegrees: (kartSlip(current) * 180) / Math.PI,
        drifting: current.drifting,
        drawingBuffer: scene.drawingBuffer(),
        rendererName: scene.rendererName,
        gamepad: pad?.id,
      })
      statsFrom = now
      statsFrames = 1
      slowest = 0
    }
  }

  // A driving key must not also press the focused button (Space) or scroll the page (arrows)
  const ownsKey = (code: string, bindings: Bindings) =>
    isBoundKey(bindings, code) || code.startsWith('Arrow')

  const onKeyDown = (event: KeyboardEvent) => {
    const { bindings, enabled } = options.controls()
    if (!enabled || event.altKey || event.ctrlKey || event.metaKey) return
    if (!ownsKey(event.code, bindings)) return
    event.preventDefault()
    held.add(event.code)
    if (!event.repeat && boostKeys(bindings).includes(event.code)) boostTapped = true
  }
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code)
    const { bindings, enabled } = options.controls()
    if (enabled && ownsKey(event.code, bindings)) event.preventDefault()
  }
  // The key-up of a key let go in another window never arrives
  const onBlur = () => held.clear()

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    debug.running = false
    cancelAnimationFrame(handle)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    scene.canvas.removeEventListener('webglcontextlost', onContextLost)
    scene.dispose()
  }
  const onContextLost = () => {
    stop()
    options.onContextLost()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  scene.canvas.addEventListener('webglcontextlost', onContextLost)
  handle = requestAnimationFrame(frame)
  return stop
}
