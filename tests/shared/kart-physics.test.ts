import { describe, expect, it } from 'vitest'
import { advanceClock, MAX_FRAME_SECONDS } from '../../shared/kart/clock.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  poseBetween,
  STEP_SECONDS,
  stepKart,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }

function run(state: KartState, input: KartInput, seconds: number): KartState {
  let current = state
  for (let step = 0; step < Math.round(seconds * 60); step++) current = stepKart(current, input)
  return current
}

const atSpeed = () => run(INITIAL_KART, THROTTLE, 3)

describe('stepKart', () => {
  it('gives the same result for the same state and input, and changes neither', () => {
    const state = Object.freeze(atSpeed())
    const input = Object.freeze({ ...THROTTLE, steer: 1, drift: true })
    expect(stepKart(state, input)).toEqual(stepKart(state, input))
  })

  it('stays still with no input', () => {
    expect(run(INITIAL_KART, NO_INPUT, 2)).toEqual(INITIAL_KART)
  })

  it('takes topSpeed / acceleration seconds from a standstill to the top speed', () => {
    let state = INITIAL_KART
    let steps = 0
    while (kartSpeed(state) < KART_TUNING.topSpeed - 1e-9) {
      state = stepKart(state, THROTTLE)
      steps++
    }
    // 40 / 20 = 2 s: 120 steps of 1/60 s
    expect(steps).toBe(Math.ceil((KART_TUNING.topSpeed / KART_TUNING.acceleration) * 60 - 1e-9))
    expect(steps * STEP_SECONDS).toBeCloseTo(2, 2)
  })

  it('keeps the top speed in a turn: sliding does not add to it', () => {
    const turning = run(run(INITIAL_KART, THROTTLE, 10), { ...THROTTLE, steer: 1 }, 3)
    expect(kartSpeed(turning)).toBeLessThanOrEqual(KART_TUNING.topSpeed + 1e-9)
  })

  it('accelerates straight ahead up to the top speed and no further', () => {
    const after1s = run(INITIAL_KART, THROTTLE, 1)
    expect(kartSpeed(after1s)).toBeCloseTo(KART_TUNING.acceleration, 5)
    // Heading 0 faces -z
    expect(after1s.z).toBeLessThan(0)
    expect(after1s.x).toBeCloseTo(0, 5)

    expect(kartSpeed(run(INITIAL_KART, THROTTLE, 10))).toBeCloseTo(KART_TUNING.topSpeed, 5)
  })

  it('slows down when coasting and when braking, braking faster, and then reverses', () => {
    const coasted = run(atSpeed(), NO_INPUT, 1)
    const braked = run(atSpeed(), { ...NO_INPUT, brake: true }, 1)
    expect(kartSpeed(coasted)).toBeLessThan(kartSpeed(atSpeed()))
    expect(kartSpeed(braked)).toBeLessThan(kartSpeed(coasted))

    const reversing = run(INITIAL_KART, { ...NO_INPUT, brake: true }, 5)
    expect(reversing.z).toBeGreaterThan(0)
    expect(kartSpeed(reversing)).toBeCloseTo(KART_TUNING.reverseSpeed, 5)
  })

  it('cannot turn standing still, and turns less at high speed', () => {
    const steerRight = { ...THROTTLE, steer: 1 }
    expect(run(INITIAL_KART, { ...NO_INPUT, steer: 1 }, 1).heading).toBe(0)

    const slow = stepKart(run(INITIAL_KART, THROTTLE, 0.5), steerRight)
    const fast = stepKart(atSpeed(), steerRight)
    expect(slow.heading).toBeGreaterThan(fast.heading)
    expect(fast.heading).toBeGreaterThan(0)
  })

  it('steers left and right as mirror images', () => {
    const right = run(atSpeed(), { ...THROTTLE, steer: 1 }, 0.5)
    const left = run(atSpeed(), { ...THROTTLE, steer: -1 }, 0.5)
    expect(left.heading).toBeCloseTo(-right.heading, 9)
    expect(left.x).toBeCloseTo(-right.x, 9)
    expect(left.z).toBeCloseTo(right.z, 9)
  })

  it('clamps the steering', () => {
    expect(stepKart(atSpeed(), { ...THROTTLE, steer: 5 })).toEqual(
      stepKart(atSpeed(), { ...THROTTLE, steer: 1 }),
    )
  })

  it('keeps the slip small in a normal turn', () => {
    const turning = run(atSpeed(), { ...THROTTLE, steer: 1 }, 1)
    expect(turning.drifting).toBe(false)
    expect(Math.abs(kartSlip(turning))).toBeLessThan((10 * Math.PI) / 180)
  })
})

