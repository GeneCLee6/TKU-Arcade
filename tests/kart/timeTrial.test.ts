import { describe, expect, it } from 'vitest'
import { KART_TUNING, kartSpeed, STEP_SECONDS, type KartInput } from '../../shared/kart/physics.ts'
import {
  COUNTDOWN_SECONDS,
  bestLap,
  currentLap,
  formatTime,
  goingBackwards,
  lapSteps,
  resetTrial,
  seconds,
  startFrom,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type Track, type TrackJson } from '../../shared/kart/track.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { alongRoad, sharpCorners } from './trackShape.ts'

// e8-t05a, e8-t10 (AC-8.4): the first track and the time trial on it

const load = (json: TrackJson): Track => {
  const parsed = parseTrack(json)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  return parsed.track
}

const trialCourse = (track: Track): TrialCourse => ({
  ...courseOf(track),
  checkpoints: courseOf(track).checkpoints!,
  road: track.road,
})

/** Steers at the road a few points ahead, slowing for bends: enough to go round, not to race */
function autopilot(trial: Trial, road: readonly { x: number; z: number }[], ahead = 4): KartInput {
  const { kart } = trial.run
  let nearest = 0
  let best = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - kart.x) ** 2 + (point.z - kart.z) ** 2
    if (distance < best) {
      best = distance
      nearest = index
    }
  })
  const target = road[(nearest + ahead) % road.length]!
  let turn = Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.35
  return {
    throttle: !(sharp && speed > 14),
    brake: sharp && speed > 20,
    steer: Math.max(-1, Math.min(1, turn * 3)),
    drift: false,
    boost: false,
  }
}

function race(json: TrackJson, limitSeconds: number) {
  const track = load(json)
  const course = trialCourse(track)
  let trial = startTrial(course)
  let steps = 0
  let wrongWarnings = 0
  while (trial.phase !== 'finished' && steps < limitSeconds / STEP_SECONDS) {
    const before = trial
    trial = stepTrial(trial, autopilot(trial, track.road), course)
    if (trial.wrongWay && !before.wrongWay) wrongWarnings++
    steps++
  }
  return { track, trial, wrongWarnings }
}

describe('the time trial', () => {
  it('holds the car on the grid for the countdown, whatever is pressed', () => {
    const track = load(TEST_OVAL)
    const course = trialCourse(track)
    let trial = startTrial(course)
    const floored: KartInput = { throttle: true, brake: false, steer: 1, drift: true, boost: true }
    for (let step = 0; step < COUNTDOWN_SECONDS / STEP_SECONDS - 1; step++)
      trial = stepTrial(trial, floored, course)
    expect(trial.phase).toBe('countdown')
    expect(trial.run.kart).toMatchObject({ x: track.grid[0]!.x, z: track.grid[0]!.z, vx: 0, vz: 0 })
    trial = stepTrial(trial, floored, course)
    expect(trial.phase).toBe('racing')
    expect(trial.steps).toBe(0)
    trial = stepTrial(trial, floored, course)
    expect(trial.steps).toBe(1)
  })

  describe('the start boost', () => {
    const track = load(TEST_OVAL)
    const course = trialCourse(track)
    const idle: KartInput = { throttle: false, brake: false, steer: 0, drift: false, boost: false }
    const gas: KartInput = { ...idle, throttle: true }
    /** Counts down, pressing the throttle once `pressAt` seconds are left (null: never) */
    const countdownWith = (pressAt: number | null) => {
      let trial = startTrial(course)
      while (trial.phase === 'countdown') {
        const pressing = pressAt !== null && trial.countdown <= pressAt + 1e-9
        trial = stepTrial(trial, pressing ? gas : idle, course)
      }
      return trial
    }

    it('boosts off the line when the throttle goes down just before GO', () => {
      const trial = countdownWith(KART_TUNING.startWindow - 0.1)
      expect(trial.start).toBe('boost')
      expect(trial.run.kart.boostSeconds).toBeCloseTo(KART_TUNING.startBoostDuration, 9)
      // A second in, well ahead of a plain start
      let boosted = trial
      let plain = countdownWith(null)
      expect(plain.start).toBe('none')
      for (let step = 0; step < 60; step++) {
        boosted = stepTrial(boosted, gas, course)
        plain = stepTrial(plain, gas, course)
      }
      expect(kartSpeed(boosted.run.kart)).toBeGreaterThan(kartSpeed(plain.run.kart) + 10)
    })

    it('stalls instead when the throttle is held from too early', () => {
      const trial = countdownWith(KART_TUNING.startWindow + 0.3)
      expect(trial.start).toBe('stall')
      expect(trial.run.kart.boostSeconds).toBe(0)
      let stalled = trial
      let plain = countdownWith(null)
      for (let step = 0; step < 30; step++) {
        stalled = stepTrial(stalled, gas, course)
        plain = stepTrial(plain, gas, course)
      }
      expect(kartSpeed(stalled.run.kart)).toBeLessThan(kartSpeed(plain.run.kart) / 2)
    })

    it('forgives an early press let go, if pressed again inside the window', () => {
      let trial = startTrial(course)
      while (trial.phase === 'countdown') {
        const left = trial.countdown
        const pressing = left > 2 || left <= KART_TUNING.startWindow - 0.05
        trial = stepTrial(trial, pressing ? gas : idle, course)
      }
      expect(trial.start).toBe('boost')
      expect(startFrom(null, KART_TUNING)).toBe('none')
      expect(startFrom(KART_TUNING.startWindow, KART_TUNING)).toBe('boost')
      expect(startFrom(KART_TUNING.startWindow + 0.05, KART_TUNING)).toBe('stall')
    })
  })

  it('times three laps on the test oval, from GO, adding up to the total', () => {
    const { trial } = race(TEST_OVAL, 240)
    expect(trial.phase).toBe('finished')
    expect(trial.laps).toHaveLength(3)
    expect(trial.laps.reduce((sum, lap) => sum + lap, 0) + lapSteps(trial)).toBe(trial.steps)
    // Lap 1 has the run-up from the grid; the others are about the same as each other
    const [, second, third] = trial.laps
    expect(Math.abs(second! - third!) * STEP_SECONDS).toBeLessThan(1.5)
    expect(bestLap(trial)).toBe(Math.min(...trial.laps))
    expect(currentLap(trial)).toBe(3)
  })

  it('stops counting once finished', () => {
    const { trial, track } = race(TEST_OVAL, 240)
    const course = trialCourse(track)
    let after = trial
    for (let step = 0; step < 600; step++) {
      after = stepTrial(
        after,
        { throttle: true, brake: false, steer: 0, drift: false, boost: false },
        course,
      )
    }
    expect(after.laps).toEqual(trial.laps)
    expect(after.steps).toBe(trial.steps)
  })

  it('warns about the wrong way, and the clock runs on through a reset', () => {
    const track = load(TEST_OVAL)
    // Going down the start straight, which is driven up
    expect(goingBackwards(track.road, -50, 0, 0, 10)).toBe(true)
    expect(goingBackwards(track.road, -50, 0, 0, -10)).toBe(false)
    expect(goingBackwards(track.road, -50, 0, 0, 1)).toBe(false)
    const course = trialCourse(track)
    let trial: Trial = { ...startTrial(course), phase: 'racing', countdown: 0 }
    const reverse: KartInput = {
      throttle: false,
      brake: true,
      steer: 0,
      drift: false,
      boost: false,
    }
    for (let step = 0; step < 6 / STEP_SECONDS && !trial.wrongWay; step++)
      trial = stepTrial(trial, reverse, course)
    expect(trial.wrongWay).toBe(true)
    const reset = resetTrial(trial)
    expect(reset.wrongWay).toBe(false)
    expect(reset.steps).toBe(trial.steps)
  })

  it('formats times', () => {
    expect(formatTime(62.3456)).toBe('1:02.346')
    expect(formatTime(seconds(60))).toBe('0:01.000')
    expect(formatTime(-1)).toBe('0:00.000')
  })
})

