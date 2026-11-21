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
/** The outermost place on the line is at most this far off where the camera looks (radians) */
export const GRID_SHOT_HALF_ANGLE = (21 * Math.PI) / 180
/** Standing further back than GRID_SHOT_BACK, the camera is this high for each metre back */
export const GRID_SHOT_RISE = 0.45
/** ... looking at a point this far ahead of the pole */
export const GRID_SHOT_AHEAD = 6
/** The glide down behind the kart: from this much countdown left to this much (seconds) */
export const GLIDE_FROM = 2.1
export const GLIDE_TO = 1.05
/** With less motion asked for: one cut, at this much countdown left */
export const CUT_AT = 1.6

const forwardOf = (heading: number) => ({ x: Math.sin(heading), z: -Math.cos(heading) })

/** Where the camera sees the whole grid from: behind it, up high, along the pole's heading, far enough back to see it all */
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
  // 2026-11-21: the grid is one row across the road (startLine.ts), so the camera stands back as far
  // as it takes for the outermost karts to be on the screen too, and rises with it
  const spread = Math.max(
    0,
    ...spots.map((spot) => Math.abs((spot.x - pole.x) * side.x + (spot.z - pole.z) * side.z - across)),
  )
  const distance = Math.max(GRID_SHOT_BACK, spread / Math.tan(GRID_SHOT_HALF_ANGLE))
  const behind = back - distance
  return {
    eye: {
      x: pole.x + forward.x * behind + side.x * across,
      y: y + Math.max(GRID_SHOT_UP, distance * GRID_SHOT_RISE),
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

// ── The race's show (2026-11-20, docs/ARCHITECTURE.md §4.43) ────────────────────────────────────
//
// Before the countdown the camera flies once round the grid: from high up the road ahead, looking
// back at the karts' faces, round one side to behind them, where it settles on the grid shot for the
// 3, 2, 1. Anyone may skip it on their own screen (spikeLoop.ts). At the finish the camera swings
// round from behind this kart to in front of it, low, and stays there.

/** The fly round lasts from this much countdown left ... */
export const INTRO_FROM = 6.5
/** ... to this much, where the 3 comes */
export const INTRO_TO = 3
/** How far from the middle of the grid it flies, and how high (start, end), metres */
export const INTRO_RADIUS = 27
export const INTRO_UP: readonly [number, number] = [12, 7]
/** The share of the fly round spent flying; the rest settles on the grid shot */
const INTRO_FLY = 0.75

const lerp = (a: number, b: number, share: number) => a + (b - a) * share
const lerpPoint = (a: Point3, b: Point3, share: number): Point3 => ({
  x: lerp(a.x, b.x, share),
  y: lerp(a.y, b.y, share),
  z: lerp(a.z, b.z, share),
})

/** Whether `left` seconds of countdown are still in the fly round */
export const inIntro = (left: number | null): boolean => left !== null && left > INTRO_TO

/** The fly round's shot with `left` seconds of countdown left; null outside it */
export function introShot(spots: readonly Spot[], left: number, y = 0): CameraShot | null {
  const grid = gridShot(spots, y)
  const pole = spots[0]
  if (!grid || !pole || left <= INTRO_TO) return null
  const share = Math.max(0, Math.min(1, (INTRO_FROM - left) / (INTRO_FROM - INTRO_TO)))
  const forward = forwardOf(pole.heading)
  const side = { x: -forward.z, z: forward.x }
  const middle = {
    x: spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length,
    z: spots.reduce((sum, spot) => sum + spot.z, 0) / spots.length,
  }
  const fly = smooth(Math.min(1, share / INTRO_FLY), 0, 1)
  // Round from ahead (0) by the side to behind (π)
  const angle = Math.PI * fly
  const around = {
    x: forward.x * Math.cos(angle) + side.x * Math.sin(angle),
    z: forward.z * Math.cos(angle) + side.z * Math.sin(angle),
  }
  const flying: Omit<CameraShot, 'blend'> = {
    eye: {
      x: middle.x + around.x * INTRO_RADIUS,
      y: y + lerp(INTRO_UP[0], INTRO_UP[1], fly),
      z: middle.z + around.z * INTRO_RADIUS,
    },
    target: { x: middle.x, y: y + 0.5, z: middle.z },
  }
  const settle = smooth(share, INTRO_FLY, 1)
  return {
    eye: lerpPoint(flying.eye, grid.eye, settle),
    target: lerpPoint(flying.target, grid.target, settle),
    blend: 1,
  }
}

/** The finish: the swing round to the front takes this long, seconds */
export const FINISH_SWING = 2.2
/** ... ending this far from the kart, this high, this many radians off dead ahead */
export const FINISH_BACK = 6.5
export const FINISH_UP: readonly [number, number] = [2.6, 1.4]
export const FINISH_END_ANGLE = 0.35
/** And comes in over this long */
const FINISH_EASE_IN = 0.35

/**
 * The finish's shot, `since` seconds after crossing the line, of the kart at `kart`: from behind it
 * round to its front. With less motion asked for, none: the chase camera stays
 */
export function finishShot(
  kart: { readonly x: number; readonly z: number; readonly heading: number; readonly y?: number },
  since: number,
  reducedMotion = false,
): CameraShot | null {
  if (reducedMotion || since < 0) return null
  const forward = forwardOf(kart.heading)
  const side = { x: -forward.z, z: forward.x }
  const swing = smooth(Math.min(1, since / FINISH_SWING), 0, 1)
  // π: straight behind; FINISH_END_ANGLE: ahead and a little to the side
  const angle = lerp(Math.PI, FINISH_END_ANGLE, swing)
  const y = kart.y ?? 0
  return {
    eye: {
      x: kart.x + (forward.x * Math.cos(angle) + side.x * Math.sin(angle)) * FINISH_BACK,
      y: y + lerp(FINISH_UP[0], FINISH_UP[1], swing),
      z: kart.z + (forward.z * Math.cos(angle) + side.z * Math.sin(angle)) * FINISH_BACK,
    },
    target: { x: kart.x, y: y + 0.9, z: kart.z },
    blend: smooth(Math.min(1, since / FINISH_EASE_IN), 0, 1),
  }
}

export { CELEBRATE_SECONDS } from './race/celebrate.ts'
