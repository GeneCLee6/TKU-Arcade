// A careful driver for testing a race room alone (`?autopilot` on the room's address): steers at
// the road a little ahead, eases off for the bends, never drifts. In an item race it taps the item
// key every second, so whatever it picks up is used. For the browser tests and for
// trying a room with a second tab nobody drives; not a racing opponent.
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
  }
}
