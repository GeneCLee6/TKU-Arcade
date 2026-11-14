// Scripted drivers for the track tests (2026-11-14): a careful novice who never drifts, an average
// driver who drifts through the corners and fires charges, and an expert who also takes the start
// boost, a release boost after every drift, the double after that, and chains tapped drifts and
// release boosts down the straights. Not a racing AI: a fixed recipe on the middle of the road,
// enough to show what the techniques are worth on a lap.
import { KART_TUNING, NO_INPUT, type KartInput, type KartState } from '../../shared/kart/physics.ts'
import type { Trial } from '../../shared/kart/timeTrial.ts'

type Road = readonly { x: number; z: number }[]

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

function nearestIndex(road: Road, kart: KartState): number {
  let nearest = 0
  let best = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - kart.x) ** 2 + (point.z - kart.z) ** 2
    if (distance < best) {
      best = distance
      nearest = index
    }
  })
  return nearest
}

/** The heading error to the road point `ahead` points on */
function turnTo(road: Road, kart: KartState, nearest: number, ahead: number): number {
  const target = road[(nearest + ahead) % road.length]!
  return wrap(Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading)
}

const clampSteer = (value: number) => Math.max(-1, Math.min(1, value))

/** Steers at the road a few points ahead, slowing for bends, never drifting */
export function novice(trial: Trial, road: Road): KartInput {
  const { kart } = trial.run
  const turn = turnTo(road, kart, nearestIndex(road, kart), 4)
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.35
  // Holds the throttle from the start of the countdown, like most first-timers
  return {
    ...NO_INPUT,
    throttle: !(sharp && speed > 18),
    brake: sharp && speed > 26,
    steer: clampSteer(turn * 3),
  }
}

/** The road point about `metres` ahead of road point `from`, along the road */
function pointAhead(road: Road, from: number, metres: number): { x: number; z: number } {
  let left = metres
  let index = from
  for (let guard = 0; guard < road.length; guard++) {
    const a = road[index % road.length]!
    const b = road[(index + 1) % road.length]!
    const step = Math.hypot(b.x - a.x, b.z - a.z)
    if (step >= left) {
      const t = left / step
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    }
    left -= step
    index++
  }
  return road[from]!
}

/**
 * The turn rate (rad/s, signed) that brings a car pointing along `along` onto a point `metres` ahead
 * on the road, by pure pursuit: curvature 2 sin(angle) / distance, times the speed
 */
function pursuit(
  road: Road,
  kart: KartState,
  nearest: number,
  metres: number,
  speed: number,
  along: number,
) {
  const target = pointAhead(road, nearest, metres)
  const angle = wrap(Math.atan2(target.x - kart.x, -(target.z - kart.z)) - along)
  const distance = Math.max(1, Math.hypot(target.x - kart.x, target.z - kart.z))
  return (2 * Math.sin(angle) * Math.max(speed, 5)) / distance
}

/** What the expert's hands are in the middle of: nothing, or one of the timed moves */
type Move =
  | { readonly kind: 'none' }
  /** A tapped drift down a straight: begun one way, steered back out at once, held just long enough */
  | { readonly kind: 'tap'; readonly direction: -1 | 1; readonly steps: number }
  /** The throttle let go for a step, to press it afresh for the release boost */
  | { readonly kind: 'lift'; readonly steps: number; readonly double: boolean }
  /** The double's tap: a drift of a few steps right after the release boost */
  | { readonly kind: 'double'; readonly direction: -1 | 1; readonly steps: number }

const NONE: Move = { kind: 'none' }
/** Seconds of travel the drivers look ahead for their line, on top of 14 m: the slide answers late */
const REACH = 0.5
/** The share of the tightest turn a drift can make past which the corner needs the brake too */
const BRAKE_AT = 0.8

/** How many steps a tapped drift is held: just past chainMinDrift, so that it earns a release boost */
const TAP_STEPS = Math.ceil(KART_TUNING.chainMinDrift * 60) + 2
/** How many steps the double's tap is held */
const DOUBLE_STEPS = 3
/** A tap begins when the release boost before it has this long left, so that the chain never gaps */
const TAP_BEFORE_END = 0.1

/**
 * The drifting drivers. Pure pursuit of the middle of the road; a drift whenever the corner wants
 * more turn than the grip gives, the nose held as far round as the corner needs (the slide then
 * brings the car round), let go once the nose points down the road. Without `techniques` that is
 * the average driver, who also fires charges on the straights. With them, the expert: the start
 * boost, a release boost out of every drift and the double after it, charges stacked, and on the
 * straights a chain of tapped drifts, each for its release boost.
 */
