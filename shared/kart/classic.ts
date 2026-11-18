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
// `dashMinSeconds` earns one (`burstReady`). Both marks are a real drift's, not a deep one's
// (2026-11-18, owner, after a day of 32° and 0.45 s: "now it drifts too big again: a drift that
// really slid should boost, only the grip need not be so good"): the tail visibly out, for longer
// than a tap. What keeps it from being fired all lap long (owner, earlier that day: "a player can
// mindlessly drift a little and boost, drift a little and boost") is the loose drift: the slip
// builds slowly (`driftSlipIn`), until it is there the car hardly turns (`driftLoose`: the tail is
// out but the momentum carries on), and sliding scrubs speed. A tapped drift fills the gauge only.
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
//
// The gauge by the quality of the drift (2026-11-18, owner, after #102 to #104: "the N2O fills too
// slowly; an expert should be able to boost all the way round and a novice not; ask more skill").
// A drift fills the gauge only once it is a real one (`gaugeLead`), by the square of the speed and
// by how deep it is, and it goes on filling during a boost (`boostGaugeShare`). Most of the gauge
// comes at the exit: an instant boost fired out of the drift adds `gaugeDashBonus`, times how deep
// and how long the drift was, how fast the car goes, how well timed the press was and the combo. The
// timing has three grades: perfect (a fresh press within `perfectWindow` of letting go of a drift at
// least `perfectMinSeconds` long, with no press wasted just before), good (later in the slide, or
// with the drift key still held) and late (after the car has straightened); a perfect one is a
// longer, stronger instant boost, a late one a shorter, weaker one. The combo is the chain: instant
// boosts in a row (not late ones), its window held open through a drift and through a boost, each
// link adding `gaugeComboStep` to everything the gauge gains. A wall touched in the drift takes the
// exit's bonus away, a hard crash the combo and half the gauge, and a drift that earned an instant
// boost never fired ends the combo.
import type { KartInput, KartRules, KartState, KartTuning } from './physics.ts'
import { TEAM_BOOST } from './teamBoost.ts'

const DT = 1 / 60
const GAUGE_FULL = 100
/** How far against the drift or slide the stick must be for a counter-steer */
const COUNTER = 0.3
/** The gauge fills by the speed, as a share of the top speed, up to this */
const GAUGE_SPEED_MAX = 1.25
/** The exit's bonus counts the drift's depth against driftSlip, from this share up to this */
const BONUS_DEPTH_MIN = 0.6
const BONUS_DEPTH_MAX = 1.25
/** ... and its length past dashMinSeconds against this many seconds, never under this share */
const BONUS_SECONDS = 0.3
const BONUS_SECONDS_MIN = 0.1
/** The throttle pressed afresh in a drift this soon before it is let go: too early for a perfect one */
const EARLY_SECONDS = 0.2
/** The grades of an instant boost's timing (KartState.dashGrade) */
export const DASH_LATE = 1
export const DASH_GOOD = 2
export const DASH_PERFECT = 3
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

/**
 * What a drift is worth to the exit's bonus, 0 to about 1.25: how deep it got and how long it
 * lasted. A drift only just long enough to earn the instant boost is worth a tenth of a full one
 */
export function driftWorthOf(peak: number, seconds: number, t: KartTuning): number {
  const depth = clamp(peak / Math.max(1e-3, t.driftSlip), BONUS_DEPTH_MIN, BONUS_DEPTH_MAX)
  const long = clamp((seconds - t.dashMinSeconds) / BONUS_SECONDS, BONUS_SECONDS_MIN, 1)
  return depth * long
}

