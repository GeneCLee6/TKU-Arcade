import { TEST_ARENA } from '../../shared/kart/arena.ts'
import type { OutfitId } from '../../shared/kart/outfits.ts'
import { loadOutfit } from './bodies.ts'
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
  loadBestRun,
  loadGhost,
  loadKartBestRun,
  loadKartGhost,
  type RunRecord,
  type GhostPick,
  type RecordNews,
} from './records.ts'
import { watchKartRun } from '../achievements/kartHook.ts'
import { holdAchievements } from '../achievements/track.ts'
import { createKartAudio } from './kartAudio.ts'
import type { Quality } from './quality.ts'
import {
  applyKart,
  DEFAULT_DRIVER,
  DEFAULT_KART,
  kartKind,
  kartMass,
  kartRadius,
  loadoutByte,
  type DriverId,
  type KartId,
} from '../../shared/kart/karts.ts'
import type { KartBody } from './bodies.ts'
import { courseOf, recordKey, type Track } from '../../shared/kart/track.ts'
import { spikeTrack, type SpikeCourse } from './courses.ts'
import { HUD_STEPS } from './hudSteps.ts'
import { bumpKart } from '../../shared/kart/race.ts'
import type { BoardRecorder } from '../../shared/kart/boardRun.ts'
import type { Replay } from '../../shared/kart/replay.ts'
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
import { testClock } from './testClock.ts'
import { obstaclesOf } from '../../shared/kart/obstacles.ts'
import { obstacleCues } from './obstacleCues.ts'
import { startRun, stepRun, type Run, type Spot } from '../../shared/kart/course.ts'
import {
  CELEBRATE_SECONDS,
  countdownShot,
  finishShot,
  groupHalfAngle,
  inIntro,
  openingShot,
  pickGroupAngle,
  type CameraShot,
  type GroupAngle,
} from './director.ts'
import { isRacePaused } from './race/raceClock.ts'
import { beepsPlayed, playBeep, startBeep } from './audio/countBeeps.ts'
import { kartSoundState, startKartAudio } from './audio/unlock.ts'
import { loadSettings } from './settings.ts'
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
  kartTeamBoosting,
  kartBurstWaiting,
  kartDashDepth,
  kartSkidding,
  kartSlip,
  kartSpeed,
  KART_TUNING,
  NO_INPUT,
  poseBetween,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { TEAM_BOOST } from '../../shared/kart/teamBoost.ts'
import { calloutAtStart, calloutBetween, louder, type Callout } from './callouts.ts'
import { BURST_POWER, burstBetween, skidStrength } from './feelFx.ts'
import { BOOST_FX, boostFx, boostKindOf, type BoostKind } from './boostFx.ts'
import { readGamepad } from './devices.ts'
import {
  createKartScene,
  type HitFrame,
  type ItemProps,
  type KartScene,
  type OtherKart,
  type Pose,
  type RenderStats,
} from './Scene.ts'
import type { KartLook } from './art/kartModel.ts'
import type { HitBurst, ItemCue } from './hitFx.ts'
import type { ShotItem } from '../../shared/kart/shots.ts'
import type { TouchSource } from './touch/touchSource.ts'
import { claimMusic, scheduledSteps } from './audio/musicPlayer.ts'
import { sectionFor } from './audio/sequencer.ts'
import { songFor } from './audio/songs.ts'
import { createAmbience } from './audio/ambiencePlayer.ts'
import { audioTier } from './audio/tiers.ts'
import { isNightTrack } from './art/trackArt.ts'
import { gestureAt, type DriverGesture } from './driverGestures.ts'

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
   * A team race only (2026-11-18): the team boosts this kart may fire, and whether one burns. Left
   * out in any other race
   */
  readonly teamBoosts?: number
  readonly teamBoosting?: boolean
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
  /**
   * The gauge by the quality of the drift (2026-11-18, docs/KART-FEEL.md §3.5): the combo (instant
   * boosts in a row; shown from 2), whether the drift under way has lasted long enough for a perfect
   * exit, and the last instant boost: how many have been fired (so that the HUD plays its feedback
   * once each), the gauge points it added (whole) and its grade (1 late, 2 good, 3 perfect)
   */
  readonly combo?: number
  readonly perfectReady?: boolean
  readonly gains?: number
  readonly gain?: number
  readonly grade?: number
}

