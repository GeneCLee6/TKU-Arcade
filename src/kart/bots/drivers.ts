// 2026-11-18 (owner: "an expert should be able to boost all the way round and a novice not ... the
// maps should tell the skilled from the rest"; docs/KART-FEEL.md §5): the drivers `npm run
// kart:feel` measures with (scripts/kart/drivers.ts has the measure). They live here, with the
// computer opponents' brain, so that the page can show one driving: /kart/spike?autopilot=expert
// (or average, or novice).
//
// The drivers are not the computer opponents. Those (src/kart/bots/skill.ts) never make a mistake:
// the easy one drives slowly down the middle and hits nothing. A person new to the game does the
// opposite: the foot stays down, the hands answer late and shake, the corner comes as a surprise, the
// wall gets hit, the drift key is pressed at the wrong moment and held too long, and the instant
// boost never comes because nobody told them to let go of forward and press it again. So each driver
// here is the same pursuit of the road (src/kart/bots/brain.ts) with a person's hands on top:
//
// - novice: slow, shaky hands that drift off for a moment now and then; lifts and brakes for corners;
//   drifts late, sometimes where there is no need, and holds on too long; never means to fire an
//   instant boost; no start boost.
// - average: steady enough; drifts where the grip is not enough; fires the instant boost out of four
//   drifts in five, but slowly (the throttle comes up a moment after the drift, so it is good or
//   late, seldom perfect); a start boost half the time.
// - expert: quick, exact hands on a clean line; drifts every corner worth one, lets go and presses
//   afresh at once (perfect), keeps the combo going, fires every charge as soon as the road allows,
//   and takes the start boost.
//
// The measure is the boost cover: the share of the race (GO to the finish) spent in any boost at all
// (a charge, an instant boost, a pad, a landing or the start). The owner's targets: the expert 70% or
// more, the novice 15% or less, the average 30 to 45%.
import { createRng } from '../../../shared/games/rng.ts'
import type { KartInput, KartTuning } from '../../../shared/kart/physics.ts'
import type { Trial } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { createTrackBrain } from './routes.ts'
import { BOT_SKILLS, type BotSkill } from './skill.ts'

/** A person's hands on top of the pursuit: every number a habit or a failing */
export interface Hands {
  /** How much the steering shakes: the size of a slow random sway added to the stick, 0 to 1 */
  readonly shake: number
  /** How often the hands drift off, a second; and for how many steps the stick then stays as it was */
  readonly lapses: number
  readonly lapseSteps: readonly [number, number]
  /**
   * Lifts for a corner: the throttle comes up while the stick is this far over at this speed (m/s)
   * or more; 0 for never
   */
  readonly liftSteer: number
  readonly liftSpeed: number
  /** How often, a second in a corner, the drift key is pressed for no reason and held (wild drifts) */
  readonly wildDrifts: number
  /** Steps a drift is held on after the pursuit lets it go: [least, most] */
  readonly holdOn: readonly [number, number]
}

export interface Driver {
  readonly skill: BotSkill
  readonly hands: Hands
}

const STEADY: Hands = {
  shake: 0,
  lapses: 0,
  lapseSteps: [0, 0],
  liftSteer: 0,
  liftSpeed: 0,
  wildDrifts: 0,
  holdOn: [0, 0],
}

export const DRIVER_IDS = ['novice', 'average', 'expert', 'master'] as const
export type DriverId = (typeof DRIVER_IDS)[number]

