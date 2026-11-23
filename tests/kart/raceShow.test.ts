import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { countdownMs, introMs } from '../../shared/kart/opening.ts'
import { NO_INPUT } from '../../shared/kart/physics.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import { startTrial, stepTrial, type Trial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack } from '../../shared/kart/track.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import {
  CELEBRATE_SECONDS,
  FINISH_SWING,
  finishShot,
  gridShot,
  INTRO_FROM,
  INTRO_TO,
  inIntro,
} from '../../src/kart/director.ts'
import { CONFETTI_MS, confettiPieces } from '../../src/kart/ui/confettiPieces.ts'
import { useFinishHold } from '../../src/kart/race/useFinishHold.ts'
import { kartFestival } from '../../src/styles/kartTokens.ts'

// 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): the fly round the grid before the
// countdown, the swing to the front at the finish, the confetti, and the results held for the show.

const track = raceTrack('riverside') as Track
const spots = Array.from({ length: 8 }, (_, slot) => gridSpot(track, slot))

describe('the opening before the countdown', () => {
  it('fills the room countdown before the 3, 2, 1', () => {
    // 2026-11-23: one group shot, the same length for any field (raceFlow.test.ts)
    expect(introMs(8)).toBeGreaterThanOrEqual(1_000)
    expect(INTRO_FROM).toBeCloseTo(countdownMs(8) / 1000, 9)
    expect(INTRO_TO).toBe(3)
    expect(inIntro(4)).toBe(true)
    expect(inIntro(2.9)).toBe(false)
    expect(inIntro(null)).toBe(false)
  })

  it('cuts at the 3 to the grid shot from behind, which then glides down', () => {
    const grid = gridShot(spots)!
    const pole = spots[0]!
    const ahead = { x: Math.sin(pole.heading), z: -Math.cos(pole.heading) }
    // Behind the pole, the whole grid ahead of it
    expect((grid.eye.x - pole.x) * ahead.x + (grid.eye.z - pole.z) * ahead.z).toBeLessThan(0)
  })
})

describe('after the finish', () => {
  it('the car stops and stays: it never backs over the line', () => {
    const oval = parseTrack(TEST_OVAL)
    if ('problems' in oval) throw new Error(oval.problems.join('; '))
    const plain = courseOf(oval.track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: oval.track.road }
    let trial = startTrial(course)
    while (trial.phase === 'countdown') trial = stepTrial(trial, NO_INPUT, course)
    for (let step = 0; step < 120; step++) trial = stepTrial(trial, { ...NO_INPUT, throttle: true }, course)
    let finished: Trial = { ...trial, phase: 'finished' }
    const crossings = finished.run.crossings
    for (let step = 0; step < 600; step++) {
      finished = stepTrial(finished, NO_INPUT, course)
      const { kart } = finished.run
      expect(kart.vx * Math.sin(kart.heading) - kart.vz * Math.cos(kart.heading)).toBeGreaterThan(-0.5)
    }
    expect(Math.hypot(finished.run.kart.vx, finished.run.kart.vz)).toBeLessThan(0.6)
    expect(finished.run.crossings).toBe(crossings)
  })
})

describe('the finish', () => {
  const kart = { x: 10, z: -20, heading: 0.4 }

  it('swings from behind the kart round to its front, coming in smoothly', () => {
    const start = finishShot(kart, 0)!
    expect(start.blend).toBe(0)
    const forward = { x: Math.sin(kart.heading), z: -Math.cos(kart.heading) }
    const along = (shot: NonNullable<ReturnType<typeof finishShot>>) =>
      (shot.eye.x - kart.x) * forward.x + (shot.eye.z - kart.z) * forward.z
    expect(along(start)).toBeLessThan(-5)
    const end = finishShot(kart, FINISH_SWING + 1)!
    expect(end.blend).toBe(1)
    expect(along(end)).toBeGreaterThan(5)
    expect(end.target.x).toBe(kart.x)
  })

  it('is no swing at all with less motion asked for', () => {
    expect(finishShot(kart, 1, true)).toBeNull()
  })

  it('throws confetti and sparks in the festival colours, all inside the show', () => {
    const pieces = confettiPieces(800, 450, () => 0.5)
    expect(pieces.length).toBeGreaterThan(100)
    expect(pieces.some((piece) => piece.spark)).toBe(true)
    const colours = new Set<string>(kartFestival.flags)
    for (const piece of pieces) {
      expect(colours.has(piece.fill)).toBe(true)
      expect(piece.at).toBeLessThan(CONFETTI_MS)
    }
    expect(CONFETTI_MS).toBeLessThanOrEqual(CELEBRATE_SECONDS * 1000)
  })

  it('holds the results for the show from the finish, then lets them come', () => {
    const { result, rerender } = renderHook(({ finished }) => useFinishHold(finished), {
      initialProps: { finished: false },
    })
    expect(result.current).toBe(false)
    rerender({ finished: true })
    expect(result.current).toBe(true)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        act(() => {})
        expect(result.current).toBe(false)
        resolve()
      }, CELEBRATE_SECONDS * 1000 + 100)
    })
  }, 10_000)
})
