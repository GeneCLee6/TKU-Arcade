// 2026-11-21 (docs/ARCHITECTURE.md §4.60): what the challenge mode judges. Pure, like the driving
// school's judge (src/kart/school/judge.ts): a mission on its own (a time trial) is judged one
// physics step at a time from the kart's state before and after the step, the input it ran with
// and the race as the time trial left it (spikeLoop.ts's `onStep`); a mission against the computer
// is judged from the race room's laps and finishes (`judgeRace`), and from the player's own steps
// for its rules (`ruleBroken`). The tests pass made-up steps and made-up rooms.
import {
  kartBoosting,
  STEP_SECONDS,
  type KartInput,
  type KartState,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import { START_LATE_TELL, type Trial, type TrialPhase, type TrialStart } from '../../../shared/kart/timeTrial.ts'
import { GATE_HALF, type GateLine } from '../school/judge.ts'
import type { Mission } from './missions.ts'

/** One physics step, as the challenge mode sees it */
export interface Sample {
  readonly before: KartState
  readonly after: KartState
  readonly input: KartInput
  readonly phase: TrialPhase
  readonly start: TrialStart
  /** Steps since GO */
  readonly steps: number
  /** Laps finished */
  readonly laps: number
  /** How hard the kart went into a wall in this step and the one before, m/s */
  readonly hit: number
  readonly hitBefore: number
  /** Resets so far */
  readonly resets: number
  /** The branch the kart is on (shared/kart/branches.ts's `forkAt`), -1 the main road */
  readonly fork: number
  /** The high platform the kart is up on (shared/kart/ledges.ts's `onPlatform`), -1 none */
  readonly platform?: number
}

/** A step of the game loop (spikeLoop.ts's SpikeStep) as a sample; null off a track */
export function sampleOf(
  step: {
    readonly before: KartState
    readonly after: KartState
    readonly input: KartInput
    readonly trial: Trial | null
    readonly hit: number
    readonly hitBefore: number
  },
  forkAt: (x: number, z: number) => number = () => -1,
  /** 2026-11-23: the high platform a kart is up on, -1 none */
  platformAt: (kart: KartState) => number = () => -1,
): Sample | null {
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
    hit: step.hit,
    hitBefore: step.hitBefore,
    resets: trial.run.resets,
    fork: forkAt(step.after.x, step.after.z),
    platform: platformAt(step.after),
  }
}

/** Why a mission was not passed */
export type FailReason =
  | 'crash'
  | 'n2o'
  | 'reset'
  | 'noBoostStart'
  | 'timeUp'
  | 'short'
  | 'slotAround'
  | 'slotWall'
  | 'branchMissed'
  | 'platformMissed'
  | 'lowCover'
  | 'place'
  | 'eliminated'
  | 'beaten'

export interface Judge {
  /** What counts towards the goal: laps, the combo, perfect boosts, drift jumps, slots, per cent */
  readonly count: number
  readonly done: boolean
  readonly failed: boolean
  readonly why: FailReason | null
  /** Steps from GO to the pass */
  readonly doneAt: number | null
  readonly crashes: number
  readonly resets: number
  /** Steps of the race so far, and of those in a boost */
  readonly racing: number
  readonly boosted: number
  /** The slots: the next one to go through (counting on round the laps), and the kart's place along it */
  readonly gate: number
  readonly along: number | null
  /** The branches taken on this lap, as bits */
  readonly forks: number
  readonly laps: number
}

export const startJudge = (): Judge => ({
  count: 0,
  done: false,
  failed: false,
  why: null,
  doneAt: null,
  crashes: 0,
  resets: 0,
  racing: 0,
  boosted: 0,
  gate: 0,
  along: null,
  forks: 0,
  laps: 0,
})

export interface JudgeContext {
  readonly tuning: KartTuning
  /** Seconds from GO; past it, not passed */
  readonly limit?: number
  /** The slots mission's slots, in driving order */
  readonly gates?: readonly GateLine[]
  /** The branches mission: how many branches the track has */
  readonly forkCount?: number
  /** The platforms mission: the track's high platforms, as their branches' indices */
  readonly platforms?: readonly number[]
}

/** Only a crossing this near the road's middle is a crossing of a slot's wall */
const GATE_NEAR = 45
/** A crash this near before a slot is a crash into its wall */
const GATE_WALL = 30

/** How long after GO a start is settled: the late grace, and the time a late press is told in */
export const startSettled = (tuning: KartTuning): number =>
  Math.ceil((tuning.startLate + START_LATE_TELL) / STEP_SECONDS) + 1

