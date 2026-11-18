// The classic feel (2026-11-17, owner: "the feel is wrong: while the kart is still drifting, not yet
// pulled back, counter-steer and forward should boost; pressing forward in the countdown should
// launch; it is still far from the classic kart racers' design and feel, and the speed is odd").
// The default since then; the arcade feel before it stays in physics.ts as the "arcade (old)" preset.
// The rules and every number: docs/KART-FEEL.md. Pure, like physics.ts, which calls it.
//
// The car is in one of three modes:
// - grip: the nose steers (following the stick quickly, not at once) and the velocity follows the
//   nose; turning hard scrubs a little speed off (`gripScrub`).
// - drift: the direction of travel turns (`driftTurnRate`, faster steering in, slower steering out)
//   and the nose is the travel plus a slip angle that swings to its target in `driftSlipIn`. Sliding
//   scrubs speed by the sine of the slip, less than grip would through the same corner.
// - slide-out: the drift key let go, the slip straightens at `driftRecoverRate` (twice as fast
//   counter-steering; a fresh drift press while counter-steering is the cut, `cutSeconds`).
//
// The dash (the instant boost): a drift whose slip has reached `dashMinSlip` and that has lasted
// `dashMinSeconds` earns one (`burstReady`). Deep and long, both (2026-11-18, owner: "the drift still
// grips too well: a player can mindlessly drift a little and boost, drift a little and boost, all lap
// long; it should take a big drift to boost"): the slip builds slowly (`driftSlipIn`), only steering
// into the drift takes it past the mark, and until the slip is there the car hardly turns
// (`driftLoose`: the tail is out but the momentum carries on). A tapped drift fills the gauge only.
// Only a fresh press of the throttle fires it (let go and pressed again; the page's tap latch counts
// a press shorter than a step): (a) while the car slides out, the drift key up; (b) while the drift
// key is still held, with the stick against the drift; (c) once the car has straightened, within
// `releaseWindow`. Owner, 2026-11-17: "after the counter-steer it must not boost by itself: only when
// the player presses forward does the car pull straight and boost". The counter-steer alone only
// straightens the car faster. A new drift before it fires forfeits it, except the double: a drift
// begun within `doubleWindow` of a dash earns the next however short (off since 2026-11-18:
// `doubleWindow` is 0). A dash multiplies the engine's pull and lifts the top speed a little.
//
// The boost (N2O) runs out before the next can be fired (2026-11-18, owner: "normally one has to end
// before the next"): while any boost runs (a charge, a pad's, an item's) the boost key does nothing
// and the charge stays in stock.
//
// Speeds come from an engine against drag, so 0 to the top speed is quick at first and eases in.
import type { KartInput, KartRules, KartState, KartTuning } from './physics.ts'

const DT = 1 / 60
const GAUGE_FULL = 100
/** How far against the drift or slide the stick must be for a counter-steer */
const COUNTER = 0.3
/** The gauge fills by the speed, as a share of the top speed, up to this */
const GAUGE_SPEED_MAX = 1.25
/** The share of the fill rate the slide-out earns, times how loose it still is */
const SLIDE_GAUGE = 0.5
/** A slip this small is straight */
const STRAIGHT = 0.1 * (Math.PI / 180)
/** Below this speed there is no travel to slide along */
const STILL = 0.5
/** ln 10: the swing to the slip target is 90% done in driftSlipIn */
const SWING = Math.LN10

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

const wrapAngle = (angle: number): number => {
  const wrapped = angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
  return wrapped === -Math.PI ? Math.PI : wrapped
}

const forwardOf = (vx: number, vz: number, heading: number): number =>
  vx * Math.sin(heading) - vz * Math.cos(heading)

const sideOf = (vx: number, vz: number, heading: number): number =>
  vx * Math.cos(heading) + vz * Math.sin(heading)

/** The engine against drag, m/s², at `speed` along the way the car goes */
export function classicAcceleration(
  speed: number,
  tuning: KartTuning,
  options: {
    /** The top speed after the slope (terrain.ts) */
    readonly top: number
    readonly throttle: boolean
    readonly brake: boolean
    /** The engine's pull times every boost running; 0 for none (then the throttle decides) */
    readonly factor: number
    /** A flat push on top, m/s² */
    readonly push?: number
    /** The share of the pull that reaches the road */
    readonly pull?: number
  },
): number {
  const u = Math.max(0, speed) / Math.max(1, options.top)
  const drag = tuning.acceleration * (tuning.dragShare * u + (1 - tuning.dragShare) * u * u)
  if (options.brake) return -tuning.braking - drag * tuning.coastDragShare
  const pushing = options.factor > 1 || (options.push ?? 0) > 0
  if (options.throttle || pushing) {
    return tuning.acceleration * options.factor * (options.pull ?? 1) + (options.push ?? 0) - drag
  }
  return -(tuning.coastDrag + drag * tuning.coastDragShare)
}

