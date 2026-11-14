import { describe, expect, it } from 'vitest'
import { TEST_ARENA } from '../../shared/kart/arena.ts'
import { advanceClock } from '../../shared/kart/clock.ts'
import {
  resetRun,
  SAFE_CLEARANCE,
  startRun,
  stepRun,
  type Course,
  type Run,
} from '../../shared/kart/course.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  kartSpeed,
  NO_INPUT,
  STEP_SECONDS,
  type KartInput,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { PRESETS } from '../../shared/kart/tuning.ts'
import { collideWalls, KART_RADIUS, wallClearance, type Wall } from '../../shared/kart/walls.ts'

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }
const DEGREE = Math.PI / 180

/** One long wall along x = 0, from z = +500 to z = -500 */
const WALL: Wall = { ax: 0, az: 500, bx: 0, bz: -500 }

/** A car `distance` to the left of the wall (x < 0), moving at `speed` at `angle` into it */
function towardsWall(distance: number, speed: number, angle: number): KartState {
  // Heading 0 faces -z; turning right by `angle` points it at the wall (x grows)
  return {
    ...INITIAL_KART,
    x: -distance,
    heading: angle,
    vx: speed * Math.sin(angle),
    vz: -speed * Math.cos(angle),
  }
}

/** Moves a car one step with its own velocity, as stepKart would place it, then hits the walls */
function slide(state: KartState, walls: readonly Wall[], tuning: KartTuning = KART_TUNING) {
  const after = {
    ...state,
    x: state.x + state.vx * STEP_SECONDS,
    z: state.z + state.vz * STEP_SECONDS,
  }
  return collideWalls(state, after, walls, tuning)
}

describe('collideWalls', () => {
  it('leaves a car that touches nothing exactly where stepKart put it', () => {
    const state = towardsWall(10, 30, 20 * DEGREE)
    const after = { ...state, x: state.x + 0.5, z: state.z - 0.5 }
    const result = collideWalls(state, after, [WALL], KART_TUNING)
    expect(result.state).toBe(after)
    expect(result).toMatchObject({ impact: 0, hitSpeed: 0, touching: false })
  })

  it('makes a glancing hit slide along the wall, keeping most of the speed', () => {
    const state = towardsWall(KART_RADIUS + 0.05, 30, 10 * DEGREE)
    const { state: after, impact, touching } = slide(state, [WALL])
    expect(touching).toBe(true)
    expect(impact).toBeCloseTo(Math.sin(10 * DEGREE), 6)
    // Out of the wall, never into it; the speed along it is nearly all still there
    expect(after.x).toBeLessThanOrEqual(-KART_RADIUS + 1e-9)
    expect(after.vx).toBeLessThanOrEqual(0)
    expect(after.vz).toBeLessThan(-0.85 * 30)
    expect(kartSpeed(after)).toBeGreaterThan(0.85 * 30)
    expect(kartSpeed(after)).toBeLessThan(30)
  })

  it('takes more speed in a head-on hit than in a glancing one, and bounces back a little', () => {
    const glancing = slide(towardsWall(KART_RADIUS + 0.1, 30, 15 * DEGREE), [WALL])
    const steep = slide(towardsWall(KART_RADIUS + 0.1, 30, 50 * DEGREE), [WALL])
    const headOn = slide(towardsWall(KART_RADIUS + 0.1, 30, 90 * DEGREE), [WALL])
    expect(kartSpeed(glancing.state)).toBeGreaterThan(kartSpeed(steep.state))
    expect(kartSpeed(steep.state)).toBeGreaterThan(kartSpeed(headOn.state))
    expect(headOn.impact).toBeCloseTo(1, 6)
    expect(headOn.hitSpeed).toBeCloseTo(30, 6)
    // Straight back out at the bounce share of the speed it came in with, before the scrape
    expect(headOn.state.vx).toBeLessThan(0)
    expect(-headOn.state.vx).toBeCloseTo(
      30 * KART_TUNING.wallBounce - KART_TUNING.wallScrapeDrag * STEP_SECONDS,
      6,
    )
    expect(Math.abs(headOn.state.vz)).toBeLessThan(1e-9)
  })

  it('loses speed scraping along a wall while steering into it', () => {
    let run: Run = startRun({ walls: [WALL], start: { x: -KART_RADIUS - 2, z: 0, heading: 0 } })
    const course: Course = { walls: [WALL], start: run.safe }
    for (let step = 0; step < 150; step++) run = stepRun(run, THROTTLE, course)
    const free = kartSpeed(run.kart)
    let scraping = run
    let touched = 0
    for (let step = 0; step < 90; step++) {
      scraping = stepRun(scraping, { ...THROTTLE, steer: 0.3 }, course)
      if (scraping.kart.x > -KART_RADIUS - 1e-6) touched++
    }
    let open = run
    for (let step = 0; step < 90; step++) open = stepRun(open, THROTTLE, course)
    expect(touched).toBeGreaterThan(30)
    expect(scraping.kart.x).toBeLessThanOrEqual(-KART_RADIUS + 1e-9)
    expect(kartSpeed(scraping.kart)).toBeLessThan(kartSpeed(open.kart) - 1)
    expect(free).toBeGreaterThan(20)
  })

  it('never lets a car through a wall, even at the highest boosted speed any tuning allows', () => {
    const fastest = { ...KART_TUNING, topSpeed: 50, boostTopSpeedFactor: 2 }
    const speed = fastest.topSpeed * fastest.boostTopSpeedFactor
    for (const angle of [90, 60, 30, 5]) {
      // Starting anywhere in the last step before the wall, so no lucky alignment hides a gap
      for (let offset = 0; offset < 1; offset += 0.05) {
        const distance = KART_RADIUS + offset * speed * STEP_SECONDS
        let state = towardsWall(distance, speed, angle * DEGREE)
        for (let step = 0; step < 10; step++) {
          state = slide(state, [WALL], fastest).state
          expect(state.x).toBeLessThanOrEqual(-KART_RADIUS + 1e-9)
        }
      }
    }
  })

  it('stops a car at a thin wall end-on, and in a corner it is pushed out of both walls', () => {
    const corner: Wall[] = [
      { ax: -50, az: -10, bx: 0, bz: -10 },
      { ax: 0, az: -10, bx: 0, bz: 50 },
    ]
    // Into the corner at 45°, fast
    let state: KartState = {
      ...INITIAL_KART,
      x: -5,
      z: -5 + 10,
      heading: 45 * DEGREE,
      vx: 39 * Math.sin(45 * DEGREE),
      vz: -39 * Math.cos(45 * DEGREE),
    }
    for (let step = 0; step < 60; step++) {
      state = slide(state, corner).state
      expect(wallClearance(corner, state.x, state.z)).toBeGreaterThanOrEqual(KART_RADIUS - 1e-9)
      expect(state.x).toBeLessThan(0)
      expect(state.z).toBeGreaterThan(-10)
    }
  })

  it('is pure: the same arguments give the same answer and nothing is changed', () => {
    const state = Object.freeze(towardsWall(KART_RADIUS + 0.2, 30, 40 * DEGREE))
    const walls = Object.freeze([Object.freeze({ ...WALL })])
    expect(slide(state, walls)).toEqual(slide(state, walls))
  })
})

