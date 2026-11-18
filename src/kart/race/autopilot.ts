// A careful driver for testing a race room alone (`?autopilot` on the room's address): steers at
// the road a little ahead, eases off for the bends, never drifts. In an item race it taps the item
// key every second, so whatever it picks up is used, and in a team race the boost key while it
// holds a blue boost. For the browser tests and for
// trying a room with a second tab nobody drives; not a racing opponent. `?autopilot=drift` is the
// same driver holding the drift key through the bends it takes at speed (2026-11-18: a team race's
// gauges fill from drifting, and a kart that never drifts never holds a charge to turn blue).
import { NO_INPUT, type KartInput } from '../../../shared/kart/physics.ts'
import { nearestRoadPoint, type Trial } from '../../../shared/kart/timeTrial.ts'
import type { RoadPoint } from '../../../shared/kart/track.ts'

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export function autopilot(trial: Trial, road: readonly RoadPoint[]): KartInput {
  if (trial.phase !== 'racing') return NO_INPUT
  const { kart } = trial.run
  const nearest = nearestRoadPoint(road, kart.x, kart.z)
  const target = road[(nearest + 4) % road.length]!
  const turn = wrap(Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading)
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.3
  return {
    ...NO_INPUT,
    throttle: !(sharp && speed > 22),
    brake: sharp && speed > 32,
    steer: Math.max(-1, Math.min(1, turn * 3)),
    item: Math.floor(trial.steps / 30) % 2 === 1,
    // A team race: a team boost held is fired, the same way
    boost: (kart.teamBoosts ?? 0) > 0 && Math.floor(trial.steps / 30) % 2 === 1,
  }
}

/** A bend steered this hard at this speed or more (m/s) is drifted through */
const DRIFT_STEER = 0.45
const DRIFT_SPEED = 24

/**
 * The autopilot, drifting through the bends it takes at speed (`?autopilot=drift`): its gauge
 * fills, it keeps one charge for its team's gauge to turn blue, and fires the second
 */
export function driftingAutopilot(trial: Trial, road: readonly RoadPoint[]): KartInput {
  const input = autopilot(trial, road)
  if (trial.phase !== 'racing') return input
  const { kart } = trial.run
  const fast = Math.hypot(kart.vx, kart.vz) > DRIFT_SPEED
  const drift = Math.abs(input.steer) > DRIFT_STEER && fast
  const spare = kart.storedBoosts >= 2 && Math.floor(trial.steps / 30) % 2 === 1
  return {
    ...input,
    ...(drift ? { drift: true, throttle: true, brake: false } : {}),
    boost: input.boost || spare,
  }
}
