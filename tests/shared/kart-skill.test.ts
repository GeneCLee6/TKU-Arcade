import { describe, expect, it } from 'vitest'
import { onPad, startRun, stepRun, type Course } from '../../shared/kart/course.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  STEP_SECONDS,
  stepKart,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import { padsAlong } from '../../shared/kart/track.ts'

// 2026-11-14 (owner: much faster, longer boosts, a higher skill ceiling): stacked charges, the flick,
// the depth and length of a drift, the counter catch, walls that break the chain, boost pads

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }
const DRIFT_RIGHT: KartInput = { ...THROTTLE, steer: 1, drift: true }
const BOOST: KartInput = { ...THROTTLE, boost: true }

function run(state: KartState, input: KartInput, seconds: number): KartState {
  let current = state
  for (let step = 0; step < Math.round(seconds * 60); step++) current = stepKart(current, input)
  return current
}

const atSpeed = () => run(INITIAL_KART, THROTTLE, 3)
const T = KART_TUNING

describe('the new numbers', () => {
  it('is much faster, with longer boosts', () => {
    expect(T.topSpeed).toBe(50)
    expect(T.topSpeed * T.boostTopSpeedFactor).toBe(70)
    expect(T.topSpeed * T.boostStackFactor).toBeCloseTo(77.5, 9)
    expect(T.boostDuration).toBe(3.25)
    expect(T.chainDuration).toBe(0.9)
    expect(T.startBoostDuration).toBe(1.8)
    expect(T.maxStoredBoosts).toBe(2)
  })
})

describe('stacked charges', () => {
  const twoCharges = () => ({ ...atSpeed(), storedBoosts: 2 })

  it('adds a second charge fired during a boost to it, and goes higher for a while', () => {
    const first = run(stepKart(twoCharges(), BOOST), THROTTLE, 1)
    const stacked = stepKart(first, BOOST)
    expect(stacked.storedBoosts).toBe(0)
    expect(stacked.boostSeconds).toBeCloseTo(first.boostSeconds + T.boostDuration - STEP_SECONDS, 9)
    expect(stacked.stackSeconds).toBeGreaterThan(0)
    const flying = run(stacked, THROTTLE, T.boostStackSeconds - 0.1)
    expect(kartSpeed(flying)).toBeGreaterThan(T.topSpeed * T.boostTopSpeedFactor + 1)
    expect(kartSpeed(flying)).toBeLessThanOrEqual(T.topSpeed * T.boostStackFactor + 1e-9)
  })

  it('never stacks past the longest boost', () => {
    let state: KartState = { ...atSpeed(), storedBoosts: 2 }
    state = stepKart(state, BOOST)
    state = stepKart(stepKart(state, THROTTLE), BOOST)
    state = { ...state, storedBoosts: 1 }
    state = stepKart(stepKart(state, THROTTLE), BOOST)
    expect(state.boostSeconds).toBeLessThanOrEqual(T.boostMaxSeconds)
  })

  it('does not hand back a charge for nothing when the store was full', () => {
    // A full store parks the gauge full; firing one does not refill it until the next drift
    const full = run(atSpeed(), DRIFT_RIGHT, 6)
    expect(full.storedBoosts).toBe(2)
    const fired = run(stepKart(stepKart(full, THROTTLE), BOOST), THROTTLE, 1)
    expect(fired.storedBoosts).toBe(1)
  })
})

