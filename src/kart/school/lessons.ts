// 2026-11-20 (docs/ARCHITECTURE.md §4.50, docs/KART-FEEL.md §17): the driving school's lessons, one
// technique each, in the order they build on each other. Each says where it is driven, what passes
// it, how long it may take and how its stars are given. What is judged, step by step, is in
// judge.ts. The numbers of the stars come from the master driver (`npm run kart:feel -- --school`):
// three stars is within reach of a good player, one is any pass.
import type { SchoolTrackId } from '../../../shared/kart/tracks/school.ts'

export const LESSON_IDS = [
  'drive',
  'drift',
  'dash',
  'perfect',
  'combo',
  'n2o',
  'start',
  'jump',
  'gap',
  'final',
] as const

export type LessonId = (typeof LESSON_IDS)[number]

/**
 * How the stars are given: by the seconds from GO to the pass, by the runs it took (a lesson whose
 * every run is one try: the start, the jump, the gates), or by the crashes on the way
 */
export type StarsBy = 'seconds' | 'attempts' | 'hits'

export interface Lesson {
  readonly id: LessonId
  readonly track: SchoolTrackId
  /** What the count must reach */
  readonly target: number
  /**
   * Seconds from GO; past it the lesson is not passed (`final`: the two laps must be done in it).
   * None for a lesson of tries
   */
  readonly limit?: number
  /** Three stars at or under `three`, two at or under `two`, one for any pass */
  readonly stars: { readonly by: StarsBy; readonly three: number; readonly two: number }
  /** Every run is one try: a try that fails is over, and the run starts again from the grid */
  readonly tries?: boolean
}

export const LESSONS: Readonly<Record<LessonId, Lesson>> = {
  drive: { id: 'drive', track: 'yard', target: 1, limit: 120, stars: { by: 'hits', three: 0, two: 2 } },
  drift: {
    id: 'drift',
    track: 'yard',
    target: 3,
    limit: 120,
    stars: { by: 'seconds', three: 15, two: 30 },
  },
  dash: {
    id: 'dash',
    track: 'yard',
    target: 3,
    limit: 150,
    stars: { by: 'seconds', three: 16, two: 35 },
  },
  perfect: {
    id: 'perfect',
    track: 'yard',
    target: 3,
    limit: 180,
    stars: { by: 'seconds', three: 20, two: 60 },
  },
  combo: {
    id: 'combo',
    track: 'yard',
    target: 3,
    limit: 180,
    stars: { by: 'seconds', three: 20, two: 50 },
  },
  n2o: { id: 'n2o', track: 'yard', target: 3, limit: 240, stars: { by: 'seconds', three: 20, two: 45 } },
  start: {
    id: 'start',
    track: 'yard',
    target: 1,
    tries: true,
    stars: { by: 'attempts', three: 1, two: 3 },
  },
  jump: { id: 'jump', track: 'wharf', target: 1, tries: true, stars: { by: 'attempts', three: 1, two: 3 } },
  gap: { id: 'gap', track: 'lanes', target: 3, tries: true, stars: { by: 'attempts', three: 1, two: 3 } },
  final: {
    id: 'final',
    track: 'test',
    target: 2,
    limit: 50,
    stars: { by: 'seconds', three: 28, two: 36 },
  },
}

export const isLessonId = (value: unknown): value is LessonId =>
  typeof value === 'string' && (LESSON_IDS as readonly string[]).includes(value)

/** The lesson after this one; null after the last */
export function nextLesson(id: LessonId): LessonId | null {
  const at = LESSON_IDS.indexOf(id)
  return LESSON_IDS[at + 1] ?? null
}
