import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  GAUGE_FULL,
  INITIAL_KART,
  KART_TUNING,
  kartSpeed,
  NO_INPUT,
  STEP_SECONDS,
  stepKart,
  type KartInput,
  type KartRules,
  type KartState,
} from '../../shared/kart/physics.ts'

// e8-t02a: the gauge, boosts and chained boosts (AC-8.3; walls and respawn are e8-t02b)

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }
const DRIFT_RIGHT: KartInput = { ...THROTTLE, steer: 1, drift: true }
const BOOST: KartInput = { ...THROTTLE, boost: true }

function run(
  state: KartState,
  input: KartInput,
  seconds: number,
  rules: KartRules = DEFAULT_RULES,
): KartState {
  let current = state
  for (let step = 0; step < Math.round(seconds * 60); step++) {
    current = stepKart(current, input, KART_TUNING, rules)
  }
  return current
}

const atSpeed = () => run(INITIAL_KART, THROTTLE, 3)

/** A car at top speed with `boosts` stored and an empty gauge */
const withBoosts = (boosts: number): KartState => ({ ...atSpeed(), storedBoosts: boosts })

const forwardSpeed = (state: KartState) =>
  state.vx * Math.sin(state.heading) - state.vz * Math.cos(state.heading)

const BOOSTED_TOP = KART_TUNING.topSpeed * KART_TUNING.boostTopSpeedFactor

describe('the boost gauge', () => {
  it('fills at gaugeFillRate points per second of drifting', () => {
    const entered = run(atSpeed(), DRIFT_RIGHT, 0.1)
    const later = run(entered, DRIFT_RIGHT, 1)
    expect(later.gauge - entered.gauge).toBeCloseTo(KART_TUNING.gaugeFillRate, 6)
  })

  it('turns into a stored boost when full, 100 / 40 = 2.5 s into a drift, and starts over', () => {
    const fillSteps = Math.ceil((GAUGE_FULL / KART_TUNING.gaugeFillRate) * 60)
    let state = atSpeed()
    let steps = 0
    while (state.storedBoosts === 0) {
      state = stepKart(state, DRIFT_RIGHT)
      steps++
    }
    expect(steps).toBe(fillSteps)
    expect(state.gauge).toBeLessThan(KART_TUNING.gaugeFillRate * STEP_SECONDS)
  })

  it('does not fill outside a drift, and keeps what it has', () => {
    const part = run(atSpeed(), DRIFT_RIGHT, 1)
    const after = run(part, { ...THROTTLE, steer: 1 }, 3)
    expect(after.gauge).toBe(part.gauge)
    expect(run(INITIAL_KART, { ...THROTTLE, steer: 1 }, 5).gauge).toBe(0)
  })

  it('stops filling once the store is full', () => {
    const long = run(atSpeed(), DRIFT_RIGHT, 20)
    expect(long.storedBoosts).toBe(KART_TUNING.maxStoredBoosts)
    expect(long.gauge).toBe(GAUGE_FULL)
  })

  it('stops filling when a drift slows below the minimum speed, before the drift ends', () => {
    let state = run(atSpeed(), DRIFT_RIGHT, 0.5)
    const coastDrift = { ...NO_INPUT, steer: 1, drift: true }
    while (forwardSpeed(state) >= KART_TUNING.driftMinSpeed) state = stepKart(state, coastDrift)
    expect(state.drifting).toBe(true)
    expect(stepKart(state, coastDrift).gauge).toBe(state.gauge)
  })
})