describe('the course: safe places and the reset', () => {
  const course = TEST_ARENA

  function drive(run: Run, input: KartInput, seconds: number): Run {
    let current = run
    for (let step = 0; step < Math.round(seconds * 60); step++) {
      current = stepRun(current, input, course)
    }
    return current
  }

  it('starts at the start, which is also the first safe place', () => {
    const run = startRun(course)
    expect(run.kart).toEqual({ ...INITIAL_KART, ...course.start })
    expect(run.safe).toEqual(course.start)
  })

  it('drives straight into the barrier ahead, stops there and does not go through', () => {
    const run = drive(startRun(course), THROTTLE, 8)
    expect(run.kart.z).toBeGreaterThan(-120)
    expect(run.kart.z).toBeCloseTo(-120 + KART_RADIUS, 6)
    expect(kartSpeed(run.kart)).toBeLessThan(1)
  })

  it('remembers a safe place behind the car, clear of the walls and facing the way it drove', () => {
    const run = drive(startRun(course), THROTTLE, 8)
    expect(run.safe.z).toBeLessThan(-15)
    expect(run.safe.z).toBeGreaterThan(-120 + SAFE_CLEARANCE)
    expect(run.safe.heading).toBeCloseTo(0, 9)
    expect(wallClearance(course.walls, run.safe.x, run.safe.z)).toBeGreaterThanOrEqual(
      SAFE_CLEARANCE,
    )
  })

  it('puts the car back at the safe place on reset, stopped and facing forwards, once per press', () => {
    let run = drive(startRun(course), { ...THROTTLE, steer: 1, drift: true }, 0.1)
    run = drive(run, THROTTLE, 8)
    // A drift and a boost to show what a reset keeps and what it ends
    run = { ...run, kart: { ...run.kart, gauge: 40, storedBoosts: 1, boostSeconds: 0.5, chain: 2 } }
    const safe = run.safe
    const reset = stepRun(run, { ...NO_INPUT, reset: true }, course)
    expect(reset.resets).toBe(1)
    expect(reset.kart).toMatchObject({
      x: safe.x,
      z: safe.z,
      heading: safe.heading,
      vx: 0,
      vz: 0,
      drifting: false,
      boostSeconds: 0,
      chain: 0,
      gauge: 40,
      storedBoosts: 1,
    })
    // Held down, it does not keep resetting; let go and pressed again, it does
    const held = stepRun(reset, { ...THROTTLE, reset: true }, course)
    expect(held.resets).toBe(1)
    expect(kartSpeed(held.kart)).toBeGreaterThan(0)
    const again = stepRun(stepRun(held, THROTTLE, course), { ...NO_INPUT, reset: true }, course)
    expect(again.resets).toBe(2)
  })

  it('faces the direction of travel at the safe place, not where the nose pointed in a drift', () => {
    let run = drive(startRun(course), THROTTLE, 2)
    run = drive(run, { ...THROTTLE, steer: 1, drift: true }, 0.6)
    // Out of the way of the candidate taken so far, so the next step takes a new one mid-drift
    run = { ...run, candidate: null, candidateSeconds: 0 }
    run = stepRun(run, { ...THROTTLE, steer: 0, drift: true }, course)
    expect(run.kart.drifting).toBe(true)
    const { kart, candidate } = run
    const travel = Math.atan2(kart.vx, -kart.vz)
    expect(candidate?.heading).toBeCloseTo(travel, 9)
    // In a drift the nose is well off the travel
    expect(Math.abs(kart.heading - travel)).toBeGreaterThan(10 * DEGREE)
    // and a reset faces the safe place's heading
    expect(resetRun({ ...run, safe: candidate! }).kart.heading).toBe(candidate!.heading)
  })

  it('never takes a safe place while reversing', () => {
    let run = drive(startRun(course), { ...NO_INPUT, brake: true }, 3)
    expect(run.safe).toEqual(course.start)
    expect(run.candidate).toBeNull()
  })
})