/** What a mission's count must reach to be passed */
export function targetOf(mission: Mission, context: Pick<JudgeContext, 'gates'>): number {
  switch (mission.kind) {
    case 'slots':
      return (context.gates?.length ?? 0) * mission.laps
    case 'finish':
    case 'branches':
    case 'platforms':
      return mission.laps
    default:
      return mission.target ?? 1
  }
}

const failed = (judge: Judge, why: FailReason): Judge => ({ ...judge, failed: true, why })

const passed = (judge: Judge, count: number, steps: number): Judge => ({
  ...judge,
  count,
  done: true,
  doneAt: steps,
})

/** Whether a step broke one of the mission's rules (also for a mission against the computer) */
export function ruleBroken(
  mission: Mission,
  sample: Pick<Sample, 'before' | 'after' | 'hit' | 'hitBefore' | 'resets' | 'phase'>,
  resetsBefore: number,
  tuning: KartTuning,
): FailReason | null {
  const rules = mission.rules ?? {}
  if (sample.phase !== 'racing') return null
  const crash = sample.hit >= tuning.wallBreakSpeed && sample.hitBefore < tuning.wallBreakSpeed
  if (rules.noCrash && crash) return 'crash'
  const fired =
    sample.after.storedBoosts < sample.before.storedBoosts && sample.after.boostSeconds > 0
  if (rules.noN2O && fired) return 'n2o'
  if (rules.noReset && sample.resets > resetsBefore) return 'reset'
  return null
}

/** The judge after one step of a mission on its own (not one against the computer) */
export function judgeStep(
  mission: Mission,
  judge: Judge,
  sample: Sample,
  context: JudgeContext,
): Judge {
  if (judge.done || judge.failed) return judge
  const { tuning } = context
  const { before, after, steps } = sample
  if (sample.phase === 'countdown') return judge
  const racing = sample.phase === 'racing'
  let next = judge

  // The rules
  const broken = ruleBroken(mission, sample, judge.resets, tuning)
  const crash = racing && sample.hit >= tuning.wallBreakSpeed && sample.hitBefore < tuning.wallBreakSpeed
  next = { ...next, crashes: next.crashes + (crash ? 1 : 0), resets: sample.resets }
  if (broken) return failed(next, broken)
  if (mission.rules?.boostStart && racing && steps >= startSettled(tuning) && sample.start !== 'boost') {
    return failed(next, 'noBoostStart')
  }
  if (racing) {
    next = {
      ...next,
      racing: next.racing + 1,
      boosted: next.boosted + (kartBoosting(after) ? 1 : 0),
    }
  }
  const target = targetOf(mission, context)
  const lapsDone = Math.min(sample.laps, mission.laps)
  const over = sample.phase === 'finished' || sample.laps >= mission.laps

  switch (mission.kind) {
    case 'combo': {
      const count = Math.max(next.count, after.chain)
      if (count >= target) return passed(next, count, steps)
      next = { ...next, count }
      break
    }
    case 'perfects': {
      const fired = (after.dashCount ?? 0) > (before.dashCount ?? 0)
      const count = next.count + (fired && (after.dashGrade ?? 0) >= 3 ? 1 : 0)
      if (count >= target) return passed(next, count, steps)
      next = { ...next, count }
      break
    }
    case 'driftJumps': {
      const count = next.count + Math.max(0, (after.driftJumps ?? 0) - (before.driftJumps ?? 0))
      if (count >= target) return passed(next, count, steps)
      next = { ...next, count }
      break
    }
    case 'slots': {
      const gates = context.gates ?? []
      const gate = gates[next.gate % Math.max(1, gates.length)]
      if (gate) {
        // Along the road's way from the wall's line, and right of the road's middle there
        const along = (after.x - gate.mx) * gate.dx + (after.z - gate.mz) * gate.dz
        const right = (after.x - gate.mx) * -gate.dz + (after.z - gate.mz) * gate.dx
        const near = Math.abs(right) < GATE_NEAR
        if (crash && near && along > -GATE_WALL && along < 2) return failed(next, 'slotWall')
        if (next.along !== null && next.along < 0 && along >= 0 && near) {
          if (Math.abs(right - gate.across) > GATE_HALF) return failed(next, 'slotAround')
          const count = next.count + 1
          if (count >= target) return passed(next, count, steps)
          next = { ...next, count, gate: next.gate + 1, along: null }
        } else {
          next = { ...next, along: near && Math.abs(along) < GATE_NEAR ? along : null }
        }
      }
      break
    }
    case 'branches': {
      const forks = sample.fork >= 0 ? next.forks | (1 << sample.fork) : next.forks
      next = { ...next, forks }
      if (sample.laps > next.laps) {
        const all = (1 << (context.forkCount ?? 0)) - 1
        if ((forks & all) !== all) return failed(next, 'branchMissed')
        next = { ...next, forks: 0, laps: sample.laps, count: lapsDone }
        if (lapsDone >= target) return passed(next, lapsDone, steps)
      }
      break
    }
    case 'platforms': {
      // As the branches mission, by the platforms reached rather than the branches driven
      const up = sample.platform ?? -1
      const forks = up >= 0 ? next.forks | (1 << up) : next.forks
      next = { ...next, forks }
      if (sample.laps > next.laps) {
        const all = (context.platforms ?? []).reduce((bits, fork) => bits | (1 << fork), 0)
        if ((forks & all) !== all) return failed(next, 'platformMissed')
        next = { ...next, forks: 0, laps: sample.laps, count: lapsDone }
        if (lapsDone >= target) return passed(next, lapsDone, steps)
      }
      break
    }
    case 'cover': {
      const share = next.racing > 0 ? (100 * next.boosted) / next.racing : 0
      next = { ...next, count: Math.floor(share) }
      if (over) {
        return share + 1e-9 >= target ? passed(next, Math.floor(share), steps) : failed(next, 'lowCover')
      }
      break
    }
    case 'finish': {
      next = { ...next, count: lapsDone }
      if (lapsDone >= target) return passed(next, lapsDone, steps)
      break
    }
    default:
      break
  }

  if (context.limit !== undefined && steps * STEP_SECONDS > context.limit + 1e-9) {
    return failed(next, 'timeUp')
  }
  if (over) return failed(next, 'short')
  return next
}

