// 2026-11-21 (owner: "design more challenging levels"; docs/ARCHITECTURE.md §4.60, docs/KART-FEEL.md
// §19): the challenge mode's missions, each one track and one condition, in four chapters that open
// one after the other. What each condition means step by step is in judge.ts; the stars and the
// time limits that hang on a track's pace come from `npm run kart:medals` (medalTable.ts), so that
// a change to the physics is followed by running it again, not by editing numbers here. The names
// and conditions are ours (working titles, docs/KART-WORLD.md §6); none is taken from another game.
import type { KartId } from '../../../shared/kart/karts.ts'
import type { Difficulty } from '../bots/skill.ts'

export const CHAPTER_IDS = ['basics', 'technique', 'master', 'boss'] as const
export type ChapterId = (typeof CHAPTER_IDS)[number]

/** Missions passed in a chapter that open the next one */
export const UNLOCK_PASSES = 4

/**
 * What a mission asks:
 * - finish: the laps, with the rules on top (no crash, no N2O, no reset, a boost start, a limit);
 * - combo, perfects, driftJumps: a count (the combo's length, perfect instant boosts, drift jumps)
 *   reached before the laps are over;
 * - slots: through every slot of the track's guide, in turn, every lap;
 * - branches: down every branch of the track (shared/kart/branches.ts) on every lap;
 * - cover: at least `target` per cent of the race in a boost;
 * - place: against the computer, finish in the first `target`;
 * - elimination: against the computer, the last to finish each lap is out; win the last lap;
 * - chase: one computer kart at its best (the expert), one on one: finish before it
 */
export type MissionKind =
  | 'finish'
  | 'combo'
  | 'perfects'
  | 'driftJumps'
  | 'slots'
  | 'branches'
  | 'cover'
  | 'place'
  | 'elimination'
  | 'chase'

export const RACE_KINDS: ReadonlySet<MissionKind> = new Set(['place', 'elimination', 'chase'])

export interface MissionRules {
  /** A hard hit on a wall (one that ends the combo) fails it */
  readonly noCrash?: boolean
  /** Firing a charge of N2O fails it */
  readonly noN2O?: boolean
  /** A reset (stuck, turned round, off the road) fails it */
  readonly noReset?: boolean
  /** No start boost at GO fails it */
  readonly boostStart?: boolean
}

/**
 * A time limit by the track's pace: its `medal` time (medalTable.ts) for the mission's laps, times
 * `slack`. The judge fails the mission past it
 */
export interface PaceLimit {
  readonly medal: 'bronze' | 'silver' | 'gold'
  readonly slack: number
}

export interface Mission {
  readonly id: string
  readonly chapter: ChapterId
  /** A race track's id, or a challenge track's (shared/kart/tracks/challenge.ts) */
  readonly track: string
  readonly laps: number
  readonly kind: MissionKind
  /** The count, the per cent, or the place */
  readonly target?: number
  readonly limit?: PaceLimit
  readonly rules?: MissionRules
  /** Driven in this vehicle, whatever was picked */
  readonly vehicle?: KartId
  /** In sea fog from start to finish */
  readonly fog?: boolean
  /** Against the computer: how many karts, how good */
  readonly bots?: { readonly count: number; readonly difficulty: Difficulty }
}

const m = (mission: Mission): Mission => mission

