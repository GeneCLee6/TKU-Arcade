import { describe, expect, it } from 'vitest'
import { classicAcceleration } from '../../shared/kart/classic.ts'
import { startRun, stepRun, type Course } from '../../shared/kart/course.ts'
import {
  DEFAULT_RULES,
  INITIAL_KART,
  KART_TUNING,
  kartBurstWaiting,
  kartDashDepth,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  STEP_SECONDS,
  stepKart,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack } from '../../shared/kart/track.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { touchInput, DEFAULT_TOUCH_SETTINGS } from '../../shared/kart/touch.ts'
import { collideWalls, type Wall } from '../../shared/kart/walls.ts'
import { followCar, startRig } from '../../src/kart/camera.ts'

// The classic feel (2026-11-17, owner: "while the kart is still drifting, not yet pulled back,
// counter-steer and forward should boost; pressing forward in the countdown should launch; the speed
// is odd"; docs/KART-FEEL.md): the default physics. The arcade (old) preset keeps its own tests.
// Later the same day (owner: "after the counter-steer it must not boost by itself: only when the
// player presses forward does the car pull straight and boost"): only a fresh press of the throttle
// fires the instant boost.

const T = KART_TUNING
const DEG = Math.PI / 180
const GAS: KartInput = { ...NO_INPUT, throttle: true }
const DRIFT_RIGHT: KartInput = { ...GAS, steer: 1, drift: true }
/** The throttle let go and pressed again since the last step: a fresh press (the page's tap latch) */
const TAP: KartInput = { ...GAS, throttleTap: true }

function run(state: KartState, input: KartInput, seconds: number): KartState {
  let current = state
  for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step++) {
    current = stepKart(current, input)
  }
  return current
}

/** Flat out on the throttle, at the top speed near enough */
const atSpeed = () => run(INITIAL_KART, GAS, 8)
/** A right-hand drift held this long, steering into it, the throttle down all along */
const drifted = (seconds = 0.6) => run(atSpeed(), DRIFT_RIGHT, seconds)
/** A drift deep and long enough to have earned the instant boost */
const EARNED = T.dashMinSeconds + 0.15

describe('the engine against drag', () => {
  it('pulls hardest from a standstill and eases into the top speed, never past it', () => {
    let state = INITIAL_KART
    let last = 0
    let lastGain = Infinity
    const speeds: number[] = []
    for (let step = 1; step <= 10 * 60; step++) {
      state = stepKart(state, GAS)
      const speed = kartSpeed(state)
      const gain = speed - last
      expect(gain).toBeGreaterThanOrEqual(0)
      // Each step gains no more than the one before: the pull eases off with speed
      expect(gain).toBeLessThanOrEqual(lastGain + 1e-9)
      expect(speed).toBeLessThanOrEqual(T.topSpeed + 1e-9)
      last = speed
      lastGain = gain
      if (step % 60 === 0) speeds.push(speed)
    }
    // Front-loaded: 100 km/h in about a second, 90% of the top in about three, nearly all of it by ten
    expect(speeds[0]!).toBeGreaterThan(27)
    expect(speeds[2]!).toBeGreaterThan(T.topSpeed * 0.85)
    expect(speeds[9]!).toBeGreaterThan(T.topSpeed * 0.995)
  })

  it('reads 245 km/h at the top speed on an honest dial (m/s × 3.6)', () => {
    expect(Math.round(T.topSpeed * 3.6)).toBe(245)
    // A boost settles near 1.27 times the top: about 310 km/h, under its cap
    const u = (factor: number) => {
      // factor = k·u + (1 − k)·u²
      const k = T.dragShare
      return (-k + Math.sqrt(k * k + 4 * (1 - k) * factor)) / (2 * (1 - k))
    }
    expect(u(T.boostAccelFactor)).toBeGreaterThan(1.24)
    expect(u(T.boostAccelFactor)).toBeLessThan(T.boostTopSpeedFactor)
    expect(Math.round(T.topSpeed * T.boostTopSpeedFactor * 3.6)).toBeGreaterThanOrEqual(300)
  })

  it('slows off the throttle, more at speed', () => {
    const top = { top: T.topSpeed, throttle: false, brake: false, factor: 1 }
    expect(classicAcceleration(T.topSpeed, T, top)).toBeLessThan(classicAcceleration(20, T, top))
    expect(classicAcceleration(20, T, top)).toBeLessThan(0)
  })
})