// 2026-11-21: in their own light modules, so that a page can name the courses and draw the HUD
// before the engine is here (docs/ARCHITECTURE.md §4.52)
export { HUD_STEPS } from './hudSteps.ts'
export { SPIKE_COURSES, spikeTrack, type SpikeCourse } from './courses.ts'

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
  /** 2026-11-20 (§4.43): a race's opening before the 3, not skipped (2026-11-23: the group shot) */
  readonly intro: boolean
  /** ... and the finish's show, for CELEBRATE_SECONDS after crossing the line */
  readonly celebrating: boolean
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
  a.newKartBestRun === b.newKartBestRun &&
  a.intro === b.intro &&
  a.celebrating === b.celebrating

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
  /**
   * 2026-11-20 (docs/KART-PERF.md): the last frame's draw calls, triangles and what is held on the
   * GPU (refreshed twice a second), and the JS time of a frame, milliseconds, averaged
   */
  render?: RenderStats
  jsMs?: number
  /** The same, summed over every frame drawn so far: calls, triangles and JS milliseconds */
  totals?: { frames: number; calls: number; triangles: number; jsMs: number }
  /** 2026-11-20 (§4.46): the song and its part asked for this frame, `song:section` */
  music?: string
  /**
   * 2026-11-23 (audio/unlock.ts): the kart's sound this frame ('running', 'suspended', 'none'), the
   * music's steps scheduled so far (musicPlayer.ts) and the start's beeps played
   */
  sound?: { state: string; steps: number; beeps: number }
  /** 2026-11-20 (§4.47), for looking at the drivers: this driver does this whatever the race says */
  gesture?: DriverGesture | null
  /**
   * 2026-11-23 (§4.86), for looking at the skeleton and the kart's motion (scripts/kart-shots.mjs
   * `--poses`): the look's steering, slide, stun and throttle as given here, whatever the kart does.
   * Looks only; null or left out, as driven
   */
  pose?: { steer?: number; drift?: number; dazed?: number; throttle?: number } | null
  /**
   * 2026-11-18, for looking at the effects (a screenshot, a curious owner): draws the kart as if a
   * boost of this kind ran, whatever the physics says. Looks only; null or left out, nothing
   */
  fx?: BoostKind | null
  /** The same, for the camera: turned this many radians round the kart, this far back, this high */
  view?: { orbit?: number; back?: number; up?: number } | null
  /**
   * 2026-11-20, the same for the items (scripts/kart-shots.mjs `--items`): boxes, bubbles, mirrors
   * and shots to draw, placed relative to this kart (metres ahead and to its right), and bursts to
   * start once (taken and cleared on the next frame). Looks only
   */
  items?: {
    readonly shields?: readonly { ahead: number; right: number }[]
    readonly mirrors?: readonly { ahead: number; right: number }[]
    readonly shots?: readonly { item: ShotItem; ahead: number; right: number; n?: number }[]
    readonly bursts?: readonly { kind: HitBurst['kind']; ahead: number; right: number }[]
  } | null
  /** 2026-11-23 (director.ts's `pickGroupAngle`): where the group shot stands on this grid */
  groupAngle?: GroupAngle
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
  /**
   * 2026-11-20: every racer's place on the grid, the pole first: the countdown's camera starts with
   * the whole grid in view (director.ts)
   */
  readonly gridSpots?: () => readonly Spot[]
  /** 2026-11-20 (§4.47): this kart's place now, 1 for the lead: a place gained, a fist in the air */
  readonly place?: () => number
  /**
   * 2026-11-23 (#152): whether the room's clock is settled here (shared/kart/net.ts's
   * `clockSettled`; the race screen tells the room it has loaded only then). Absent: always
   */
  readonly clockSettled?: () => boolean
  /** After each step: the race so far, the input it ran with, and whether the kart was reset */
  afterStep(trial: Trial, input: KartInput, reset: boolean): void
  /** The other karts as drawn now, to bump into (e9-t09) */
  bumpers(): readonly {
    x: number
    z: number
    vx: number
    vz: number
    mass?: number
    radius?: number
  }[]
  /** Each frame: the other karts to draw */
  others(): readonly OtherKart[]
  /** After each frame is drawn: to put the name tags where the karts are */
  drawn(scene: Pick<KartScene, 'tagPoints'>): void
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
  /** 2026-11-23 (shared/kart/outfits.ts): what the driver wears; left out, what this browser keeps */
  readonly outfit?: OutfitId
  /** Every frame, where the car is: the minimap moves its marker with it, outside React */
  readonly onPose?: (x: number, z: number, heading: number, nextGate: number, tick?: number) => void
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
  /**
   * 2026-11-20 (§4.50): after each physics step, the step as it ran: the driving school judges a
   * lesson by it, and its coach gives a tip in a race (src/kart/school/). Only reads
   */
  readonly onStep?: (step: SpikeStep) => void
  /**
   * 2026-11-21 (§4.60, the challenge mode): a time trial of this many laps instead of the track's
   * own. A run of other laps keeps no record and no ghost (they are the track's own laps' alone)
   */
  readonly laps?: number
  /** 2026-11-21 (§4.60): false keeps no record and no ghost of this run (a mission with a handicap) */
  readonly keepRecords?: boolean
  /**
   * 2026-11-21 (§4.60): this ghost races along instead of the picked one (a medal's target, its
   * time already in it); null for none
   */
  readonly ghost?: Ghost | null
  /**
   * 2026-11-23 (§4.81, the leaderboard): at the finish of a time trial on its own laps with the
   * standard tuning, the run recorded for the board (shared/kart/boardRun.ts). Given only on a
   * track with a board (SpikePage); the recorder is fetched when the loop starts, and a run whose GO
   * comes before it has arrived is not recorded
   */
  readonly onBoardRun?: (run: BoardRunDone) => void
}

