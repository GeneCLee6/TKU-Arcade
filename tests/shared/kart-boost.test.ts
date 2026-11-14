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

// e8-t02a: the gauge, boosts and chained boosts (AC-8.3; walls and respawn are e8-t02b). 2026-11-14:
// a quicker gauge, a longer boost, release boosts and their chains, and the boost slide

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

  it('turns into a stored boost when full, 100 / 65 = 1.54 s into a drift, and starts over', () => {
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
    // Only the bonus for letting go of the drift
    expect(after.gauge).toBeCloseTo(part.gauge + KART_TUNING.gaugeDriftBonus, 9)
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

  it('raises the drift top speed too, for a drift already going when the boost fires', () => {
    const plain = run(atSpeed(), DRIFT_RIGHT, 1)
    const drifting = { ...run(atSpeed(), DRIFT_RIGHT, 0.5), storedBoosts: 1 }
    const boosted = run(stepKart(drifting, { ...DRIFT_RIGHT, boost: true }), DRIFT_RIGHT, 1)
    expect(boosted.sliding).toBe(false)
    expect(kartSpeed(plain)).toBeCloseTo(KART_TUNING.driftTopSpeed, 6)
    expect(kartSpeed(boosted)).toBeGreaterThan(KART_TUNING.driftTopSpeed + 3)
    expect(kartSpeed(boosted)).toBeLessThanOrEqual(
      KART_TUNING.driftTopSpeed * KART_TUNING.boostTopSpeedFactor + 1e-9,
    )
  })

  it('lasts two seconds now (it was 1.2), and the gauge fills in two or three drifts', () => {
    expect(KART_TUNING.boostDuration).toBe(2)
    expect(KART_TUNING.topSpeed).toBe(40)
    // Drifts of about two thirds of a second, each let go: two nearly fill it, the third does
    let state = atSpeed()
    let drifts = 0
    while (state.storedBoosts === 0 && drifts < 5) {
      state = run(state, DRIFT_RIGHT, 0.65)
      state = run(state, THROTTLE, 0.6)
      drifts++
    }
    expect(state.storedBoosts).toBe(1)
    expect(drifts).toBeGreaterThanOrEqual(2)
    expect(drifts).toBeLessThanOrEqual(3)
  })

  it('adds the drift bonus to the gauge on letting go of a drift, not on a tap', () => {
    const drifting = run(atSpeed(), DRIFT_RIGHT, 0.5)
    const released = stepKart(drifting, THROTTLE)
    expect(released.gauge - drifting.gauge).toBeCloseTo(KART_TUNING.gaugeDriftBonus, 6)
    const tap = run(atSpeed(), DRIFT_RIGHT, KART_TUNING.chainMinDrift / 2)
    expect(stepKart(tap, THROTTLE).gauge).toBeCloseTo(tap.gauge, 6)
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

describe('release boosts and chains', () => {
  /** Drifts for `seconds`, then lets go of the drift and the throttle together */
  const driftThenLift = (state: KartState, seconds: number) =>
    stepKart(run(state, DRIFT_RIGHT, seconds), NO_INPUT)

  it('fires on a fresh press of the throttle inside the window after a drift', () => {
    const lifted = driftThenLift(atSpeed(), 0.5)
    expect(lifted.releaseWindow).toBeGreaterThan(0)
    expect(lifted.miniSeconds).toBe(0)
    const fired = stepKart(lifted, THROTTLE)
    expect(fired.miniSeconds).toBeCloseTo(KART_TUNING.chainDuration - STEP_SECONDS, 9)
    expect(fired.chain).toBe(1)
    expect(fired.releaseWindow).toBe(0)
  })

  it('pushes the car past its top speed, less than a full boost does', () => {
    const fired = run(stepKart(driftThenLift(atSpeed(), 0.5), THROTTLE), THROTTLE, 0.5)
    expect(fired.miniSeconds).toBeGreaterThan(0)
    expect(kartSpeed(fired)).toBeGreaterThan(KART_TUNING.driftTopSpeed + 2)
    expect(kartSpeed(fired)).toBeLessThanOrEqual(
      KART_TUNING.topSpeed * KART_TUNING.miniTopSpeedFactor + 1e-9,
    )
  })

  it('needs the press inside the window: late does nothing', () => {
    const late = run(driftThenLift(atSpeed(), 0.5), NO_INPUT, KART_TUNING.releaseWindow + 0.05)
    expect(late.releaseWindow).toBe(0)
    expect(stepKart(late, THROTTLE).miniSeconds).toBe(0)
  })

  it('needs a fresh press: holding the throttle through the release does nothing', () => {
    const held = run(run(atSpeed(), DRIFT_RIGHT, 0.5), THROTTLE, 0.2)
    expect(held.miniSeconds).toBe(0)
    expect(held.chain).toBe(0)
  })

  it('needs a real drift, and the drift key let go, not a stop', () => {
    const tap = driftThenLift(atSpeed(), KART_TUNING.chainMinDrift / 2)
    expect(stepKart(tap, THROTTLE).miniSeconds).toBe(0)
    const braking: KartInput = { ...NO_INPUT, brake: true, steer: 1, drift: true }
    const slowed = run(run(atSpeed(), DRIFT_RIGHT, 0.3), braking, 2)
    expect(slowed.drifting).toBe(false)
    expect(slowed.releaseWindow).toBe(0)
  })

  it('chains drift after drift, the count rising while the window stays open', () => {
    let state = atSpeed()
    for (let link = 1; link <= 5; link++) {
      state = stepKart(driftThenLift(state, 0.4), THROTTLE)
      expect(state.chain).toBe(link)
      state = run(state, THROTTLE, 0.1)
    }
    // A long drift does not break it: the window waits while drifting
    state = stepKart(driftThenLift(state, 2), THROTTLE)
    expect(state.chain).toBe(6)
    // Waiting too long does
    state = run(state, THROTTLE, KART_TUNING.chainDuration + KART_TUNING.chainGrace + 0.1)
    expect(state.chain).toBe(0)
    expect(stepKart(driftThenLift(state, 0.4), THROTTLE).chain).toBe(1)
  })

  it('counts on from a boost fired from the gauge', () => {
    const boosted = run(stepKart(withBoosts(1), BOOST), THROTTLE, 0.2)
    expect(boosted.chainWindow).toBeGreaterThan(0)
    expect(stepKart(driftThenLift(boosted, 0.4), THROTTLE).chain).toBe(1)
  })

  it('is off when the rules turn it off', () => {
    const off = { ...DEFAULT_RULES, chainBoosts: false }
    const lifted = driftThenLift(atSpeed(), 0.5)
    expect(stepKart(lifted, THROTTLE, KART_TUNING, off).miniSeconds).toBe(0)
  })
})

describe('the boost slide', () => {
  const boosted = () => run(stepKart(withBoosts(1), BOOST), THROTTLE, 0.5)

  it('starts when a drift begins during a boost, keeping the boost speed', () => {
    const sliding = run(boosted(), DRIFT_RIGHT, 0.6)
    expect(sliding.sliding).toBe(true)
    expect(sliding.drifting).toBe(true)
    // A plain drift drops to the drift top speed; the slide stays near the boosted top speed
    expect(kartSpeed(sliding)).toBeGreaterThan(BOOSTED_TOP * KART_TUNING.slideSpeedKeep - 0.5)
    expect(kartSpeed(run(atSpeed(), DRIFT_RIGHT, 0.6))).toBeLessThan(KART_TUNING.driftTopSpeed + 1)
  })

  it('makes the boost last longer through the corner', () => {
    const start = boosted()
    const straight = run(start, THROTTLE, 1)
    const slid = run(start, DRIFT_RIGHT, 1)
    expect(start.boostSeconds - straight.boostSeconds).toBeCloseTo(1, 6)
    expect(start.boostSeconds - slid.boostSeconds).toBeCloseTo(KART_TUNING.slideBoostDrain, 1)
  })

  it('turns into a plain drift once the boost runs out', () => {
    const late = run(stepKart(withBoosts(1), BOOST), THROTTLE, KART_TUNING.boostDuration - 0.2)
    const after = run(late, DRIFT_RIGHT, 1)
    expect(after.boostSeconds).toBe(0)
    expect(after.drifting).toBe(true)
    expect(after.sliding).toBe(false)
  })

  it('works from a release boost too, so that chains can slide', () => {
    const fired = stepKart(stepKart(run(atSpeed(), DRIFT_RIGHT, 0.5), NO_INPUT), THROTTLE)
    expect(fired.miniSeconds).toBeGreaterThan(0)
    expect(run(fired, DRIFT_RIGHT, 0.2).sliding).toBe(true)
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