describe('steering', () => {
  it('follows a key quickly, not in one step', () => {
    const fast = atSpeed()
    const one = stepKart(fast, { ...GAS, steer: 1 })
    expect(one.steerNow).toBeCloseTo(T.steerResponse * STEP_SECONDS, 9)
    const settled = run(fast, { ...GAS, steer: 1 }, 0.3)
    expect(settled.steerNow).toBe(1)
  })

  it('a drift turns faster than grip, and loses less speed for the same turn', () => {
    const fast = atSpeed()
    const turned = (state: KartState, from: KartState) =>
      Math.abs(Math.atan2(state.vx, -state.vz) - Math.atan2(from.vx, -from.vz))
    const grip = run(fast, { ...GAS, steer: 1 }, 1)
    const drift = run(fast, DRIFT_RIGHT, 1)
    expect(turned(drift, fast)).toBeGreaterThan(turned(grip, fast) * 1.3)
    const lossPerRadian = (state: KartState) =>
      (kartSpeed(fast) - kartSpeed(state)) / turned(state, fast)
    expect(lossPerRadian(drift)).toBeLessThan(lossPerRadian(grip) * 0.8)
  })

  it('does not spin a slow drift on the spot', () => {
    const slow = run(INITIAL_KART, GAS, 0.6)
    expect(kartSpeed(slow)).toBeGreaterThan(T.driftMinSpeed)
    const before = Math.atan2(slow.vx, -slow.vz)
    const after = run(slow, DRIFT_RIGHT, 0.5)
    const fast = drifted(EARNED)
    const fastTurn = Math.atan2(fast.vx, -fast.vz) - Math.atan2(atSpeed().vx, -atSpeed().vz)
    expect(Math.atan2(after.vx, -after.vz) - before).toBeLessThan(fastTurn)
  })

  it('swings to the drift angle in about driftSlipIn, and lets it go when the key is up', () => {
    const quick = run(atSpeed(), { ...GAS, steer: 0.0001, drift: true }, T.driftSlipIn)
    expect(Math.abs(kartSlip(quick)) / DEG).toBeGreaterThan(0.85 * (T.driftSlip / DEG))
    const letGo = run(drifted(1), GAS, 0.05)
    expect(letGo.slideDirection).toBe(1)
    // Straight again at about driftRecoverRate
    const straight = run(
      drifted(1),
      GAS,
      (T.driftSlip + T.driftSlipSteer) / T.driftRecoverRate + 0.1,
    )
    expect(straight.slideDirection).toBe(0)
    expect(straight.traction).toBe(1)
    // Counter-steering straightens it twice as fast
    const half = (T.driftSlip + T.driftSlipSteer) / T.driftRecoverRate / 2 + 0.05
    const countered = run(drifted(1), { ...NO_INPUT, steer: -1 }, half)
    expect(countered.slideDirection).toBe(0)
  })

  it('cuts a slide short: a drift tap while counter-steering', () => {
    const sliding = run(drifted(1), NO_INPUT, 2 * STEP_SECONDS)
    expect(sliding.slideDirection).toBe(1)
    const tapped = stepKart(sliding, { ...NO_INPUT, steer: -1, drift: true })
    expect(tapped.drifting).toBe(false)
    const cut = run(tapped, { ...NO_INPUT, steer: -1 }, T.cutSeconds)
    expect(cut.slideDirection).toBe(0)
    // Left alone, the same slide takes far longer
    expect(run(sliding, NO_INPUT, T.cutSeconds + STEP_SECONDS).slideDirection).toBe(1)
    // Held on (off the throttle: on it, the counter-steer fires the dash), the drift key starts the
    // drift the other way once the car is straight
    const connected = run(sliding, { ...NO_INPUT, steer: -1, drift: true }, T.cutSeconds + 0.1)
    expect(connected.driftDirection).toBe(-1)
  })
})