/** How much the grip steers at `forward` m/s, 0 to 1 */
function authorityAt(forward: number, tuning: KartTuning): number {
  const pace = Math.abs(forward)
  const loss = tuning.turnLossAtTopSpeed * Math.min(1, pace / tuning.topSpeed)
  return Math.min(1, pace / tuning.fullTurnSpeed) * (1 - loss)
}

/** One step of 1/60 s of the classic feel. Pure */
export function stepClassic(
  state: KartState,
  input: KartInput,
  t: KartTuning,
  rules: KartRules,
  limitScale: number,
): KartState {
  const steer = clamp(input.steer, -1, 1)
  // A fresh press: up at the last step, or let go and pressed again since (the page's tap latch)
  const tapped = input.throttle && (!state.throttleHeld || (input.throttleTap ?? false))
  const wheels = state.steerNow ?? 0
  const slew = t.steerResponse * DT
  const steerNow = wheels + clamp(steer - wheels, -slew, slew)

  // The boost (N2O): one at a time. While any boost runs the key does nothing: no restart, no
  // stacking, no extra push, and the charge stays in stock
  let { gauge, storedBoosts, boostSeconds } = state
  const fire =
    storedBoosts > 0 && boostSeconds === 0 && ((input.boost && !state.boostHeld) || rules.autoBoost)
  if (fire) {
    storedBoosts--
    boostSeconds = t.boostDuration
  }

  const speed0 = Math.hypot(state.vx, state.vz)
  const forward0 = forwardOf(state.vx, state.vz, state.heading)
  const moving = speed0 > STILL && forward0 > 0
  const travel0 = moving ? Math.atan2(state.vx, -state.vz) : state.heading
  const slip0 = moving ? wrapAngle(state.heading - travel0) : 0

  let dir = state.driftDirection
  let slideDir = state.slideDirection
  let cutLeft = state.catchSeconds
  let driftLatch = (state.driftLatch ?? false) && input.drift
  const driftFresh = input.drift && !(state.driftKey ?? false)
  let { burstReady, releaseWindow, miniSeconds, chain, chainWindow } = state
  let { doubleWindow, doubleArmed, doubles, doubleDrift } = state
  let driftPeak = state.driftPeak ?? 0
  const launchSeconds = Math.max(0, (state.launchSeconds ?? 0) - DT)

  // The way the car drifts or slides out, and whether the stick is against it
  const way = state.drifting ? state.driftDirection : state.slideDirection
  const inSlide = way !== 0
  const countering = inSlide && steer * way < -COUNTER

  // The dash
  if (rules.chainBoosts) {
    // Never by itself: the throttle held all along fires nothing, however the stick goes. With the
    // drift key still down the stick must be against the drift, so that lifting off to tighten a
    // drift and pressing again does not end it
    const whileSliding = burstReady && inSlide && tapped && (!input.drift || countering)
    const afterStraight = !inSlide && releaseWindow > 0 && tapped
    if (whileSliding || afterStraight) {
      chain = chainWindow > 0 ? chain + 1 : 1
      if (doubleArmed) {
        miniSeconds += t.chainDuration
        doubles++
        doubleWindow = 0
      } else {
        miniSeconds = t.chainDuration
        doubleWindow = t.doubleWindow
      }
      doubleArmed = false
      burstReady = false
      releaseWindow = 0
      chainWindow = Math.max(chainWindow, miniSeconds + t.chainGrace)
      if (inSlide) {
        // Fired out of the slide: it is put away at once, and the drift key must come up first
        if (dir !== 0) slideDir = dir
        dir = 0
        driftLatch = input.drift
        cutLeft = Math.max(cutLeft, t.cutSeconds)
      }
    }
  }

  // The drift let go (or too slow to hold): the car slides out the way it went
  if (dir !== 0 && (!input.drift || forward0 < t.driftExitSpeed)) {
    slideDir = dir
    dir = 0
  }
  // The cut: a fresh drift press while counter-steering a slide-out straightens it at once. Held on,
  // the drift the other way begins once the car is straight (a connected drift)
  const againstSlide = dir === 0 && slideDir !== 0 && steer * slideDir < -COUNTER
  if (againstSlide && driftFresh) cutLeft = t.cutSeconds
  let entered = false
  if (
    dir === 0 &&
    input.drift &&
    !driftLatch &&
    !againstSlide &&
    steer !== 0 &&
    forward0 >= t.driftMinSpeed
  ) {
    dir = steer > 0 ? 1 : -1
    entered = true
    slideDir = 0
    cutLeft = 0
    driftPeak = 0
    // A dash still waiting is gone with a new drift, unless this is the double's
    burstReady = false
    releaseWindow = 0
    doubleArmed = false
    doubleDrift = doubleWindow > 0
    doubleWindow = 0
  }
  const drifting = dir !== 0
  const driftSeconds = drifting ? (entered ? 0 : state.driftSeconds) + DT : 0

  // The engine
  const top = t.topSpeed * limitScale
  const links = clamp(chain - 1, 0, t.chainSpeedLinks)
  const full = boostSeconds > 0
  const mini = miniSeconds > 0
  let factor = 1
  let capFactor = 1
  if (mini) {
    factor = Math.max(factor, t.dashAccelFactor + t.chainAccelStep * links)
    capFactor = Math.max(capFactor, t.miniTopSpeedFactor + t.chainSpeedStep * links)
  }
  if (full) {
    factor = Math.max(factor, t.boostAccelFactor)
    capFactor = Math.max(capFactor, t.boostTopSpeedFactor)
  }
  if (launchSeconds > 0 || (state.launchSeconds ?? 0) > 0) {
    factor = Math.max(factor, t.startAccelFactor)
    capFactor = Math.max(capFactor, t.startTopSpeedFactor)
  }
  const engine = (speed: number, pull: number) =>
    classicAcceleration(speed, t, {
      top,
      throttle: input.throttle,
      brake: input.brake,
      factor,
      pull,
    })

  let heading: number
  let vx: number
  let vz: number
  let slip = 0
  if (!drifting && slideDir === 0) {
    // Grip: the nose steers and the velocity follows it
    let forward = forward0
    if (input.brake) {
      forward =
        forward > 0
          ? Math.max(0, forward - t.braking * DT)
          : Math.max(-t.reverseSpeed, forward - t.acceleration * 0.5 * DT)
    } else if (input.throttle || factor > 1) {
      forward =
        forward < 0 ? Math.min(0, forward + t.braking * DT) : forward + engine(forward, 1) * DT
    } else {
      forward =
        forward > 0
          ? Math.max(0, forward + engine(forward, 1) * DT)
          : Math.min(0, forward + t.coastDrag * DT)
    }
    const side = sideOf(state.vx, state.vz, state.heading)
    const authority = authorityAt(forward, t)
    heading = wrapAngle(state.heading + Math.sign(forward) * steerNow * t.turnRate * authority * DT)
    const worldVx = forward * Math.sin(state.heading) + side * Math.cos(state.heading)
    const worldVz = -forward * Math.cos(state.heading) + side * Math.sin(state.heading)
    let newForward = forwardOf(worldVx, worldVz, heading)
    let newSide = sideOf(worldVx, worldVz, heading)
    if (newForward > 0) {
      // The grip swings the velocity onto the nose, keeping its speed, then scrubs a little off for
      // how hard it turns
      const speed = Math.hypot(newForward, newSide)
      const angle = Math.atan2(newSide, newForward) * Math.exp(-t.grip * DT)
      const u = speed / Math.max(1, top)
      const kept = Math.max(0, speed - t.gripScrub * Math.abs(steerNow) * u * u * DT)
      newForward = kept * Math.cos(angle)
      newSide = kept * Math.sin(angle)
    } else {
      newSide *= Math.exp(-t.grip * DT)
    }
    vx = newForward * Math.sin(heading) + newSide * Math.cos(heading)
    vz = -newForward * Math.cos(heading) + newSide * Math.sin(heading)
  } else {
    // A drift or its slide-out: the travel turns, and the nose is the travel plus the slip
    let speed = speed0
    speed = input.brake
      ? Math.max(0, speed - t.braking * DT)
      : Math.max(0, speed + engine(speed, drifting ? t.driftPull : t.slidePull) * DT)
    speed = Math.max(
      0,
      speed - t.driftScrub * Math.abs(Math.sin(slip0)) * (speed / Math.max(1, top)) * DT,
    )
    let travel = travel0
    slip = slip0
    const ramp = Math.min(1, speed / Math.max(1, t.driftFullSpeed))
    if (drifting) {
      const into = clamp(steer * dir, -1, 1)
      // The tail is out before the car comes round: the turn bites only as the slip builds
      const bite =
        1 - t.driftLoose * (1 - Math.min(1, Math.abs(slip) / Math.max(1e-3, t.driftSlip)))
      travel += dir * t.driftTurnRate * ramp * bite * (1 + t.driftSteerShare * into) * DT
      const target = dir * (t.driftSlip + t.driftSlipSteer * into)
      slip += (target - slip) * (1 - Math.exp((-SWING * DT) / Math.max(DT, t.driftSlipIn)))
      slip = clamp(slip, -t.driftMaxSlip, t.driftMaxSlip)
      driftPeak = Math.max(driftPeak, slip * dir)
    } else {
      const loose = Math.min(1, Math.abs(slip) / Math.max(1e-3, t.driftSlip))
      const gripYaw = steerNow * t.turnRate * authorityAt(speed, t)
      travel +=
        (slideDir * t.driftTurnRate * ramp * t.slideCarry * loose + gripYaw * (1 - loose)) * DT
      const against = steer * slideDir
      let rate = t.driftRecoverRate * (against < -COUNTER ? 2 : against > COUNTER ? 0.5 : 1)
      if (cutLeft > 0) rate = Math.max(rate, Math.abs(slip) / Math.max(DT, cutLeft))
      const left = Math.max(0, Math.abs(slip) - rate * DT)
      slip = Math.sign(slip) * left
      if (left <= STRAIGHT || speed <= STILL) slip = 0
    }
    heading = wrapAngle(travel + slip)
    vx = speed * Math.sin(travel)
    vz = -speed * Math.cos(travel)
  }

  // Straight again: a dash still waiting now waits for a fresh press of the throttle
  let opened = false
  if (!drifting && slideDir !== 0 && slip === 0) {
    slideDir = 0
    if (burstReady) {
      releaseWindow = t.releaseWindow
      burstReady = false
      opened = true
    }
  }

  // Deep enough and long enough (or the double's tap, two steps at least): the drift has earned a
  // dash
  if (drifting && !burstReady) {
    const deep = driftPeak >= t.dashMinSlip - 1e-9 && driftSeconds >= t.dashMinSeconds - 1e-9
    if (deep || (doubleDrift && driftSeconds > DT * 1.5)) {
      burstReady = true
      doubleArmed = doubleDrift
    }
  }
  if (!drifting) doubleDrift = false

  // One limit on the whole speed. Above it, after a boost, the car eases down
  const limit = top * capFactor
  const speed = Math.hypot(vx, vz)
  if (speed > limit) {
    const allowed = Math.max(limit, speed0 - t.overSpeedDrag * DT)
    if (speed > allowed) {
      vx *= allowed / speed
      vz *= allowed / speed
    }
  }

  const traction = drifting
    ? 0
    : slideDir !== 0
      ? Math.min(0.99, 1 - Math.min(1, Math.abs(slip) / Math.max(1e-3, t.driftSlip)))
      : 1

  // The gauge: while sliding, by the speed and by how deep; the longer one drift, the slower; never
  // in a boost
  const pace = Math.hypot(vx, vz)
  if (
    !full &&
    (drifting || slideDir !== 0) &&
    pace >= t.driftMinSpeed &&
    storedBoosts < t.maxStoredBoosts
  ) {
    const depth =
      t.gaugeShallow +
      (1 - t.gaugeShallow) * Math.min(1, Math.abs(slip) / Math.max(1e-3, t.driftSlip))
    const share = drifting
      ? depth / (1 + driftSeconds / Math.max(0.05, t.gaugeFade))
      : SLIDE_GAUGE * (1 - traction)
    gauge += t.gaugeFillRate * Math.min(GAUGE_SPEED_MAX, pace / t.topSpeed) * share * DT
  }
  if (gauge > state.gauge && gauge >= GAUGE_FULL && storedBoosts < t.maxStoredBoosts) {
    storedBoosts++
    gauge = storedBoosts < t.maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
  }

  // The clocks
  if (boostSeconds > 0) boostSeconds = Math.max(0, boostSeconds - DT)
  if (miniSeconds > 0) miniSeconds = Math.max(0, miniSeconds - DT)
  if (releaseWindow > 0 && !opened) releaseWindow = Math.max(0, releaseWindow - DT)
  if (releaseWindow === 0 && !burstReady) doubleArmed = false
  if (doubleWindow > 0 && doubleWindow === state.doubleWindow) {
    doubleWindow = Math.max(0, doubleWindow - DT)
  }
  if (chainWindow > 0 && !drifting) chainWindow = Math.max(0, chainWindow - DT)
  if (chainWindow === 0) chain = 0

  return {
    x: state.x + vx * DT,
    z: state.z + vz * DT,
    heading,
    vx,
    vz,
    drifting,
    driftDirection: dir,
    driftSeconds,
    gauge,
    storedBoosts,
    boostSeconds,
    chainWindow,
    chain,
    boostHeld: input.boost,
    throttleHeld: input.throttle,
    releaseWindow,
    miniSeconds,
    sliding: false,
    stallSeconds: 0,
    stackSeconds: 0,
    catchSeconds: Math.max(0, cutLeft - DT),
    traction,
    doubleWindow,
    doubleDrift,
    doubleArmed,
    doubles,
    slideDirection: slideDir,
    burstReady,
    steerNow,
    driftPeak: drifting ? driftPeak : 0,
    driftKey: input.drift,
    driftLatch,
    launchSeconds,
  }
}