// ── Against the computer ──────────────────────────────────────────────────────────────────────

/** A seat of the race room, as the judge needs it */
export interface RaceSeat {
  readonly seat: number
  /** Each finished lap's time, ms */
  readonly lapMs: readonly number[]
  readonly finishMs: number | null
}

/**
 * The elimination race's order of going out: after each lap but the last, the last of those still
 * in to finish it. Decided as soon as only one of them has not finished the lap (that one is out,
 * wherever it is), or when all have (the slowest is). Seats in the order they went out
 */
export function eliminations(seats: readonly RaceSeat[], laps: number): number[] {
  const out: number[] = []
  for (let lap = 1; lap < laps; lap++) {
    const still = seats.filter((one) => !out.includes(one.seat))
    if (still.length <= 1) break
    const pending = still.filter((one) => one.lapMs.length < lap)
    if (pending.length > 1) break
    if (pending.length === 1) {
      out.push(pending[0]!.seat)
      continue
    }
    const at = (one: RaceSeat) => one.lapMs.slice(0, lap).reduce((sum, ms) => sum + ms, 0)
    const slowest = still.reduce((worst, one) => (at(one) > at(worst) ? one : worst))
    out.push(slowest.seat)
  }
  return out
}

export interface RaceVerdict {
  readonly done: boolean
  readonly failed: boolean
  readonly why: FailReason | null
  /** The player's place at the finish (among those still in, in an elimination race) */
  readonly place: number | null
  /** Seconds from GO to the finish */
  readonly seconds: number | null
  /** The seats out so far (an elimination race) */
  readonly out: readonly number[]
}

/** How a mission against the computer stands, from the room's laps and finishes */
export function judgeRace(mission: Mission, seats: readonly RaceSeat[], player: number): RaceVerdict {
  const me = seats.find((one) => one.seat === player)
  const out = mission.kind === 'elimination' ? eliminations(seats, mission.laps) : []
  const verdict = (rest: Partial<RaceVerdict>): RaceVerdict => ({
    done: false,
    failed: false,
    why: null,
    place: null,
    seconds: null,
    out,
    ...rest,
  })
  if (!me) return verdict({})
  if (out.includes(player)) return verdict({ failed: true, why: 'eliminated' })
  const rivals = seats.filter((one) => one.seat !== player && !out.includes(one.seat))
  const myFinish = me.finishMs
  const ahead = rivals.filter(
    (one) => one.finishMs !== null && (myFinish === null || one.finishMs < myFinish),
  ).length
  const wanted = mission.kind === 'place' ? (mission.target ?? 1) : 1
  const lost: FailReason = mission.kind === 'place' ? 'place' : 'beaten'
  if (ahead >= wanted) return verdict({ failed: true, why: lost, place: myFinish === null ? null : ahead + 1 })
  if (myFinish === null) return verdict({})
  return verdict({ done: true, place: ahead + 1, seconds: myFinish / 1000 })
}
