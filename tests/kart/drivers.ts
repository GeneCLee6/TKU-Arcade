// Scripted drivers for the track tests (2026-11-14): a careful novice who never drifts, an average
// driver who drifts and fires charges, and an expert who also takes the start boost and a release
// boost after every drift. Not a racing AI: a fixed recipe, enough to show what the techniques are
// worth on a lap.
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
 * The turn rate (rad/s, signed) that brings the car's travel onto a point `metres` ahead on the road,
 * by pure pursuit: curvature 2 sin(angle) / distance, times the speed
 */
function pursuit(road: Road, kart: KartState, nearest: number, metres: number, speed: number) {
  const target = pointAhead(road, nearest, metres)
  const travel = speed > 3 ? Math.atan2(kart.vx, -kart.vz) : kart.heading
  const angle = wrap(Math.atan2(target.x - kart.x, -(target.z - kart.z)) - travel)
  const distance = Math.max(1, Math.hypot(target.x - kart.x, target.z - kart.z))
  return (2 * Math.sin(angle) * Math.max(speed, 5)) / distance
}

/**
 * The expert: pure pursuit, drifting whenever the corner wants more turn than grip gives, steering
 * the drift deeper or shallower to hold the line, braking only when even a drift is not enough. With
 * `techniques` it also gets the start boost and a release boost after every drift (and so slides
 * through the next corner under it); without, it is an average driver who drifts and fires charges.
 */
export function createExpert(techniques = true): (trial: Trial, road: Road) => KartInput {
  const t = KART_TUNING
  let lift = 0
  let wasDrifting = false
  let boostPressed = false
  return (trial, road) => {
    const { kart } = trial.run
    if (trial.phase === 'countdown') {
      // The start boost: the throttle goes down in the last moment before GO
      return { ...NO_INPUT, throttle: techniques && trial.countdown <= t.startWindow - 0.1 }
    }
    const nearest = nearestIndex(road, kart)
    const speed = Math.hypot(kart.vx, kart.vz)
    const want = pursuit(road, kart, nearest, 14 + speed * 0.3, speed)
    // Far ahead: is a corner coming?
    const later = pursuit(road, kart, nearest, 30 + speed * 0.9, speed)
    const gripTurn = t.turnRate * (1 - t.turnLossAtTopSpeed * Math.min(1, speed / t.topSpeed))
    const driftMax = t.driftTurnRate + t.driftSteerRate
    if (techniques && wasDrifting && !kart.drifting) lift = 2
    wasDrifting = kart.drifting

    let drift: boolean
    let steer: number
    if (kart.drifting) {
      const dir = kart.driftDirection
      steer = clampSteer((want - dir * t.driftTurnRate) / t.driftSteerRate)
      drift = kart.driftSeconds < 0.25 || Math.abs(want) > gripTurn * 0.75
      if (Math.sign(want) !== dir && kart.driftSeconds >= 0.25) drift = false
    } else {
      drift = speed > t.driftMinSpeed + 4 && Math.abs(want) > gripTurn * 0.95
      steer = drift ? Math.sign(want) : clampSteer(want / gripTurn)
    }
    const brake = Math.abs(want) > driftMax * 1.05 && speed > 25
    // A charge only where the road stays straight a good way ahead
    const straight = Math.abs(later) < gripTurn * 0.4 && Math.abs(want) < gripTurn * 0.4
    const fire = !boostPressed && kart.storedBoosts > 0 && straight && !kart.drifting
    boostPressed = fire
    if (lift > 0) {
      lift--
      return { ...NO_INPUT, throttle: lift === 0, steer, boost: fire }
    }
    return { ...NO_INPUT, throttle: !brake, brake, steer, drift: drift && !brake, boost: fire }
  }
}
