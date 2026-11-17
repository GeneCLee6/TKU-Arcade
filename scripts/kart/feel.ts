// 2026-11-17 (docs/KART-FEEL.md): what the classic feel's techniques are worth. Three drivers race
// three laps on every built-in track, with the classic feel and with the arcade (old) preset: a novice
// (the easy computer kart's hands: no drift techniques, a sloppy line), an average driver (drifts, no
// instant boosts) and an expert (the hard computer kart's hands on a clean line: instant boosts out
// of every drift, taps down the straights, the double, the perfect start, boosts on the straights).
// scripts/kart-feel.ts prints the times and the gaps (npm run kart:feel); tests/kart/feel.test.ts
// pins them.
import type { KartTuning } from '../../shared/kart/physics.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { BOT_SKILLS, type BotSkill } from '../../src/kart/bots/skill.ts'

export const FEEL_TRACKS = ['riverside', 'harbour', 'tamkang', 'oldstreet', 'guanyin'] as const

export const FEEL_DRIVERS: Readonly<Record<'novice' | 'average' | 'expert', BotSkill>> = {
  novice: { ...BOT_SKILLS.easy },
  average: {
    ...BOT_SKILLS.normal,
    lineNoise: 0.1,
    reactionSteps: 3,
    topSpeedShare: 1,
    releaseBoosts: 0,
    startBoost: 0,
  },
  expert: { ...BOT_SKILLS.hard, lineNoise: 0, reactionSteps: 1, startBoost: 1 },
}

export interface FeelResult {
  readonly seconds: number
  readonly dashes: number
  readonly finished: boolean
}

/** One driver, three laps (or 400 s) of a built-in track */
export function feelRace(
  trackId: string,
  skill: BotSkill,
  tuning: KartTuning,
  seed = 7,
): FeelResult {
  const track = raceTrack(trackId)!
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const brain = createBotBrain(skill, track.road, tuning, seed, track.jumps)
  let trial = startTrial(course)
  let dashes = 0
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial.run.kart.miniSeconds
    trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course, tuning)
    if (trial.run.kart.miniSeconds > before) dashes++
  }
  return { seconds: seconds(trial.steps), dashes, finished: trial.phase === 'finished' }
}