describe('the instant boost (the dash)', () => {
  const dashed = (before: KartState, after: KartState) => after.miniSeconds > before.miniSeconds

  it('is earned by a drift deep enough and long enough, and only then', () => {
    expect(drifted(EARNED).burstReady).toBe(true)
    // Steering out of it all along: a shallow drift (8°) earns nothing, however long
    const shallow = stepKart(atSpeed(), { ...GAS, steer: 0.0001, drift: true })
    const held = run(shallow, { ...GAS, steer: -1, drift: true }, 1)
    expect(held.drifting).toBe(true)
    expect(held.driftPeak!).toBeLessThan(T.dashMinSlip)
    expect(held.burstReady).toBe(false)
    // Nor does the slide-out of one, however the throttle goes
    const out = run(held, NO_INPUT, 0.1)
    expect(dashed(out, stepKart(out, { ...GAS, steer: -1 }))).toBe(false)
  })

  // 2026-11-18, owner: "a player can mindlessly drift a little and boost, drift a little and boost,
  // all lap long; it should take a big drift to boost"
  it('a tapped drift earns nothing: not deep, not long', () => {
    for (const seconds of [0.1, 0.2, 0.3]) {
      const tap = drifted(seconds)
      expect(tap.burstReady).toBe(false)
      // Let go, counter-steer, a fresh press of forward: no dash, sliding out or straight again
      let state = run(tap, { ...NO_INPUT, steer: -1 }, 2 * STEP_SECONDS)
      for (let step = 0; step < 90; step++) {
        const input = step % 4 < 2 ? { ...TAP, steer: -1 } : { ...NO_INPUT, steer: -1 }
        const next = stepKart(state, input)
        expect(dashed(state, next)).toBe(false)
        state = next
      }
    }
  })

  it('a drift with the stick centred never gets deep enough, however long it is held', () => {
    const entered = stepKart(atSpeed(), DRIFT_RIGHT)
    const centred = run(entered, { ...GAS, drift: true }, 3)
    expect(centred.drifting).toBe(true)
    expect(Math.abs(kartSlip(centred)) / DEG).toBeCloseTo(T.driftSlip / DEG, 0)
    expect(centred.burstReady).toBe(false)
  })

  it('a deep drift let go too soon earns nothing; held on, it does', () => {
    // Deep enough before it is long enough: the length is what is missing
    let state = atSpeed()
    let steps = 0
    while ((state.driftPeak ?? 0) < T.dashMinSlip && steps < 120) {
      state = stepKart(state, DRIFT_RIGHT)
      steps++
    }
    expect(steps * STEP_SECONDS).toBeLessThan(T.dashMinSeconds)
    expect(steps * STEP_SECONDS).toBeGreaterThan(0.25)
    expect(state.burstReady).toBe(false)
    const held = run(state, DRIFT_RIGHT, T.dashMinSeconds - steps * STEP_SECONDS + STEP_SECONDS)
    expect(held.burstReady).toBe(true)
    // By then the car has come well round: a dash takes a real corner
    const turned = Math.atan2(held.vx, -held.vz) - Math.atan2(atSpeed().vx, -atSpeed().vz)
    expect(turned / DEG).toBeGreaterThan(40)
  })

  it('the depth meter rises with the drift and is full only once the dash is earned', () => {
    expect(kartDashDepth(atSpeed(), T)).toBe(0)
    const early = drifted(0.15)
    const later = drifted(0.3)
    expect(kartDashDepth(early, T)).toBeGreaterThan(0.1)
    expect(kartDashDepth(later, T)).toBeGreaterThan(kartDashDepth(early, T))
    expect(kartDashDepth(later, T)).toBeLessThan(1)
    expect(kartDashDepth(drifted(EARNED), T)).toBe(1)
    // Let go, the meter is gone (the prompt takes over)
    expect(kartDashDepth(run(drifted(EARNED), GAS, 0.05), T)).toBe(0)
  })

  it('the car hardly turns until the slip is there: the tail goes out first', () => {
    const from = atSpeed()
    const travel = (state: KartState) => Math.atan2(state.vx, -state.vz)
    const first = travel(run(from, DRIFT_RIGHT, 0.1)) - travel(from)
    const deep = drifted(1)
    const later = travel(run(deep, DRIFT_RIGHT, 0.1)) - travel(deep)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(later * 0.65)
  })

  it('never fires by itself: counter-steering with the throttle held all along does nothing', () => {
    // Still drifting, the drift key down
    const drift = drifted(EARNED)
    expect(drift.burstReady).toBe(true)
    expect(drift.throttleHeld).toBe(true)
    const countered = run(drift, { ...GAS, steer: -1, drift: true }, 0.5)
    expect(countered.miniSeconds).toBe(0)
    expect(countered.chain).toBe(0)
    // The drift key let go, the car sliding out, counter-steered all the way to straight and after
    let state = drifted(EARNED)
    for (let step = 0; step < 120; step++) {
      const next = stepKart(state, { ...GAS, steer: step < 40 ? -1 : 0 })
      expect(dashed(state, next)).toBe(false)
      state = next
    }
    expect(state.slideDirection).toBe(0)
    expect(state.releaseWindow).toBe(0)
    // The counter-steer does straighten the car sooner than leaving it alone
    const straightAfter = (steer: number) => {
      let sliding = run(drifted(EARNED), GAS, STEP_SECONDS)
      let steps = 0
      while (sliding.slideDirection !== 0 && steps < 300) {
        sliding = stepKart(sliding, { ...GAS, steer })
        steps++
      }
      return steps
    }
    expect(straightAfter(-1)).toBeLessThan(straightAfter(0) * 0.7)
  })

  it('(a) fires while still drifting: counter-steer and a fresh press of the throttle', () => {
    const coasting = run(atSpeed(), { ...NO_INPUT, steer: 1, drift: true }, 0.5)
    expect(coasting.burstReady).toBe(true)
    const fired = stepKart(coasting, { ...GAS, steer: -1, drift: true })
    expect(dashed(coasting, fired)).toBe(true)
    // The drift ends and the slide is put away at once: the car is pulled straight
    expect(fired.drifting).toBe(false)
    expect(run(fired, GAS, T.cutSeconds + STEP_SECONDS).slideDirection).toBe(0)
    // The drift key held on does not drift again until it comes up
    expect(run(fired, { ...GAS, steer: 1, drift: true }, 0.2).drifting).toBe(false)
    // Steering into the drift, the drift key still down, a fresh press is only the throttle again:
    // lifting off to tighten a drift does not end it
    const tightened = stepKart(coasting, { ...GAS, steer: 1, drift: true })
    expect(dashed(coasting, tightened)).toBe(false)
    expect(tightened.drifting).toBe(true)
  })

  it('(b) fires for a driver who holds the throttle: let go of it and press again', () => {
    // The drift key let go, the throttle still down: sliding out, nothing yet
    const sliding = run(drifted(EARNED), { ...GAS, steer: -1 }, 0.1)
    expect(sliding.slideDirection).toBe(1)
    expect(sliding.miniSeconds).toBe(0)
    // Up for a step, then down
    const lifted = stepKart(sliding, { ...NO_INPUT, steer: -1 })
    expect(dashed(sliding, lifted)).toBe(false)
    const fired = stepKart(lifted, { ...GAS, steer: -1 })
    expect(dashed(lifted, fired)).toBe(true)
    // The slide is put away at once
    expect(run(fired, GAS, T.cutSeconds + STEP_SECONDS).slideDirection).toBe(0)
  })

  it('(c) fires sliding out with no counter-steer too: the fresh press is what counts', () => {
    const sliding = run(drifted(EARNED), NO_INPUT, 0.1)
    expect(sliding.slideDirection).toBe(1)
    expect(sliding.miniSeconds).toBe(0)
    const fired = stepKart(sliding, GAS)
    expect(dashed(sliding, fired)).toBe(true)
  })

  it('(d) fires after the car straightens: a fresh press within releaseWindow, not after', () => {
    // Throttle held all through the slide-out, no counter-steer: nothing yet
    const straight = run(drifted(EARNED), GAS, 1)
    expect(straight.slideDirection).toBe(0)
    expect(straight.releaseWindow).toBeGreaterThan(0)
    expect(straight.miniSeconds).toBe(0)
    expect(kartBurstWaiting(straight, T)).toBe(true)
    // Let go and press again inside the window
    const lifted = stepKart(straight, NO_INPUT)
    expect(dashed(lifted, stepKart(lifted, GAS))).toBe(true)
    // Too late
    let late = straight
    while (late.releaseWindow > 0) late = stepKart(late, NO_INPUT)
    expect(dashed(late, stepKart(late, GAS))).toBe(false)
  })

  it('takes a press let go and pressed again between two steps (the tap latch)', () => {
    const straight = run(drifted(EARNED), GAS, 1)
    expect(straight.throttleHeld).toBe(true)
    expect(dashed(straight, stepKart(straight, GAS))).toBe(false)
    expect(dashed(straight, stepKart(straight, { ...GAS, throttleTap: true }))).toBe(true)
  })

  it('is forfeit to a new drift before it fires: the new drift has to earn its own', () => {
    const straight = run(drifted(EARNED), GAS, 1)
    expect(straight.releaseWindow).toBeGreaterThan(0)
    const again = stepKart(straight, { ...GAS, steer: 0.0001, drift: true })
    expect(again.drifting).toBe(true)
    expect(again.releaseWindow).toBe(0)
    expect(again.burstReady).toBe(false)
  })

  it('multiplies the pull and lifts the top speed a little, for most of a second', () => {
    const drift = drifted(EARNED)
    const fired = run(drift, { ...TAP, steer: -1 }, STEP_SECONDS)
    expect(fired.miniSeconds).toBeCloseTo(T.chainDuration - STEP_SECONDS, 9)
    // Against letting go without one (chain boosts off)
    const without = (state: KartState, seconds: number) => {
      let current = state
      for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step++) {
        current = stepKart(current, { ...GAS, steer: -1 }, T, {
          ...DEFAULT_RULES,
          chainBoosts: false,
        })
      }
      return current
    }
    const boosted = run(fired, GAS, 0.5)
    const unboosted = without(drift, 0.5 + STEP_SECONDS)
    expect(kartSpeed(boosted) - kartSpeed(unboosted)).toBeGreaterThan(2)
    // Never past its own cap
    const flat = run(atSpeed(), GAS, 1)
    const atTop = { ...flat, miniSeconds: T.chainDuration }
    expect(kartSpeed(run(atTop, GAS, 0.5))).toBeLessThanOrEqual(
      T.topSpeed * T.miniTopSpeedFactor + 1e-9,
    )
    expect(kartSpeed(run(atTop, GAS, 0.5))).toBeGreaterThan(T.topSpeed + 1)
  })

  it('chains, each link worth a little more, up to chainSpeedLinks', () => {
    let state = atSpeed()
    let chain = 0
    for (let link = 0; link < 6; link++) {
      state = run(state, DRIFT_RIGHT, EARNED)
      state = stepKart(state, { ...TAP, steer: -1 })
      state = run(state, GAS, 0.2)
      chain = state.chain
    }
    expect(chain).toBe(6)
    const most = T.miniTopSpeedFactor + T.chainSpeedStep * T.chainSpeedLinks
    expect(most).toBeLessThan(1.14)
  })

  it('no double any more: a tapped drift right after a dash earns nothing either', () => {
    expect(T.doubleWindow).toBe(0)
    const fired = stepKart(drifted(EARNED), { ...TAP, steer: -1 })
    expect(fired.miniSeconds).toBeGreaterThan(0)
    expect(fired.doubleWindow).toBe(0)
    let state = run(fired, GAS, 0.1)
    state = run(state, { ...GAS, steer: -0.2, drift: true }, 3 * STEP_SECONDS)
    expect(state.burstReady).toBe(false)
    const second = stepKart(state, { ...TAP, steer: 1 })
    expect(second.doubles).toBe(0)
    expect(second.miniSeconds).toBeLessThan(state.miniSeconds)
  })

  it('the double still works for numbers that turn it on (the tuning panel)', () => {
    const on = { ...T, doubleWindow: 0.5 }
    const go = (state: KartState, input: KartInput, seconds: number) => {
      let current = state
      for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step++) {
        current = stepKart(current, input, on)
      }
      return current
    }
    const fired = stepKart(drifted(EARNED), { ...TAP, steer: -1 }, on)
    expect(fired.doubleWindow).toBeGreaterThan(0)
    let state = go(fired, GAS, 0.1)
    state = go(state, { ...GAS, steer: -0.2, drift: true }, 3 * STEP_SECONDS)
    expect(state.driftPeak!).toBeLessThan(T.dashMinSlip)
    expect(state.burstReady).toBe(true)
    expect(stepKart(state, { ...TAP, steer: 1 }, on).doubles).toBe(1)
  })
})

