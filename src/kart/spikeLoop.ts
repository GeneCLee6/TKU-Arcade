import { TEST_ARENA } from '../../shared/kart/arena.ts'
import type { KartTelemetry } from '../../shared/protocol.ts'
import {
  finishRecording,
  ghostAt,
  recordStep,
  startRecording,
  type Ghost,
  type GhostRecorder,
} from '../../shared/kart/ghost.ts'
import { keepIfBetter, loadBestLap, loadGhost, type RecordNews } from './records.ts'
import { createKartAudio } from './kartAudio.ts'
import type { Quality } from './quality.ts'
import { courseOf, parseTrack, type Track } from '../../shared/kart/track.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import {
  currentLap,
  lapSteps,
  seconds,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
  type TrialPhase,
} from '../../shared/kart/timeTrial.ts'
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
}

/** What /kart/spike drives on: the walled yard of J3, J4's test oval, or J5's first track */
export type SpikeCourse = 'arena' | 'oval' | 'riverside'

export const SPIKE_COURSES: readonly SpikeCourse[] = ['arena', 'oval', 'riverside']

/** A course's track, checked like any track file; null for the yard, which is not a track */
export function spikeTrack(course: SpikeCourse): Track | null {
  if (course === 'arena') return null
  const parsed = parseTrack(course === 'oval' ? TEST_OVAL : RIVERSIDE)
  if ('problems' in parsed) throw new Error(`${course}: ${parsed.problems.join('; ')}`)
  return parsed.track
}

/** What the page shows of a time trial (e8-t10); sent only when it changes */
export interface SpikeTrial {
  readonly phase: TrialPhase
  /** Whole seconds left of the countdown: 3, 2, 1, then 0 at GO */
  readonly countdown: number
  readonly lap: number
  readonly laps: number
  /** Each finished lap, seconds */
  readonly lapTimes: readonly number[]
  readonly wrongWay: boolean
  /** Seconds from GO to the finish, once finished */
  readonly total: number | null
  /** The records on this track in this browser, seconds (e8-t11) */
  readonly bestRun: number | null
  readonly bestLap: number | null
  /** Set at the finish: whether this run set them */
  readonly newBestRun: boolean
  readonly newBestLap: boolean
}

const sameTrial = (a: SpikeTrial | undefined, b: SpikeTrial): boolean =>
  !!a &&
  a.phase === b.phase &&
  a.countdown === b.countdown &&
  a.lap === b.lap &&
  a.wrongWay === b.wrongWay &&
  a.lapTimes.length === b.lapTimes.length &&
  a.bestRun === b.bestRun &&
  a.newBestRun === b.newBestRun

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
  /** e8-t06: how much to draw */
  readonly quality?: Quality
  /** Every frame, where the car is: the minimap moves its marker with it, outside React */
  readonly onPose?: (x: number, z: number, heading: number, nextGate: number) => void
  /** On a track: the time trial's state, when it changes */
  readonly onTrial?: (trial: SpikeTrial) => void
  /** On a track, every frame: the race time and the lap's, seconds, written straight into the page */
  readonly onClock?: (total: number, lap: number) => void
  /** Called once, with a way to start the race over from the grid */
  readonly onReady?: (handle: { restart: () => void }) => void
}

const sameHud = (a: SpikeHud | undefined, b: SpikeHud): boolean =>
  !!a &&
  a.speed === b.speed &&
  a.gauge === b.gauge &&
  a.hits === b.hits &&
  a.storedBoosts === b.storedBoosts &&
  a.boosting === b.boosting &&
  a.chain === b.chain

/**
 * The game loop, outside React (docs/ARCHITECTURE.md §4): rendering follows the display, the physics
 * runs in fixed steps. Returns the function that stops everything; it may be called more than once.
 * Throws when WebGL is unavailable.
 */
/** e12-t10: one report a visit, after this long of driving */
export const TELEMETRY_AFTER_MS = 30_000
let reported = false

