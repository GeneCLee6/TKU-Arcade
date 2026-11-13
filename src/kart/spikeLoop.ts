import { TEST_ARENA } from '../../shared/kart/arena.ts'
import { courseOf, parseTrack, type Track } from '../../shared/kart/track.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { advanceClock } from '../../shared/kart/clock.ts'
import { startRun, stepRun, type Spot } from '../../shared/kart/course.ts'
import { actionKeys, isBoundKey, readInput, type Bindings } from '../../shared/kart/input.ts'
import {
  kartSlip,
  kartSpeed,
  NO_INPUT,
  poseBetween,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { calloutBetween, louder, type Callout } from './callouts.ts'
import { readGamepad } from './devices.ts'
import { createKartScene } from './Scene.ts'

const STATS_EVERY_MS = 500

/**
 * The HUD's speed: metres per second times 3.6, the real conversion, since the world is in metres.
 * The standard top speed of 30 m/s reads 108 km/h, and 140 km/h in a boost.
 */
export const KMH_PER_MPS = 3.6

/** A hit at least this fast into the wall (m/s) counts as one for the debug count and the HUD flash */
const HIT_SPEED = 4

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

/** What the HUD shows; sent only when it changes */
export interface SpikeHud {
  /** Whole km/h */
  readonly speed: number
  /** Whole points, 0 to 100 */
  readonly gauge: number
  readonly storedBoosts: number
  readonly boosting: boolean
  /** The chain count while a chained boost runs, else 0 */
  readonly chain: number
  /** Counts wall hits, so that the HUD can flash on each one */
  readonly hits: number
  /** On a track: laps begun (finish line crossings) and the track's laps */
  readonly lap?: { readonly count: number; readonly of: number }
}

/** What /kart/spike drives on: the walled yard of J3, or J4's test track */
export type SpikeCourse = 'arena' | 'oval'

/** The test oval, checked like any track file */
export function spikeTrack(): Track {
  const parsed = parseTrack(TEST_OVAL)
  if ('problems' in parsed) throw new Error(`test oval: ${parsed.problems.join('; ')}`)
  return parsed.track
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
  /** Where a reset puts the car now */
  safe: Spot
  /** The hardest wall hit of the last step, 0 to 1 */
  impact: number
  /** Wall hits so far, and resets so far */
  hits: number
  resets: number
  /** The tuning the last step ran with */
  tuning: KartTuning | undefined
  /** On a track: finish line crossings and the next gate (e8-t04) */
  crossings: number
  nextGate: number
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
  /** The tuning panel's numbers (e8-t03) */
  readonly tuning: KartTuning
  /** False while the controls panel is open: the panel has the keyboard and the gamepad */
  readonly enabled: boolean
}

export interface SpikeOptions {
  readonly controls: () => SpikeControls
  readonly onStats: (stats: SpikeStats) => void
  readonly onHud: (hud: SpikeHud) => void
  /** DRIFT, BOOST or CHAIN: called once for each */
  readonly onCallout: (callout: Callout) => void
  readonly onContextLost: () => void
  readonly course?: SpikeCourse
  /** Every frame, where the car is: the minimap moves its marker with it, outside React */
  readonly onPose?: (x: number, z: number, heading: number, nextGate: number) => void
}

const sameHud = (a: SpikeHud | undefined, b: SpikeHud): boolean =>
  !!a &&
  a.speed === b.speed &&
  a.gauge === b.gauge &&
  a.hits === b.hits &&
  a.storedBoosts === b.storedBoosts &&
  a.boosting === b.boosting &&
  a.chain === b.chain &&
  a.lap?.count === b.lap?.count

/**
 * The game loop, outside React (docs/ARCHITECTURE.md §4): rendering follows the display, the physics
 * runs in fixed steps. Returns the function that stops everything; it may be called more than once.
 * Throws when WebGL is unavailable.
 */
export function startSpikeLoop(container: HTMLElement, options: SpikeOptions): () => void {
  const track = options.course === 'oval' ? spikeTrack() : null
  const course = track ? courseOf(track) : TEST_ARENA
  const scene = createKartScene(container, course.walls, track ?? undefined)
  const held = new Set<string>()
  // A boost or reset key pressed and let go between two steps still counts
  let boostTapped = false
  let resetTapped = false
  let run = startRun(course)
  const debug: SpikeDebug = {
    running: true,
    tick: 0,
    frames: 0,
    state: run.kart,
    input: NO_INPUT,
    gamepad: undefined,
    safe: run.safe,
    impact: 0,
    hits: 0,
    resets: 0,
    tuning: undefined,
    crossings: 0,
    nextGate: 0,
  }
  window.__kartSpike = debug
  scene.snapCamera(run.kart.heading)

  let previous: KartState = run.kart
  let hits = 0
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

    const { bindings, rules, tuning, enabled } = options.controls()
    const pad = readGamepad()
    if (!enabled) {
      held.clear()
      boostTapped = false
      resetTapped = false
    }
    const clock = advanceClock(accumulator, frameMs / 1000)
    accumulator = clock.accumulator
    let callout: Callout | undefined
    for (let step = 0; step < clock.steps; step++) {
      const input = enabled
        ? readInput(bindings, { held, pad: pad?.snapshot, boostTapped, resetTapped })
        : NO_INPUT
      boostTapped = false
      resetTapped = false
      const before = run
      run = stepRun(run, input, course, tuning, rules)
      if (run.resets !== before.resets) {
        // A jump, not a move: nothing to draw in between, and the camera starts behind the car
        previous = run.kart
        scene.snapCamera(run.kart.heading)
      } else {
        previous = before.kart
        callout = louder(callout, calloutBetween(before.kart, run.kart))
      }
      // One hit per crash, not one per step of pushing against the wall after it
      if (run.hitSpeed >= HIT_SPEED && before.hitSpeed < HIT_SPEED) hits++
      debug.input = input
    }
    const current = run.kart
    debug.tick += clock.steps
    debug.frames++
    debug.state = current
    debug.gamepad = pad?.id
    debug.safe = run.safe
    debug.impact = run.impact
    debug.hits = hits
    debug.resets = run.resets
    debug.tuning = tuning
    debug.crossings = run.crossings
    debug.nextGate = run.nextGate
    const boosting = current.boostSeconds > 0
    scene.draw(
      poseBetween(previous, current, clock.alpha),
      { heading: current.heading, vx: current.vx, vz: current.vz, boosting },
      frameMs / 1000,
    )
    if (callout) options.onCallout(callout)

    const hud: SpikeHud = {
      speed: Math.round(kartSpeed(current) * KMH_PER_MPS),
      gauge: Math.floor(current.gauge),
      storedBoosts: current.storedBoosts,
      boosting,
      chain: boosting ? current.chain : 0,
      hits,
      ...(track ? { lap: { count: run.crossings, of: track.laps } } : {}),
    }
    options.onPose?.(current.x, current.z, current.heading, run.nextGate)
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
    // A slider, a list or a text box keeps its keys: the tuning panel is used while the car waits
    if (isField(event.target)) return
    if (!ownsKey(event.code, bindings)) return
    event.preventDefault()
    held.add(event.code)
    if (event.repeat) return
    if (actionKeys(bindings, 'boost').includes(event.code)) boostTapped = true
    if (actionKeys(bindings, 'reset').includes(event.code)) resetTapped = true
  }
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code)
    const { bindings, enabled } = options.controls()
    if (enabled && !isField(event.target) && ownsKey(event.code, bindings)) event.preventDefault()
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

/** Form fields that use the keys a car drives with */
function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
}