describe('the boost (N2O)', () => {
  const stocked = (state: KartState) => ({ ...state, storedBoosts: 2 })
  const BOOST: KartInput = { ...GAS, boost: true }

  // 2026-11-18, owner: "what is stacking for? normally one has to end before the next"
  it('lasts boostDuration; the key does nothing while it runs: no restart, no stack, no push', () => {
    const fired = stepKart(stocked(atSpeed()), BOOST)
    expect(fired.storedBoosts).toBe(1)
    expect(fired.boostSeconds).toBeCloseTo(T.boostDuration - STEP_SECONDS, 9)
    const later = run(fired, GAS, 1)
    // Pressed again mid-boost: exactly the step it would have been without the press
    const again = stepKart(later, BOOST)
    const plain = stepKart(later, GAS)
    expect(again.storedBoosts).toBe(1)
    expect(again.boostSeconds).toBe(plain.boostSeconds)
    expect(again.stackSeconds).toBe(0)
    expect(kartSpeed(again)).toBe(kartSpeed(plain))
    // Hammering the key all through it changes nothing either
    let hammered = fired
    let left = fired
    for (let step = 0; step < 120; step++) {
      hammered = stepKart(hammered, step % 2 === 0 ? BOOST : GAS)
      left = stepKart(left, GAS)
    }
    expect(hammered.storedBoosts).toBe(1)
    expect(hammered.boostSeconds).toBe(left.boostSeconds)
    expect(kartSpeed(hammered)).toBe(kartSpeed(left))
    expect(hammered.z).toBe(left.z)
  })

  it('fires the next only once the first has run out, on a fresh press', () => {
    let state = stepKart(stocked(atSpeed()), BOOST)
    // The key held down all through the boost and past its end: nothing (it fires once a press)
    while (state.boostSeconds > 0) state = stepKart(state, BOOST)
    state = stepKart(state, BOOST)
    expect(state.boostSeconds).toBe(0)
    expect(state.storedBoosts).toBe(1)
    // Let go and pressed again: the second
    state = stepKart(stepKart(state, GAS), BOOST)
    expect(state.storedBoosts).toBe(0)
    expect(state.boostSeconds).toBeCloseTo(T.boostDuration - STEP_SECONDS, 9)
  })

  it('a pad or an item boost running blocks the key too, and never adds up with a charge', () => {
    // A boost from a pad or the tailwind item is the same boost (boostSeconds): the longer of the
    // two stays, the key does nothing until it is over, and the charge is kept
    const onPad = { ...stocked(atSpeed()), boostSeconds: T.padBoostSeconds }
    const pressed = stepKart(onPad, BOOST)
    expect(pressed.storedBoosts).toBe(2)
    expect(pressed.boostSeconds).toBeCloseTo(T.padBoostSeconds - STEP_SECONDS, 9)
    // The automatic boost (a room option) waits for it to end as well
    const auto = stepKart(onPad, GAS, T, { ...DEFAULT_RULES, autoBoost: true })
    expect(auto.storedBoosts).toBe(2)
  })

  it('goes about 1.25 times the top speed, under its cap', () => {
    const boosted = run(stepKart(stocked(atSpeed()), BOOST), GAS, 2.5)
    expect(kartSpeed(boosted)).toBeGreaterThan(T.topSpeed * 1.2)
    expect(kartSpeed(boosted)).toBeLessThanOrEqual(T.topSpeed * T.boostTopSpeedFactor + 1e-9)
  })

  it('stores one a full gauge, two at most, and fills nothing during a boost', () => {
    const full = run(atSpeed(), DRIFT_RIGHT, 0.1)
    const ready = stepKart({ ...full, gauge: 99.99 }, DRIFT_RIGHT)
    expect(ready.storedBoosts).toBe(1)
    const boosting = { ...drifted(0.2), boostSeconds: 2, gauge: 10 }
    expect(stepKart(boosting, DRIFT_RIGHT).gauge).toBe(10)
    const stored = { ...drifted(0.2), storedBoosts: T.maxStoredBoosts, gauge: 50 }
    expect(stepKart(stored, DRIFT_RIGHT).gauge).toBe(50)
  })

  it('fills by the speed, and less a second the longer one drift lasts', () => {
    const rate = (state: KartState, seconds: number) => {
      const after = run(state, DRIFT_RIGHT, seconds)
      return (after.gauge - state.gauge) / seconds
    }
    const fresh = drifted(0.1)
    const long = drifted(2)
    expect(rate(fresh, 0.3)).toBeGreaterThan(rate(long, 0.3) * 1.8)
    // Slower, less
    const slow = run(INITIAL_KART, GAS, 1)
    const slowDrift = run(slow, DRIFT_RIGHT, 0.1)
    expect(rate(slowDrift, 0.3)).toBeLessThan(rate(fresh, 0.3))
  })
})