describe('drifting', () => {
  const DRIFT_RIGHT: KartInput = { ...THROTTLE, steer: 1, drift: true }

  it('needs steering and some speed to start', () => {
    expect(stepKart(atSpeed(), { ...THROTTLE, drift: true }).drifting).toBe(false)
    const crawling = run(INITIAL_KART, THROTTLE, 0.2)
    expect(stepKart(crawling, DRIFT_RIGHT).drifting).toBe(false)
    expect(stepKart(atSpeed(), DRIFT_RIGHT).drifting).toBe(true)
  })

  it('remembers the direction it started in, whatever the steering does next', () => {
    const entered = run(atSpeed(), DRIFT_RIGHT, 0.5)
    expect(entered.driftDirection).toBe(1)
    expect(stepKart(entered, { ...DRIFT_RIGHT, steer: -1 }).driftDirection).toBe(1)
  })

  it('settles on a slip angle under the cap, which the steering widens or narrows', () => {
    const settled = (steer: number) => {
      const entered = run(atSpeed(), DRIFT_RIGHT, 0.1)
      return Math.abs(kartSlip(run(entered, { ...THROTTLE, steer, drift: true }, 3)))
    }
    const degrees = (radians: number) => (radians * 180) / Math.PI
    const tight = settled(1)
    const centred = settled(0)
    const wide = settled(-1)
    // J1's drift sat on its cap the whole time: now the cap is only a safety net
    expect(degrees(KART_TUNING.driftMaxSlip) - degrees(tight)).toBeGreaterThan(4)
    expect(degrees(tight)).toBeGreaterThan(28)
    expect(degrees(centred)).toBeGreaterThan(18)
    expect(degrees(centred)).toBeLessThan(28)
    expect(degrees(wide)).toBeGreaterThan(8)
    expect(wide).toBeLessThan(centred)
    expect(centred).toBeLessThan(tight)
  })

  it('keeps its speed when the key is let go, instead of losing the sideways part', () => {
    const drifting = run(atSpeed(), DRIFT_RIGHT, 2)
    const released = run(drifting, NO_INPUT, 0.3)
    // Coasting loses coastDrag each second, and nothing else
    expect(kartSpeed(released)).toBeCloseTo(kartSpeed(drifting) - KART_TUNING.coastDrag * 0.3, 1)
  })

  it('cannot start below the minimum speed, nor while reversing', () => {
    const slow = run(
      INITIAL_KART,
      THROTTLE,
      (KART_TUNING.driftMinSpeed - 1) / KART_TUNING.acceleration,
    )
    const tried = run(slow, { ...NO_INPUT, steer: 1, drift: true }, 0.5)
    expect(tried.drifting).toBe(false)
    expect(tried.gauge).toBe(0)

    const reversing = run(INITIAL_KART, { ...NO_INPUT, brake: true }, 3)
    const backwards = run(reversing, { ...NO_INPUT, brake: true, steer: 1, drift: true }, 2)
    expect(backwards.drifting).toBe(false)
    expect(backwards.gauge).toBe(0)
    // Still going backwards: the nose points away from the direction of travel
    const forward =
      backwards.vx * Math.sin(backwards.heading) - backwards.vz * Math.cos(backwards.heading)
    expect(forward).toBeLessThan(0)
  })

  it('starts when steering begins if the key was already held', () => {
    const held = run(atSpeed(), { ...THROTTLE, drift: true }, 0.5)
    expect(held.drifting).toBe(false)
    expect(stepKart(held, DRIFT_RIGHT).driftDirection).toBe(1)
  })

  it('carries on through a throttle let go mid-drift, until the speed is gone', () => {
    let state = run(atSpeed(), DRIFT_RIGHT, 0.5)
    state = run(state, { ...NO_INPUT, steer: 1, drift: true }, 1)
    expect(state.drifting).toBe(true)
    state = run(state, { ...NO_INPUT, steer: 1, drift: true }, 8)
    expect(state.drifting).toBe(false)
  })

  it('starts over the other way when the key is let go and pressed again', () => {
    const right = run(atSpeed(), DRIFT_RIGHT, 1)
    const gap = stepKart(right, { ...THROTTLE, steer: -1 })
    expect(gap.drifting).toBe(false)
    const left = stepKart(gap, { ...THROTTLE, steer: -1, drift: true })
    expect(left.driftDirection).toBe(-1)
    expect(left.driftSeconds).toBeCloseTo(STEP_SECONDS, 9)
  })

  it('opens a slip angle that stays under the cap', () => {
    let state = atSpeed()
    let largest = 0
    for (let step = 0; step < 300; step++) {
      state = stepKart(state, DRIFT_RIGHT)
      largest = Math.max(largest, Math.abs(kartSlip(state)))
    }
    expect(largest).toBeGreaterThan((20 * Math.PI) / 180)
    expect(largest).toBeLessThanOrEqual(KART_TUNING.driftMaxSlip + 1e-9)
  })

  it('costs a little speed, not most of it', () => {
    const straight = kartSpeed(run(INITIAL_KART, THROTTLE, 10))
    const drifting = kartSpeed(run(run(INITIAL_KART, THROTTLE, 10), DRIFT_RIGHT, 3))
    expect(drifting).toBeLessThan(straight)
    expect(drifting).toBeGreaterThan(straight * 0.8)
  })

  it('ends when the key is let go, and the car straightens up', () => {
    const released = stepKart(run(atSpeed(), DRIFT_RIGHT, 2), THROTTLE)
    expect(released.drifting).toBe(false)
    expect(released.driftDirection).toBe(0)

    const straightened = run(released, THROTTLE, 1)
    expect(Math.abs(kartSlip(straightened))).toBeLessThan((1 * Math.PI) / 180)
  })

  it('ends when the car has slowed down too far', () => {
    const slowing = run(
      run(atSpeed(), DRIFT_RIGHT, 1),
      { ...NO_INPUT, brake: true, drift: true },
      3,
    )
    expect(slowing.drifting).toBe(false)
  })
})

