// 2026-11-20 (docs/ARCHITECTURE.md §4.50): a lesson of the driving school run without a screen,
// step by step as the page runs it, with a driver's hands on the kart (src/kart/bots/drivers.ts).
// `npm run kart:feel -- --school` and the tests show with it that the master driver passes every
// lesson, and how fast: the stars' numbers (lessons.ts) are set from that. Pure.
import { courseOf } from '../../../shared/kart/track.ts'
import {
  DEFAULT_RULES,
  STEP_SECONDS,
  type KartInput,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import { startTrial, stepTrial, type Trial, type TrialCourse } from '../../../shared/kart/timeTrial.ts'
import { trackGuide } from '../../../shared/kart/tracks/guides.ts'
import type { Track } from '../../../shared/kart/track.ts'
import {
  gateLines,
  judgeStep,
  nextTry,
  sampleOf,
  starsFor,
  startJudge,
  type Judge,
  type JudgeContext,
} from './judge.ts'
import { LESSONS, type LessonId } from './lessons.ts'
import { schoolTrack } from '../../../shared/kart/tracks/school.ts'

/** How many of a lesson's gates there are: the lanes' three yards (the first three of its slots) */
export const SCHOOL_GATES = 3

/** What a lesson is judged with on its track */
export function lessonContext(id: LessonId, track: Track, tuning: KartTuning): JudgeContext {
  if (id !== 'gap') return { tuning }
  const slots = trackGuide(track.id)?.slots.slice(0, SCHOOL_GATES) ?? []
  return { tuning, gates: gateLines(track.road, slots) }
}

export interface LessonRun {
  readonly passed: boolean
  readonly stars: 0 | 1 | 2 | 3
  /** Seconds from GO to the pass, in the try that passed */
  readonly seconds: number
  readonly judge: Judge
}

/**
 * Drives `id` with `makeDriver`'s hands (a fresh driver for each try) until it is passed, failed,
 * or out of tries
 */
export function runLesson(
  id: LessonId,
  makeDriver: (track: Track) => (trial: Trial) => KartInput,
  tuning: KartTuning,
  maxTries = 5,
): LessonRun {
  const lesson = LESSONS[id]
  const track = schoolTrack(lesson.track)
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const context = lessonContext(id, track, tuning)
  const cap = Math.round(((lesson.limit ?? 60) + 10) / STEP_SECONDS)
  let judge = startJudge()
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const drive = makeDriver(track)
    let trial = startTrial(course)
    for (let step = 0; step < cap && trial.phase !== 'finished'; step++) {
      const before = trial.run
      const input = drive(trial)
      trial = stepTrial(trial, input, course, tuning, DEFAULT_RULES)
      const sample = sampleOf({
        before: before.kart,
        after: trial.run.kart,
        input,
        trial,
        hit: trial.run.hitSpeed,
        hitBefore: before.hitSpeed,
      })
      if (sample) judge = judgeStep(lesson, judge, sample, context)
      if (judge.done || judge.failed || judge.tryOver) break
    }
    if (judge.done || judge.failed || !lesson.tries) break
    judge = nextTry(judge)
  }
  return {
    passed: judge.done,
    stars: starsFor(lesson, judge),
    seconds: (judge.doneAt ?? 0) * STEP_SECONDS,
    judge,
  }
}