export const MISSIONS: readonly Mission[] = [
  // ── Basics ──
  m({ id: 'clean', chapter: 'basics', track: 'oldstreet', laps: 1, kind: 'finish', rules: { noCrash: true } }),
  m({ id: 'combo5', chapter: 'basics', track: 'harbour', laps: 2, kind: 'combo', target: 5 }),
  m({ id: 'perfects', chapter: 'basics', track: 'oldstreet', laps: 1, kind: 'perfects', target: 5 }),
  m({
    id: 'launch',
    chapter: 'basics',
    track: 'tamkang',
    laps: 1,
    kind: 'finish',
    rules: { boostStart: true },
    limit: { medal: 'bronze', slack: 1 },
  }),
  m({
    id: 'podium',
    chapter: 'basics',
    track: 'riverside',
    laps: 2,
    kind: 'place',
    target: 3,
    bots: { count: 5, difficulty: 'normal' },
  }),
  m({
    id: 'bike',
    chapter: 'basics',
    track: 'guanyin',
    laps: 1,
    kind: 'finish',
    vehicle: 'swift',
    limit: { medal: 'bronze', slack: 1 },
  }),
  // ── Technique ──
  m({ id: 'combo10', chapter: 'technique', track: 'mangrove', laps: 3, kind: 'combo', target: 10 }),
  m({ id: 'hops', chapter: 'technique', track: 'wharf', laps: 3, kind: 'driftJumps', target: 5 }),
  m({ id: 'slots', chapter: 'technique', track: 'lanes', laps: 2, kind: 'slots' }),
  m({
    id: 'dry',
    chapter: 'technique',
    track: 'danhai',
    laps: 2,
    kind: 'place',
    target: 3,
    rules: { noN2O: true },
    bots: { count: 5, difficulty: 'hard' },
  }),
  m({ id: 'cover', chapter: 'technique', track: 'fort', laps: 2, kind: 'cover', target: 60 }),
  m({
    id: 'needle',
    chapter: 'technique',
    track: 'ch-needle',
    laps: 2,
    kind: 'finish',
    rules: { noReset: true },
    limit: { medal: 'bronze', slack: 1 },
  }),
  // 2026-11-22 (#103): through Lock Gate Lane's booms and container without touching one
  m({
    id: 'lockgate',
    chapter: 'technique',
    track: 'ch-lock',
    laps: 2,
    kind: 'finish',
    rules: { noCrash: true },
  }),
  // ── Master ──
  m({ id: 'branches', chapter: 'master', track: 'works', laps: 3, kind: 'branches' }),
  m({
    id: 'fog',
    chapter: 'master',
    track: 'harbour',
    laps: 2,
    kind: 'finish',
    fog: true,
    limit: { medal: 'silver', slack: 1.04 },
  }),
  m({
    id: 'hopyard',
    chapter: 'master',
    track: 'ch-hop',
    laps: 2,
    kind: 'finish',
    rules: { noN2O: true },
    limit: { medal: 'gold', slack: 1.04 },
  }),
  m({
    id: 'knockout',
    chapter: 'master',
    track: 'oldstreet',
    laps: 3,
    kind: 'elimination',
    bots: { count: 3, difficulty: 'hard' },
  }),
  m({ id: 'spotless', chapter: 'master', track: 'guanyin', laps: 2, kind: 'finish', rules: { noCrash: true } }),
  m({
    id: 'bikeneedle',
    chapter: 'master',
    track: 'ch-needle',
    laps: 2,
    kind: 'finish',
    vehicle: 'hornet',
    limit: { medal: 'gold', slack: 1.1 },
  }),
  // 2026-11-22 (#103): Lock Gate Lane at the gold pace: every boom timed, every container read
  m({
    id: 'lockrun',
    chapter: 'master',
    track: 'ch-lock',
    laps: 3,
    kind: 'finish',
    rules: { noReset: true },
    limit: { medal: 'gold', slack: 1.04 },
  }),
  // ── Boss ──
  m({
    id: 'chase',
    chapter: 'boss',
    track: 'datun',
    laps: 2,
    kind: 'chase',
    bots: { count: 1, difficulty: 'expert' },
  }),
  m({ id: 'goldlap', chapter: 'boss', track: 'wharf', laps: 1, kind: 'finish', limit: { medal: 'gold', slack: 1.02 } }),
  m({
    id: 'blindneedle',
    chapter: 'boss',
    track: 'ch-needle',
    laps: 3,
    kind: 'finish',
    fog: true,
    rules: { noReset: true },
    limit: { medal: 'gold', slack: 1.04 },
  }),
  m({
    id: 'drywin',
    chapter: 'boss',
    track: 'lanes',
    laps: 3,
    kind: 'place',
    target: 1,
    rules: { noN2O: true },
    bots: { count: 5, difficulty: 'expert' },
  }),
  m({ id: 'combo15', chapter: 'boss', track: 'wharf', laps: 3, kind: 'combo', target: 15 }),
  m({
    id: 'lastone',
    chapter: 'boss',
    track: 'works',
    laps: 5,
    kind: 'elimination',
    bots: { count: 5, difficulty: 'expert' },
  }),
]

export const MISSION_IDS: readonly string[] = MISSIONS.map((one) => one.id)

export const isMissionId = (value: unknown): boolean =>
  typeof value === 'string' && MISSION_IDS.includes(value)

export function missionOf(id: string): Mission {
  const found = MISSIONS.find((one) => one.id === id)
  if (!found) throw new Error(`no mission ${id}`)
  return found
}

export const missionsOf = (chapter: ChapterId): readonly Mission[] =>
  MISSIONS.filter((one) => one.chapter === chapter)

export const isRaceMission = (mission: Mission): boolean => RACE_KINDS.has(mission.kind)

/** The mission after this one, in the list; null after the last */
export function nextMission(id: string): Mission | null {
  const at = MISSION_IDS.indexOf(id)
  return MISSIONS[at + 1] ?? null
}
