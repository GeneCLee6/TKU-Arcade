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
    const fast = drifted(0.5)
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

  it('is earned by a drift with the tail out far enough for long enough, and only then', () => {
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
  // all lap long; it should take a big drift to boost". Then, with the marks at 32° and 0.45 s: "now
  // it drifts too big again: a drift that really slid should boost"
  it('a tapped drift earns nothing: not long enough, however the stick goes', () => {
    for (const seconds of [0.05, 0.1, 0.2]) {
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

  it('a real drift earns it: a third of a second with the tail out, the stick not all the way in', () => {
    expect(drifted(0.3).burstReady).toBe(true)
    // The stick centred after the turn-in: a little later, once the slip has come out
    const entered = stepKart(atSpeed(), DRIFT_RIGHT)
    const centred = (seconds: number) => run(entered, { ...GAS, drift: true }, seconds)
    expect(centred(0.2).burstReady).toBe(false)
    expect(centred(0.4).burstReady).toBe(true)
    expect(Math.abs(kartSlip(centred(3))) / DEG).toBeCloseTo(T.driftSlip / DEG, 0)
    // Half way in is plenty (it took the stick all the way in while the mark was 32°)
    expect(run(atSpeed(), { ...DRIFT_RIGHT, steer: 0.5 }, 0.35).burstReady).toBe(true)
  })

  it('a drift let go too soon earns nothing; held on, it does', () => {
    // Out far enough before it is long enough: the length is what is missing
    let state = atSpeed()
    let steps = 0
    while ((state.driftPeak ?? 0) < T.dashMinSlip && steps < 120) {
      state = stepKart(state, DRIFT_RIGHT)
      steps++
    }
    expect(steps * STEP_SECONDS).toBeLessThan(T.dashMinSeconds)
    expect(steps * STEP_SECONDS).toBeGreaterThan(0.08)
    expect(state.burstReady).toBe(false)
    const held = run(state, DRIFT_RIGHT, T.dashMinSeconds - steps * STEP_SECONDS + STEP_SECONDS)
    expect(held.burstReady).toBe(true)
    // The tail is well out by then (a real drift), though the car has hardly come round yet
    expect(Math.abs(kartSlip(held)) / DEG).toBeGreaterThan(20)
    const turned = Math.atan2(held.vx, -held.vz) - Math.atan2(atSpeed().vx, -atSpeed().vz)
    expect(turned / DEG).toBeLessThan(30)
  })

  // "Only the grip need not be so good": what keeps the dash from being fired all lap long is what
  // a drift costs. Weaving down a straight, a drift each way just long enough and a dash out of
  // each, gets no further than driving straight, and swings wider than a road is
  it('weaving down a straight for dash after dash does not pay', () => {
    const from = atSpeed()
    const plain = run(from, GAS, 12)
    let kart = from
    let phase: 'drift' | 'lift' | 'tap' | 'recover' = 'drift'
    let dir = 1
    let lift = 0
    let dashes = 0
    let widest = 0
    for (let step = 0; step < 12 * 60; step++) {
      let input: KartInput = GAS
      if (phase === 'drift') {
        input = { ...GAS, drift: true, steer: dir }
        if (kart.burstReady) {
          phase = 'lift'
          lift = 2
        }
      } else if (phase === 'lift') {
        input = { ...NO_INPUT, steer: -dir }
        if (--lift <= 0) phase = 'tap'
      } else if (phase === 'tap') {
        input = { ...TAP, steer: -dir }
        phase = 'recover'
      } else {
        input = { ...GAS, steer: Math.max(-1, Math.min(1, -kart.heading * 6)) }
        const travel = Math.atan2(kart.vx, -kart.vz)
        const settled = kart.slideDirection === 0 && Math.abs(travel) < 3 * DEG
        if (settled && kart.miniSeconds < 0.05) {
          dir = kart.x - from.x > 0 ? -1 : 1
          phase = 'drift'
        }
      }
      const next = stepKart(kart, input)
      if (dashed(kart, next)) dashes++
      kart = next
      widest = Math.max(widest, Math.abs(kart.x - from.x))
    }
    expect(dashes).toBeGreaterThanOrEqual(8)
    expect(from.z - kart.z).toBeLessThan((from.z - plain.z) * 1.01)
    expect(widest).toBeGreaterThan(20)
  })

  it('the depth meter rises with the drift and is full only once the dash is earned', () => {
    expect(kartDashDepth(atSpeed(), T)).toBe(0)
    const early = drifted(0.08)
    const later = drifted(0.16)
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

  it('stores one a full gauge, two at most', () => {
    const full = run(atSpeed(), DRIFT_RIGHT, 0.5)
    const ready = stepKart({ ...full, gauge: 99.99 }, DRIFT_RIGHT)
    expect(ready.storedBoosts).toBe(1)
    const stored = { ...drifted(0.5), storedBoosts: T.maxStoredBoosts, gauge: 50 }
    expect(stepKart(stored, DRIFT_RIGHT).gauge).toBe(50)
  })
})

// 2026-11-18, owner, after #102 to #104: "the N2O fills too slowly: an expert should be able to
// boost all the way round and a novice not; ask a little more skill". The gauge goes by the quality
// of the drift: how deep, how long, how fast, a clean exit, an instant boost out of it, well timed,
// and one after another (docs/KART-FEEL.md §3.5)
describe('the gauge by the quality of the drift', () => {
  const rate = (state: KartState, seconds: number) =>
    (run(state, DRIFT_RIGHT, seconds).gauge - state.gauge) / seconds
  /** A drift held `seconds`, then let go with the stick against it and the throttle up */
  const letGo = (seconds: number, from: KartState = atSpeed()) =>
    stepKart(run(from, DRIFT_RIGHT, seconds), { ...NO_INPUT, steer: -1 })
  /** ... and the throttle pressed afresh `after` seconds later: the instant boost */
  const exit = (seconds: number, after = 0, from: KartState = atSpeed()) =>
    stepKart(run(letGo(seconds, from), { ...NO_INPUT, steer: -1 }, after), { ...GAS, steer: -1 })

  it('a tapped drift fills nothing; a real one fills, and less a second once it is a long one', () => {
    expect(run(atSpeed(), DRIFT_RIGHT, T.gaugeLead).gauge).toBe(0)
    const real = drifted(2 * T.gaugeLead + 0.05)
    const long = drifted(T.gaugeFade + 2)
    expect(rate(real, 0.3)).toBeGreaterThan(10)
    expect(rate(real, 0.3)).toBeGreaterThan(rate(long, 0.3) * 1.8)
  })

  it('goes by the square of the speed: a slow drift fills a fraction', () => {
    const slow = run(INITIAL_KART, GAS, 1)
    const share = kartSpeed(slow) / kartSpeed(atSpeed())
    expect(share).toBeLessThan(0.6)
    const slowRate = rate(run(slow, DRIFT_RIGHT, 0.45), 0.2)
    expect(slowRate).toBeGreaterThan(0)
    expect(slowRate).toBeLessThan(rate(drifted(0.45), 0.2) * 0.45)
  })

  it('fills during a boost as well: a drift through a boost earns the next', () => {
    const plain = drifted(0.45)
    const boosting = { ...plain, boostSeconds: 2 }
    expect(rate(boosting, 0.2)).toBeGreaterThan(rate(plain, 0.2) * 0.95)
  })

  it('grades the timing of the press: perfect, good, late', () => {
    const perfect = exit(0.6)
    const good = exit(0.6, T.perfectWindow + 0.1)
    const straight = run(drifted(0.6), GAS, 1)
    const late = stepKart(stepKart(straight, NO_INPUT), GAS)
    expect([perfect.dashGrade, good.dashGrade, late.dashGrade]).toEqual([3, 2, 1])
    // The exit's bonus: a perfect one is worth the most, a late one the least
    expect(perfect.gaugeGain!).toBeGreaterThan(good.gaugeGain! * 1.3)
    expect(good.gaugeGain!).toBeGreaterThan(late.gaugeGain! * 1.3)
    expect(late.gaugeGain!).toBeGreaterThan(0)
    // ... and the longest and strongest instant boost
    expect(perfect.miniSeconds).toBeCloseTo(T.chainDuration * T.perfectShare - STEP_SECONDS, 9)
    expect(good.miniSeconds).toBeCloseTo(T.chainDuration - STEP_SECONDS, 9)
    expect(late.miniSeconds).toBeCloseTo(T.chainDuration * T.lateShare - STEP_SECONDS, 9)
    const reach = (fired: KartState) => kartSpeed(run(fired, GAS, fired.miniSeconds))
    expect(reach(perfect)).toBeGreaterThan(reach(good) + 1)
    // The window: a press just inside it is still perfect
    expect(exit(0.6, T.perfectWindow - 2 * STEP_SECONDS).dashGrade).toBe(3)
  })

  it('a perfect one takes a drift that lasted: a short one, however crisp, is good', () => {
    expect(exit(T.perfectMinSeconds - 0.1).dashGrade).toBe(2)
    expect(exit(T.perfectMinSeconds + 0.05).dashGrade).toBe(3)
    // With the drift key still held (the stick against the drift): good
    const held = stepKart(drifted(0.6), { ...TAP, steer: -1, drift: true })
    expect(held.dashGrade).toBe(2)
  })

  it('a press wasted just before letting go spoils it: mashing forward is not timing', () => {
    // The throttle let go and pressed again in the drift, steering into it: nothing fires
    const mashed = stepKart(drifted(0.6), { ...DRIFT_RIGHT, throttleTap: true })
    expect(mashed.miniSeconds).toBe(0)
    const soon = stepKart(stepKart(run(mashed, DRIFT_RIGHT, 0.05), { ...NO_INPUT, steer: -1 }), {
      ...GAS,
      steer: -1,
    })
    expect(soon.dashGrade).toBe(2)
    // Long enough after it, the press is forgotten
    const later = stepKart(stepKart(run(mashed, DRIFT_RIGHT, 0.3), { ...NO_INPUT, steer: -1 }), {
      ...GAS,
      steer: -1,
    })
    expect(later.dashGrade).toBe(3)
  })

  it('most of the gauge comes at the exit: the same drift with no instant boost earns a third', () => {
    const without = run(drifted(0.6), GAS, 1.5)
    expect(without.miniSeconds).toBe(0)
    const fired = exit(0.6)
    expect(fired.gauge).toBeGreaterThan(without.gauge * 2.5)
    // A longer drift is worth more; one only just earned, a little
    expect(exit(0.6).gaugeGain!).toBeGreaterThan(exit(T.dashMinSeconds + 0.05).gaugeGain! * 3)
    // A deep one more than a shallow one (the stick centred after the drift begins)
    const shallow = stepKart(atSpeed(), DRIFT_RIGHT)
    const centred = stepKart(run(shallow, { ...GAS, drift: true }, 0.6), { ...NO_INPUT, steer: -1 })
    expect(stepKart(centred, { ...GAS, steer: -1 }).gaugeGain!).toBeLessThan(exit(0.6).gaugeGain!)
    // And a slow one, a fraction
    const slow = run(INITIAL_KART, GAS, 1)
    expect(exit(0.6, 0, slow).gaugeGain!).toBeLessThan(exit(0.6).gaugeGain! * 0.5)
  })

  it('a combo: instant boosts one after another, each link worth more to the gauge', () => {
    let kart = exit(0.6)
    const gains = [kart.gaugeGain!]
    for (let link = 0; link < 3; link++) {
      // Back to a straight line and the top speed, inside the combo's window
      kart = run({ ...kart, gauge: 0, storedBoosts: 0 }, GAS, 1.2)
      expect(kart.chain).toBe(link + 1)
      kart = exit(0.6, 0, kart)
      gains.push(kart.gaugeGain!)
    }
    expect(kart.chain).toBe(4)
    expect(gains[1]!).toBeGreaterThan(gains[0]! * 1.05)
    expect(gains[3]!).toBeGreaterThan(gains[2]! * 1.05)
    // The window runs out on a straight, but not while a boost burns
    expect(run(kart, GAS, T.chainDuration * T.perfectShare + T.chainGrace + 0.1).chain).toBe(0)
    const boosting = run({ ...kart, storedBoosts: 1 }, { ...GAS, boost: true }, T.boostDuration)
    expect(boosting.chain).toBe(4)
  })

  it('an instant boost earned and never fired ends the combo; a late one only keeps it', () => {
    const one = run(exit(0.6), GAS, 1.2)
    expect(one.chain).toBe(1)
    // The drift again, let go, and no press: the window closes, and the combo with it
    let missed = stepKart(run(one, DRIFT_RIGHT, 0.6), GAS)
    expect(missed.chain).toBe(1)
    missed = run(missed, GAS, 2)
    expect(missed.releaseWindow).toBe(0)
    expect(missed.chain).toBe(0)
    // Drifting again before firing throws it away as well
    const straight = run(stepKart(run(one, DRIFT_RIGHT, 0.6), GAS), GAS, 0.8)
    expect(straight.releaseWindow).toBeGreaterThan(0)
    expect(straight.chain).toBe(1)
    expect(stepKart(straight, DRIFT_RIGHT).chain).toBe(0)
    // A late press fires, and the combo stands where it was
    const late = stepKart(stepKart(straight, NO_INPUT), GAS)
    expect(late.dashGrade).toBe(1)
    expect(late.chain).toBe(1)
  })

  describe('and the walls', () => {
    const WALL: Wall = { ax: -100, az: -1000, bx: 100, bz: -1000 }
    const course = (wall: Wall): Course => ({ walls: [wall], start: { x: 0, z: 0, heading: 0 } })

    it('a wall brushed in the drift takes the bonus of its exit away, and adds nothing to the combo', () => {
      const one = run(exit(0.6), GAS, 1.2)
      const drift = run(one, DRIFT_RIGHT, 0.6)
      // A wall just to the left of the car, closing on its way at a small angle: a light touch
      const travel = Math.atan2(drift.vx, -drift.vz)
      const ax = drift.x - 2.2 * Math.cos(travel) - 40 * Math.sin(travel)
      const az = drift.z - 2.2 * Math.sin(travel) + 40 * Math.cos(travel)
      const along: Wall = {
        ax,
        az,
        bx: ax + 160 * Math.sin(travel + 0.06),
        bz: az - 160 * Math.cos(travel + 0.06),
      }
      let state = { ...startRun(course(along)), kart: drift }
      const hold: KartInput = { ...GAS, drift: true, steer: -1 }
      for (let step = 0; step < 60 && !state.kart.driftDirty; step++) {
        state = stepRun(state, hold, course(along))
      }
      expect(state.kart.driftDirty).toBe(true)
      expect(state.kart.drifting).toBe(true)
      const fired = stepKart(stepKart(state.kart, { ...NO_INPUT, steer: -1 }), {
        ...GAS,
        steer: -1,
      })
      expect(fired.miniSeconds).toBeGreaterThan(0)
      expect(fired.gaugeGain).toBe(0)
      expect(fired.chain).toBe(1)
      // The next drift starts clean
      expect(run(run(fired, GAS, 1), DRIFT_RIGHT, 0.3).driftDirty).toBe(false)
    })

    it('a hard crash ends the combo and takes gauge by how hard: up to half', () => {
      const crash = (speed: number) => {
        let state = startRun(course(WALL))
        state = {
          ...state,
          kart: { ...state.kart, z: -998, vz: -speed, gauge: 60, chain: 3, chainWindow: 2 },
        }
        for (let step = 0; step < 10 && state.hitSpeed === 0; step++) {
          state = stepRun(state, GAS, course(WALL))
        }
        return state
      }
      const hard = crash(50)
      expect(hard.kart.chain).toBe(0)
      expect(hard.kart.gauge).toBeCloseTo(60 * T.wallGaugeKeep, 5)
      const light = crash(T.wallBreakSpeed + 1)
      expect(light.hitSpeed).toBeGreaterThanOrEqual(T.wallBreakSpeed)
      expect(light.kart.chain).toBe(0)
      expect(light.kart.gauge).toBeGreaterThan(45)
      expect(light.kart.gauge).toBeLessThan(55)
    })
  })

  // #102's check, with the gauge counted: weaving down a straight, each drift held as long as it
  // takes to be worth something, firing every charge it earns, gets no further than driving straight
  it.each([0, 0.2, 0.4])(
    'weaving down a straight for the gauge does not pay: drifts held %s s past the mark',
    (extra) => {
      const from = atSpeed()
      const seconds = 30
      const plain = run(from, GAS, seconds)
      let kart = from
      let phase: 'drift' | 'lift' | 'tap' | 'recover' = 'drift'
      let dir = 1
      let lift = 0
      let hold = 0
      let charges = 0
      for (let step = 0; step < seconds * 60; step++) {
        let input: KartInput = GAS
        if (phase === 'drift') {
          input = { ...GAS, drift: true, steer: dir }
          if (kart.burstReady && (hold += STEP_SECONDS) > extra) {
            phase = 'lift'
            lift = 2
            hold = 0
          }
        } else if (phase === 'lift') {
          input = { ...NO_INPUT, steer: -dir }
          if (--lift <= 0) phase = 'tap'
        } else if (phase === 'tap') {
          input = { ...TAP, steer: -dir }
          phase = 'recover'
        } else {
          input = { ...GAS, steer: Math.max(-1, Math.min(1, -kart.heading * 6)) }
          const travel = Math.atan2(kart.vx, -kart.vz)
          const settled = kart.slideDirection === 0 && Math.abs(travel) < 3 * DEG
          if (settled && kart.miniSeconds < 0.05) {
            dir = kart.x - from.x > 0 ? -1 : 1
            phase = 'drift'
          }
        }
        // Every charge fired as soon as it may be
        const fire = kart.storedBoosts > 0 && kart.boostSeconds === 0 && !kart.boostHeld
        const next = stepKart(kart, { ...input, boost: fire })
        if (next.storedBoosts < kart.storedBoosts) charges++
        kart = next
      }
      console.log(
        'weave',
        extra,
        (from.z - kart.z).toFixed(0),
        (from.z - plain.z).toFixed(0),
        charges,
      )
      expect(from.z - kart.z).toBeLessThan((from.z - plain.z) * 1.01)
      // Not for want of gauge: the long ones do earn charges
      if (extra >= 0.4) expect(charges).toBeGreaterThanOrEqual(2)
    },
  )
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

  it('a hard crash takes up to half the gauge and ends the drift', () => {
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
    // Head on at 50 m/s: well past three times the mark, so all of the share goes
    expect(crashed.hitSpeed).toBeGreaterThanOrEqual(T.wallBreakSpeed * 3)
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
    const shallow = run(drifted(0.15), GAS, 0.05)
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