describe('boosting', () => {
  it('fires a stored boost on the key, once per press', () => {
    const fired = stepKart(withBoosts(2), BOOST)
    expect(fired.storedBoosts).toBe(1)
    expect(fired.boostSeconds).toBeCloseTo(KART_TUNING.boostDuration - STEP_SECONDS, 9)
    // Held down: nothing more
    expect(run(fired, BOOST, 1).storedBoosts).toBe(1)
    // Let go and pressed again: the second one
    expect(stepKart(stepKart(fired, THROTTLE), BOOST).storedBoosts).toBe(0)
  })

  it('does nothing with an empty store', () => {
    expect(stepKart(atSpeed(), BOOST).boostSeconds).toBe(0)
  })

  it('raises the top speed by boostTopSpeedFactor for boostDuration, then eases back', () => {
    const boosted = run(
      stepKart(withBoosts(1), BOOST),
      THROTTLE,
      KART_TUNING.boostDuration - 2 / 60,
    )
    expect(boosted.boostSeconds).toBeGreaterThan(0)
    expect(kartSpeed(boosted)).toBeCloseTo(BOOSTED_TOP, 6)

    const ended = run(boosted, THROTTLE, 2 / 60)
    expect(ended.boostSeconds).toBe(0)
    const easing = run(ended, THROTTLE, 1)
    expect(kartSpeed(easing)).toBeCloseTo(kartSpeed(ended) - KART_TUNING.overSpeedDrag, 6)
    expect(kartSpeed(run(easing, THROTTLE, 5))).toBeCloseTo(KART_TUNING.topSpeed, 6)
  })

  it('pushes without the throttle, and from reversing', () => {
    const coasting = run(stepKart(withBoosts(1), { ...NO_INPUT, boost: true }), NO_INPUT, 0.5)
    expect(kartSpeed(coasting)).toBeGreaterThan(KART_TUNING.topSpeed)

    const reversing = run(INITIAL_KART, { ...NO_INPUT, brake: true }, 3)
    expect(forwardSpeed(reversing)).toBeLessThan(0)
    const pushed = run(stepKart({ ...reversing, storedBoosts: 1 }, BOOST), NO_INPUT, 1)
    expect(forwardSpeed(pushed)).toBeGreaterThan(0)
  })

  it('gives way to the brake', () => {
    const braking = run(stepKart(withBoosts(1), BOOST), { ...NO_INPUT, brake: true }, 0.5)
    expect(braking.boostSeconds).toBeGreaterThan(0)
    expect(kartSpeed(braking)).toBeLessThan(KART_TUNING.topSpeed)
  })

  it('raises the drift top speed too', () => {
    const plain = run(atSpeed(), DRIFT_RIGHT, 1)
    const boosted = run(stepKart(withBoosts(1), BOOST), DRIFT_RIGHT, 1)
    expect(kartSpeed(plain)).toBeCloseTo(KART_TUNING.driftTopSpeed, 6)
    expect(kartSpeed(boosted)).toBeGreaterThan(KART_TUNING.driftTopSpeed + 3)
    expect(kartSpeed(boosted)).toBeLessThanOrEqual(
      KART_TUNING.driftTopSpeed * KART_TUNING.boostTopSpeedFactor + 1e-9,
    )
  })

  it('fires the moment the gauge fills when the rules say so, and waits otherwise', () => {
    const auto = { ...DEFAULT_RULES, autoBoost: true }
    const manual = run(atSpeed(), DRIFT_RIGHT, 3)
    const automatic = run(atSpeed(), DRIFT_RIGHT, 3, auto)
    expect(manual.storedBoosts).toBe(1)
    expect(manual.boostSeconds).toBe(0)
    expect(automatic.storedBoosts).toBe(0)
    expect(automatic.boostSeconds).toBeGreaterThan(0)
  })
})