describe('frame rate independence', () => {
  /** A drive that changes its input every 1/6 s, a time both frame rates below land on exactly */
  const script: { seconds: number; input: KartInput }[] = [
    { seconds: 3, input: THROTTLE },
    { seconds: 1, input: { ...THROTTLE, steer: 1 } },
    { seconds: 2, input: { ...THROTTLE, steer: 1, drift: true } },
    { seconds: 0.5, input: { ...THROTTLE, steer: -1, drift: true } },
    { seconds: 1, input: THROTTLE },
    { seconds: 1 + 1 / 6, input: { ...NO_INPUT, brake: true, steer: -1 } },
    { seconds: 1 + 1 / 3, input: NO_INPUT },
    { seconds: 2, input: THROTTLE },
    { seconds: 3, input: { ...THROTTLE, steer: -1, drift: true } },
    { seconds: 1 / 6, input: { ...THROTTLE, steer: -1, drift: true, boost: true } },
    { seconds: 1 / 2, input: { ...THROTTLE, steer: -1, drift: true } },
    // Let go of everything, then the throttle again: a release boost
    { seconds: 1 / 6, input: NO_INPUT },
    { seconds: 1 / 6, input: THROTTLE },
  ]

  /** Plays the script as the render loop would, with frames of the durations `frameLength` gives */
  function play(frameLength: (frame: number) => number): { state: KartState; steps: number } {
    let state = INITIAL_KART
    let accumulator = 0
    let steps = 0
    let frame = 0
    for (const { seconds, input } of script) {
      let left = seconds
      while (left > 1e-9) {
        const length = Math.min(frameLength(frame++), left)
        left -= length
        const clock = advanceClock(accumulator, length)
        accumulator = clock.accumulator
        steps += clock.steps
        for (let step = 0; step < clock.steps; step++) state = stepKart(state, input)
      }
    }
    return { state, steps }
  }

  const stepsInScript = Math.round(script.reduce((sum, part) => sum + part.seconds, 0) * 60)

  it('ends in exactly the same state at 30 and 144 fps', () => {
    const at30 = play(() => 1 / 30)
    const at144 = play(() => 1 / 144)
    expect(at30.steps).toBe(stepsInScript)
    expect(at144.steps).toBe(stepsInScript)
    expect(at144.state).toEqual(at30.state)
    expect(at30.state.x).not.toBe(0)
    // The script really did fill the gauge, boost and fire a release boost
    expect(at30.state.chain).toBe(1)
  })

  it('ends in the same state with uneven frames', () => {
    const uneven = play((frame) => [1 / 40, 1 / 90, 1 / 200, 1 / 25][frame % 4]!)
    expect(uneven.state).toEqual(play(() => 1 / 60).state)
  })
})

describe('advanceClock', () => {
  it('runs one step per 1/60 s and carries the rest over', () => {
    const half = advanceClock(0, STEP_SECONDS / 2)
    expect(half.steps).toBe(0)
    expect(half.alpha).toBeCloseTo(0.5)

    const whole = advanceClock(half.accumulator, STEP_SECONDS / 2)
    expect(whole.steps).toBe(1)
    expect(whole.alpha).toBeCloseTo(0)
  })

  it('does not simulate a long gap all at once', () => {
    const { steps } = advanceClock(0, 60)
    expect(steps).toBe(Math.round(MAX_FRAME_SECONDS * 60))
  })

  it('ignores a clock that went backwards', () => {
    expect(advanceClock(0, -1).steps).toBe(0)
  })
})

describe('poseBetween', () => {
  const at = (x: number, z: number, heading: number): KartState => ({
    ...INITIAL_KART,
    x,
    z,
    heading,
  })

  it('moves part of the way', () => {
    expect(poseBetween(at(0, 10, 0), at(2, 20, 1), 0.5)).toEqual({ x: 1, z: 15, heading: 0.5 })
  })

  it('takes the short way round the back', () => {
    const { heading } = poseBetween(at(0, 0, Math.PI - 0.1), at(0, 0, -Math.PI + 0.1), 0.5)
    expect(Math.abs(heading)).toBeCloseTo(Math.PI, 9)
  })
})
