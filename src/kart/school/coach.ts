// 2026-11-20 (docs/ARCHITECTURE.md §4.50): tips during a race, for a technique the player has not
// shown yet. Each tip is given once ever (store.ts keeps which), and a technique the player does
// unprompted is never tipped: the first instant boost they fire marks its tip as seen. Pure: the
// page passes each step (spikeLoop.ts's `onStep`) and shows the tip that comes out.
//
// - repress: an instant boost earned and never fired, the throttle held all along: let go of
//   drift, then press forward again;
// - deeper: three drifts in a row let go before they earned one: longer, steer into the corner;
// - perfect: four good instant boosts and not one perfect: press as you let go;
// - fire: a charge stored for eight seconds and not fired;
// - locked: the boost key pressed while one burns;
// - start: a start with no start boost;
// - reset: standing still in the race for three seconds.
import {
  kartSpeed,
  STEP_SECONDS,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import { IDLE_WATCH, watchDash, type DashWatch, type Sample } from './judge.ts'

export const TIPS = ['repress', 'deeper', 'perfect', 'fire', 'locked', 'start', 'reset'] as const
export type Tip = (typeof TIPS)[number]

export interface Coach {
  readonly dash: DashWatch
  /** Drifts in a row that earned nothing */
  readonly shallow: number
  /** Good instant boosts since the last perfect one, or since the race began */
  readonly good: number
  /** Steps a charge has waited, and steps stood still */
  readonly stored: number
  readonly still: number
  /** The start was looked at */
  readonly started: boolean
}

export const startCoach = (): Coach => ({
  dash: IDLE_WATCH,
  shallow: 0,
  good: 0,
  stored: 0,
  still: 0,
  started: false,
})

/** What a step shows: a tip to give, and techniques done (their tips are no longer needed) */
export interface CoachStep {
  readonly coach: Coach
  readonly tip: Tip | null
  readonly known: readonly Tip[]
}

const FIRE_AFTER = Math.round(8 / STEP_SECONDS)
const RESET_AFTER = Math.round(3 / STEP_SECONDS)
/** The start is settled a second after GO */
const START_SETTLED = Math.round(1 / STEP_SECONDS)

export function coachStep(coach: Coach, sample: Sample, tuning: KartTuning): CoachStep {
  const known: Tip[] = []
  let tip: Tip | null = null
  const give = (one: Tip) => {
    tip ??= one
  }
  if (sample.phase !== 'racing') return { coach, tip, known }
  const { before, after, input } = sample

  let { shallow, good, stored, still, started } = coach
  if (!started && sample.steps >= START_SETTLED) {
    started = true
    if (sample.start === 'boost') known.push('start')
    else give('start')
  }

  const seen = watchDash(coach.dash, sample, tuning)
  for (const event of seen.events) {
    if (event.kind === 'earned') shallow = 0
    if (event.kind === 'unearned' && ++shallow >= 3) {
      give('deeper')
      shallow = 0
    }
    if (event.kind === 'fired') {
      known.push('repress', 'deeper')
      if (event.grade >= 3) {
        known.push('perfect')
        good = 0
      } else if (++good >= 4) {
        give('perfect')
        good = 0
      }
    }
    if (event.kind === 'missed' && event.why === 'heldThrottle') give('repress')
  }

  const press = input.boost && !before.boostHeld
  if (press && before.boostSeconds > 0) give('locked')
  if (after.storedBoosts < before.storedBoosts) known.push('fire')
  stored = after.storedBoosts > 0 && after.boostSeconds === 0 ? stored + 1 : 0
  if (stored === FIRE_AFTER) give('fire')

  still = kartSpeed(after) < 1.5 ? still + 1 : 0
  if (still === RESET_AFTER) give('reset')

  return { coach: { dash: seen.watch, shallow, good, stored, still, started }, tip, known }
}