/** What the combo multiplies the gauge's gains by: `chain` instant boosts in a row */
export const comboFactor = (chain: number, t: KartTuning): number =>
  1 + t.gaugeComboStep * clamp(chain - 1, 0, t.gaugeComboLinks)

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
  // A team race (teamBoost.ts): `teamBoosts` of the charges held are blue (the team's gauge filled
  // while the kart held them). A blue one is fired first, burns as a team boost, and is a charge
  // like any other: one at a time, and it leaves the stock
  let teamBoosts = Math.min(state.teamBoosts ?? 0, storedBoosts)
  let teamSeconds = state.teamSeconds ?? 0
  const pressed = input.boost && !state.boostHeld
  const fire =
    storedBoosts > 0 && boostSeconds === 0 && teamSeconds === 0 && (pressed || rules.autoBoost)
  if (fire) {
    storedBoosts--
    if (teamBoosts > 0) {
      teamBoosts--
      teamSeconds = TEAM_BOOST.seconds
    } else {
      boostSeconds = t.boostDuration
    }
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
  // The quality of the drift (2026-11-18): whether a wall was touched in it, how long ago it was
  // let go with a dash waiting, what it was worth and how long it lasted, a throttle press wasted
  // just before, and the last dash fired (its grade, a count of them and what it added to the
  // gauge), for the HUD
  let driftDirty = state.driftDirty ?? false
  let sinceRelease = state.sinceRelease ?? 0
  let driftWorth = state.driftWorth ?? 0
  let driftHeld = state.driftHeld ?? 0
  let tapEarly = Math.max(0, (state.tapEarly ?? 0) - DT)
  let dashGrade = state.dashGrade ?? 0
  let dashCount = state.dashCount ?? 0
  let gaugeGain = state.gaugeGain ?? 0
  let dashBonus = 0
  let fired = false
  /** A dash that was there for the taking and never fired: the combo is over */
  let missed = false
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
      // The timing: perfect just as a long enough drift is let go, good later in the slide (or with
      // the drift key still held), late once the car has straightened
      const held = state.drifting && input.drift
      const worth = state.drifting
        ? driftWorthOf(state.driftPeak ?? 0, state.driftSeconds, t)
        : driftWorth
      const long = state.drifting ? state.driftSeconds : driftHeld
      const crisp =
        !held &&
        tapEarly === 0 &&
        (state.drifting ? 0 : sinceRelease) <= t.perfectWindow + 1e-9 &&
        long >= t.perfectMinSeconds - 1e-9
      dashGrade = afterStraight ? DASH_LATE : crisp ? DASH_PERFECT : DASH_GOOD
      const gradeShare =
        dashGrade === DASH_PERFECT ? t.perfectShare : dashGrade === DASH_LATE ? t.lateShare : 1
      // The combo: a late one keeps it and adds nothing, and so does one out of a drift that
      // touched a wall
      const counts = dashGrade !== DASH_LATE && !driftDirty
      chain = chainWindow > 0 ? chain + (counts ? 1 : 0) : 1
      const lasts = t.chainDuration * gradeShare
      if (doubleArmed) {
        miniSeconds += lasts
        doubles++
        doubleWindow = 0
      } else {
        miniSeconds = lasts
        doubleWindow = t.doubleWindow
      }
      // The exit's bonus: most of the gauge a good drift earns. None for one that touched a wall
      const pace0 = Math.min(GAUGE_SPEED_MAX, speed0 / t.topSpeed)
      dashBonus = driftDirty
        ? 0
        : t.gaugeDashBonus * worth * pace0 * pace0 * gradeShare * comboFactor(chain, t)
      fired = true
      dashCount++
      sinceRelease = 0
      driftWorth = 0
      driftHeld = 0
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

  // A press of the throttle in a drift that fired nothing: too soon, if the drift is let go next
  if (tapped && state.drifting && input.drift && !fired) tapEarly = EARLY_SECONDS
  // The drift let go (or too slow to hold): the car slides out the way it went
  if (dir !== 0 && (!input.drift || forward0 < t.driftExitSpeed)) {
    slideDir = dir
    dir = 0
    // What it was worth, kept for the dash that may still be fired out of it
    driftWorth = driftWorthOf(driftPeak, state.driftSeconds, t)
    driftHeld = state.driftSeconds
    sinceRelease = 0
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
    // A dash earned and thrown away by drifting again ends the combo
    if (burstReady || releaseWindow > 0) missed = true
    driftDirty = false
    driftWorth = 0
    driftHeld = 0
    tapEarly = 0
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
    // A perfect one pulls harder and goes higher; a late one less
    const grade = dashGrade === DASH_PERFECT ? 1 : dashGrade === DASH_LATE ? -1 : 0
    factor = Math.max(
      factor,
      t.dashAccelFactor + t.chainAccelStep * links + t.perfectAccelStep * grade,
    )
    capFactor = Math.max(
      capFactor,
      t.miniTopSpeedFactor + t.chainSpeedStep * links + t.perfectSpeedStep * grade,
    )
  }
  if (full) {
    factor = Math.max(factor, t.boostAccelFactor)
    capFactor = Math.max(capFactor, t.boostTopSpeedFactor)
  }
  if (teamSeconds > 0) {
    factor = Math.max(factor, TEAM_BOOST.accelFactor)
    capFactor = Math.max(capFactor, TEAM_BOOST.topSpeedFactor)
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

  // The tail out far enough, for long enough (or the double's tap, two steps at least): the drift
  // has earned a dash
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

  // The gauge: in a drift that has lasted (`gaugeLead`: a tap fills nothing), by the square of the
  // speed and by how deep; steady for `gaugeFade` seconds of one drift, then less and less; times
  // the combo; in a boost too (`boostGaugeShare`). And the exit's bonus, all at once
  const pace = Math.hypot(vx, vz)
  const roomLeft = storedBoosts < t.maxStoredBoosts
  if (drifting && pace >= t.driftMinSpeed && roomLeft) {
    const depth =
      t.gaugeShallow +
      (1 - t.gaugeShallow) * Math.min(1, Math.abs(slip) / Math.max(1e-3, t.driftSlip))
    const lead = Math.max(DT, t.gaugeLead)
    const ramp = clamp((driftSeconds - lead) / lead, 0, 1)
    const fade = 1 / (1 + Math.max(0, driftSeconds - t.gaugeFade) / Math.max(0.05, t.gaugeFade))
    const share = Math.min(GAUGE_SPEED_MAX, pace / t.topSpeed)
    gauge +=
      t.gaugeFillRate *
      share *
      share *
      depth *
      ramp *
      fade *
      comboFactor(chain, t) *
      (full || teamSeconds > 0 ? t.boostGaugeShare : 1) *
      DT
  }
  if (fired) gaugeGain = roomLeft ? dashBonus : 0
  if (dashBonus > 0 && roomLeft) gauge += dashBonus
  if (gauge > state.gauge && gauge >= GAUGE_FULL && storedBoosts < t.maxStoredBoosts) {
    storedBoosts++
    gauge = storedBoosts < t.maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
  }

  // The clocks
  if (boostSeconds > 0) boostSeconds = Math.max(0, boostSeconds - DT)
  if (miniSeconds > 0) miniSeconds = Math.max(0, miniSeconds - DT)
  if (teamSeconds > 0) teamSeconds = Math.max(0, teamSeconds - DT)
  if (releaseWindow > 0 && !opened) {
    releaseWindow = Math.max(0, releaseWindow - DT)
    if (releaseWindow === 0) missed = true
  }
  if (releaseWindow === 0 && !burstReady) doubleArmed = false
  // A dash waits: the clock of its timing runs from the drift's letting go
  const waiting = !drifting && (burstReady || releaseWindow > 0)
  sinceRelease = waiting ? sinceRelease + DT : 0
  if (!drifting && !waiting) {
    driftWorth = 0
    driftHeld = 0
  }
  if (doubleWindow > 0 && doubleWindow === state.doubleWindow) {
    doubleWindow = Math.max(0, doubleWindow - DT)
  }
  // The combo's window holds through a drift and through a boost
  if (chainWindow > 0 && !drifting && boostSeconds === 0 && teamSeconds === 0) {
    chainWindow = Math.max(0, chainWindow - DT)
  }
  if (missed) chainWindow = 0
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
    driftDirty: (drifting || waiting) && driftDirty,
    sinceRelease,
    driftWorth,
    driftHeld,
    tapEarly,
    dashGrade,
    dashCount,
    gaugeGain,
    // Only ever there in a team race: any other kart's state is what it always was
    ...(state.teamBoosts !== undefined || state.teamSeconds !== undefined
      ? { teamBoosts, teamSeconds }
      : {}),
  }
}
