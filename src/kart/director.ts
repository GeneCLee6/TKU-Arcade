// 2026-11-20 (owner: "like the classic kart racers, at 3-2-1 all the racers should be lined up
// together; now I can only see my own kart"): the race's camera shots other than the chase camera,
// without three.js so that they are tested in Node. Scene.ts blends a shot with the chase camera
// (`KartScene.shot`); spikeLoop.ts picks the shot each frame.
//
// The countdown: the camera starts high behind the whole grid, every kart on it in view (the pole
// sitter's included, whose rivals are all behind it), and glides down behind this kart during the
// "2", so that it is in its place for the "1" when the throttle counts. Before it, the group shot
// from in front (2026-11-23, `groupShot`).
import type { Spot } from '../../shared/kart/course.ts'
import { COUNT_MS, countdownMs, openingStage } from '../../shared/kart/opening.ts'

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
const lerp = (a: number, b: number, share: number) => a + (b - a) * share

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
// 2026-11-23 (owner: "don't present everyone at the start, just one shot with everyone in it"): before
// the 3, 2, 1 the camera stands in front of the grid, up a little, and takes the whole field in one
// shot, the drivers' faces to it (each in their idle or ready pose, driverGestures.ts), pushing in
// slowly. At the 3 it cuts to the grid shot from behind, which glides down behind this kart for the
// 1 (`countdownShot`). Where in the opening it is comes from the seconds to GO (shared/kart/opening.ts),
// the same on every screen in a room. Anyone may skip it on their own screen (spikeLoop.ts). At the
// finish the camera swings round from behind this kart to in front of it, low, and stays there.

/** The group shot lasts until this much countdown left, where the 3 comes */
export const INTRO_TO = COUNT_MS / 1000
/** ... and from this much (the whole opening) */
export const INTRO_FROM = countdownMs() / 1000

/**
 * The group shot: each outermost kart at most this far off where the camera looks across, without a
 * screen to fit (radians; a phone held upright sees about 21 degrees either side, Scene.ts's 80-degree
 * view at 9:19.5)
 */
export const GROUP_HALF_ANGLE = (17 * Math.PI) / 180
/** ... with one: this share of what the screen sees either side (the rest is margin) */
export const GROUP_FILL = 0.78
/** ... never nearer the middle of the grid than this, metres, and this high for each metre away (at least GROUP_LOW) */
export const GROUP_NEAREST = 9
export const GROUP_RISE = 0.3
export const GROUP_LOW = 2.6

/**
 * How far either side of where it looks the group shot may put a kart on a screen `aspect` wide (width
 * over height): Scene.ts's vertical view is 60 degrees, 80 held upright
 */
export function groupHalfAngle(aspect: number | undefined): number {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return GROUP_HALF_ANGLE
  const vertical = ((aspect < 1 ? 80 : 60) * Math.PI) / 180
  const across = Math.atan(Math.tan(vertical / 2) * aspect)
  return Math.max(GROUP_HALF_ANGLE, Math.min((40 * Math.PI) / 180, across * GROUP_FILL))
}
/** The push in: from this much further away to the shot's own distance */
export const GROUP_PUSH = 1.22
/** ... and a drift across, metres either side of dead ahead over the shot */
export const GROUP_DRIFT = 1.6

/** Whether `left` seconds of countdown are still before the 3 (the group shot) */
export const inIntro = (left: number | null): boolean => left !== null && left > INTRO_TO

/** How the opening is shown on this screen (the settings, src/kart/settings.ts) */
export interface OpeningLook {
  /** The group shot; without it the grid shot from behind all the way */
  readonly group: boolean
}

/**
 * 2026-11-23 (docs/ARCHITECTURE.md §4.96): where the group shot stands. `front` is the shot as it
 * was; on a track where something stands between it and the grid (a building by the start, a wall,
 * a landmark, a hill) the opening takes the first of the others that sees every kart
 * (`pickGroupAngle`): higher up, from either front corner, from behind and high, from overhead
 */
export const GROUP_ANGLES = ['front', 'high', 'left', 'right', 'behind', 'top'] as const
export type GroupAngle = (typeof GROUP_ANGLES)[number]

/** Each angle: turned this far from dead ahead round the grid (radians), this high for each metre away, at least this high */
export const GROUP_ANGLE_LOOK: {
  readonly [A in GroupAngle]: { readonly turn: number; readonly rise: number; readonly low: number }
} = {
  front: { turn: 0, rise: GROUP_RISE, low: GROUP_LOW },
  high: { turn: 0, rise: 0.85, low: 7 },
  left: { turn: 0.85, rise: 0.5, low: 4 },
  right: { turn: -0.85, rise: 0.5, low: 4 },
  behind: { turn: Math.PI, rise: 0.6, low: 5 },
  top: { turn: 0.2, rise: 1.7, low: 14 },
}

/**
 * The group shot, `share` (0 to 1) of the way through it: in front of the grid, looking back at it,
 * far enough for every kart on it to be on the screen; null without a grid. `angle`: where it
 * stands (`front` unless something is in the way)
 */