/** A time trial finished and recorded for the leaderboard (`onBoardRun`) */
export interface BoardRunDone {
  readonly replay: Replay
  /** The track's id and layout revision */
  readonly track: string
  readonly revision: number
  /** From GO to the finish, ms */
  readonly totalMs: number
  /** Whether this run set the track's best in this browser */
  readonly newBest: boolean
}

/** Whether `tuning` is the standard one for `kart`: only such a run goes on the board */
function standardTuning(tuning: KartTuning, kart: KartId): boolean {
  const standard = applyKart(KART_TUNING, kart) as Record<string, number>
  const given = tuning as Record<string, number>
  return Object.keys(standard).every((key) => given[key] === standard[key])
}

/** One physics step, for `onStep` */
export interface SpikeStep {
  readonly before: KartState
  readonly after: KartState
  readonly input: KartInput
  /** The race after the step; null off a track */
  readonly trial: Trial | null
  /** How hard the kart went into a wall in this step and the one before, m/s */
  readonly hit: number
  readonly hitBefore: number
}

const sameHud = (a: SpikeHud | undefined, b: SpikeHud): boolean =>
  !!a &&
  a.speed === b.speed &&
  a.gauge === b.gauge &&
  a.hits === b.hits &&
  a.storedBoosts === b.storedBoosts &&
  a.teamBoosts === b.teamBoosts &&
  a.teamBoosting === b.teamBoosting &&
  a.boosting === b.boosting &&
  a.chain === b.chain &&
  (a.dash ?? 0) === (b.dash ?? 0) &&
  (a.depth ?? 0) === (b.depth ?? 0) &&
  (a.boostLeft ?? 0) === (b.boostLeft ?? 0) &&
  (a.boostLocked ?? false) === (b.boostLocked ?? false) &&
  (a.combo ?? 0) === (b.combo ?? 0) &&
  (a.perfectReady ?? false) === (b.perfectReady ?? false) &&
  (a.gains ?? 0) === (b.gains ?? 0)

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
  const ownLaps =
    !net && options.laps !== undefined && plainCourse.checkpoints ? options.laps : undefined
  const course =
    net && plainCourse.checkpoints
      ? {
          ...plainCourse,
          start: net.start,
          checkpoints: { ...plainCourse.checkpoints, laps: net.laps },
        }
      : ownLaps !== undefined && plainCourse.checkpoints
        ? { ...plainCourse, checkpoints: { ...plainCourse.checkpoints, laps: ownLaps } }
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
  // 2026-11-20 (§4.40): the records at once, from localStorage; the ghosts a moment later, from
  // IndexedDB (records.ts), unless this run has set a new record by then
  const keeps =
    options.keepRecords !== false && (ownLaps === undefined || ownLaps === track?.laps)
  const keyOfRecords = track && !net && keeps ? recordKey(track) : null
  let bestRun: RunRecord | null = keyOfRecords ? loadBestRun(keyOfRecords) : null
  let kartBestRun: number | null = keyOfRecords ? loadKartBestRun(keyOfRecords, kartId) : null
  let best: Ghost | null = null
  let kartBest: Ghost | null = null
  if (keyOfRecords) {
    void loadGhost(keyOfRecords).then((ghost) => {
      if (ghost && ghost.total === bestRun?.total) best ??= ghost
    })
    void loadKartGhost(keyOfRecords, kartId).then((ghost) => {
      if (ghost && ghost.total === kartBestRun) kartBest ??= ghost
    })
  }
  const fixedGhost = options.ghost
  const chased = (): Ghost | null =>
    fixedGhost !== undefined
      ? fixedGhost
      : pick === 'off'
        ? null
        : pick === 'kart'
          ? kartBest
          : best
  let bestLap: number | null = keyOfRecords ? loadBestLap(keyOfRecords) : null
  let recorder: GhostRecorder | null = null
  let news: RecordNews | null = null
  // e11-t06 (§4.82): the race's feats for the achievements, watched from its steps
  let feats = track ? watchKartRun(track, kartId) : null
  // 2026-11-23 (§4.81): the run as the leaderboard keeps it, on a built-in track's own laps alone;
  // `boardTuning` is the tuning it started with, which must stay the standard one to the finish
  const boardable = !net && !!track && !!options.onBoardRun && ownLaps === undefined
  // Its own small chunk (the tape, replay.ts), so that the race's engine does not carry it
  let recorders: typeof import('../../shared/kart/boardRun.ts') | null = null
  if (boardable) {
    void import('../../shared/kart/boardRun.ts')
      .then((module) => {
        recorders = module
      })
      .catch(() => undefined)
  }
  let board: BoardRecorder | null = null
  let boardTuning: KartTuning | null = null
  const scene = createKartScene(
    container,
    course.walls,
    track ?? undefined,
    options.quality,
    options.body,
    options.driver,
    // 2026-11-23 (shared/kart/outfits.ts): what the driver wears, as picked in the garage
    options.outfit ?? loadOutfit(options.driver ?? DEFAULT_DRIVER),
  )
  // 2026-11-22: a bike's own engine, and as much sound as the quality has (audio/tiers.ts)
  const audio = createKartAudio({ quality: options.quality, kind: kartKind(kartId) })
  // 2026-11-23 (audio/unlock.ts): the sound from the moment the race is built (the intro, the world
  // round the track, the 3, 2, 1), not from the first key, wherever the browser lets this page
  if (startKartAudio()) audio.unlock()
  // 2026-11-20 (§4.46): the track's song, by the race's part, and the world around the track
  const music = claimMusic(true)
  const song = songFor(track)
  const finishLine = track?.gates[0]
  const ambience =
    track && finishLine
      ? createAmbience(
          track,
          { x: (finishLine.ax + finishLine.bx) / 2, z: (finishLine.az + finishLine.bz) / 2 },
          isNightTrack(track),
          audioTier(options.quality),
        )
      : null
  let crossingsHeard = 0
  // §4.47: this kart's place as last seen, and when it last went up (the driver punches the air)
  let lastPlace = 0
  let placeUpAt = -Infinity
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
  // What the start boost counts as (boostFx.ts): a perfect one, or a small one
  let launchKind: BoostKind = 'start'
  // Whether the kart's shape is open (a full boost runs): its sound when it changes
  let shapeOpen = false
  let forced: BoostKind | null = null
  // A hill track (2026-11-17): landings, for the dust and the thump
  let landings = 0
  // 2026-11-22 (obstacles.ts): the moving obstacles, drawn by the race clock (steps since GO; still
  // in the countdown, running on after the finish for the look of it), and their bells and horns
  const obstacles = track ? obstaclesOf(track) : []
  let obstacleTick = 0

  let statsFrom: number | undefined
  let statsFrames = 0
  let slowest = 0

  // Whether a shot of director.ts's was last given to the scene
  let directed = false
  // 2026-11-23 (§4.97): where the group shot stands, worked out once for this grid and screen shape
  // (away from anything in the way)
  let groupAngle: { key: string; angle: GroupAngle } | null = null
  // §4.43: the fly round skipped (any key or touch), and when this kart crossed the line
  let skipped = false
  let finishedAt: number | null = null
  // 2026-11-22 (§4.73): the countdown left at the last frame, for the 3, 2, 1 and GO beeps
  let beepFrom: number | null = null
  let wasPaused = false
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  let firstFrameAt: number | null = null
  let loadMs = 0
  // 2026-11-23 (QA follow-up): a browser test's clock in place of the wall's (testClock.ts); null
  // whenever no test asked for it
  const manual = testClock()
  const frame = (now: number) => {
    handle = requestAnimationFrame(frame)
    const workFrom = performance.now()
    if (firstFrameAt === null) {
      firstFrameAt = now
      // (2026-11-23, QA sweep: a first frame in the very frame the loop started is stamped with that
      // frame's start, a moment before: a negative load time, which /api/telemetry refuses with a 400)
      loadMs = Math.max(0, now - loadStarted)
    } else if (now - firstFrameAt >= TELEMETRY_AFTER_MS && !reported) {
      report(((debug.frames + 1) * 1000) / (now - firstFrameAt), loadMs, options.quality ?? 'high')
    }
    // 2026-11-22 (§4.73): paused (a race with no one else in it, raceClock.ts), no time passes: no
    // step, no countdown, nothing moves; the picture is still drawn (the menu blurs it)
    const paused = isRacePaused()
    // e11-t06: an achievement's badge waits while the race runs, and shows at the finish or the pause
    holdAchievements(trial?.phase === 'racing' && !paused)
    const frameMs = lastFrame === undefined || paused || wasPaused ? 0 : now - lastFrame
    lastFrame = now
    wasPaused = paused
    // 2026-11-23 (docs/KART-PERF.md §11): and the picture behind the menu is drawn once, not every frame
    scene.hold(paused)

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
    const clock = manual
      ? { steps: paused ? 0 : manual.take(), accumulator: 0, alpha: 1 }
      : advanceClock(accumulator, frameMs / 1000)
    accumulator = clock.accumulator
    let callout: Callout | undefined
    let ran = 0
    while (ran < clock.steps) {
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
          const bumped = bumpKart(
            run.kart,
            net.bumpers(),
            kartMass(options.body ?? DEFAULT_KART),
            kartRadius(options.body ?? DEFAULT_KART),
          )
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
          if (keyOfRecords) {
            recorder = startRecording(keyOfRecords)
            recordStep(recorder, 0, run.kart)
          }
        } else if (trial.phase !== 'countdown' && was === 'racing' && recorder) {
          recordStep(recorder, trial.steps, run.kart)
        }
        // The finish's show (§4.43): the camera swings round, the page celebrates
        if (was === 'racing' && trial.phase === 'finished') finishedAt = now
        if (was === 'racing' && trial.phase === 'finished' && recorder) {
          const ghost: Ghost = {
            ...finishRecording(recorder, trial.steps, trial.laps),
            kart: kartId,
          }
          news = keepIfBetter(ghost)
          if (news.bestRun) {
            best = ghost
            bestRun = { total: ghost.total, kart: kartId }
          }
          if (news.kartBestRun) {
            kartBest = ghost
            kartBestRun = ghost.total
          }
          bestLap = news.lapSteps
        }
        if (boardable && track) {
          if (was === 'countdown' && trial.phase === 'racing') {
            board = recorders && standardTuning(tuning, kartId)
              ? recorders.createBoardRecorder(
                  track.id,
                  track.laps,
                  loadoutByte(kartId, options.driver ?? DEFAULT_DRIVER),
                )
              : null
            boardTuning = tuning
          }
          // A tuning changed during the run (the test page's panel) takes it off the board
          if (board && tuning !== boardTuning) board = null
          if (board && was !== 'finished') {
            board.step(trial, input, trial.run.resets !== before.resets)
            if (trial.phase === 'finished') {
              const replay = board.finish(trial)
              board = null
              if (replay) {
                options.onBoardRun?.({
                  replay,
                  track: track.id,
                  revision: track.revision ?? 1,
                  totalMs: replay.racers[0]!.finishMs ?? 0,
                  newBest: news?.bestRun ?? false,
                })
              }
            }
          }
        }
      } else {
        run = stepRun(run, input, course, tuning, rules)
      }
      if (obstacles.length > 0 && trial) {
        const was = obstacleTick
        obstacleTick = trial.phase === 'racing' ? trial.steps : trial.phase === 'finished' ? was + 1 : 0
        if (trial.phase === 'racing') {
          for (const cue of obstacleCues(obstacles, was, obstacleTick, run.kart.x, run.kart.z)) {
            audio.cue({ kind: cue })
          }
        }
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
          if (fired === 'start' || fired === 'quick')
            launchKind = fired === 'start' ? 'start' : 'mini'
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
      const step: SpikeStep = {
        before: before.kart,
        after: run.kart,
        input,
        trial,
        hit: run.hitSpeed,
        hitBefore: before.hitSpeed,
      }
      feats?.(step)
      options.onStep?.(step)
      ran++
      if (manual?.stepped(run.kart, input)) break
    }
    const current = run.kart
    debug.tick += ran
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
    // Which boost runs (boostFx.ts): the flames' size and colour, and whether the kart changes shape
    const wanted = debug.fx ?? null
    if (wanted !== forced) {
      forced = wanted
      if (wanted) {
        bursts++
        burstPower = BOOST_FX[wanted].power
        audio.burst(burstPower)
      }
    }
    const boostKind = forced ?? boostKindOf(current, launchKind)
    const boosting = boostKind !== null || kartBoosting(current)
    const open = boostKind !== null && BOOST_FX[boostKind].transforms
    if (open !== shapeOpen) {
      shapeOpen = open
      audio.morph(open)
    }
    scene.view(debug.view ?? null)
    const skidding = kartSkidding(current)
    // Let go, the car slides on until the grip is back: the nose is still turned the drift's way
    const slideWay = current.driftDirection || (skidding ? -Math.sign(kartSlip(current)) : 0)
    const forward = current.vx * Math.sin(current.heading) - current.vz * Math.cos(current.heading)
    const airborne = (current.air ?? 0) > 0
    // How hard the tyres slide: the skid marks, the smoke and the squeal all follow it
    const skid = airborne
      ? 0
      : skidStrength(
          kartSlip(current),
          kartSpeed(current),
          skidding,
          debug.input.brake && forward > 0,
        )
    const waiting = kartBurstWaiting(current, tuning)
    const look: KartLook = {
      speed: forward,
      steer: debug.input.steer,
      drift: slideWay,
      // 2026-11-23 (§4.86): the thrusters' halo follows the throttle as pressed
      throttle: Number(debug.input.throttle),
      ...boostFx(boostKind ?? (boosting ? 'mini' : null)),
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
      ...ownGesture(now),
      ...(debug.pose ?? {}),
    }
    const pose = poseBetween(previous, current, clock.alpha)
    if (obstacles.length > 0) {
      scene.clock(obstacleTick + (trial && trial.phase !== 'countdown' ? clock.alpha : 0))
    }
    const hitFrame = net?.fx?.(pose)
    if (hitFrame) {
      scene.hits(hitFrame, frameMs / 1000)
      for (const cue of hitFrame.cues) audio.cue(cue)
    }
    if (net) scene.others(net.others(), frameMs / 1000)
    // 2026-11-20: the countdown starts on the whole grid, and glides down behind this kart; before
    // it, unless skipped, the group shot from in front (2026-11-23, director.ts); at the finish the
    // camera swings to the front
    const reduced = reducedMotion?.matches ?? false
    const left = net && trial?.phase === 'countdown' ? net.countdown() : null
    const opening = { group: loadSettings().opening === 'group' }
    const introNow =
      !!net?.gridSpots && trial?.phase === 'countdown' && inIntro(left) && !skipped && opening.group
    // The start's beeps: 3, 2, 1 and GO, by the room's countdown in a race, this run's in a trial
    if (trial?.phase === 'countdown' || beepFrom !== null) {
      const counted = trial?.phase === 'countdown' ? (net ? left : trial.countdown) : 0
      if (counted !== null) {
        beepFrom ??= Math.max(counted, 3) + 1e-6
        const beep = startBeep(beepFrom, counted)
        if (beep) playBeep(beep)
        beepFrom = trial?.phase === 'countdown' ? counted : null
      }
    }
    let shot: CameraShot | null = null
    if (trial?.phase === 'finished' && finishedAt !== null) {
      shot = finishShot(
        { x: pose.x, z: pose.z, heading: current.heading, y: current.y },
        (now - finishedAt) / 1000,
        reduced,
      )
    } else if (net?.gridSpots && trial?.phase === 'countdown') {
      const spots = net.gridSpots()
      const aspect = window.innerWidth / Math.max(1, window.innerHeight)
      const grounded = current.y ?? 0
      const opens = !skipped && opening.group && (left === null || inIntro(left))
      const key = `${spots.length}:${aspect.toFixed(2)}:${grounded.toFixed(1)}:${reduced}`
      if (opens && groupAngle?.key !== key) {
        groupAngle = {
          key,
          angle: pickGroupAngle(spots, scene.sightBlocked, grounded, groupHalfAngle(aspect), reduced),
        }
        debug.groupAngle = groupAngle.angle
      }
      shot =
        (skipped
          ? null
          : openingShot(spots, left, opening, reduced, grounded, aspect, groupAngle?.angle)) ??
        countdownShot(spots, left, reduced, grounded)
    }
    if (shot || directed) scene.shot(shot)
    directed = shot !== null
    if (net?.props) scene.items(net.props(pose), frameMs / 1000)
    else if (debug.items) {
      // Placed relative to this kart: `ahead` along its nose, `right` across
      const place = (one: { ahead: number; right: number }) => ({
        x: pose.x + Math.sin(current.heading) * one.ahead + Math.cos(current.heading) * one.right,
        z: pose.z - Math.cos(current.heading) * one.ahead + Math.sin(current.heading) * one.right,
      })
      const wanted = debug.items
      scene.items(
        {
          boxes: [],
          shields: (wanted.shields ?? []).map(place),
          mirrors: (wanted.mirrors ?? []).map(place),
          shots: (wanted.shots ?? []).map((one, n) => ({
            n: one.n ?? n,
            item: one.item,
            ...place(one),
          })),
        },
        frameMs / 1000,
      )
      const bursts = (wanted.bursts ?? []).map((one) => ({ kind: one.kind, ...place(one) }))
      if (bursts.length > 0) {
        scene.hits({ spins: new Map(), bursts }, frameMs / 1000)
        debug.items = { ...wanted, bursts: [] }
      } else scene.hits({ spins: new Map(), bursts: [] }, frameMs / 1000)
    }
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
    const totalLaps = trialCourse?.checkpoints.laps ?? track?.laps ?? 1
    const section = sectionFor({
      phase: trial?.phase ?? 'none',
      finalLap: !!trial && totalLaps > 1 && currentLap(trial) === totalLaps,
      celebrating: finishedAt !== null && now - finishedAt < CELEBRATE_SECONDS * 1000,
    })
    // After the finish's show (the results), and off a track, the quiet song
    const playing = section === 'menu' ? 'lounge' : song
    music.set({ song: playing, section, boosting })
    debug.music = `${playing}:${section}`
    debug.sound = { state: kartSoundState(), steps: scheduledSteps(), beeps: beepsPlayed() }
    ambience?.update(pose.x, pose.z)
    // The crowd roars as the kart crosses the line
    if (run.crossings > crossingsHeard && trial?.phase !== 'countdown') ambience?.cheer()
    crossingsHeard = run.crossings
    if (callout) options.onCallout(callout)

    const hud: SpikeHud = {
      speed: Math.round(kartSpeed(current) * KMH_PER_MPS),
      gauge: Math.floor(current.gauge),
      storedBoosts: current.storedBoosts,
      boosting,
      chain: boosting ? current.chain : 0,
      hits,
      dash: !rules.chainBoosts ? 0 : waiting ? 2 : current.drifting && current.burstReady ? 1 : 0,
      ...(current.teamBoosts !== undefined
        ? { teamBoosts: current.teamBoosts, teamBoosting: kartTeamBoosting(current) }
        : {}),
      depth: rules.chainBoosts ? Math.floor(kartDashDepth(current, tuning) * HUD_STEPS + 1e-9) : 0,
      // A team boost (a team race) shows on the same meter, and locks the charges like any boost
      boostLeft: Math.min(
        HUD_STEPS,
        Math.ceil(
          Math.max(
            current.boostSeconds / Math.max(0.1, tuning.boostDuration),
            (current.teamSeconds ?? 0) / TEAM_BOOST.seconds,
          ) *
            HUD_STEPS -
            1e-9,
        ),
      ),
      boostLocked: isClassic(tuning) && (current.boostSeconds > 0 || kartTeamBoosting(current)),
      ...(isClassic(tuning) && rules.chainBoosts
        ? {
            combo: current.chain >= 2 ? current.chain : 0,
            perfectReady:
              current.drifting &&
              current.burstReady &&
              current.driftSeconds >= tuning.perfectMinSeconds,
            gains: current.dashCount ?? 0,
            gain: Math.round(current.gaugeGain ?? 0),
            grade: current.dashGrade ?? 0,
          }
        : {}),
    }
    // 2026-11-23: and the race clock, for the obstacles on the map
    options.onPose?.(current.x, current.z, current.heading, run.nextGate, obstacles.length > 0 ? obstacleTick : undefined)
    if (trial && track) {
      const view: SpikeTrial = {
        phase: trial.phase,
        countdown: Math.ceil(trial.countdown - 1e-9),
        lap: currentLap(trial),
        laps: trialCourse?.checkpoints.laps ?? track.laps,
        lapTimes: trial.laps.map(seconds),
        wrongWay: trial.wrongWay,
        total: trial.phase === 'finished' ? seconds(trial.steps) : null,
        bestRun: news ? seconds(news.runSteps) : bestRun ? seconds(bestRun.total) : null,
        bestLap: bestLap === null ? null : seconds(bestLap),
        newBestRun: news?.bestRun ?? false,
        newBestLap: news?.bestLap ?? false,
        recordKart: bestRun ? (bestRun.kart ?? 'unknown') : null,
        kartBestRun:
          news ? seconds(news.kartRunSteps) : kartBestRun === null ? null : seconds(kartBestRun),
        newKartBestRun: news?.kartBestRun ?? false,
        intro: introNow,
        celebrating:
          trial.phase === 'finished' &&
          finishedAt !== null &&
          now - finishedAt < CELEBRATE_SECONDS * 1000,
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

    // The JS a frame took, smoothed, and what it drew (docs/KART-PERF.md)
    const workMs = performance.now() - workFrom
    debug.jsMs = (debug.jsMs ?? 0) * 0.95 + workMs * 0.05
    const drawn = scene.drawn()
    const totals = (debug.totals ??= { frames: 0, calls: 0, triangles: 0, jsMs: 0 })
    totals.frames++
    totals.calls += drawn.calls
    totals.triangles += drawn.triangles
    totals.jsMs += workMs
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
      debug.render = scene.stats()
      statsFrom = now
      statsFrames = 1
      slowest = 0
    }
  }

  /** §4.47: what this kart's driver does besides drive, by the race's moment */
  function ownGesture(now: number): { gesture?: DriverGesture } {
    if (debug.gesture) return { gesture: debug.gesture }
    if (trial?.phase === 'racing' && net?.place) {
      const place = net.place()
      if (lastPlace > 0 && place > 0 && place < lastPlace) placeUpAt = now
      lastPlace = place
    }
    const gesture = gestureAt({
      toGo: trial?.phase === 'countdown' ? (net ? net.countdown() : trial.countdown) : null,
      sinceFinish: finishedAt === null ? null : (now - finishedAt) / 1000,
      sincePlaceUp: (now - placeUpAt) / 1000,
    })
    return gesture ? { gesture } : {}
  }

  // A driving key must not also press the focused button (Space) or scroll the page (arrows)
  const ownsKey = (code: string, bindings: Bindings) =>
    isBoundKey(bindings, code) || code.startsWith('Arrow')

  // §4.43: any key or touch skips the fly round on this screen (GO stays the room's)
  const skip = (event?: Event) => {
    // A tap is a gesture too: the sound may start (a phone has no keys)
    audio.unlock()
    // 2026-11-22: not while paused, and not by the pause menu's own key or buttons
    if (isRacePaused() || (event?.target instanceof Element && event.target.closest('[data-kart-menu]'))) return
    if (trial?.phase === 'countdown') skipped = true
  }
  const onKeyDown = (event: KeyboardEvent) => {
    // Sound may start only after a gesture: the first key is one
    audio.unlock()
    if (event.key !== 'Escape') skip(event)
    // 2026-11-22: paused, the keys drive nothing
    if (isRacePaused()) return
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
    holdAchievements(false)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('pointerdown', skip)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('blur', onBlur)
    scene.canvas.removeEventListener('webglcontextlost', onContextLost)
    scene.dispose()
    audio.dispose()
    music.release()
    ambience?.dispose()
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
      board = null
      news = null
      feats = track ? watchKartRun(track, kartId) : null
      finishedAt = null
      skipped = false
      beepFrom = null
      previous = run.kart
      lastTrial = undefined
      scene.snapCamera(run.kart.heading)
    },
  })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerdown', skip)
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
