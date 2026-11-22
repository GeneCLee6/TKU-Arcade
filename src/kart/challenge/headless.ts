// 2026-11-21 (docs/ARCHITECTURE.md §4.60): a challenge run without a screen, step by step as the
// page runs it: a mission on its own with a driver's hands on the kart (src/kart/bots/drivers.ts),
// and the time trial of a track for its medals. `npm run kart:medals` and the tests use it. Pure.
import { forkAt } from '../../../shared/kart/branches.ts'
import { onPlatform, trackLedges } from '../../../shared/kart/ledges.ts'
import { GHOST_STEPS, ghostAt, recordStep, startRecording, type Ghost } from '../../../shared/kart/ghost.ts'
import { applyKart } from '../../../shared/kart/karts.ts'
import {
  DEFAULT_RULES,
  KART_TUNING,
  STEP_SECONDS,
  type KartInput,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import { startTrial, stepTrial, type Trial, type TrialCourse } from '../../../shared/kart/timeTrial.ts'
import { courseOf, recordKey, type Track } from '../../../shared/kart/track.ts'
import { challengeTrack, isChallengeTrackId } from '../../../shared/kart/tracks/challenge.ts'
import { trackGuide } from '../../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import { gateLines } from '../school/judge.ts'
import { judgeStep, sampleOf, startJudge, type Judge, type JudgeContext } from './judge.ts'
import { missionLimit, missionStars, starsFor, type MedalTable } from './medals.ts'
import { MEDAL_TABLE } from './medalTable.ts'
import type { Mission } from './missions.ts'

/** A mission's track: a race track or one of the challenge tracks */
export function missionTrack(id: string): Track {
  const track = isChallengeTrackId(id) ? challengeTrack(id) : raceTrack(id)
  if (!track) throw new Error(`no track ${id}`)
  return track
}

/** The tuning a mission is driven with: the standard one, in its own vehicle if it names one */
export const missionTuning = (mission: Mission, base: KartTuning = KART_TUNING): KartTuning =>
  mission.vehicle ? applyKart(base, mission.vehicle) : base

/** What a mission is judged with on its track */
export function missionContext(
  mission: Mission,
  track: Track,
  tuning: KartTuning,
  table: MedalTable = MEDAL_TABLE,
): JudgeContext {
  const limit = missionLimit(mission, table)
  return {
    tuning,
    ...(limit !== undefined ? { limit } : {}),
    ...(mission.kind === 'slots'
      ? { gates: gateLines(track.road, trackGuide(track.id)?.slots ?? []) }
      : {}),
    // A high platform (2026-11-23) is a branch of its own mission, not of this one; the tracks lay
    // theirs after their other branches
    ...(mission.kind === 'branches'
      ? { forkCount: (track.forks ?? []).filter((fork) => fork.rise === undefined).length }
      : {}),
    ...(mission.kind === 'platforms' ? { platforms: trackLedges(track).map((ledge) => ledge.fork) } : {}),
  }
}

/** Which high platform a kart is up on (2026-11-23): a function of the kart, -1 none */
export function platformFinder(track: Track): (kart: { x: number; z: number; y?: number }) => number {
  const ledges = trackLedges(track)
  if (ledges.length === 0) return () => -1
  return (kart) => onPlatform(track, ledges, kart)
}

/** Where a kart is among a track's branches: a function of its place, -1 the main road */
export function forkFinder(track: Track): (x: number, z: number) => number {
  const paths = (track.forks ?? []).map((fork) => fork.path)
  if (paths.length === 0) return () => -1
  return (x, z) => forkAt(track.road, paths, x, z)
}

/** A track's time trial course for `laps` laps */
export function trialCourse(track: Track, laps = track.laps): TrialCourse {
  const plain = courseOf(track)
  return {
    ...plain,
    checkpoints: { ...plain.checkpoints!, laps },
    road: track.road,
  }
}

export interface MissionRun {
  readonly passed: boolean
  readonly stars: 0 | 1 | 2 | 3
  /** Seconds from GO to the pass */
  readonly seconds: number
  readonly judge: Judge
}

/** Hands with the N2O key never pressed (a mission that forbids it) */
const withoutN2O =
  (drive: (trial: Trial) => KartInput) =>
  (trial: Trial): KartInput => ({ ...drive(trial), boost: false })

/** Drives a mission on its own (not one against the computer) with `makeDriver`'s hands, once */
export function runMission(
  mission: Mission,
  makeDriver: (track: Track, tuning: KartTuning) => (trial: Trial) => KartInput,
  base: KartTuning = KART_TUNING,
  table: MedalTable = MEDAL_TABLE,
): MissionRun {
  const track = missionTrack(mission.track)
  const tuning = missionTuning(mission, base)
  const course = trialCourse(track, mission.laps)
  const context = missionContext(mission, track, tuning, table)
  const findFork = forkFinder(track)
  const findPlatform = platformFinder(track)
  const hands = makeDriver(track, tuning)
  const drive = mission.rules?.noN2O ? withoutN2O(hands) : hands
  const cap = Math.round(((context.limit ?? 120 * mission.laps) + 10) / STEP_SECONDS)
  let judge = startJudge()
  let trial = startTrial(course)
  for (let step = 0; step < cap && trial.phase !== 'finished'; step++) {
    const before = trial.run
    const input = drive(trial)
    trial = stepTrial(trial, input, course, tuning, DEFAULT_RULES)
    const sample = sampleOf(
      {
        before: before.kart,
        after: trial.run.kart,
        input,
        trial,
        hit: trial.run.hitSpeed,
        hitBefore: before.hitSpeed,
      },
      findFork,
      findPlatform,
    )
    if (sample) judge = judgeStep(mission, judge, sample, context)
    if (judge.done || judge.failed) break
  }
  const seconds = (judge.doneAt ?? 0) * STEP_SECONDS
  return {
    passed: judge.done,
    stars: judge.done ? starsFor(missionStars(mission, table), seconds) : 0,
    seconds,
    judge,
  }
}

/**
 * A ghost of `makeDriver`'s hands round `track` (its own laps), played back so that it finishes in
 * exactly `seconds`: the target to race beside in the time trial for a medal. The line is the
 * driver's; the pace is the medal's
 */
export function targetGhost(
  track: Track,
  seconds: number,
  makeDriver: (track: Track, tuning: KartTuning) => (trial: Trial) => KartInput,
  tuning: KartTuning = KART_TUNING,
): Ghost | null {
  const course = trialCourse(track)
  const drive = makeDriver(track, tuning)
  const recorder = startRecording(recordKey(track))
  let trial = startTrial(course)
  for (let step = 0; step < 400 / STEP_SECONDS && trial.phase !== 'finished'; step++) {
    const was = trial.phase
    trial = stepTrial(trial, drive(trial), course, tuning, DEFAULT_RULES)
    if (trial.phase !== 'countdown' && (was === 'racing' || trial.phase === 'racing')) {
      recordStep(recorder, trial.steps, trial.run.kart)
    }
  }
  if (trial.phase !== 'finished') return null
  const driven: Ghost = {
    track: recorder.track,
    format: 1,
    total: trial.steps,
    laps: [...trial.laps],
    samples: recorder.samples,
  }
  return retimed(driven, Math.round(seconds / STEP_SECONDS))
}

/** A ghost played back faster or slower, to finish in `total` steps */
export function retimed(ghost: Ghost, total: number): Ghost {
  const share = ghost.total / total
  const samples: number[] = []
  for (let step = 0; step <= total; step += GHOST_STEPS) {
    const pose = ghostAt(ghost, step * share)
    if (!pose) break
    samples.push(
      Math.round(pose.x * 100) / 100 + 0,
      Math.round(pose.z * 100) / 100 + 0,
      Math.round(pose.heading * 1000) / 1000 + 0,
    )
  }
  return {
    track: ghost.track,
    format: 1,
    total,
    laps: ghost.laps.map((lap) => Math.max(1, Math.round(lap / share))),
    samples,
  }
}