describe('the start', () => {
  const oval = parseTrack(TEST_OVAL)
  if ('problems' in oval) throw new Error(oval.problems.join('; '))
  const plain = courseOf(oval.track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: oval.track.road }

  /**
   * The countdown with the throttle down from `pressAt` seconds before GO, then `after` past it.
   * Without a press, the throttle goes down only once the grace after GO is over: a plain start
   */
  function start(pressAt: number | null, after = 1.5) {
    let trial = startTrial(course)
    while (trial.phase === 'countdown') {
      const input = pressAt !== null && trial.countdown <= pressAt + 1e-9 ? GAS : NO_INPUT
      trial = stepTrial(trial, input, course)
    }
    const launched = trial
    for (let step = 0; step < Math.round(after / STEP_SECONDS); step++) {
      const late = pressAt === null && step * STEP_SECONDS <= T.startLate + STEP_SECONDS
      trial = stepTrial(trial, late ? NO_INPUT : GAS, course)
    }
    return { launched, trial }
  }

  it('launches on a press in the last moment before GO', () => {
    const { launched, trial } = start(T.startWindow - 0.1)
    expect(launched.start).toBe('boost')
    expect(launched.run.kart.launchSeconds).toBeCloseTo(T.startBoostDuration, 9)
    const plain = start(null).trial
    expect(kartSpeed(trial.run.kart)).toBeGreaterThan(kartSpeed(plain.run.kart) + 5)
  })

  it('is a launch: well ahead after a second and a half, and over the plain top speed', () => {
    const perfect = start(T.startWindow - 0.1).trial.run.kart
    const plain = start(null).trial.run.kart
    const gone = (kart: KartState) => Math.hypot(kart.x - plain.x, kart.z - plain.z)
    // A dozen metres up the road on a plain start, a second and a half after GO
    expect(gone(perfect)).toBeGreaterThan(12)
    // Faster than the engine alone ever goes, and never over its own cap
    expect(kartSpeed(perfect)).toBeGreaterThan(T.topSpeed * 1.03)
    expect(kartSpeed(perfect)).toBeLessThanOrEqual(T.topSpeed * T.startTopSpeedFactor + 1e-9)
    // 0 to 100 km/h in well under a second
    let trial = start(T.startWindow - 0.1, 0).launched
    let steps = 0
    while (kartSpeed(trial.run.kart) < 100 / 3.6) {
      trial = stepTrial(trial, GAS, course)
      steps++
    }
    expect(steps * STEP_SECONDS).toBeLessThan(0.6)
  })

  it('held from too early: a smaller launch, and never a stall', () => {
    const { launched, trial } = start(2.5)
    expect(launched.start).toBe('quick')
    expect(launched.run.kart.launchSeconds).toBeCloseTo(T.startBoostDuration * T.startEarlyShare, 9)
    expect(launched.run.kart.stallSeconds).toBe(0)
    const perfect = start(T.startWindow - 0.1).trial
    const plain = start(null).trial
    expect(kartSpeed(trial.run.kart)).toBeLessThan(kartSpeed(perfect.run.kart))
    expect(kartSpeed(trial.run.kart)).toBeGreaterThan(kartSpeed(plain.run.kart))
  })

  it('still counts a fresh press just after GO', () => {
    let trial = startTrial(course)
    while (trial.phase === 'countdown') trial = stepTrial(trial, NO_INPUT, course)
    expect(trial.start).toBe('none')
    trial = stepTrial(trial, GAS, course)
    expect(trial.start).toBe('boost')
    expect(trial.run.kart.launchSeconds).toBeGreaterThan(0)
  })
})

