import { describe, expect, it } from 'vitest'
import type { KartInput } from '../../shared/kart/physics.ts'
import {
  seconds,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type TrackJson } from '../../shared/kart/track.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TAMKANG } from '../../shared/kart/tracks/tamkang.ts'
import { createExpert, novice } from './drivers.ts'

// 2026-11-14 (owner: "the skill ceiling is too low"): what the techniques are worth. Three scripted
// drivers race three laps on each track: drifting beats braking for the corners, and the start
// boost and the release boosts beat drifting alone

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
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial
    trial = stepTrial(trial, driver(trial, track.road), course)
    if (trial.wrongWay && !before.wrongWay) wrong++
  }
  return { trial, wrong, total: seconds(trial.steps) }
}

describe.each([RIVERSIDE, HARBOUR, TAMKANG])('three laps of $id', (json) => {
  const slow = race(json, novice)
  const average = race(json, createExpert(false))
  const expert = race(json, createExpert(true))

  it('can be finished by all three drivers, never the wrong way, in two to three minutes', () => {
    for (const run of [slow, average, expert]) {
      expect(run.trial.phase).toBe('finished')
      expect(run.wrong).toBe(0)
    }
    expect(slow.total).toBeLessThan(180)
    expect(expert.total).toBeGreaterThan(100)
  })

  it('pays for skill: the expert is at least 10% quicker than the novice, and beats the average', () => {
    expect(expert.total).toBeLessThan(slow.total * 0.9)
    expect(expert.total).toBeLessThan(average.total)
    expect(expert.trial.start).toBe('boost')
    expect(slow.trial.start).toBe('stall')
  })
})
