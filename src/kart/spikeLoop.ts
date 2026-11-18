import { TEST_ARENA } from '../../shared/kart/arena.ts'
import type { KartTelemetry } from '../../shared/protocol.ts'
import {
  finishRecording,
  ghostAt,
  GHOST_STEPS,
  recordStep,
  startRecording,
  type Ghost,
  type GhostRecorder,
} from '../../shared/kart/ghost.ts'
import {
  keepIfBetter,
  loadBestLap,
  loadGhost,
  loadKartGhost,
  type GhostPick,
  type RecordNews,
} from './records.ts'
import { createKartAudio } from './kartAudio.ts'
import type { Quality } from './quality.ts'
import { DEFAULT_KART, kartMass, type DriverId, type KartId } from '../../shared/kart/karts.ts'
import type { KartBody } from './bodies.ts'
import { courseOf, parseTrack, recordKey, type Track } from '../../shared/kart/track.ts'
import { GUANYIN } from '../../shared/kart/tracks/guanyin.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { OLDSTREET } from '../../shared/kart/tracks/oldstreet.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TAMKANG } from '../../shared/kart/tracks/tamkang.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { bumpKart } from '../../shared/kart/race.ts'
import {
  COUNTDOWN_SECONDS,
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
import { startRun, stepRun, type Run, type Spot } from '../../shared/kart/course.ts'
import {
  actionKeys,
  activeControls,
  isBoundKey,
  readInput,
  type Bindings,
} from '../../shared/kart/input.ts'
import { mergeInputs } from '../../shared/kart/touch.ts'
import {
  isClassic,
  kartBoosting,
  kartBurstWaiting,
  kartDashDepth,
  kartSkidding,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  poseBetween,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { calloutAtStart, calloutBetween, louder, type Callout } from './callouts.ts'
import { BURST_POWER, burstBetween, skidStrength } from './feelFx.ts'
import { readGamepad } from './devices.ts'
import {
  createKartScene,
  type HitFrame,
  type ItemProps,
  type KartScene,
  type OtherKart,
  type Pose,
} from './Scene.ts'
import type { KartLook } from './art/kartModel.ts'
import type { ItemCue } from './hitFx.ts'
import type { TouchSource } from './touch/touchSource.ts'

const STATS_EVERY_MS = 500

/**
 * How much faster the speedometer reads than the real speed. 2026-11-14 (owner: kart racers' dials
 * read 300 to 400) it was 1.45; 2026-11-17 (owner: "the speed is odd"; docs/KART-FEEL.md) the dial is
 * honest again and the classic feel's top speed went up instead, so the number and what the eye sees
 * agree.
 */
export const SPEEDOMETER_SCALE = 1

/**
 * The HUD's speed: metres per second times 3.6, the real conversion. The classic feel's top speed of
 * 68 m/s reads 245 km/h, an instant boost up to about 262, a boost about 310 and a boost fired again
 * about 320.
 */
export const KMH_PER_MPS = 3.6 * SPEEDOMETER_SCALE

/** A hit at least this fast into the wall (m/s) counts as one for the debug count and the HUD flash */
const HIT_SPEED = 4

/** A boost fired: a buzz this long on a phone driven by touch */
const BOOST_BUZZ_MS = 25

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
  /** The chain count while a boost runs (shown from 2), else 0 */
  readonly chain: number
  /** Counts wall hits, so that the HUD can flash on each one */
  readonly hits: number
  /**
   * The instant boost (docs/KART-FEEL.md): 1 once the drift under way has earned one, 2 while a
   * fresh press of the throttle would fire it (sliding out, or just straightened); 0 or left out
   * otherwise
   */
  readonly dash?: 0 | 1 | 2
  /**
   * The drift under way, on its way to earning the instant boost (2026-11-18: deep and long, both),
   * in twentieths: 0 out of a drift, 20 once it is earned. The HUD's depth meter
   */
  readonly depth?: number
  /** How much of the running boost is left, in twentieths of a full one; 0 or left out with none */
  readonly boostLeft?: number
  /**
   * A boost is running and the boost key does nothing until it ends (the classic feel, 2026-11-18):
   * the HUD shows the charges locked
   */
  readonly boostLocked?: boolean
}

/** The HUD's meters move in twentieths, so that the HUD is drawn again only when one moves */
export const HUD_STEPS = 20

/**
 * What /kart/spike drives on: the walled yard of J3, J4's test oval, J5's first track, N1's second or
 * the Tamkang campus (2026-11-14), or N2's item track, the old street
 */
export type SpikeCourse =
  | 'arena'
  | 'oval'
  | 'riverside'
  | 'harbour'
  | 'tamkang'
  | 'oldstreet'
  // 2026-11-17: slopes and jumps (shared/kart/terrain.ts)
  | 'guanyin'

export const SPIKE_COURSES: readonly SpikeCourse[] = [
  'arena',
  'oval',
  'riverside',
  'harbour',
  'tamkang',
  'oldstreet',
  'guanyin',
]

const TRACKS = {
  oval: TEST_OVAL,
  riverside: RIVERSIDE,
  harbour: HARBOUR,
  tamkang: TAMKANG,
  oldstreet: OLDSTREET,
  guanyin: GUANYIN,
} as const

/** Where the ghost is, and (for its height on a hill track) how fast it goes there */
function ghostPose(ghost: Ghost, steps: number): Pose | null {
  const at = ghostAt(ghost, steps)
  const ahead = ghostAt(ghost, steps + GHOST_STEPS)
  if (!at || !ahead) return at
  return {
    ...at,
    speed: Math.hypot(ahead.x - at.x, ahead.z - at.z) / (GHOST_STEPS * STEP_SECONDS),
  }
}

/** A course's track, checked like any track file; null for the yard, which is not a track */
export function spikeTrack(course: SpikeCourse): Track | null {
  if (course === 'arena') return null
  const parsed = parseTrack(TRACKS[course])
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
  /**
   * 2026-11-17: the kart the overall record was driven in; 'unknown' for one kept before records
   * knew the kart (records.ts)
   */
  readonly recordKart: KartId | 'unknown' | null
  /** The best run in this kart on this track, seconds, and whether this run set it */
  readonly kartBestRun: number | null
  readonly newKartBestRun: boolean
}

const sameTrial = (a: SpikeTrial | undefined, b: SpikeTrial): boolean =>
  !!a &&
  a.phase === b.phase &&
  a.countdown === b.countdown &&
  a.lap === b.lap &&
  a.wrongWay === b.wrongWay &&
  a.lapTimes.length === b.lapTimes.length &&
  a.bestRun === b.bestRun &&
  a.newBestRun === b.newBestRun &&
  a.recordKart === b.recordKart &&
  a.kartBestRun === b.kartBestRun &&
  a.newKartBestRun === b.newKartBestRun

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
  /** A hill track (2026-11-17): jumps taken off and landed so far */
  takeoffs: number
  landings: number
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

/**
 * e9: a race in a room against other karts (src/kart/race/). Everything the loop needs of the
 * network, read every step or frame; without it the loop is the time trial as ever. In a race no
 * record or ghost is kept: the room keeps the times
 */
export interface SpikeNet {
  /** This kart's place on the grid */
  readonly start: Spot
  /** Laps in this race, as the room set them */
  readonly laps: number
  /** Seconds to GO by the room's shared clock; null while the start is not set yet */
  countdown(): number | null
  /** After each step: the race so far, the input it ran with, and whether the kart was reset */
  afterStep(trial: Trial, input: KartInput, reset: boolean): void
  /** The other karts as drawn now, to bump into (e9-t09) */
  bumpers(): readonly { x: number; z: number; vx: number; vz: number; mass?: number }[]
  /** Each frame: the other karts to draw */
  others(): readonly OtherKart[]
  /** After each frame is drawn: to put the name tags where the karts are */
  drawn(scene: Pick<KartScene, 'project'>): void
  /** Drives the kart instead of the keys (testing a room alone, `?autopilot`) */
  readonly autopilot?: (trial: Trial) => KartInput
  /**
   * e9-t05, e9-t06a: after each step of the race, what the items do: a box driven through, the item
   * key, and the effects on this kart (a boost, a tow, a headwind, a swap's jump, which counts as a
   * reset). Returns the run as it is now
   */
  readonly adjust?: (run: Run, input: KartInput) => Run
  /** Each frame, before drawing: the item boxes and the shields to draw, this kart's at `own` */
  readonly props?: (own: Pose) => ItemProps
  /** 2026-11-17: each frame, before drawing: a hit's spins, bursts and shake, and the item sounds */
  readonly fx?: (own: Pose) => (HitFrame & { readonly cues: readonly ItemCue[] }) | null
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
  /** DRIFT, BOOST, CHAIN and the techniques' callouts: called once for each */
  readonly onCallout: (callout: Callout) => void
  readonly onContextLost: () => void
  readonly course?: SpikeCourse
  /**
   * A track to drive on instead of `course`'s: a race room's (any of them, a custom one too), or
   * one made in the editor (e10-t07)
   */
  readonly track?: Track
  /** Drives the kart instead of the keys in a time trial (testing, `?autopilot`) */
  readonly autopilot?: (trial: Trial) => KartInput
  /** e8-t06: how much to draw */
  readonly quality?: Quality
  /**
   * Which hover kart to draw (2026-11-14). Its numbers (e10-t05a, karts.ts) are already in the
   * tuning `controls` gives; here it is the look, and the kart's weight in a bump
   */
  readonly body?: KartBody
  /** e10-t05b: who sits in it, looks only */
  readonly driver?: DriverId
  /** Every frame, where the car is: the minimap moves its marker with it, outside React */
  readonly onPose?: (x: number, z: number, heading: number, nextGate: number) => void
  /** 2026-11-17: which ghost races along: the track's overall best (the default), this kart's, none */
  readonly ghostPick?: GhostPick
  /** On a track: the time trial's state, when it changes */
  readonly onTrial?: (trial: SpikeTrial) => void
  /** On a track, every frame: the race time and the lap's, seconds, written straight into the page */
  readonly onClock?: (total: number, lap: number) => void
  /** Called once, with a way to start the race over from the grid */
  readonly onReady?: (handle: { restart: () => void }) => void
  /** A race against others in a room (e9); see `SpikeNet` */
  readonly net?: SpikeNet
  /** 2026-11-17: the on-screen buttons of a phone (src/kart/touch/), driving along with the keys */
  readonly touch?: TouchSource
}

const sameHud = (a: SpikeHud | undefined, b: SpikeHud): boolean =>
  !!a &&
  a.speed === b.speed &&
  a.gauge === b.gauge &&
  a.hits === b.hits &&
  a.storedBoosts === b.storedBoosts &&
  a.boosting === b.boosting &&
  a.chain === b.chain &&
  (a.dash ?? 0) === (b.dash ?? 0) &&
  (a.depth ?? 0) === (b.depth ?? 0) &&
  (a.boostLeft ?? 0) === (b.boostLeft ?? 0) &&
  (a.boostLocked ?? false) === (b.boostLocked ?? false)

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
  const track = options.track ?? spikeTrack(options.course ?? 'arena')
  const net = options.net
  const plainCourse = track ? courseOf(track) : TEST_ARENA
  // In a race each kart starts on its own place on the grid
  const course =
    net && plainCourse.checkpoints
      ? {
          ...plainCourse,
          start: net.start,
          checkpoints: { ...plainCourse.checkpoints, laps: net.laps },
        }
      : plainCourse
  const trialCourse: TrialCourse | null = track
    ? { ...course, checkpoints: course.checkpoints!, road: track.road }
    : null
  let trial: Trial | null = trialCourse ? startTrial(trialCourse) : null
  let lastTrial: SpikeTrial | undefined
  // e8-t11: the best run to race against, and this run as it is recorded. 2026-11-17: the track's
  // overall best and this kart's own best, the pick says which one races along
  const kartId: KartId = options.body ?? DEFAULT_KART
  const pick: GhostPick = options.ghostPick ?? 'overall'
  let best: Ghost | null = track && !net ? loadGhost(recordKey(track)) : null
  let kartBest: Ghost | null = track && !net ? loadKartGhost(recordKey(track), kartId) : null
  const chased = (): Ghost | null => (pick === 'off' ? null : pick === 'kart' ? kartBest : best)
  let bestLap: number | null = track && !net ? loadBestLap(recordKey(track)) : null
  let recorder: GhostRecorder | null = null
  let news: RecordNews | null = null
  const scene = createKartScene(
    container,
    course.walls,
    track ?? undefined,
    options.quality,
    options.body,
    options.driver,
  )
  const audio = createKartAudio()
  const held = new Set<string>()
  // A boost or reset key pressed and let go between two steps still counts
  let boostTapped = false
  let resetTapped = false
  let itemTapped = false
  let throttleTapped = false
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
    takeoffs: 0,
    landings: 0,
    tuning: undefined,
    crossings: 0,
    nextGate: 0,
  }
  window.__kartSpike = debug
  scene.snapCamera(run.kart.heading, run.kart.y)

  let previous: KartState = run.kart
  let hits = 0
  let accumulator = 0
  let lastFrame: number | undefined
  let handle = 0
  let lastHud: SpikeHud | undefined
  let bursts = 0
  /** How hard the last boost kicked (feelFx.ts) */
  let burstPower = 0
  // A hill track (2026-11-17): landings, for the dust and the thump
  let landings = 0

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
    const touch = options.touch
    // A gamepad in use hides the buttons on the screen, as a key does
    if (touch && pad && activeControls(pad.snapshot).length > 0) touch.otherDevice()
    if (!enabled) {
      touch?.clear()
      held.clear()
      boostTapped = false
      resetTapped = false
      itemTapped = false
      throttleTapped = false
    }
    const clock = advanceClock(accumulator, frameMs / 1000)
    accumulator = clock.accumulator
    let callout: Callout | undefined
    for (let step = 0; step < clock.steps; step++) {
      const pilot = net?.autopilot ?? options.autopilot
      const driven = pilot && trial ? pilot(trial) : null
      const keyed = enabled
        ? readInput(bindings, {
            held,
            pad: pad?.snapshot,
            boostTapped,
            resetTapped,
            itemTapped,
            throttleTapped,
          })
        : NO_INPUT
      // Read even when the autopilot drives, so that a tap is used up and not kept for later
      const touched =
        enabled && touch
          ? touch.read({
              racing: !trial || trial.phase !== 'countdown',
              burstWaiting: kartBurstWaiting(run.kart, tuning),
            })
          : null
      const input = driven ?? (touched ? mergeInputs(keyed, touched) : keyed)
      boostTapped = false
      resetTapped = false
      itemTapped = false
      throttleTapped = false
      const before = run
      if (trial && trialCourse && track) {
        const was = trial.phase
        const startBefore = trial.start
        if (net && was === 'countdown') {
          // Counted down to the room's GO, not this browser's: held on the grid until it is set
          const left = net.countdown()
          trial = {
            ...trial,
            countdown: left === null ? COUNTDOWN_SECONDS + 1 : Math.min(left, COUNTDOWN_SECONDS),
          }
        }
        trial = stepTrial(trial, input, trialCourse, tuning, rules)
        run = trial.run
        if (net && trial.phase !== 'countdown') {
          // e9-t09: pushed out of the other karts, as this browser draws them
          const bumped = bumpKart(run.kart, net.bumpers(), kartMass(options.body ?? DEFAULT_KART))
          if (bumped.kart !== run.kart) {
            run = { ...run, kart: bumped.kart }
            trial = { ...trial, run }
            if (bumped.hit >= HIT_SPEED) audio.hit(Math.min(1, bumped.hit / 30))
          }
          if (net.adjust && trial.phase === 'racing') {
            const adjusted = net.adjust(run, input)
            if (adjusted !== run) {
              run = adjusted
              trial = { ...trial, run }
            }
          }
        }
        // The classic feel's start boost may come just after GO (`startLate`)
        if (was === 'racing' && trial.start !== startBefore) {
          callout = louder(callout, calloutAtStart(trial.start))
        }
        if (was === 'countdown' && trial.phase === 'racing') {
          callout = louder(callout, calloutAtStart(trial.start))
          if (!net) {
            recorder = startRecording(recordKey(track))
            recordStep(recorder, 0, run.kart)
          }
        } else if (trial.phase !== 'countdown' && was === 'racing' && recorder) {
          recordStep(recorder, trial.steps, run.kart)
        }
        if (was === 'racing' && trial.phase === 'finished' && recorder) {
          const ghost: Ghost = {
            ...finishRecording(recorder, trial.steps, trial.laps),
            kart: kartId,
          }
          news = keepIfBetter(ghost)
          if (news.bestRun) best = ghost
          if (news.kartBestRun) kartBest = ghost
          bestLap = news.lapSteps
        }
      } else {
        run = stepRun(run, input, course, tuning, rules)
      }
      if (run.resets !== before.resets) {
        // A jump, not a move: nothing to draw in between, and the camera starts behind the car
        previous = run.kart
        scene.snapCamera(run.kart.heading, run.kart.y)
      } else {
        previous = before.kart
        callout = louder(callout, calloutBetween(before.kart, run.kart))
        // Any boost fired (a charge, an instant boost, a pad, the start): the thrusters burst, the
        // camera lurches and it bangs, by how hard it kicks
        const { kart } = run
        const was = before.kart
        const fired = burstBetween(was, kart, tuning.startBoostDuration)
        if (fired) {
          bursts++
          burstPower = BURST_POWER[fired]
          audio.burst(burstPower)
          touch?.buzz(BOOST_BUZZ_MS)
        }
        if (run.terrainEvent === 'takeoff') debug.takeoffs++
        if (run.terrainEvent === 'landing') {
          debug.landings++
          landings++
          audio.hit(Math.min(0.5, (was.air ?? 0) * 0.4))
        }
      }
      // One hit per crash, not one per step of pushing against the wall after it
      if (run.hitSpeed >= HIT_SPEED && before.hitSpeed < HIT_SPEED) {
        hits++
        audio.hit(run.impact)
      }
      debug.input = input
      if (net && trial) net.afterStep(trial, input, run.resets !== before.resets)
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
    const boosting = kartBoosting(current)
    const skidding = kartSkidding(current)
    // Let go, the car slides on until the grip is back: the nose is still turned the drift's way
    const slideWay = current.driftDirection || (skidding ? -Math.sign(kartSlip(current)) : 0)
    const forward = current.vx * Math.sin(current.heading) - current.vz * Math.cos(current.heading)
    const airborne = (current.air ?? 0) > 0
    // How hard the tyres slide: the skid marks, the smoke and the squeal all follow it
    const skid = airborne
      ? 0
      : skidStrength(kartSlip(current), kartSpeed(current), skidding, debug.input.brake && forward > 0)
    const waiting = kartBurstWaiting(current, tuning)
    const look: KartLook = {
      speed: forward,
      steer: debug.input.steer,
      drift: slideWay,
      boosting,
      // The sparks say where the release boost stands: gold once the drift has earned one and all
      // through the slide-out (counter-steer now), blue once it is caught (the throttle now)
      charge:
        current.releaseWindow > 0
          ? 2
          : current.burstReady ||
              (!isClassic(tuning) &&
                current.drifting &&
                current.driftSeconds >= tuning.chainMinDrift)
            ? 1
            : 0,
      bursts,
      burstPower,
      skid,
      ...(trialCourse?.terrain ? { airborne, landings } : {}),
    }
    const pose = poseBetween(previous, current, clock.alpha)
    const hitFrame = net?.fx?.(pose)
    if (hitFrame) {
      scene.hits(hitFrame, frameMs / 1000)
      for (const cue of hitFrame.cues) audio.cue(cue)
    }
    if (net) scene.others(net.others(), frameMs / 1000)
    if (net?.props) scene.items(net.props(pose), frameMs / 1000)
    scene.draw(
      pose,
      { heading: current.heading, vx: current.vx, vz: current.vz, boosting, skidding },
      frameMs / 1000,
      look,
    )
    net?.drawn(scene)
    audio.update({
      speed: look.speed,
      throttle: debug.input.throttle,
      drifting: skidding,
      boosting,
      skid,
    })
    if (callout) options.onCallout(callout)

    const hud: SpikeHud = {
      speed: Math.round(kartSpeed(current) * KMH_PER_MPS),
      gauge: Math.floor(current.gauge),
      storedBoosts: current.storedBoosts,
      boosting,
      chain: boosting ? current.chain : 0,
      hits,
      dash: !rules.chainBoosts ? 0 : waiting ? 2 : current.drifting && current.burstReady ? 1 : 0,
      depth: rules.chainBoosts ? Math.floor(kartDashDepth(current, tuning) * HUD_STEPS + 1e-9) : 0,
      boostLeft: Math.min(
        HUD_STEPS,
        Math.ceil((current.boostSeconds / Math.max(0.1, tuning.boostDuration)) * HUD_STEPS - 1e-9),
      ),
      boostLocked: isClassic(tuning) && current.boostSeconds > 0,
    }
    options.onPose?.(current.x, current.z, current.heading, run.nextGate)
    if (trial && track) {
      const view: SpikeTrial = {
        phase: trial.phase,
        countdown: Math.ceil(trial.countdown - 1e-9),
        lap: currentLap(trial),
        laps: trialCourse?.checkpoints.laps ?? track.laps,
        lapTimes: trial.laps.map(seconds),
        wrongWay: trial.wrongWay,
        total: trial.phase === 'finished' ? seconds(trial.steps) : null,
        bestRun: news ? seconds(news.runSteps) : best ? seconds(best.total) : null,
        bestLap: bestLap === null ? null : seconds(bestLap),
        newBestRun: news?.bestRun ?? false,
        newBestLap: news?.bestLap ?? false,
        recordKart: best ? (best.kart ?? 'unknown') : null,
        kartBestRun: news ? seconds(news.kartRunSteps) : kartBest ? seconds(kartBest.total) : null,
        newKartBestRun: news?.kartBestRun ?? false,
      }
      if (!sameTrial(lastTrial, view)) {
        lastTrial = view
        options.onTrial?.(view)
      }
      options.onClock?.(seconds(trial.steps), seconds(lapSteps(trial)))
      const ghost = chased()
      scene.ghost(ghost ? ghostPose(ghost, trial.steps) : null)
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
    // Ctrl itself boosts (ALWAYS_KEYS), and an arrow pressed while Ctrl is held still steers
    const ctrlChord =
      event.ctrlKey && !event.code.startsWith('Control') && !event.code.startsWith('Arrow')
    if (!enabled || event.altKey || ctrlChord || event.metaKey) return
    // A slider, a list or a text box keeps its keys: the tuning panel is used while the car waits
    if (isField(event.target)) return
    if (!ownsKey(event.code, bindings)) return
    event.preventDefault()
    // A driving key hides the buttons on the screen: this player has a keyboard
    options.touch?.otherDevice()
    held.add(event.code)
    if (event.repeat) return
    if (actionKeys(bindings, 'boost').includes(event.code)) boostTapped = true
    if (actionKeys(bindings, 'reset').includes(event.code)) resetTapped = true
    if (actionKeys(bindings, 'item').includes(event.code)) itemTapped = true
    if (actionKeys(bindings, 'throttle').includes(event.code)) throttleTapped = true
  }
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code)
    const { bindings, enabled } = options.controls()
    if (enabled && !isField(event.target) && ownsKey(event.code, bindings)) event.preventDefault()
  }
  // The key-up of a key let go in another window never arrives; nor does a finger's lift
  const onBlur = () => {
    held.clear()
    options.touch?.clear()
  }
  // Ctrl boosts, and Ctrl with W closes the tab before any page can stop it: during a race, the
  // browser asks first (2026-11-14)
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (trial?.phase !== 'racing') return
    event.preventDefault()
    event.returnValue = ''
  }

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    debug.running = false
    cancelAnimationFrame(handle)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('beforeunload', onBeforeUnload)
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
  window.addEventListener('beforeunload', onBeforeUnload)
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
