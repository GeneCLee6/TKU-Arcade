// 2026-11-21 (docs/ARCHITECTURE.md §4.59, docs/KART-FEEL.md §19): the time trial's medals, and what
// a mission's stars and time limit come to on its track. The times are measured, not chosen:
// `npm run kart:medals` (scripts/kart-medals.ts) races the drivers of `npm run kart:feel` (src/kart/
// bots/drivers.ts: the average driver, the expert who drives well, the master who knows the track
// by heart) on every track and writes medalTable.ts with `calibrate` below. Run it again whenever
// the physics or a track changes. Pure.
import { MEDAL_TABLE, MISSION_PACE } from './medalTable.ts'
import type { Mission } from './missions.ts'

export const MEDAL_IDS = ['bronze', 'silver', 'gold', 'platinum'] as const
export type MedalId = (typeof MEDAL_IDS)[number]

export const isMedalId = (value: unknown): value is MedalId =>
  typeof value === 'string' && (MEDAL_IDS as readonly string[]).includes(value)

/** A track's targets, seconds for its own laps, and how many laps that is */
export interface MedalTimes {
  readonly laps: number
  readonly bronze: number
  readonly silver: number
  readonly gold: number
  /** Hidden until gold is won */
  readonly platinum: number
}

/** The races a track's medals are measured from: each driver's seconds, one per seed */
export interface MedalRuns {
  readonly average: readonly number[]
  readonly expert: readonly number[]
  /** The master's; on a track without a guide the master is the expert (the same races) */
  readonly master: readonly number[]
}

/** How much quicker than the top driver's best the hidden medal is */
export const PLATINUM_SHARE = 0.98

const up = (seconds: number) => Math.ceil(seconds * 10 - 1e-6) / 10
const down = (seconds: number) => Math.floor(seconds * 10 + 1e-6) / 10

/**
 * The medals from the races: gold within reach of the top driver in every race (the quicker of the
 * expert and the master), silver of the expert's every race, bronze of the average driver's; each
 * at least a few per cent apart from the one above, and platinum 2% under the top driver's best.
 * Rounded to a tenth, up (down for platinum)
 */
export function calibrate(runs: MedalRuns, laps: number): MedalTimes {
  const top = runs.expert.map((expert, at) => Math.min(expert, runs.master[at] ?? expert))
  const gold = up(Math.max(...top))
  const silver = up(Math.max(Math.max(...runs.expert) * 1.01, gold * 1.04))
  const bronze = up(Math.max(Math.max(...runs.average) * 1.01, silver * 1.06))
  return { laps, bronze, silver, gold, platinum: down(Math.min(...top) * PLATINUM_SHARE) }
}

/** The best medal a time earns; null for none */
export function medalFor(times: MedalTimes, seconds: number): MedalId | null {
  for (const medal of ['platinum', 'gold', 'silver', 'bronze'] as const) {
    if (seconds <= times[medal] + 1e-9) return medal
  }
  return null
}

export const medalRank = (medal: MedalId | null | undefined): number =>
  medal ? MEDAL_IDS.indexOf(medal) + 1 : 0

/** The better of two medals */
export const betterMedal = (a: MedalId | undefined, b: MedalId | null): MedalId | undefined =>
  medalRank(b) > medalRank(a) ? (b ?? undefined) : a

/** Medal times by track (medalTable.ts's, or one being measured) */
export type MedalTable = Readonly<Record<string, MedalTimes>>

/** A track's medal times; null for a track that has none */
export const medalTimes = (track: string, table: MedalTable = MEDAL_TABLE): MedalTimes | null =>
  Object.hasOwn(table, track) ? table[track]! : null

/** The next medal to aim for after `had` (platinum once gold is won), null after platinum */
export function nextMedal(had: MedalId | undefined): MedalId | null {
  const at = medalRank(had)
  return MEDAL_IDS[at] ?? null
}

/** A medal time for `laps` of the track instead of its own */
function scaled(
  mission: Mission,
  medal: 'bronze' | 'silver' | 'gold',
  table: MedalTable,
): number | null {
  const times = medalTimes(mission.track, table)
  return times ? (times[medal] * mission.laps) / times.laps : null
}

/** A mission's time limit, seconds from GO; undefined for none */
export function missionLimit(
  mission: Mission,
  table: MedalTable = MEDAL_TABLE,
): number | undefined {
  if (!mission.limit) return undefined
  const base = scaled(mission, mission.limit.medal, table)
  return base === null ? undefined : up(base * mission.limit.slack)
}

/** Three stars at or under `three` seconds from GO to the pass, two at or under `two` */
export interface StarTimes {
  readonly three: number
  readonly two: number
}

/** How much slower than the master's pass three stars and two stars allow */
const THREE_SLACK = 1.12
const TWO_SLACK = 1.35

/**
 * A mission's stars: from the master's own pass where the master passes it (medalTable.ts's
 * MISSION_PACE), otherwise from the track's silver and bronze for the mission's laps; under a time
 * limit, each a margin under it
 */
export function missionStars(
  mission: Mission,
  table: MedalTable = MEDAL_TABLE,
  paces: Readonly<Record<string, number>> = MISSION_PACE,
): StarTimes {
  const pace = Object.hasOwn(paces, mission.id) ? paces[mission.id]! : null
  let three = pace !== null ? up(pace * THREE_SLACK) : up(scaled(mission, 'silver', table) ?? 60)
  let two = pace !== null ? up(pace * TWO_SLACK) : up(scaled(mission, 'bronze', table) ?? 90)
  const limit = missionLimit(mission, table)
  if (limit !== undefined) {
    // Under a limit, a pass earns one star; two and three ask for a margin under it
    two = Math.min(two, up(limit * 0.97))
    three = Math.min(three, up(two * 0.95))
  }
  return { three, two }
}

/** The stars a pass `seconds` after GO earns */
export function starsFor(stars: StarTimes, seconds: number): 1 | 2 | 3 {
  return seconds <= stars.three + 1e-9 ? 3 : seconds <= stars.two + 1e-9 ? 2 : 1
}