/** Sends the visit's frame rate and load time, once; never fails the game */
function report(fps: number, loadMs: number, quality: Quality): void {
  if (reported) return
  reported = true
  const body: KartTelemetry = {
    kind: 'kart',
    fps: Math.round(fps * 10) / 10,
    loadMs: Math.round(loadMs),
    quality,
  }
  try {
    void fetch('/api/telemetry', {
      method: 'POST',
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // No network: nothing to report
  }
}

export function startSpikeLoop(container: HTMLElement, options: SpikeOptions): () => void {
  const loadStarted = performance.now()
  const track = spikeTrack(options.course ?? 'arena')
  const course = track ? courseOf(track) : TEST_ARENA
  const trialCourse: TrialCourse | null = track
    ? { ...courseOf(track), checkpoints: courseOf(track).checkpoints!, road: track.road }
    : null
  let trial: Trial | null = trialCourse ? startTrial(trialCourse) : null
  let lastTrial: SpikeTrial | undefined
  // e8-t11: the best run to race against, and this run as it is recorded
  let best: Ghost | null = track ? loadGhost(track.id) : null
  let bestLap: number | null = track ? loadBestLap(track.id) : null
  let recorder: GhostRecorder | null = null
  let news: RecordNews | null = null
  const scene = createKartScene(container, course.walls, track ?? undefined, options.quality)
  const audio = createKartAudio()
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

  let firstFrameAt: number | null = null
  let loadMs = 0
  const frame = (now: number) => {
    handle = requestAnimationFrame(frame)
    if (firstFrameAt === null) {
      firstFrameAt = now
      loadMs = now - loadStarted
    } else if (now - firstFrameAt >= TELEMETRY_AFTER_MS && !reported) {
      report(((debug.frames + 1) * 1000) / (now - firstFrameAt), loadMs, options.quality ?? 'high')
    }
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
      if (trial && trialCourse && track) {
        const was = trial.phase
        trial = stepTrial(trial, input, trialCourse, tuning, rules)
        run = trial.run
        if (was === 'countdown' && trial.phase === 'racing') {
          recorder = startRecording(track.id)
          recordStep(recorder, 0, run.kart)
        } else if (trial.phase !== 'countdown' && was === 'racing' && recorder) {
          recordStep(recorder, trial.steps, run.kart)
        }
        if (was === 'racing' && trial.phase === 'finished' && recorder) {
          const ghost = finishRecording(recorder, trial.steps, trial.laps)
          news = keepIfBetter(ghost)
          if (news.bestRun) best = ghost
          bestLap = news.lapSteps
        }
      } else {
        run = stepRun(run, input, course, tuning, rules)
      }
      if (run.resets !== before.resets) {
        // A jump, not a move: nothing to draw in between, and the camera starts behind the car
        previous = run.kart
        scene.snapCamera(run.kart.heading)
      } else {
        previous = before.kart
        callout = louder(callout, calloutBetween(before.kart, run.kart))
      }
      // One hit per crash, not one per step of pushing against the wall after it
      if (run.hitSpeed >= HIT_SPEED && before.hitSpeed < HIT_SPEED) {
        hits++
        audio.hit(run.impact)
      }
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
    const look = {
      speed: current.vx * Math.sin(current.heading) - current.vz * Math.cos(current.heading),
      steer: debug.input.steer,
      drift: current.driftDirection,
      boosting,
    }
    scene.draw(
      poseBetween(previous, current, clock.alpha),
      { heading: current.heading, vx: current.vx, vz: current.vz, boosting },
      frameMs / 1000,
      look,
    )
    audio.update({
      speed: look.speed,
      throttle: debug.input.throttle,
      drifting: current.drifting,
      boosting,
    })
    if (callout) options.onCallout(callout)

    const hud: SpikeHud = {
      speed: Math.round(kartSpeed(current) * KMH_PER_MPS),
      gauge: Math.floor(current.gauge),
      storedBoosts: current.storedBoosts,
      boosting,
      chain: boosting ? current.chain : 0,
      hits,
    }
    options.onPose?.(current.x, current.z, current.heading, run.nextGate)
    if (trial && track) {
      const view: SpikeTrial = {
        phase: trial.phase,
        countdown: Math.ceil(trial.countdown - 1e-9),
        lap: currentLap(trial),
        laps: track.laps,
        lapTimes: trial.laps.map(seconds),
        wrongWay: trial.wrongWay,
        total: trial.phase === 'finished' ? seconds(trial.steps) : null,
        bestRun: news ? seconds(news.runSteps) : best ? seconds(best.total) : null,
        bestLap: bestLap === null ? null : seconds(bestLap),
        newBestRun: news?.bestRun ?? false,
        newBestLap: news?.bestLap ?? false,
      }
      if (!sameTrial(lastTrial, view)) {
        lastTrial = view
        options.onTrial?.(view)
      }
      options.onClock?.(seconds(trial.steps), seconds(lapSteps(trial)))
      scene.ghost(best ? ghostAt(best, trial.steps) : null)
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
    // Sound may start only after a gesture: the first key is one
    audio.unlock()
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
    audio.dispose()
  }
  const onContextLost = () => {
    stop()
    options.onContextLost()
  }

  options.onReady?.({
    restart: () => {
      if (!trialCourse) return
      trial = startTrial(trialCourse)
      run = trial.run
      recorder = null
      news = null
      previous = run.kart
      lastTrial = undefined
      scene.snapCamera(run.kart.heading)
    },
  })
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
