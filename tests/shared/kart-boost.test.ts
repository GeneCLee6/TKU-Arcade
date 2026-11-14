import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  GAUGE_FULL,
  INITIAL_KART,
  KART_TUNING,
  kartSlip,
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
/** Held centred once a drift has begun: neither deep nor shallow */
const DRIFT_CENTRED: KartInput = { ...THROTTLE, steer: 0, drift: true }
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
  it('fills by how far the car slides: gaugeFillRate a second at driftGaugeSlip', () => {
    const { gaugeFillRate, driftGaugeSlip } = KART_TUNING
    // A settled drift: each step adds the rate times its slip over the reference slip
    const settled = run(run(atSpeed(), DRIFT_RIGHT, 0.1), DRIFT_CENTRED, 0.6)
    const next = stepKart(settled, DRIFT_CENTRED)
    const depth = Math.abs(kartSlip(next)) / driftGaugeSlip
    expect(depth).toBeGreaterThan(0.8)
    expect(depth).toBeLessThan(1.5)
    expect(next.gauge - settled.gauge).toBeCloseTo(gaugeFillRate * depth * STEP_SECONDS, 9)
  })

  it('fills faster steering into the drift and slower steering out of it, up to 1.5 times', () => {
    const entered = run(atSpeed(), DRIFT_RIGHT, 0.1)
    const rate = (steer: number) =>
      run(entered, { ...DRIFT_CENTRED, steer }, 1).gauge - entered.gauge
    expect(rate(1)).toBeGreaterThan(rate(0) * 1.2)
    expect(rate(-1)).toBeLessThan(rate(0) * 0.7)
    // However deep, no faster than one and a half times the rate
    const deep = run(entered, DRIFT_RIGHT, 1)
    const deeper = stepKart(deep, DRIFT_RIGHT)
    expect(deeper.gauge - deep.gauge).toBeCloseTo(KART_TUNING.gaugeFillRate * 1.5 * STEP_SECONDS, 9)
  })

  it('turns into a stored boost when full, about two seconds into a centred drift, and starts over', () => {
    let state = stepKart(atSpeed(), DRIFT_RIGHT)
    let steps = 1
    while (state.storedBoosts === 0) {
      state = stepKart(state, DRIFT_CENTRED)
      steps++
    }
    expect(steps / 60).toBeGreaterThan(1.5)
    expect(steps / 60).toBeLessThan(2.5)
    expect(state.gauge).toBeLessThan(KART_TUNING.gaugeFillRate * 1.5 * STEP_SECONDS)
  })

  it('does not fill outside a drift, and keeps what it has', () => {
    const part = run(atSpeed(), DRIFT_RIGHT, 0.5)
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

  it('pushes a drift already going when the boost fires, though that is no boost slide', () => {
    const drifting = {
      ...run(run(atSpeed(), DRIFT_RIGHT, 0.1), DRIFT_CENTRED, 0.4),
      storedBoosts: 1,
    }
    const plain = run(drifting, DRIFT_CENTRED, 1)
    const boosted = run(stepKart(drifting, { ...DRIFT_CENTRED, boost: true }), DRIFT_CENTRED, 1)
    expect(boosted.sliding).toBe(false)
    expect(kartSpeed(boosted)).toBeGreaterThan(kartSpeed(plain) + 3)
    expect(kartSpeed(boosted)).toBeLessThanOrEqual(BOOSTED_TOP + 1e-9)
  })

  it('lasts 3.25 seconds, and the gauge fills in three or four drifts', () => {
    expect(KART_TUNING.boostDuration).toBe(3.25)
    expect(KART_TUNING.topSpeed).toBe(60)
    // Drifts of about two thirds of a second, each let go
    let state = atSpeed()
    let drifts = 0
    while (state.storedBoosts === 0 && drifts < 6) {
      state = run(state, DRIFT_RIGHT, 0.65)
      state = run(state, THROTTLE, 0.6)
      drifts++
    }
    expect(state.storedBoosts).toBe(1)
    expect(drifts).toBeGreaterThanOrEqual(3)
    expect(drifts).toBeLessThanOrEqual(4)
  })

  it('adds the drift bonus to the gauge on letting go of a drift, not on a tap', () => {
    const drifting = run(atSpeed(), DRIFT_RIGHT, 0.5)
    const released = stepKart(drifting, THROTTLE)
    expect(released.gauge - drifting.gauge).toBeCloseTo(KART_TUNING.gaugeDriftBonus, 6)
    // A tap gets nothing for being let go
    const tap = run(atSpeed(), DRIFT_RIGHT, KART_TUNING.chainMinDrift / 2)
    expect(stepKart(tap, THROTTLE).gauge).toBe(tap.gauge)
  })

  it('fires the moment the gauge fills when the rules say so, and waits otherwise', () => {
    const auto = { ...DEFAULT_RULES, autoBoost: true }
    const manual = run(atSpeed(), DRIFT_RIGHT, 1.8)
    const automatic = run(atSpeed(), DRIFT_RIGHT, 1.8, auto)
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
    expect(kartSpeed(fired)).toBeGreaterThan(KART_TUNING.topSpeed + 2)
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

  it('goes a little faster with every link of the chain, up to chainSpeedLinks of them', () => {
    const { topSpeed, miniTopSpeedFactor, chainSpeedStep, chainSpeedLinks } = KART_TUNING
    let state = atSpeed()
    const tops: number[] = []
    for (let link = 1; link <= chainSpeedLinks + 3; link++) {
      state = run(stepKart(driftThenLift(state, 0.3), THROTTLE), THROTTLE, 0.5)
      tops.push(kartSpeed(state))
    }
    expect(tops[0]).toBeCloseTo(topSpeed * miniTopSpeedFactor, 6)
    expect(tops[1]).toBeCloseTo(topSpeed * (miniTopSpeedFactor + chainSpeedStep), 6)
    const most = topSpeed * (miniTopSpeedFactor + chainSpeedStep * chainSpeedLinks)
    expect(tops[chainSpeedLinks]).toBeCloseTo(most, 6)
    expect(tops.at(-1)).toBeCloseTo(most, 6)
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

describe('the double', () => {
  const TAP: KartInput = { ...THROTTLE, steer: 1, drift: true }
  /** A drift, let go with the throttle up, then the throttle pressed: a release boost */
  const released = () => stepKart(stepKart(run(atSpeed(), DRIFT_RIGHT, 0.4), NO_INPUT), THROTTLE)
  /** A tapped drift of three steps, let go with the throttle up */
  const tapThenLift = (state: KartState) => stepKart(run(state, TAP, 3 / 60), NO_INPUT)

  it('opens the release window again on a tapped drift just after a release boost', () => {
    const first = released()
    expect(first.doubleWindow).toBeCloseTo(KART_TUNING.doubleWindow, 9)
    const tapped = tapThenLift(first)
    expect(tapped.releaseWindow).toBeGreaterThan(0)
    expect(tapped.doubleArmed).toBe(true)
    const second = stepKart(tapped, THROTTLE)
    expect(second.doubles).toBe(1)
    expect(second.chain).toBe(2)
    // The second release boost adds its length to what is left of the first
    expect(second.miniSeconds).toBeCloseTo(tapped.miniSeconds + KART_TUNING.chainDuration - STEP_SECONDS, 9)
  })

  it('is one a drift: the tap after a double earns nothing more', () => {
    const second = stepKart(tapThenLift(released()), THROTTLE)
    expect(second.doubleWindow).toBe(0)
    const again = tapThenLift(second)
    expect(again.releaseWindow).toBe(0)
    expect(stepKart(again, THROTTLE).doubles).toBe(1)
  })

  it('needs the tap soon after the release boost, and a release boost before it', () => {
    const late = run(released(), THROTTLE, KART_TUNING.doubleWindow + 0.05)
    expect(late.doubleWindow).toBe(0)
    expect(tapThenLift(late).releaseWindow).toBe(0)
    // A tap from nothing is only a tap
    expect(tapThenLift(atSpeed()).releaseWindow).toBe(0)
  })

  it('is a plain release boost when the second drift is a long one', () => {
    const long = stepKart(stepKart(run(released(), TAP, 0.4), NO_INPUT), THROTTLE)
    expect(long.doubles).toBe(0)
    expect(long.chain).toBe(2)
    expect(long.miniSeconds).toBeCloseTo(KART_TUNING.chainDuration - STEP_SECONDS, 9)
  })
})

describe('the boost slide', () => {
  const boosted = () => run(stepKart(withBoosts(1), BOOST), THROTTLE, 0.5)

  it('starts when a drift begins during a boost, keeping the boost speed', () => {
    const sliding = run(boosted(), DRIFT_RIGHT, 1)
    expect(sliding.sliding).toBe(true)
    expect(sliding.drifting).toBe(true)
    // A plain drift held as deep and as long scrubs off a good part of its speed; the slide, pushed
    // by the boost and paying only slideScrub of the scrub, stays at the boosted top speed
    expect(kartSpeed(sliding)).toBeGreaterThan(BOOSTED_TOP * 0.97)
    expect(kartSpeed(run(atSpeed(), DRIFT_RIGHT, 1))).toBeLessThan(KART_TUNING.topSpeed * 0.8)
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