describe('walls', () => {
  // A wall along x at z = -10; the car comes at it
  const WALL: Wall = { ax: -100, az: -10, bx: 100, bz: -10 }
  function hit(angleFromWall: number) {
    const speed = 50
    const z = -10 + 1.25
    const before: KartState = { ...INITIAL_KART, z }
    const vx = speed * Math.cos(angleFromWall)
    const vz = -speed * Math.sin(angleFromWall)
    const after: KartState = { ...before, x: vx * STEP_SECONDS, z: z + vz * STEP_SECONDS, vx, vz }
    const { state } = collideWalls(before, after, [WALL], T)
    return 1 - kartSpeed(state) / speed
  }

  it('head on stops the car nearly dead; a glancing hit costs little and slides along', () => {
    expect(hit(90 * DEG)).toBeGreaterThan(0.7)
    expect(hit(90 * DEG)).toBeLessThan(0.95)
    expect(hit(15 * DEG)).toBeGreaterThan(0.08)
    expect(hit(15 * DEG)).toBeLessThan(0.3)
    expect(hit(45 * DEG)).toBeGreaterThan(hit(15 * DEG))
    expect(hit(45 * DEG)).toBeLessThan(hit(90 * DEG))
  })

  it('a hard crash keeps half the gauge and ends the drift', () => {
    const course: Course = {
      walls: [WALL],
      start: { x: 0, z: 0, heading: 0 },
    }
    let state = startRun(course)
    state = {
      ...state,
      kart: { ...state.kart, vz: -50, gauge: 60, drifting: true, driftDirection: 1 },
    }
    const after = stepRun(state, { ...GAS, steer: 1, drift: true }, course)
    let before = state
    let crashed = after
    while (crashed.hitSpeed < T.wallBreakSpeed && crashed.kart.z > -9) {
      before = crashed
      crashed = stepRun(crashed, { ...GAS, steer: 1, drift: true }, course)
    }
    expect(crashed.hitSpeed).toBeGreaterThanOrEqual(T.wallBreakSpeed)
    expect(crashed.kart.gauge).toBeLessThanOrEqual(before.kart.gauge * T.wallGaugeKeep + 1)
    expect(crashed.kart.gauge).toBeGreaterThan(before.kart.gauge * T.wallGaugeKeep - 1)
    expect(crashed.kart.drifting).toBe(false)
  })
})

