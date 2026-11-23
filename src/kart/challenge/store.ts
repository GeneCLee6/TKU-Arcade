// 2026-11-21 (docs/ARCHITECTURE.md §4.60): what the challenge mode keeps in this browser: each
// track's best medal and best time, each mission's best stars. localStorage through lib/storage.ts,
// which never throws (blocked, it all lasts until the page closes); a stored value that is not
// what this file wrote reads as nothing stored.
import { readStored, writeStored } from '../../lib/storage.ts'
import { betterMedal, isMedalId, type MedalId } from './medals.ts'
import {
  CHAPTER_IDS,
  isMissionId,
  MISSIONS,
  missionsOf,
  UNLOCK_PASSES,
  type ChapterId,
} from './missions.ts'

export const CHALLENGE_KEY = 'tku-arcade.kart.challenge'

export interface ChallengeProgress {
  /** Each track's best medal */
  readonly medals: Readonly<Record<string, MedalId>>
  /** Each track's best time for a medal, seconds */
  readonly best: Readonly<Record<string, number>>
  /** Each mission's best stars */
  readonly stars: Readonly<Record<string, 1 | 2 | 3>>
}

export const EMPTY_PROGRESS: ChallengeProgress = { medals: {}, best: {}, stars: {} }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Progress from its JSON; anything that is not right is left out */
export function parseProgress(stored: string | null): ChallengeProgress {
  if (!stored) return EMPTY_PROGRESS
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return EMPTY_PROGRESS
  }
  if (!isRecord(value)) return EMPTY_PROGRESS
  const medals: Record<string, MedalId> = {}
  const best: Record<string, number> = {}
  const stars: Record<string, 1 | 2 | 3> = {}
  const track = (id: string) => /^[a-z][a-z0-9-]{0,31}$/.test(id)
  if (isRecord(value.medals)) {
    for (const [id, medal] of Object.entries(value.medals)) {
      if (track(id) && isMedalId(medal)) medals[id] = medal
    }
  }
  if (isRecord(value.best)) {
    for (const [id, seconds] of Object.entries(value.best)) {
      if (track(id) && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
        best[id] = seconds
      }
    }
  }
  if (isRecord(value.stars)) {
    for (const [id, count] of Object.entries(value.stars)) {
      if (isMissionId(id) && (count === 1 || count === 2 || count === 3)) stars[id] = count
    }
  }
  return { medals, best, stars }
}

export const loadProgress = (): ChallengeProgress => parseProgress(readStored(CHALLENGE_KEY))

const save = (progress: ChallengeProgress): ChallengeProgress => {
  writeStored(CHALLENGE_KEY, JSON.stringify(progress))
  // e11-t06: a medal or a mission may unlock an achievement
  // (src/achievements/kartLists.ts KART_PROGRESS_EVENT: nothing to import)
  window.dispatchEvent(new Event('tku-arcade:kart-progress'))
  return progress
}

/** A time trial for a medal: the best medal and the best time kept */
export function withRun(
  progress: ChallengeProgress,
  track: string,
  seconds: number,
  medal: MedalId | null,
): ChallengeProgress {
  const had = progress.best[track]
  const best = had === undefined || seconds < had ? { ...progress.best, [track]: seconds } : progress.best
  const kept = betterMedal(progress.medals[track], medal)
  const medals = kept ? { ...progress.medals, [track]: kept } : progress.medals
  return { ...progress, best, medals }
}

/** A mission passed: the best stars kept */
export function withStars(
  progress: ChallengeProgress,
  mission: string,
  stars: 1 | 2 | 3,
): ChallengeProgress {
  const had = progress.stars[mission]
  if (had !== undefined && had >= stars) return progress
  return { ...progress, stars: { ...progress.stars, [mission]: stars } }
}

export const saveRun = (track: string, seconds: number, medal: MedalId | null): ChallengeProgress =>
  save(withRun(loadProgress(), track, seconds, medal))

export const saveStars = (mission: string, stars: 1 | 2 | 3): ChallengeProgress =>
  save(withStars(loadProgress(), mission, stars))

/** Missions passed in a chapter */
export const passesIn = (progress: ChallengeProgress, chapter: ChapterId): number =>
  missionsOf(chapter).filter((one) => progress.stars[one.id] !== undefined).length

/** Whether a chapter is open: the first always, each other once UNLOCK_PASSES of the one before are passed */
export function chapterOpen(progress: ChallengeProgress, chapter: ChapterId): boolean {
  const at = CHAPTER_IDS.indexOf(chapter)
  if (at <= 0) return true
  const before = CHAPTER_IDS[at - 1]!
  return chapterOpen(progress, before) && passesIn(progress, before) >= UNLOCK_PASSES
}

/** Stars earned over every mission */
export const totalStars = (progress: ChallengeProgress): number =>
  MISSIONS.reduce((sum, one) => sum + (progress.stars[one.id] ?? 0), 0)