describe('chained boosts', () => {
  /** Fires a boost, then drifts for `seconds` while it lasts */
  const driftInBoost = (seconds: number, rules: KartRules = DEFAULT_RULES) =>
    run(stepKart(withBoosts(1), BOOST, KART_TUNING, rules), DRIFT_RIGHT, seconds, rules)

  it('fires another boost when a drift is let go during a boost', () => {
    const drifting = driftInBoost(0.5)
    expect(drifting.chainWindow).toBeGreaterThan(0)
    const chained = stepKart(drifting, THROTTLE)
    expect(chained.chain).toBe(1)
    // The longer of what was left and a chained boost
    expect(chained.boostSeconds).toBeCloseTo(
      Math.max(drifting.boostSeconds, KART_TUNING.chainDuration) - STEP_SECONDS,
      9,
    )
    expect(chained.chainWindow).toBeCloseTo(
      KART_TUNING.chainDuration + KART_TUNING.chainGrace - STEP_SECONDS,
      9,
    )
  })

  it('chains again and again, each drift released inside the window', () => {
    let state = driftInBoost(0.5)
    for (let link = 1; link <= 4; link++) {
      state = run(state, THROTTLE, 0.1)
      expect(state.chain).toBe(link)
      state = run(state, DRIFT_RIGHT, 0.5)
    }
    // Long after the one boost from the store would have ended: chaining is what kept it going
    expect(state.boostSeconds).toBeGreaterThan(0)
  })

  it('still chains in the grace time just after a boost ends', () => {
    const late = driftInBoost(KART_TUNING.boostDuration + KART_TUNING.chainGrace / 2)
    expect(late.boostSeconds).toBe(0)
    expect(late.chainWindow).toBeGreaterThan(0)
    expect(stepKart(late, THROTTLE).chain).toBe(1)
  })

  it('does not chain once the window has closed', () => {
    const tooLate = driftInBoost(KART_TUNING.boostDuration + KART_TUNING.chainGrace + 0.1)
    const released = stepKart(tooLate, THROTTLE)
    expect(released.chain).toBe(0)
    expect(released.boostSeconds).toBe(0)
  })

  it('does not chain from a tap of the drift key, nor without a boost first', () => {
    const tap = stepKart(driftInBoost(KART_TUNING.chainMinDrift / 2), THROTTLE)
    expect(tap.chain).toBe(0)

    const noBoost = stepKart(run(atSpeed(), DRIFT_RIGHT, 1), THROTTLE)
    expect(noBoost.chain).toBe(0)
    expect(noBoost.boostSeconds).toBe(0)
  })

  it('does not chain when the drift ends from slowing down with the key still held', () => {
    const state = run(driftInBoost(0.3), { ...NO_INPUT, brake: true, steer: 1, drift: true }, 2)
    expect(state.drifting).toBe(false)
    expect(state.chain).toBe(0)
  })

  it('starts the count over when a boost is fired from the store', () => {
    const chained = run({ ...driftInBoost(0.5), storedBoosts: 1 }, THROTTLE, 0.1)
    expect(chained.chain).toBe(1)
    expect(stepKart(chained, BOOST).chain).toBe(0)
  })

  it('is off when the rules turn it off', () => {
    const off = { ...DEFAULT_RULES, chainBoosts: false }
    const released = stepKart(driftInBoost(0.5, off), THROTTLE, KART_TUNING, off)
    expect(released.chain).toBe(0)
  })
})

describe('tuning', () => {
  it('reads every number from the object it is given', () => {
    const faster = { ...KART_TUNING, topSpeed: 40, acceleration: 20 }
    let state = INITIAL_KART
    for (let step = 0; step < 4 * 60; step++) state = stepKart(state, THROTTLE, faster)
    expect(kartSpeed(state)).toBeCloseTo(40, 6)

    const quickGauge = { ...KART_TUNING, gaugeFillRate: 100 }
    let drift = atSpeed()
    for (let step = 0; step < 61; step++) drift = stepKart(drift, DRIFT_RIGHT, quickGauge)
    expect(drift.storedBoosts).toBe(1)
  })

  it('has a finite, positive value for every number', () => {
    for (const [name, value] of Object.entries(KART_TUNING)) {
      expect(Number.isFinite(value), name).toBe(true)
      expect(value, name).toBeGreaterThan(0)
    }
  })
})
