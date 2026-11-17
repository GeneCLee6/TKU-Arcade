// 2026-11-17 (owner: "the maps should be as good as the classic kart racers' ... next to them ours is
// a toy project"; docs/KART-FEEL.md §8): where the arrow boards stand. Every corner sharp enough to
// want a drift gets a row of boards along its outside, from just before it turns to past its middle,
// facing the karts that come at it and pointing the way it goes: the corner reads from far off, and
// the boards rushing by are what makes it feel fast. Worked out from the road alone, so every track
// has them, a custom one from the editor too. Pure: the same road, the same boards.
import { roadClearance } from './scenery.ts'
import type { RoadPoint } from './track.ts'

export interface CornerSign {
  readonly x: number
  readonly z: number
  /** The road point it stands beside: its height on a hill track */
  readonly index: number
  /** The way the road runs there, as a heading (0 faces -z, growing clockwise): the board faces back along it */
  readonly heading: number
  /** The way the corner turns: -1 left, 1 right */
  readonly turn: -1 | 1
}

/** A bend tighter than this radius is part of a corner, metres */
export const CORNER_RADIUS = 80
/** A corner turns at least this far in all, radians (about 40°): a kink gets no boards */
export const CORNER_TURN = (40 * Math.PI) / 180
/** The boards begin this far before the corner starts to turn, metres ... */
const LEAD = 14
/** ... and stop this share of the way through it */
const THROUGH = 0.7
/** One board every this many metres along the road */
export const SIGN_SPACING = 10
/** At most this many a corner */
const MOST = 9
/** Behind the barrier: this far out from the road's edge, metres */
export const SIGN_OFFSET = 1.8
/** A gap this short inside a corner (road points) does not end it */
const GAP = 2

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** A corner of the road: the points it runs over, how far it turns in all (signed) */
export interface Corner {
  readonly from: number
  /** How many road points long, from `from` on round the loop */
  readonly points: number
  /** Radians, positive to the right */
  readonly turn: number
}

/** The corners of a closed road, in order */
export function roadCorners(road: readonly RoadPoint[]): Corner[] {
  const n = road.length
  if (n < 8) return []
  const at = (index: number) => road[((index % n) + n) % n]!
  const heading = (index: number) => {
    const a = at(index)
    const b = at(index + 1)
    return Math.atan2(b.x - a.x, -(b.z - a.z))
  }
  const length = (index: number) => {
    const a = at(index)
    const b = at(index + 1)
    return Math.hypot(b.x - a.x, b.z - a.z)
  }
  // How far the road turns at each point, and its curvature there, smoothed over five points
  const turns = road.map((_, index) => wrap(heading(index) - heading(index - 1)))
  const curve = road.map((_, index) => {
    let turned = 0
    let run = 0
    for (let near = index - 2; near <= index + 2; near++) {
      turned += turns[((near % n) + n) % n]!
      run += (length(near - 1) + length(near)) / 2
    }
    return run > 0 ? turned / run : 0
  })
  const sharp = (index: number): -1 | 0 | 1 => {
    const k = curve[((index % n) + n) % n]!
    return Math.abs(k) >= 1 / CORNER_RADIUS ? (k > 0 ? 1 : -1) : 0
  }
  // Begin where the road runs straight, so that no corner is cut in two by the loop's seam
  let start = 0
  while (start < n && sharp(start) !== 0) start++
  if (start === n) return []
  const corners: Corner[] = []
  let index = start
  while (index < start + n) {
    const way = sharp(index)
    if (way === 0) {
      index++
      continue
    }
    let end = index
    let gap = 0
    for (let next = index + 1; next < start + n; next++) {
      const here = sharp(next)
      if (here === way) {
        end = next
        gap = 0
      } else if (here === 0 && gap < GAP) gap++
      else break
    }
    let turned = 0
    for (let point = index; point <= end; point++) turned += turns[((point % n) + n) % n]!
    if (Math.abs(turned) >= CORNER_TURN) {
      corners.push({ from: ((index % n) + n) % n, points: end - index + 1, turn: turned })
    }
    index = end + 1
  }
  return corners
}

/**
 * The arrow boards of a road: along the outside of every corner. `share` (0 to 1) thins them out for
 * a lower graphics quality: every board at 1, every other at 0.5
 */
export function cornerSigns(road: readonly RoadPoint[], share = 1): CornerSign[] {
  const n = road.length
  const at = (index: number) => road[((index % n) + n) % n]!
  const signs: CornerSign[] = []
  const step = share >= 0.75 ? 1 : 2
  for (const corner of roadCorners(road)) {
    const turn: -1 | 1 = corner.turn > 0 ? 1 : -1
    // Walk back LEAD metres from where the corner begins
    let first = corner.from
    for (let back = 0; back < LEAD; ) {
      const a = at(first - 1)
      const b = at(first)
      back += Math.hypot(b.x - a.x, b.z - a.z)
      first--
    }
    const last = corner.from + Math.round((corner.points - 1) * THROUGH)
    let since = SIGN_SPACING
    let placed = 0
    let counted = 0
    for (let index = first; index <= last && placed < MOST; index++) {
      const a = at(index)
      const b = at(index + 1)
      const span = Math.hypot(b.x - a.x, b.z - a.z)
      since += span
      if (since < SIGN_SPACING || span === 0) continue
      since = 0
      if (counted++ % step !== 0) continue
      const heading = Math.atan2(b.x - a.x, -(b.z - a.z))
      // The outside of a right-hand corner is the left of the road
      const out = -turn
      const reach = a.width / 2 + SIGN_OFFSET
      const x = a.x + Math.cos(heading) * out * reach
      const z = a.z + Math.sin(heading) * out * reach
      // Not where another stretch of the road runs (a hairpin's other leg, a crossing)
      if (roadClearance(road, x, z) < SIGN_OFFSET * 0.6) continue
      signs.push({ x, z, index: ((index % n) + n) % n, heading, turn })
      placed++
    }
  }
  return signs
}
