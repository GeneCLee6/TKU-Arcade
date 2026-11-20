// 2026-11-20 (docs/ARCHITECTURE.md §4.50): what the driving school keeps in this browser: each
// lesson's best stars (or that it was skipped), whether the tips during a race are on, which tips
// have been given (each is given once), and whether /kart's suggestion to start at the school was
// answered. localStorage through lib/storage.ts, which never throws: blocked, it all lasts until
// the page closes. A stored value that is not what this file wrote reads as nothing stored.
import { readStored, writeStored } from '../../lib/storage.ts'
import { isLessonId, LESSON_IDS, type LessonId } from './lessons.ts'

const PROGRESS_KEY = 'tku-arcade.kart.school'
const COACH_KEY = 'tku-arcade.kart.coach'
const TIPS_KEY = 'tku-arcade.kart.tips'
const INVITE_KEY = 'tku-arcade.kart.schoolInvite'

/** A lesson's best: 1 to 3 stars, or 0 for skipped */
export type Progress = Readonly<Partial<Record<LessonId, 0 | 1 | 2 | 3>>>

/** Reads a progress object from its JSON; anything else is no progress */
export function parseProgress(stored: string | null): Progress {
  if (!stored) return {}
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return {}
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const progress: Partial<Record<LessonId, 0 | 1 | 2 | 3>> = {}
  for (const [id, stars] of Object.entries(value)) {
    if (isLessonId(id) && (stars === 0 || stars === 1 || stars === 2 || stars === 3)) {
      progress[id] = stars
    }
  }
  return progress
}

export const loadProgress = (): Progress => parseProgress(readStored(PROGRESS_KEY))

/** The progress with a lesson's result: the best stars kept; a skip never lowers a pass */
export function withResult(progress: Progress, id: LessonId, stars: 0 | 1 | 2 | 3): Progress {
  const had = progress[id]
  if (had !== undefined && had >= stars) return progress
  return { ...progress, [id]: stars }
}

export function saveResult(id: LessonId, stars: 0 | 1 | 2 | 3): Progress {
  const next = withResult(loadProgress(), id, stars)
  writeStored(PROGRESS_KEY, JSON.stringify(next))
  return next
}

/** The first lesson neither passed nor skipped; the first of all once every one is */
export function firstOpen(progress: Progress): LessonId {
  return LESSON_IDS.find((id) => progress[id] === undefined) ?? LESSON_IDS[0]
}

/** Stars earned over every lesson */
export const totalStars = (progress: Progress): number =>
  LESSON_IDS.reduce((sum, id) => sum + (progress[id] ?? 0), 0)

/** The tips during a race: on unless turned off */
export const loadCoachOn = (): boolean => readStored(COACH_KEY) !== 'off'
export const saveCoachOn = (on: boolean): void => writeStored(COACH_KEY, on ? 'on' : 'off')

export function parseTips(stored: string | null): ReadonlySet<string> {
  if (!stored) return new Set()
  try {
    const value: unknown = JSON.parse(stored)
    return new Set(Array.isArray(value) ? value.filter((one) => typeof one === 'string') : [])
  } catch {
    return new Set()
  }
}

export const loadTipsSeen = (): ReadonlySet<string> => parseTips(readStored(TIPS_KEY))

export function saveTipSeen(tip: string): void {
  const seen = loadTipsSeen()
  if (seen.has(tip)) return
  writeStored(TIPS_KEY, JSON.stringify([...seen, tip]))
}

/** Whether to suggest the school on /kart: never once answered, nor once a lesson is done */
export const shouldInvite = (): boolean =>
  readStored(INVITE_KEY) === null && Object.keys(loadProgress()).length === 0

export const answerInvite = (): void => writeStored(INVITE_KEY, 'answered')