export const DRIVERS: Readonly<Record<DriverId, Driver>> = {
  novice: {
    skill: {
      ...BOT_SKILLS.easy,
      lineNoise: 0.4,
      // A third of a second between the eyes and the hands
      reactionSteps: 14,
      // The foot stays down: nobody new to the game drives at 86% on purpose
      topSpeedShare: 1,
      flatOut: true,
      driftAt: 1.2,
      releaseBoosts: 0,
      startBoost: 0,
    },
    hands: {
      shake: 0.28,
      lapses: 0.16,
      lapseSteps: [14, 34],
      liftSteer: 0.5,
      liftSpeed: 46,
      wildDrifts: 0.1,
      holdOn: [0, 26],
    },
  },
  average: {
    skill: {
      ...BOT_SKILLS.normal,
      lineNoise: 0.2,
      apex: 0.2,
      reactionSteps: 7,
      topSpeedShare: 1,
      flatOut: true,
      driftAt: 1,
      // Knows a drift has to be held through a real corner, and mostly does it
      cornerTurn: 0.4,
      holdSeconds: 0.4,
      releaseBoosts: 0.8,
      startBoost: 0.5,
      // The throttle comes up a moment after the drift: good at best, often late
      exitWait: [2, 12],
      liftSteps: [2, 5],
    },
    hands: {
      shake: 0.1,
      lapses: 0.04,
      lapseSteps: [8, 18],
      liftSteer: 0,
      liftSpeed: 0,
      wildDrifts: 0,
      holdOn: [0, 8],
    },
  },
  expert: {
    skill: {
      ...BOT_SKILLS.hard,
      lineNoise: 0.04,
      reactionSteps: 2,
      topSpeedShare: 1,
      flatOut: true,
      apex: 0.15,
      driftAt: 0.9,
      // Only into a corner big enough to hold a drift through, and then all the way through it: a
      // drift cut short is worth next to nothing
      cornerTurn: 0.5,
      holdSeconds: 0.45,
      releaseBoosts: 1,
      startBoost: 1,
      // Fires a charge anywhere short of a real corner, so that the stock is never full for long
      boostAt: 0.6,
    },
    hands: { ...STEADY, shake: 0.02 },
  },
  // 2026-11-19 (owner: "it is too easy to become an expert ... know the map by heart"): the expert's
  // hands, and the track known by heart (shared/kart/tracks/guide.ts): its technical line through
  // the slots and over the fences, and the drift jumps that line asks for. On a track without a
  // guide it is the expert
  master: {
    skill: {
      ...BOT_SKILLS.hard,
      lineNoise: 0.04,
      reactionSteps: 2,
      topSpeedShare: 1,
      flatOut: true,
      apex: 0.15,
      driftAt: 0.9,
      cornerTurn: 0.5,
      holdSeconds: 0.45,
      releaseBoosts: 1,
      startBoost: 1,
      boostAt: 0.6,
      tricks: true,
    },
    hands: { ...STEADY, shake: 0.02 },
  },
}

/** A brain with a person's hands on it. Seeded: the same seed drives the same race */
export function createDriver(
  driver: Driver,
  track: Track,
  tuning: KartTuning,
  seed: number,
): (trial: Trial) => KartInput {
  const { skill, hands } = driver
  // 2026-11-20: on a track with branches, the choice of road too (routes.ts)
  const brain = createTrackBrain(skill, track, tuning, seed)
  const rng = createRng(seed * 7919 + 13)
  const between = (range: readonly [number, number]) =>
    Math.round(range[0] + (range[1] - range[0]) * rng.float())
  let sway = 0
  let lapse = 0
  let last: KartInput | null = null
  let wild = 0
  let wildWay = 1
  let holding = 0
  let holdWay = 0
  let wasDrift = false
  return (trial) => {
    const want = brain(trial, { speedShare: skill.topSpeedShare })
    if (trial.phase !== 'racing' || want.reset) {
      last = null
      lapse = 0
      wild = 0
      holding = 0
      wasDrift = false
      return want
    }
    const kart = trial.run.kart
    const speed = Math.hypot(kart.vx, kart.vz)
    // The hands drift off: whatever they were doing, they go on doing
    if (lapse > 0 && last) {
      lapse--
      return { ...last, boost: false, throttleTap: false }
    }
    if (hands.lapses > 0 && rng.float() < hands.lapses / 60) lapse = between(hands.lapseSteps)

    let input = want
    // A shaking stick: a slow sway, pulled back to the middle
    if (hands.shake > 0) {
      sway += (rng.float() - 0.5) * hands.shake * 0.5 - sway * 0.08
      input = { ...input, steer: Math.max(-1, Math.min(1, input.steer + sway)) }
    }
    // A drift held on after the corner is over
    if (wasDrift && !want.drift && kart.drifting && holding === 0) {
      holding = between(hands.holdOn)
      holdWay = kart.driftDirection
    }
    wasDrift = want.drift
    if (holding > 0) {
      holding = kart.drifting ? holding - 1 : 0
      if (holding > 0) input = { ...input, drift: true, steer: holdWay * 0.6, throttle: true }
    }
    // A drift for no reason, in a corner
    if (wild > 0) {
      wild--
      input = { ...input, drift: true, steer: wildWay, throttle: true, brake: false }
    } else if (
      hands.wildDrifts > 0 &&
      !kart.drifting &&
      Math.abs(input.steer) > 0.35 &&
      speed > 30 &&
      rng.float() < hands.wildDrifts / 60
    ) {
      wild = 12 + between([0, 40])
      wildWay = input.steer > 0 ? 1 : -1
    }
    // Lifting for a corner
    if (
      hands.liftSteer > 0 &&
      !input.drift &&
      Math.abs(input.steer) >= hands.liftSteer &&
      speed >= hands.liftSpeed
    ) {
      input = { ...input, throttle: false }
    }
    last = input
    return input
  }
}
