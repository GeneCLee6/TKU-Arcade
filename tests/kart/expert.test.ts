import { describe, expect, it } from 'vitest'
import { ARCADE_TUNING as KART_TUNING, type KartInput } from '../../shared/kart/physics.ts'
import {
  seconds,
  startTrial,
  stepTrial as stepTrialWith,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type TrackJson } from '../../shared/kart/track.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TAMKANG } from '../../shared/kart/tracks/tamkang.ts'
import { createExpert, novice } from './drivers.ts'

// Pinned to the arcade feel (the "arcade (old)" preset, before 2026-11-17): these tests lock what it
// always did. The classic feel, the default since, has its own (tests/kart/classic.test.ts)
const stepTrial = (...[a, b, c, tuning = KART_TUNING, ...rest]: Parameters<typeof stepTrialWith>) =>
  stepTrialWith(a, b, c, tuning, ...rest)

// 2026-11-14 (owner: "the skill ceiling is too low", then "an expert and a novice should differ
// hugely"): what the techniques are worth. Three scripted drivers race three laps on each track:
// drifting beats braking for the corners, and the start boost, the release boosts, the doubles and
// the chains down the straights beat drifting alone by a long way. Then the slide-out and the
// counter-steer, on tracks redrawn with many more corners: the expert counter-steers out of every
// drift before pressing the throttle for the release boost; the average driver never does.

type Driver = (trial: Trial, road: TrackJson['road']) => KartInput

function race(json: TrackJson, driver: Driver) {
  const parsed = parseTrack(json)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  const { track } = parsed
  const course: TrialCourse = {
    ...courseOf(track),
    checkpoints: courseOf(track).checkpoints!,
    road: track.road,
  }
  let trial = startTrial(course)
  let wrong = 0
  let hardHits = 0
  let releases = 0
  let longestChain = 0
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial
    trial = stepTrial(trial, driver(trial, track.road), course)
    if (trial.wrongWay && !before.wrongWay) wrong++
    if (trial.run.hitSpeed >= 4 && before.run.hitSpeed < 4) hardHits++
    if (trial.run.kart.miniSeconds > before.run.kart.miniSeconds) releases++
    longestChain = Math.max(longestChain, trial.run.kart.chain)
  }
  const { doubles } = trial.run.kart
  return { trial, wrong, hardHits, releases, doubles, longestChain, total: seconds(trial.steps) }
}

/**
 * Three laps, in seconds, as measured with the standard tuning: novice, average, expert. Pinned, so
 * that a change to the physics or the tracks that moves them shows up here; when it is meant, write
 * the new times in (and in docs/ARCHITECTURE.md §4.13).
 */
const TIMES: Record<string, readonly [number, number, number]> = {
  // 2026-11-18: the tracks redrawn (docs/ARCHITECTURE.md §4.31)
  riverside: [133.0, 107.8, 91.2],
  harbour: [161.4, 126.1, 102.0],
  tamkang: [171.2, 132.8, 111.2],
}
/** How far a time may move before the test says so, in seconds */
const TOLERANCE = 2.5

describe.each([RIVERSIDE, HARBOUR, TAMKANG])('three laps of $id', (json) => {
  const slow = race(json, novice)
  const average = race(json, createExpert(false))
  const expert = race(json, createExpert(true))

  it('can be finished by all three, never the wrong way, the novice in about two minutes or more', () => {
    for (const run of [slow, average, expert]) {
      expect(run.trial.phase).toBe('finished')
      expect(run.wrong).toBe(0)
      expect(run.trial.run.resets).toBe(0)
    }
    expect(slow.total).toBeGreaterThan(120)
    expect(slow.total).toBeLessThan(185)
  })

  it('takes the times written down', () => {
    const [noviceTime, averageTime, expertTime] = TIMES[json.id]!
    expect(Math.abs(slow.total - noviceTime)).toBeLessThan(TOLERANCE)
    expect(Math.abs(average.total - averageTime)).toBeLessThan(TOLERANCE)
    expect(Math.abs(expert.total - expertTime)).toBeLessThan(TOLERANCE)
  })

  it('pays for skill: the expert takes 25% less time than the novice, 12% less than the average', () => {
    expect(expert.total).toBeLessThan(slow.total * 0.75)
    expect(expert.total).toBeLessThan(average.total * 0.88)
    // Drifting alone already beats braking for the corners
    expect(average.total).toBeLessThan(slow.total * 0.92)
    expect(expert.trial.start).toBe('boost')
    expect(slow.trial.start).toBe('stall')
  })

  it('is the techniques that make the difference: release boosts, doubles and long chains', () => {
    // A landing boost off a jump counts as a release: one a lap on a track with a jump
    expect(average.releases).toBeLessThanOrEqual(3 * (json.jumps?.length ?? 0))
    expect(expert.releases).toBeGreaterThan(60)
    expect(expert.doubles).toBeGreaterThan(30)
    expect(expert.longestChain).toBeGreaterThan(20)
    // The expert all but keeps it off the walls (a hard hit breaks the chain): the recipe is a
    // fixed one on the middle of the road, and the tighter tracks catch it out once in a while
    expect(expert.hardHits).toBeLessThanOrEqual(2)
  })
})
