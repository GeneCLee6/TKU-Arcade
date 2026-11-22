// Computer opponents (owner 2026-11-17, outside the roadmap; docs/ARCHITECTURE.md §4.20): how well
// each difficulty drives. Every number is a handicap or a habit, never a cheat: a bot drives the same
// physics with the same kart numbers as a player (shared/kart/karts.ts), and the most a bot ever gets
// is its own kart's top speed. Pure.

import { BOT_LEVELS, type BotLevel } from '../../../shared/games/kart/bots.ts'
import { EXPERT_SKILL } from './expert.ts'

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
  /**
   * The racing line (2026-11-18): how far towards the inside kerb it goes through a corner, as a
   * share of the room there is (0 or left out: the middle of the road; 1: clips every apex)
   */
  readonly apex?: number
  /** Past an island that splits the road, takes the lane inside the bend: the shortcut (2026-11-18) */
  readonly shortcuts?: boolean
  /**
   * Knows the track by heart (2026-11-19, shared/kart/tracks/guide.ts): on a track with a guide,
   * drives its technical line (through the slots, over the fences) and does the drift jumps that
   * line asks for. Without it the safe line, lifting before a jump into a corner
   */
  readonly tricks?: boolean
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
  // 2026-11-18, the gauge by the quality of the drift (docs/KART-FEEL.md §5): the hands of the
  // scripted drivers `npm run kart:feel` measures with (scripts/kart/drivers.ts). The easy and
  // normal difficulties leave them all out; the expert (2026-11-20, expert.ts) has them, as the
  // master driver does; the hard one (2026-11-22) holds its drifts through (holdSeconds, cornerTurn)
  /** The foot stays down, as a player's does: no easing off at the kart's own top speed */
  readonly flatOut?: boolean
  /**
   * The instant boost's timing, in steps, each drawn between the two: how long after letting the
   * drift go the throttle comes up, and for how long before it is pressed afresh. Left out: at once,
   * for two steps (a perfect one)
   */
  readonly exitWait?: readonly [number, number]
  readonly liftSteps?: readonly [number, number]
  /**
   * A charge is fired where the turn wanted now and further on are under this share of what the grip
   * gives (left out: 0.4, a straight)
   */
  readonly boostAt?: number
  /**
   * Every drift begun is held at least this long, seconds, and until it has earned its instant
   * boost, steering out of it if the corner is over: a drift cut short is worth little to the gauge
   */
  readonly holdSeconds?: number
  /**
   * A drift is begun only where the road ahead turns at least this much the same way, radians: a
   * corner big enough to hold a drift through. Left out: wherever the grip is not enough
   */
  readonly cornerTurn?: number
  /**
   * Watches the wall (2026-11-22, #100; the classic feel, docs/KART-FEEL.md §13.5): in a drift, the
   * line the kart is on is watched this many seconds ahead, and where it meets the road's edge the
   * drift is let go (once it has earned its instant boost) or braked in (until then); out of a
   * drift, where the line the hands mean to drive meets the edge they steer one that does not, and
   * where none does they lift, keep the charge and the instant boost's press, and brake. Left out:
   * they drive into it
   */
  readonly wallCare?: number
  /**
   * A team race (2026-11-22, #102): with the team's gauge at least this full (a share of it) and no
   * blue charge held, the last red charge is kept, to turn blue when the gauge fills. Left out: every
   * charge is fired as it comes
   */
  readonly teamSave?: number
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
    apex: 0.3,
    reactionSteps: 5,
    topSpeedShare: 0.95,
    driftAt: 1,
    releaseBoosts: 0.5,
    teamSave: 0.7,
    doubles: false,
    taps: false,
    startBoost: 0.5,
    stackBoosts: false,
    itemDelayMs: [700, 2_500],
    itemSense: true,
  },
  // 2026-11-22 (owner: "all as proposed"; docs/KART-FEEL.md §13.4): the hard one learnt the
  // expert's timing, not its routes. Every drift into a corner worth one (0.8 rad) is seen through
  // until it has earned its instant boost, let go with the perfect press, so the combo keeps going;
  // and the start boost every time. It still keeps to the line everyone sees: no guide, no drift
  // jumps, no slots, no branches (those stay the expert's), its line a little looser than the
  // expert's and a little nearer the middle (apex 0.2, was 0.3), so that it hits the walls no more
  // than it did
  hard: {
    lineNoise: 0.1,
    apex: 0.2,
    shortcuts: true,
    reactionSteps: 2,
    topSpeedShare: 1,
    driftAt: 0.95,
    cornerTurn: 0.8,
    holdSeconds: 0.45,
    releaseBoosts: 1,
    doubles: true,
    taps: true,
    startBoost: 1,
    stackBoosts: true,
    itemDelayMs: [300, 1_200],
    itemSense: true,
    // 2026-11-22 (#100, #102; docs/KART-FEEL.md §13.5): watches the wall, and keeps a charge for blue
    wallCare: 0.3,
    teamSave: 0.6,
  },
  // 2026-11-20: the fourth level (expert.ts): what the hard one does, at full throttle, and the
  // track known by heart
  expert: EXPERT_SKILL,
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
