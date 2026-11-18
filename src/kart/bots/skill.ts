// Computer opponents (owner 2026-11-17, outside the roadmap; docs/ARCHITECTURE.md §4.20): how well
// each difficulty drives. Every number is a handicap or a habit, never a cheat: a bot drives the same
// physics with the same kart numbers as a player (shared/kart/karts.ts), and the most a bot ever gets
// is its own kart's top speed. Pure.

import { BOT_LEVELS, type BotLevel } from '../../../shared/games/kart/bots.ts'

export const DIFFICULTIES = BOT_LEVELS
export type Difficulty = BotLevel

export const isDifficulty = (value: unknown): value is Difficulty =>
  DIFFICULTIES.some((one) => one === value)

export interface BotSkill {
  /**
   * How far the line wanders from the middle of the road, as a share of half the road's width: a
   * slow sway, different for every bot. Bigger is sloppier (and takes longer corners)
   */
  readonly lineNoise: number
  /** Steps between seeing the road and the hands answering (1/60 s each) */
  readonly reactionSteps: number
  /**
   * The share of the kart's own top speed it drives at on the throttle alone; boosts still go over
   * it, as they do for a player. Never above 1
   */
  readonly topSpeedShare: number
  /**
   * When a corner gets a drift: the turn it needs as a share of what the grip gives. Higher drifts
   * later (and brakes more); the expert recipe drifts at 0.9
   */
  readonly driftAt: number
  /** The chance a drift ends in the counter-steer and the release boost (0 never, 1 always) */
  readonly releaseBoosts: number
  /** After a release boost, the double's tap (the arcade feel only: the classic feel has none) */
  readonly doubles: boolean
  /**
   * Tapped drifts down the straights, each for a release boost (the arcade feel only: since
   * 2026-11-18 the classic feel's instant boost takes a deep, long drift, which a straight has no
   * room for)
   */
  readonly taps: boolean
  /** The chance of a start boost (the throttle pressed just before GO); otherwise a jump start */
  readonly startBoost: number
  /**
   * Fires the second charge while a boost runs, to stack it (the arcade feel only: in the classic
   * feel a boost runs out before the next can be fired)
   */
  readonly stackBoosts: boolean
  /** How long an item is held at least before it is used, ms: [shortest, longest] */
  readonly itemDelayMs: readonly [number, number]
  /** Waits for a good moment to use an item (a target in range, a straight); else uses it as it comes */
  readonly itemSense: boolean
}

export const BOT_SKILLS: Readonly<Record<Difficulty, BotSkill>> = {
  easy: {
    lineNoise: 0.3,
    reactionSteps: 8,
    topSpeedShare: 0.86,
    driftAt: 1.1,
    releaseBoosts: 0,
    doubles: false,
    taps: false,
    startBoost: 0,
    stackBoosts: false,
    itemDelayMs: [1_500, 5_000],
    itemSense: false,
  },
  normal: {
    lineNoise: 0.2,
    reactionSteps: 5,
    topSpeedShare: 0.95,
    driftAt: 1,
    releaseBoosts: 0.5,
    doubles: false,
    taps: false,
    startBoost: 0.5,
    stackBoosts: false,
    itemDelayMs: [700, 2_500],
    itemSense: true,
  },
  hard: {
    lineNoise: 0.1,
    reactionSteps: 2,
    topSpeedShare: 1,
    driftAt: 0.9,
    releaseBoosts: 1,
    doubles: true,
    taps: true,
    startBoost: 0.9,
    stackBoosts: true,
    itemDelayMs: [300, 1_200],
    itemSense: true,
  },
}

/**
 * The rubber band: a mild one, and only through the speed share above. A bot far ahead of the player
 * eases off; one far behind drives a little nearer its kart's top speed, never past it. Measured in
 * laps of the race's own progress (shared/kart/race.ts's raceProgress, divided by the gates a lap)
 */
export const RUBBER_BAND = {
  /** Within this much of the player (in laps, either way) nothing changes */
  deadZone: 0.05,
  /** At this lead or more the share is down by `aheadCut`, in proportion between */
  fullLead: 0.3,
  aheadCut: 0.06,
  /** At this much behind or more the share is up by `behindLift`, capped at 1 */
  fullLag: 0.3,
  behindLift: 0.05,
} as const

/** The speed share for a bot `lead` laps ahead of the player (negative: behind) */
export function bandedShare(share: number, lead: number): number {
  const { deadZone, fullLead, aheadCut, fullLag, behindLift } = RUBBER_BAND
  if (Math.abs(lead) <= deadZone) return share
  if (lead > 0) {
    const t = Math.min(1, (lead - deadZone) / (fullLead - deadZone))
    return share - aheadCut * t
  }
  const t = Math.min(1, (-lead - deadZone) / (fullLag - deadZone))
  return Math.min(1, share + behindLift * t)
}