describe('touch, with the automatic throttle', () => {
  it('keeps the throttle on through a drift; a counter-steer alone fires nothing', () => {
    const drift = drifted(EARNED)
    const moment = { racing: true, burstWaiting: kartBurstWaiting(drift, T) }
    expect(moment.burstWaiting).toBe(false)
    const input = touchInput(
      { held: new Set(['left', 'drift']), tapped: new Set(), slider: 0 },
      DEFAULT_TOUCH_SETTINGS,
      moment,
    )
    expect(input.throttle).toBe(true)
    expect(stepKart(drift, input).miniSeconds).toBe(0)
  })

  it('lets go while the car slides out of a drift that earned a dash: a tap of GAS fires it', () => {
    const sliding = run(drifted(EARNED), GAS, 0.1)
    expect(sliding.slideDirection).toBe(1)
    const moment = { racing: true, burstWaiting: kartBurstWaiting(sliding, T) }
    expect(moment.burstWaiting).toBe(true)
    const idle = touchInput(
      { held: new Set(['left']), tapped: new Set(), slider: 0 },
      DEFAULT_TOUCH_SETTINGS,
      moment,
    )
    expect(idle.throttle).toBe(false)
    const lifted = stepKart(sliding, idle)
    expect(lifted.miniSeconds).toBe(0)
    const tap = touchInput(
      { held: new Set(['left']), tapped: new Set(['throttle']), slider: 0 },
      DEFAULT_TOUCH_SETTINGS,
      { racing: true, burstWaiting: kartBurstWaiting(lifted, T) },
    )
    expect(stepKart(lifted, tap).miniSeconds).toBeGreaterThan(0)
    // A slide-out that earned nothing keeps the engine running
    const shallow = run(drifted(0.25), GAS, 0.05)
    expect(shallow.slideDirection).not.toBe(0)
    expect(kartBurstWaiting(shallow, T)).toBe(false)
  })

  it('lets go once the car has straightened, so a tap of GAS is a fresh press', () => {
    const straight = run(drifted(EARNED), GAS, 1)
    const moment = { racing: true, burstWaiting: kartBurstWaiting(straight, T) }
    const idle = touchInput(
      { held: new Set(), tapped: new Set(), slider: 0 },
      DEFAULT_TOUCH_SETTINGS,
      moment,
    )
    expect(idle.throttle).toBe(false)
    const lifted = stepKart(straight, idle)
    const tap = touchInput(
      { held: new Set(), tapped: new Set(['throttle']), slider: 0 },
      DEFAULT_TOUCH_SETTINGS,
      moment,
    )
    expect(tap.throttleTap).toBe(true)
    expect(stepKart(lifted, tap).miniSeconds).toBeGreaterThan(0)
  })
})

describe('the chase camera', () => {
  it('settles on its aim in about 0.15 s, without overshooting', () => {
    const car = { heading: 0.5, vx: 40 * Math.sin(0.5), vz: -40 * Math.cos(0.5), boosting: false }
    let rig = startRig(0)
    let most = 0
    let at = 0
    for (let frame = 1; frame <= 60; frame++) {
      rig = followCar(rig, car, 1 / 60)
      most = Math.max(most, rig.heading)
      if (at === 0 && rig.heading >= 0.5 * 0.6) at = frame / 60
    }
    expect(at).toBeGreaterThan(0.08)
    expect(at).toBeLessThan(0.22)
    expect(most).toBeLessThanOrEqual(0.5 + 1e-9)
    expect(rig.heading).toBeCloseTo(0.5, 3)
  })
})
