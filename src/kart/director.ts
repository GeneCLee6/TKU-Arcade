// 2026-11-20 (owner: "like the classic kart racers, at 3-2-1 all the racers should be lined up
// together; now I can only see my own kart"): the race's camera shots other than the chase camera,
// without three.js so that they are tested in Node. Scene.ts blends a shot with the chase camera
// (`KartScene.shot`); spikeLoop.ts picks the shot each frame.
//
// The countdown: the camera starts high behind the whole grid, every kart on it in view (the pole
// sitter's included, whose rivals are all behind it), and glides down behind this kart during the
// "2", so that it is in its place for the "1" when the throttle counts.
import type { Spot } from '../../shared/kart/course.ts'

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A camera placed by hand: where it is, what it looks at, and how much of it there is (0 to 1) over the chase camera */
export interface CameraShot {
  readonly eye: Point3
  readonly target: Point3
  readonly blend: number
}

/** The grid shot: this far behind the last place on the grid, this high, metres */
export const GRID_SHOT_BACK = 11
export const GRID_SHOT_UP = 6.5
/** ... looking at a point this far ahead of the pole */
export const GRID_SHOT_AHEAD = 6
/** The glide down behind the kart: from this much countdown left to this much (seconds) */
export const GLIDE_FROM = 2.1
export const GLIDE_TO = 1.05
/** With less motion asked for: one cut, at this much countdown left */
export const CUT_AT = 1.6

const forwardOf = (heading: number) => ({ x: Math.sin(heading), z: -Math.cos(heading) })

/** Where the camera sees the whole grid from: behind its last row, up high, along the pole's heading */
export function gridShot(spots: readonly Spot[], y = 0): Omit<CameraShot, 'blend'> | null {
  const pole = spots[0]
  if (!pole) return null
  const forward = forwardOf(pole.heading)
  const along = (spot: Spot) => (spot.x - pole.x) * forward.x + (spot.z - pole.z) * forward.z
  // The rearmost place, and the middle of the grid across the road
  const back = Math.min(0, ...spots.map(along))
  const middle = {
    x: spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length,
    z: spots.reduce((sum, spot) => sum + spot.z, 0) / spots.length,
  }
  const side = { x: -forward.z, z: forward.x }
  const across =
    (middle.x - pole.x) * side.x + (middle.z - pole.z) * side.z
  const behind = back - GRID_SHOT_BACK
  return {
    eye: {
      x: pole.x + forward.x * behind + side.x * across,
      y: y + GRID_SHOT_UP,
      z: pole.z + forward.z * behind + side.z * across,
    },
    target: {
      x: pole.x + forward.x * GRID_SHOT_AHEAD + side.x * across,
      y: y + 0.5,
      z: pole.z + forward.z * GRID_SHOT_AHEAD + side.z * across,
    },
  }
}

/** Smooth from 0 at `from` to 1 at `to` (either way round) */
export function smooth(value: number, from: number, to: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return share * share * (3 - 2 * share)
}

/**
 * How much of the grid shot there is with `left` seconds of countdown left (null: the start not set
 * yet, still waiting on the grid): all of it until the glide, none from the "1" on
 */
export function countdownBlend(left: number | null, reducedMotion = false): number {
  if (left === null) return 1
  if (reducedMotion) return left > CUT_AT ? 1 : 0
  return smooth(left, GLIDE_TO, GLIDE_FROM)
}

/** The countdown's shot: the grid, blended by the countdown left; null once it is all the chase camera */
export function countdownShot(
  spots: readonly Spot[],
  left: number | null,
  reducedMotion = false,
  y = 0,
): CameraShot | null {
  const blend = countdownBlend(left, reducedMotion)
  if (blend <= 0) return null
  const shot = gridShot(spots, y)
  return shot ? { ...shot, blend } : null
}