describe('frame rate independence with walls', () => {
  /** A drive into the barrier, along the fence and the slanted wall, with a reset in the middle */
  const script: { seconds: number; input: KartInput }[] = [
    { seconds: 5, input: THROTTLE },
    { seconds: 1, input: { ...THROTTLE, steer: -1 } },
    { seconds: 1 / 6, input: { ...THROTTLE, reset: true } },
    { seconds: 2, input: THROTTLE },
    { seconds: 3, input: { ...THROTTLE, steer: -1, drift: true } },
    { seconds: 1 / 6, input: { ...THROTTLE, steer: -1, drift: true, boost: true } },
    { seconds: 2, input: { ...THROTTLE, steer: -0.4 } },
    { seconds: 4, input: { ...THROTTLE, steer: 0.5 } },
    { seconds: 1 + 1 / 3, input: { ...NO_INPUT, brake: true, steer: 1 } },
    { seconds: 3, input: THROTTLE },
  ]

  function play(frameLength: (frame: number) => number): { run: Run; steps: number; hits: number } {
    let run = startRun(TEST_ARENA)
    let accumulator = 0
    let steps = 0
    let hits = 0
    let frame = 0
    for (const { seconds, input } of script) {
      let left = seconds
      while (left > 1e-9) {
        const length = Math.min(frameLength(frame++), left)
        left -= length
        const clock = advanceClock(accumulator, length)
        accumulator = clock.accumulator
        steps += clock.steps
        for (let step = 0; step < clock.steps; step++) {
          run = stepRun(run, input, TEST_ARENA)
          if (run.impact > 0) hits++
        }
      }
    }
    return { run, steps, hits }
  }

  it('ends in exactly the same state at 30 and 144 fps, having hit walls and reset', () => {
    const at30 = play(() => 1 / 30)
    const at144 = play(() => 1 / 144)
    expect(at144.steps).toBe(at30.steps)
    expect(at144.run).toEqual(at30.run)
    expect(at30.hits).toBeGreaterThan(0)
    expect(at30.run.resets).toBe(1)
  })

  it('ends in the same state with uneven frames', () => {
    const uneven = play((frame) => [1 / 40, 1 / 90, 1 / 200, 1 / 25][frame % 4]!)
    expect(uneven.run).toEqual(play(() => 1 / 60).run)
  })

  it('stays inside the fence whatever the preset', () => {
    for (const tuning of Object.values(PRESETS)) {
      let run = startRun(TEST_ARENA)
      for (let step = 0; step < 60 * 30; step++) {
        const input = {
          ...THROTTLE,
          steer: Math.sin(step / 50),
          drift: step % 200 > 100,
          boost: step % 300 === 0,
        }
        run = stepRun(run, input, TEST_ARENA, tuning)
        expect(Math.abs(run.kart.x)).toBeLessThan(70)
        expect(run.kart.z).toBeLessThan(30)
        expect(run.kart.z).toBeGreaterThan(-150)
      }
    }
  })
})
