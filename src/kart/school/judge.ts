// 2026-11-20 (docs/ARCHITECTURE.md §4.49): what the driving school judges, one physics step at a
// time. Pure: the page passes each step as the game loop ran it (spikeLoop.ts's `onStep`), and the
// tests pass made-up ones. Everything is told from the kart's state before and after the step and
// the input it ran with, as the physics left it (shared/kart/classic.ts): a drift that earned an
// instant boost (`burstReady`), one fired (`dashCount`, `dashGrade`), the combo (`chain`), the
// charges, the start, a drift jump (`airDrift`, `driftJumps`). When a try goes wrong the judge
// says why, in the words of a coach: let go too soon, not deep enough, held the throttle all along,
// pressed too late after letting go.
import {
  kartBurstWaiting,
  kartSpeed,
  STEP_SECONDS,
  type KartInput,
  type KartState,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import {
  START_LATE_TELL,
  type Trial,
  type TrialPhase,
  type TrialStart,
} from '../../../shared/kart/timeTrial.ts'
import { roadDirection, type RoadPoint } from '../../../shared/kart/track.ts'
import { acrossRoad } from '../../../shared/kart/tracks/guide.ts'
import type { Lesson } from './lessons.ts'

/** One physics step, as the school sees it */
export interface Sample {
  readonly before: KartState
  readonly after: KartState
  readonly input: KartInput
  /** The race after the step */
  readonly phase: TrialPhase
  readonly start: TrialStart
  /** Steps since GO */
  readonly steps: number
  /** Laps finished */
  readonly laps: number
  readonly wrongWay: boolean
  /** How hard the kart went into a wall in this step, and in the one before, m/s */
  readonly hit: number
  readonly hitBefore: number
}

/** A step of the game loop (spikeLoop.ts's SpikeStep) as a sample; null off a track */
export function sampleOf(step: {
  readonly before: KartState
  readonly after: KartState
  readonly input: KartInput
  readonly trial: Trial | null
  readonly hit: number
  readonly hitBefore: number
}): Sample | null {
  const { trial } = step
  if (!trial) return null
  return {
    before: step.before,
    after: step.after,
    input: step.input,
    phase: trial.phase,
    start: trial.start,
    steps: trial.steps,
    laps: trial.laps.length,
    wrongWay: trial.wrongWay,
    hit: step.hit,
    hitBefore: step.hitBefore,
  }
}

/** What went wrong, for the player to read */
export type Note =
  | 'wall'
  | 'wrongWay'
  | 'stuck'
  | 'driftSlow'
  | 'driftNoSteer'
  | 'driftShort'
  | 'driftShallow'
  | 'heldThrottle'
  | 'noThrottle'
  | 'redrift'
  | 'perfectHeld'
  | 'perfectShort'
  | 'perfectTapEarly'
  | 'perfectSlow'
  | 'late'
  | 'comboLate'
  | 'comboDirty'
  | 'comboWall'
  | 'comboTimeout'
  | 'boostLocked'
  | 'boostEmpty'
  | 'startEarly'
  | 'startLate'
  | 'startNone'
  | 'jumpNoDrift'
  | 'jumpShallow'
  | 'jumpLetGo'
  | 'gapAround'
  | 'gapWall'
  | 'timeUp'

// ── The instant boost, step by step ─────────────────────────────────────────────────────────

/** Watching for an instant boost that waits for a fresh press of the throttle */
export interface DashWatch {
  /** One was there to be fired at the last step */
  readonly waiting: boolean
  /** The throttle has been up at some step since the drift was let go */
  readonly throttleUp: boolean
}

export const IDLE_WATCH: DashWatch = { waiting: false, throttleUp: false }

export type DashEvent =
  /** The drift under way has just earned an instant boost (the meter turned gold) */
  | { readonly kind: 'earned' }
  /** A drift let go that earned nothing, and why */
  | { readonly kind: 'unearned'; readonly why: 'driftShort' | 'driftShallow' }
  /** One fired: its grade (1 late, 2 good, 3 perfect) and, short of perfect, why */
  | { readonly kind: 'fired'; readonly grade: number; readonly why: Note | null }
  /** One that was there and never fired, and why */
  | { readonly kind: 'missed'; readonly why: 'redrift' | 'heldThrottle' | 'noThrottle' | 'wall' }

/** Why an instant boost came out short of perfect */
function shortOfPerfect(before: KartState, grade: number, tuning: KartTuning): Note | null {
  if (grade >= 3) return null
  if (grade <= 1) return 'late'
  if (before.drifting) return 'perfectHeld'
  if ((before.driftHeld ?? 0) < tuning.perfectMinSeconds - 1e-9) return 'perfectShort'
  if ((before.tapEarly ?? 0) > 0) return 'perfectTapEarly'
  return 'perfectSlow'
}

/** The instant boost's events in one step, and the watch after it */
export function watchDash(
  watch: DashWatch,
  sample: Pick<Sample, 'before' | 'after' | 'input' | 'hit'>,
  tuning: KartTuning,
): { readonly watch: DashWatch; readonly events: readonly DashEvent[] } {
  const { before, after, input } = sample
  const events: DashEvent[] = []
  const fired = (after.dashCount ?? 0) > (before.dashCount ?? 0)
  if (!before.burstReady && after.burstReady && after.drifting) events.push({ kind: 'earned' })
  if (fired) {
    const grade = after.dashGrade ?? 2
    events.push({ kind: 'fired', grade, why: shortOfPerfect(before, grade, tuning) })
  } else if (before.drifting && !after.drifting && !before.burstReady && !after.burstReady) {
    events.push({
      kind: 'unearned',
      why: before.driftSeconds < tuning.dashMinSeconds - 1e-9 ? 'driftShort' : 'driftShallow',
    })
  }
  const waiting = (after.drifting && after.burstReady) || kartBurstWaiting(after, tuning)
  if (watch.waiting && !waiting && !fired) {
    const why = after.drifting
      ? 'redrift'
      : sample.hit >= tuning.wallBreakSpeed
        ? 'wall'
        : watch.throttleUp
          ? 'noThrottle'
          : 'heldThrottle'
    events.push({ kind: 'missed', why })
  }
  const sliding = waiting && !after.drifting
  return {
    watch: {
      waiting,
      throttleUp: sliding ? watch.throttleUp || !input.throttle : false,
    },
    events,
  }
}

// ── The gates in a wall (the lanes' yards) ──────────────────────────────────────────────────

/** A gate in a wall across the road: its middle, the road's way there and the road's right */
export interface GateLine {
  readonly x: number
  readonly z: number
  readonly dx: number
  readonly dz: number
  /** Metres right of the road's middle */
  readonly across: number
  /** The road's middle where the wall stands */
  readonly mx: number
  readonly mz: number
}

/** The gates of a guide's slots, in driving order */
export function gateLines(
  road: readonly RoadPoint[],
  slots: readonly { readonly index: number; readonly across: number }[],
): GateLine[] {
  return slots.map((slot) => {
    const middle = acrossRoad(road, slot.index, 0)
    const gate = acrossRoad(road, slot.index, slot.across)
    const { dx, dz } = roadDirection(road, Math.round(slot.index) % road.length)
    return { x: gate.x, z: gate.z, dx, dz, across: slot.across, mx: middle.x, mz: middle.z }
  })
}

/** Half a gate's width, metres, and a little: the kart's middle must be this near the gate's */
export const GATE_HALF = 5.5
/** Only a crossing this near the road's middle is a crossing of the wall (its line goes on for ever) */
const GATE_NEAR = 45
/** A crash this near before a gate is a crash into its wall */
const GATE_WALL = 30

// ── The judge ───────────────────────────────────────────────────────────────────────────────

export interface Judge {
  /** What counts towards the target: drifts, instant boosts, perfect ones in a row, the combo... */
  readonly count: number
  readonly done: boolean
  /** Out of time, the lesson not passed */
  readonly failed: boolean
  /** A lesson of tries: this try is over (passed or not); the run starts again */
  readonly tryOver: boolean
  /** The last thing that went wrong, and a count that goes up with every one (to show it again) */
  readonly note: Note | null
  readonly notes: number
  /** Every thing that went wrong, how often */
  readonly mistakes: Readonly<Partial<Record<Note, number>>>
  /** Tries so far (a lesson of tries) */
  readonly attempts: number
  /** Crashes so far */
  readonly hits: number
  /** Steps from GO to the pass */
  readonly doneAt: number | null
  /** The time the last note was given, steps: the same note is not given twice in a second */
  readonly noteAt: number
  readonly dash: DashWatch
  /** Steps the kart has stood still in the race; whether it was going the wrong way */
  readonly still: number
  readonly wrongWay: boolean
  /** The N2O lesson: a charge filled, one fired, and gauge points gained while one burned */
  readonly charged: boolean
  readonly fired: boolean
  readonly refill: number
  /** The gates lesson: the next gate to go through */
  readonly gate: number
  /** The kart's place along the next gate's way at the last step */
  readonly along: number | null
}

export const startJudge = (): Judge => ({
  count: 0,
  done: false,
  failed: false,
  tryOver: false,
  note: null,
  notes: 0,
  mistakes: {},
  attempts: 0,
  hits: 0,
  doneAt: null,
  noteAt: -Infinity,
  dash: IDLE_WATCH,
  still: 0,
  wrongWay: false,
  charged: false,
  fired: false,
  refill: 0,
  gate: 0,
  along: null,
})

/** A new try of a lesson of tries: the run starts over, what was learnt from the last one stays */
export const nextTry = (judge: Judge): Judge => ({
  ...startJudge(),
  attempts: judge.attempts,
  mistakes: judge.mistakes,
  hits: judge.hits,
  note: judge.note,
  notes: judge.notes,
})

export interface JudgeContext {
  readonly tuning: KartTuning
  /** The gates lesson's gates */
  readonly gates?: readonly GateLine[]
}

/** Gauge points gained while a charge burns that count as filling on the go */
export const REFILL_POINTS = 8
/** Standing still this long in the race is being stuck, steps */
const STUCK_STEPS = 120
/** How long after GO a start is settled: the late grace, and the time a late press is told in */
const startSettled = (tuning: KartTuning) =>
  Math.ceil((tuning.startLate + START_LATE_TELL) / STEP_SECONDS) + 1

function noted(judge: Judge, note: Note, steps: number): Judge {
  const mistakes = { ...judge.mistakes, [note]: (judge.mistakes[note] ?? 0) + 1 }
  // The same thing again within a second: counted, not said again
  if (judge.note === note && steps - judge.noteAt < 1 / STEP_SECONDS) return { ...judge, mistakes }
  return { ...judge, mistakes, note, notes: judge.notes + 1, noteAt: steps }
}

const counted = (judge: Judge, count: number, lesson: Lesson, steps: number): Judge => {
  const done = count >= lesson.target
  return {
    ...judge,
    count,
    done,
    doneAt: done ? steps : null,
    tryOver: judge.tryOver || (done && !!lesson.tries),
  }
}

/** The judge after one step of `lesson` */
export function judgeStep(
  lesson: Lesson,
  judge: Judge,
  sample: Sample,
  context: JudgeContext,
): Judge {
  if (judge.done || judge.failed || judge.tryOver) return judge
  const { tuning } = context
  const { before, after, input, steps } = sample
  const racing = sample.phase === 'racing'
  let next = judge

  // The start, a try at every countdown
  if (lesson.id === 'start') {
    if (sample.phase === 'countdown' || steps === 0) return next
    if (steps === 1) next = { ...next, attempts: next.attempts + 1 }
    if (sample.start === 'boost') return counted(next, 1, lesson, steps)
    if (steps < startSettled(tuning)) return next
    const why: Note =
      sample.start === 'quick' ? 'startEarly' : sample.start === 'late' ? 'startLate' : 'startNone'
    return { ...noted(next, why, steps), tryOver: true }
  }
  if (!racing && sample.phase !== 'finished') return next
  if (steps === 1 && lesson.tries) next = { ...next, attempts: next.attempts + 1 }

  // Crashes, the wrong way, standing still: told in every lesson
  const crash = sample.hit >= tuning.wallBreakSpeed && sample.hitBefore < tuning.wallBreakSpeed
  if (crash) next = { ...next, hits: next.hits + 1 }
  if (crash && (lesson.id === 'drive' || lesson.id === 'final')) next = noted(next, 'wall', steps)
  if (sample.wrongWay && !next.wrongWay) next = noted(next, 'wrongWay', steps)
  next = { ...next, wrongWay: sample.wrongWay }
  const still = racing && kartSpeed(after) < 2 ? next.still + 1 : 0
  next = { ...next, still }
  if (still === STUCK_STEPS) next = noted(next, 'stuck', steps)

  // Pressing drift where nothing can come of it
  const driftPress = input.drift && !(before.driftKey ?? false) && !after.drifting
  if (driftPress && racing && (after.air ?? 0) === 0) {
    if (input.steer === 0) next = noted(next, 'driftNoSteer', steps)
    else if (kartSpeed(before) < tuning.driftMinSpeed) next = noted(next, 'driftSlow', steps)
  }

  // The instant boost
  const seen = watchDash(next.dash, sample, tuning)
  next = { ...next, dash: seen.watch }
  const dashLessons = lesson.id !== 'drive' && lesson.id !== 'jump' && lesson.id !== 'gap'
  for (const event of dashLessons ? seen.events : []) {
    if (event.kind === 'unearned') next = noted(next, event.why, steps)
    if (event.kind === 'missed' && lesson.id !== 'drift') next = noted(next, event.why, steps)
    if (lesson.id === 'drift' && event.kind === 'earned') {
      next = counted(next, next.count + 1, lesson, steps)
    }
    if (lesson.id === 'dash' && event.kind === 'fired') {
      next = counted(next, next.count + 1, lesson, steps)
    }
    if (lesson.id === 'perfect') {
      if (event.kind === 'fired' && event.grade >= 3) {
        next = counted(next, next.count + 1, lesson, steps)
      } else if (event.kind === 'fired' || event.kind === 'missed') {
        if (event.kind === 'fired' && event.why) next = noted(next, event.why, steps)
        next = { ...next, count: 0 }
      }
    }
  }

  // The combo: how many instant boosts in a row; why it did not go up, or ended
  if (lesson.id === 'combo') {
    const fired = seen.events.find((event) => event.kind === 'fired')
    if (fired && after.chain <= before.chain && before.chain > 0) {
      next = noted(next, after.dashGrade === 1 ? 'comboLate' : 'comboDirty', steps)
    }
    if (!fired && before.chain > 0 && after.chain === 0) {
      const missed = seen.events.some((event) => event.kind === 'missed')
      if (!missed) next = noted(next, crash ? 'comboWall' : 'comboTimeout', steps)
    }
    next = counted(next, Math.max(next.count, after.chain), lesson, steps)
    if (!next.done) next = { ...next, count: after.chain }
  }

  // N2O: a charge, fired, and the gauge filling while it burns
  if (lesson.id === 'n2o') {
    const press = input.boost && !before.boostHeld
    if (press && before.boostSeconds > 0) next = noted(next, 'boostLocked', steps)
    else if (press && before.storedBoosts === 0) next = noted(next, 'boostEmpty', steps)
    const charged = next.charged || after.storedBoosts > 0
    const firedNow = after.storedBoosts < before.storedBoosts && after.boostSeconds > 0
    const fired = next.fired || firedNow
    const gain =
      before.boostSeconds > 0 && !firedNow
        ? Math.max(0, after.gauge - before.gauge) +
          100 * Math.max(0, after.storedBoosts - before.storedBoosts)
        : 0
    const refill = next.refill + (fired ? gain : 0)
    next = { ...next, charged, fired, refill }
    const parts = (charged ? 1 : 0) + (fired ? 1 : 0) + (fired && refill >= REFILL_POINTS ? 1 : 0)
    next = counted(next, parts, lesson, steps)
  }

  // The drift jump: told at the lip, in the air, and on landing
  if (lesson.id === 'jump') {
    const tookOff = (before.air ?? 0) === 0 && (after.air ?? 0) > 0
    if (tookOff && (after.airDrift ?? 0) === 0) {
      const why = before.drifting ? 'jumpShallow' : 'jumpNoDrift'
      return { ...noted(next, why, steps), tryOver: true }
    }
    if ((before.airDrift ?? 0) !== 0 && (after.airDrift ?? 0) === 0 && (after.air ?? 0) > 0) {
      return { ...noted(next, 'jumpLetGo', steps), tryOver: true }
    }
    if ((after.driftJumps ?? 0) > (before.driftJumps ?? 0)) {
      next = counted(next, next.count + 1, lesson, steps)
    }
  }

  // The gates: through each in turn, or round the wall, or into it
  if (lesson.id === 'gap' && context.gates) {
    const gate = context.gates[next.gate]
    if (gate) {
      // Along the road's way from the wall's line, and right of the road's middle there
      const along = (after.x - gate.mx) * gate.dx + (after.z - gate.mz) * gate.dz
      const right = (after.x - gate.mx) * -gate.dz + (after.z - gate.mz) * gate.dx
      const near = Math.abs(right) < GATE_NEAR
      if (crash && near && along > -GATE_WALL && along < 2) {
        return { ...noted(next, 'gapWall', steps), tryOver: true }
      }
      if (next.along !== null && next.along < 0 && along >= 0 && near) {
        if (Math.abs(right - gate.across) > GATE_HALF) {
          return { ...noted(next, 'gapAround', steps), tryOver: true }
        }
        next = counted({ ...next, gate: next.gate + 1, along: null }, next.count + 1, lesson, steps)
      } else {
        next = { ...next, along: near && Math.abs(along) < GATE_NEAR ? along : null }
      }
    }
  }

  // The final test and the first lap: laps
  if (lesson.id === 'drive' || lesson.id === 'final') {
    next = counted(next, Math.min(lesson.target, sample.laps), lesson, steps)
  }

  // Out of time (the final test: over its limit at the finish, or before it)
  if (!next.done && lesson.limit !== undefined && steps * STEP_SECONDS > lesson.limit) {
    return { ...noted(next, 'timeUp', steps), failed: true }
  }
  if (!next.done && sample.phase === 'finished') {
    return { ...noted(next, 'timeUp', steps), failed: true }
  }
  if (next.done && lesson.limit !== undefined && steps * STEP_SECONDS > lesson.limit) {
    return { ...noted(next, 'timeUp', steps), done: false, failed: true, doneAt: null }
  }
  return next
}

/** The stars a passed lesson earns, 1 to 3; 0 when not passed */
export function starsFor(lesson: Lesson, judge: Judge): 0 | 1 | 2 | 3 {
  if (!judge.done) return 0
  const { by, three, two } = lesson.stars
  const value =
    by === 'seconds'
      ? (judge.doneAt ?? 0) * STEP_SECONDS
      : by === 'attempts'
        ? judge.attempts
        : judge.hits
  return value <= three + 1e-9 ? 3 : value <= two + 1e-9 ? 2 : 1
}

/** What went wrong most often (time running out aside), for the summary of a lesson not passed */
export function worstNote(judge: Judge): Note | null {
  let worst: Note | null = null
  let most = 0
  for (const [note, times] of Object.entries(judge.mistakes) as [Note, number][]) {
    if (note === 'timeUp' || times <= most) continue
    worst = note
    most = times
  }
  return worst
}

/** A line of help for this moment: what to do now, by the kart's state */
export type LiveHint =
  | 'deeper'
  | 'letGo'
  | 'letGoNow'
  | 'press'
  | 'fire'
  | 'keepDrifting'
  | 'wait'
  | 'holdNow'

export function liveHint(
  lesson: Lesson,
  kart: KartState,
  tuning: KartTuning,
  countdown: number | null,
): LiveHint | null {
  if (lesson.id === 'start') {
    if (countdown === null) return null
    return countdown > 1 ? 'wait' : 'holdNow'
  }
  if (lesson.id === 'drive' || lesson.id === 'gap') return null
  if (lesson.id === 'n2o' && kart.boostSeconds > 0) return 'keepDrifting'
  if (lesson.id === 'n2o' && kart.storedBoosts > 0) return 'fire'
  if (kart.drifting && !kart.burstReady) return lesson.id === 'jump' ? null : 'deeper'
  if (kart.drifting && kart.burstReady) {
    if (lesson.id === 'drift' || lesson.id === 'jump') return null
    return kart.driftSeconds >= tuning.perfectMinSeconds ? 'letGoNow' : 'letGo'
  }
  if (lesson.id !== 'drift' && kartBurstWaiting(kart, tuning)) return 'press'
  return null
}