describe('the flick', () => {
  it('snaps the nose and the travel round on a tapped drift, keeping almost all the speed', () => {
    const before = atSpeed()
    const tapped = run(before, DRIFT_RIGHT, 0.1)
    const flicked = stepKart(tapped, THROTTLE)
    expect(flicked.flicks).toBe(1)
    expect(flicked.heading - tapped.heading).toBeGreaterThan(T.flickAngle * 0.9)
    // The travel turned with the nose, all at once
    const travel = (state: KartState) => Math.atan2(state.vx, -state.vz)
    expect(travel(flicked) - travel(tapped)).toBeGreaterThan(T.flickAngle * 0.9)
    expect(kartSpeed(flicked)).toBeGreaterThan(kartSpeed(before) * 0.95)
    expect(flicked.gauge - tapped.gauge).toBeCloseTo(T.flickGauge, 6)
  })

  it('is not a held drift, and waits between flicks', () => {
    const held = stepKart(run(atSpeed(), DRIFT_RIGHT, 0.5), THROTTLE)
    expect(held.flicks).toBe(0)
    const once = stepKart(run(atSpeed(), DRIFT_RIGHT, 0.1), THROTTLE)
    const again = stepKart(run(once, DRIFT_RIGHT, 0.1), THROTTLE)
    expect(again.flicks).toBe(1)
  })
})

describe('the depth and length of a drift', () => {
  const entered = () => run(atSpeed(), DRIFT_RIGHT, 0.1)

  it('costs more speed steering into it than out of it', () => {
    const deep = run(entered(), DRIFT_RIGHT, 1)
    const shallow = run(entered(), { ...DRIFT_RIGHT, steer: -1 }, 1)
    expect(kartSpeed(deep)).toBeCloseTo(T.driftTopSpeed * (1 - T.driftDepthCost), 6)
    expect(kartSpeed(shallow)).toBeGreaterThan(kartSpeed(deep) + 3)
  })

  it('tires: a drift held long slows down', () => {
    const centred = { ...DRIFT_RIGHT, steer: 0 }
    const short = run(entered(), centred, 1)
    const long = run(entered(), centred, 3)
    expect(kartSpeed(long)).toBeLessThan(kartSpeed(short) - T.driftFatigue)
  })
})

describe('the counter catch', () => {
  it('straightens the car up faster when the drift is let go steering against it', () => {
    const drifting = run(atSpeed(), DRIFT_RIGHT, 1)
    const caught = run(drifting, { ...THROTTLE, steer: -1 }, 0.1)
    const plain = run(drifting, THROTTLE, 0.1)
    expect(caught.catchSeconds).toBeGreaterThan(0)
    expect(Math.abs(kartSlip(caught))).toBeLessThan(Math.abs(kartSlip(plain)) * 0.6)
  })
})

describe('walls and pads (course.ts)', () => {
  const wall = { ax: -50, az: -30, bx: 50, bz: -30 }
  const open: Course = { walls: [], start: { x: 0, z: 0, heading: 0 } }

  it('breaks the chain on a hard hit', () => {
    const course: Course = { walls: [wall], start: { x: 0, z: 0, heading: 0 } }
    let state = startRun(course)
    state = {
      ...state,
      kart: {
        ...state.kart,
        vz: -40,
        chain: 4,
        chainWindow: 1,
        sliding: false,
        releaseWindow: 0.2,
      },
    }
    for (let step = 0; step < 60 && state.hitSpeed < T.wallBreakSpeed; step++) {
      state = stepRun(state, THROTTLE, course)
    }
    expect(state.kart.chain).toBe(0)
    expect(state.kart.chainWindow).toBe(0)
    expect(state.kart.releaseWindow).toBe(0)
  })

  it('boosts whoever drives over a pad, off the middle of the road', () => {
    const road = Array.from({ length: 20 }, (_, index) => ({ x: 0, z: -index * 6, width: 30 }))
    const [pad] = padsAlong(road, [[5, 8]])
    expect(pad).toMatchObject({ x: 8, z: -30, heading: 0 })
    expect(onPad(pad!, 8, -30)).toBe(true)
    expect(onPad(pad!, 0, -30)).toBe(false)
    const course: Course = { ...open, boostPads: [pad!] }
    let state = startRun({ ...course, start: { x: 8, z: -20, heading: 0 } })
    state = { ...state, kart: { ...state.kart, vz: -20 } }
    for (let step = 0; step < 60 && state.kart.boostSeconds === 0; step++) {
      state = stepRun(state, THROTTLE, course)
    }
    expect(state.kart.boostSeconds).toBeCloseTo(T.padBoostSeconds, 9)
  })
})