describe('the riverside graybox', () => {
  it('is a valid track whose road never runs into itself', () => {
    const track = load(RIVERSIDE)
    const { road } = track
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        // Neighbours along the road (a hairpin's two legs included) are close by nature; any other
        // part keeps clear of the kerbs
        if (alongRoad(road, i, j) < 90) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        expect(gap, `road ${i} and ${j}`).toBeGreaterThan((road[i]!.width + road[j]!.width) / 2 + 4)
      }
    }
    // The line is on the main straight, the grid behind it facing up the straight
    expect(track.road[0]).toMatchObject({ x: 0 })
    for (const place of track.grid) {
      expect(place.z).toBeGreaterThan(track.road[0]!.z)
      expect(place.heading).toBe(0)
    }
  })

  it('can be driven round three times, never the wrong way', () => {
    const { trial, wrongWarnings } = race(RIVERSIDE, 400)
    expect(trial.phase).toBe('finished')
    expect(wrongWarnings).toBe(0)
    // A careful autopilot: a real driver drifting the hairpins is faster
    expect(seconds(trial.steps)).toBeLessThan(330)
  })
})

describe('the harbour track (N1, e10-t02)', () => {
  it('is a valid track whose road never runs into itself, the grid behind the line', () => {
    const track = load(HARBOUR)
    const { road } = track
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        // Neighbours along the road (a hairpin's two legs included) are close by nature; any other
        // part keeps clear of the kerbs
        if (alongRoad(road, i, j) < 90) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        expect(gap, `road ${i} and ${j}`).toBeGreaterThan((road[i]!.width + road[j]!.width) / 2 + 4)
      }
    }
    // The line is on the seafront straight, driven eastwards (+x); the grid is behind it
    const line = track.road[0]!
    expect(line.z).toBeLessThan(-100)
    for (const place of track.grid) {
      expect(place.x).toBeLessThan(line.x)
      expect(Math.abs(place.heading - Math.PI / 2)).toBeLessThan(0.1)
    }
  })

  it('is about as long as Riverside, with two hairpins one after the other', () => {
    const length = (json: TrackJson) =>
      json.road.reduce((sum, point, index) => {
        const next = json.road[(index + 1) % json.road.length]!
        return sum + Math.hypot(next.x - point.x, next.z - point.z)
      }, 0)
    expect(length(HARBOUR)).toBeGreaterThan(2000)
    expect(length(HARBOUR)).toBeLessThan(2600)
    // A hairpin: the road turned round by more than 150 degrees within 110 m
    expect(sharpCorners(HARBOUR.road, 110, 150)).toBeGreaterThanOrEqual(2)
    expect(sharpCorners(RIVERSIDE.road, 110, 150)).toBeGreaterThanOrEqual(2)
  })

  it('can be driven round three times, never the wrong way', () => {
    const { trial, wrongWarnings } = race(HARBOUR, 420)
    expect(trial.phase).toBe('finished')
    expect(wrongWarnings).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(360)
  })
})