export function createExpert(techniques = true): (trial: Trial, road: Road) => KartInput {
  const t = KART_TUNING
  let move: Move = NONE
  let wasDrifting = false
  let boostPressed = false
  let lastTap: -1 | 1 = 1
  return (trial, road) => {
    const { kart } = trial.run
    if (trial.phase === 'countdown') {
      // The start boost: the throttle goes down in the last moment before GO
      return { ...NO_INPUT, throttle: techniques && trial.countdown <= t.startWindow - 0.1 }
    }
    const nearest = nearestIndex(road, kart)
    const speed = Math.hypot(kart.vx, kart.vz)
    const travel = speed > 3 ? Math.atan2(kart.vx, -kart.vz) : kart.heading
    const reach = 14 + speed * REACH
    // The turn the car's travel needs, and the turn its nose needs, to reach the road ahead
    const want = pursuit(road, kart, nearest, reach, speed, travel)
    const noseWant = pursuit(road, kart, nearest, reach, speed, kart.heading)
    // Far ahead: is a corner coming?
    const later = pursuit(road, kart, nearest, 30 + speed * 0.9, speed, travel)
    const gripTurn = t.turnRate * (1 - t.turnLossAtTopSpeed * Math.min(1, speed / t.topSpeed))
    const slip = Math.abs(wrap(kart.heading - travel))

    // A drift just let go: the expert lifts off the throttle for a step, then presses for the boost
    const letGo = wasDrifting && !kart.drifting && kart.releaseWindow > 0
    if (techniques && letGo && move.kind === 'none') {
      move = { kind: 'lift', steps: 1, double: !kart.doubleArmed }
    }
    wasDrifting = kart.drifting

    const straight = Math.abs(later) < gripTurn * 0.4 && Math.abs(want) < gripTurn * 0.4
    // A charge only where the road stays straight a good way ahead; the expert stacks the second
    const fire =
      !boostPressed &&
      kart.storedBoosts > 0 &&
      straight &&
      !kart.drifting &&
      (kart.boostSeconds === 0 || (techniques && kart.stackSeconds === 0))
    boostPressed = fire

    const gripSteer = clampSteer(noseWant / gripTurn)
    const base = { ...NO_INPUT, throttle: true, boost: fire }

    if (move.kind === 'lift') {
      const { steps, double } = move
      if (steps > 0) {
        move = { kind: 'lift', steps: steps - 1, double }
        return { ...base, throttle: false, steer: gripSteer }
      }
      // Pressed again: the release boost. Then, the double: a tap of drift the way the road goes
      const direction: -1 | 1 = Math.abs(noseWant) > 0.05 ? (noseWant > 0 ? 1 : -1) : lastTap
      move = double ? { kind: 'double', direction, steps: DOUBLE_STEPS } : NONE
      return { ...base, steer: gripSteer }
    }
    if (move.kind === 'double') {
      const { direction, steps } = move
      if (steps > 0) {
        move = { kind: 'double', direction, steps: steps - 1 }
        return { ...base, drift: true, steer: steps === DOUBLE_STEPS ? direction : -direction }
      }
      move = NONE
      return { ...base, steer: gripSteer }
    }
    if (move.kind === 'tap') {
      const { direction, steps } = move
      if (steps > 0 && kart.drifting) {
        move = { kind: 'tap', direction, steps: steps - 1 }
        // Into it for the one step that starts the drift, then out of it: a shallow slide
        return { ...base, drift: true, steer: -direction }
      }
      move = NONE
      return { ...base, steer: gripSteer }
    }

    let drift = false
    let steer = gripSteer
    if (kart.drifting) {
      const dir = kart.driftDirection
      // The slide turns the car's travel at driftAlign times the slip: hold the slip the corner needs
      const slipWanted = Math.min(
        t.driftMaxSlip,
        Math.max(0.15, (Math.abs(want) / t.driftAlign) * 1.1),
      )
      const yaw = want + dir * (slipWanted - slip) * 4
      steer = clampSteer((yaw - dir * t.driftTurnRate) / t.driftSteerRate)
      // Held until the nose points down the road, or the corner has eased; the expert at least
      // long enough to earn the release boost
      const least = techniques ? t.chainMinDrift + 0.02 : 0.1
      const done = Math.sign(noseWant) !== dir || Math.abs(want) < gripTurn * 0.5
      drift = kart.driftSeconds < least || !done
    } else if (
      speed > t.driftMinSpeed + 4 &&
      Math.abs(want) > gripTurn * 0.9 &&
      kart.traction >= 1
    ) {
      drift = true
      steer = Math.sign(want)
    } else if (
      techniques &&
      straight &&
      Math.abs(noseWant) < gripTurn * 0.25 &&
      kart.traction >= 1 &&
      kart.boostSeconds === 0 &&
      kart.miniSeconds < TAP_BEFORE_END &&
      speed > t.topSpeed * 0.6
    ) {
      // A straight, and no boost running: a tapped drift for its release boost, towards the middle
      const towards: -1 | 1 = noseWant > 0 ? 1 : -1
      const direction: -1 | 1 = Math.abs(noseWant) > 0.02 ? towards : lastTap === 1 ? -1 : 1
      lastTap = direction
      move = { kind: 'tap', direction, steps: TAP_STEPS - 1 }
      return { ...base, drift: true, steer: direction }
    }
    // Even a drift is not enough: slow down, drifting on. The average driver keeps the throttle
    // down under the brake, and so never presses it afresh for a release boost by accident
    const brake = Math.abs(want) > t.driftAlign * t.driftMaxSlip * BRAKE_AT && speed > 30
    return { ...base, throttle: !brake || !techniques, brake, steer, drift }
  }
}