export function groupShot(
  spots: readonly Spot[],
  share: number,
  y = 0,
  reducedMotion = false,
  halfAngle = GROUP_HALF_ANGLE,
  angle: GroupAngle = 'front',
): CameraShot | null {
  const pole = spots[0]
  if (!pole) return null
  const { turn, rise, low } = GROUP_ANGLE_LOOK[angle]
  const ahead0 = forwardOf(pole.heading)
  // Turned round the grid's middle: `forward` points from the grid to the camera
  const forward = {
    x: ahead0.x * Math.cos(turn) - ahead0.z * Math.sin(turn),
    z: ahead0.x * Math.sin(turn) + ahead0.z * Math.cos(turn),
  }
  const side = { x: -forward.z, z: forward.x }
  const middle = {
    x: spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length,
    z: spots.reduce((sum, spot) => sum + spot.z, 0) / spots.length,
  }
  // Furthest across the picture from the middle, and furthest towards the camera from it
  const across = Math.max(
    0,
    ...spots.map((spot) => Math.abs((spot.x - middle.x) * side.x + (spot.z - middle.z) * side.z)),
  )
  const ahead = Math.max(
    0,
    ...spots.map((spot) => (spot.x - middle.x) * forward.x + (spot.z - middle.z) * forward.z),
  )
  const distance = Math.max(GROUP_NEAREST, ahead + across / Math.tan(halfAngle))
  const along = reducedMotion ? 0.5 : smooth(share, 0, 1)
  const away = distance * lerp(GROUP_PUSH, 1, along)
  const drift = GROUP_DRIFT * lerp(1, -1, along)
  return {
    eye: {
      x: middle.x + forward.x * away + side.x * drift,
      y: y + Math.max(low, away * rise),
      z: middle.z + forward.z * away + side.z * drift,
    },
    target: { x: middle.x, y: y + 0.6, z: middle.z },
    blend: 1,
  }
}

/** Whether something solid stands on the straight line between two points (Scene.ts's `sightBlocked`) */
export type SightBlocked = (from: Point3, to: Point3) => boolean

/** Where on a kart the group shot must see: its driver's head, and either side of its body */
export const SIGHT_HEAD = 1.15
export const SIGHT_BODY = 0.45
export const SIGHT_SIDE = 0.45
/** How far through the push-in the shot is looked along */
const SIGHT_SHARES = [0, 0.5, 1]

/**
 * How many of the karts on `spots` the group shot from `angle` cannot see at some point of it: a
 * kart counts as seen when its driver's head and at least one side of its body are in clear sight
 */
export function groupShotHidden(
  spots: readonly Spot[],
  angle: GroupAngle,
  blocked: SightBlocked,
  y = 0,
  halfAngle = GROUP_HALF_ANGLE,
  reducedMotion = false,
): number {
  const hidden = new Set<number>()
  for (const share of reducedMotion ? [0.5] : SIGHT_SHARES) {
    const shot = groupShot(spots, share, y, reducedMotion, halfAngle, angle)
    if (!shot) return 0
    spots.forEach((spot, index) => {
      if (hidden.has(index)) return
      const side = { x: Math.cos(spot.heading), z: Math.sin(spot.heading) }
      const head = { x: spot.x, y: y + SIGHT_HEAD, z: spot.z }
      const body = [-1, 1].map((sign) => ({
        x: spot.x + side.x * SIGHT_SIDE * sign,
        y: y + SIGHT_BODY,
        z: spot.z + side.z * SIGHT_SIDE * sign,
      }))
      if (blocked(shot.eye, head) || body.every((point) => blocked(shot.eye, point))) hidden.add(index)
    })
  }
  return hidden.size
}

/**
 * The first of GROUP_ANGLES from which the group shot sees every kart on `spots`, or (where none
 * does) the one that hides the fewest; `front` without anything to look through
 */
export function pickGroupAngle(
  spots: readonly Spot[],
  blocked: SightBlocked | null,
  y = 0,
  halfAngle = GROUP_HALF_ANGLE,
  reducedMotion = false,
): GroupAngle {
  if (!blocked || spots.length === 0) return 'front'
  let best: { angle: GroupAngle; hidden: number } | null = null
  for (const angle of GROUP_ANGLES) {
    const hidden = groupShotHidden(spots, angle, blocked, y, halfAngle, reducedMotion)
    if (hidden === 0) return angle
    if (!best || hidden < best.hidden) best = { angle, hidden }
  }
  return best?.angle ?? 'front'
}

/**
 * The opening's shot with `left` seconds to GO (null: GO not set yet, still loading): the group shot;
 * null from the 3 on, or with the group shot turned off, for `countdownShot` to take over
 */
export function openingShot(
  spots: readonly Spot[],
  left: number | null,
  look: OpeningLook,
  reducedMotion = false,
  y = 0,
  /** The screen's width over its height: the shot comes as close as it can and still fit every kart */
  aspect?: number,
  /** 2026-11-23: where it stands (`pickGroupAngle`: away from anything in the way) */
  angle: GroupAngle = 'front',
): CameraShot | null {
  if (!look.group) return null
  // Before GO is set (the others still loading) the shot waits at its start
  const stage = left === null ? { kind: 'group' as const, share: 0 } : openingStage(left)
  if (!stage || stage.kind === 'count') return null
  return groupShot(spots, stage.share, y, reducedMotion, groupHalfAngle(aspect), angle)
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
