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

// ── 2026-11-18 (owner: "more fun ... technical"; docs/ARCHITECTURE.md §4.31): the rest of a corner's
// dressing, worked out from the road alone like the boards: a wide painted kerb along the inside of
// every corner, widest at its apex (the place to aim for); countdown boards (three bars, two, one)
// along the outside of the run up to a sharp corner; and a pair of posts where the road narrows to
// a gate ──

/** The apex kerb runs over this share of a corner, about its middle */
const APEX_SHARE = 0.7
/** ... and is this wide at the apex, metres, tapering to nothing at its ends */
export const APEX_WIDTH = 3.4

export interface ApexKerb {
  /** The road points it runs along, in order (indices into the road) */
  readonly points: readonly number[]
  /** The inside of the corner: -1 the road's left, 1 its right */
  readonly side: -1 | 1
  /** How wide it is at each of `points`, metres */
  readonly widths: readonly number[]
}

/** The painted kerb inside each corner of the road */
export function apexKerbs(road: readonly RoadPoint[]): ApexKerb[] {
  const n = road.length
  return roadCorners(road).flatMap((corner) => {
    const length = Math.max(3, Math.round(corner.points * APEX_SHARE))
    const first = corner.from + Math.floor((corner.points - length) / 2)
    const points: number[] = []
    const widths: number[] = []
    for (let step = 0; step < length; step++) {
      points.push((((first + step) % n) + n) % n)
      widths.push(Math.round(APEX_WIDTH * Math.sin((Math.PI * step) / (length - 1)) * 100) / 100)
    }
    return [{ points, side: corner.turn > 0 ? 1 : -1, widths }]
  })
}

/** A corner turning at least this far gets countdown boards, radians (about 75°) */
export const BRAKE_TURN = (75 * Math.PI) / 180
/** The boards stand this far before the corner begins, metres: three bars, two, one */
export const BRAKE_DISTANCES = [90, 60, 30] as const

export interface BrakeBoard {
  readonly x: number
  readonly z: number
  readonly index: number
  readonly heading: number
  /** How many bars it shows: 3 furthest from the corner, 1 nearest */
  readonly bars: 1 | 2 | 3
}

/** The countdown boards before every sharp corner, on its outside, where the road runs straight up to it */
export function brakeBoards(road: readonly RoadPoint[]): BrakeBoard[] {
  const n = road.length
  const at = (index: number) => road[((index % n) + n) % n]!
  const corners = roadCorners(road)
  const inCorner = new Set<number>()
  for (const corner of corners) {
    for (let step = 0; step < corner.points; step++) inCorner.add((corner.from + step) % n)
  }
  const boards: BrakeBoard[] = []
  for (const corner of corners) {
    if (Math.abs(corner.turn) < BRAKE_TURN) continue
    const out = corner.turn > 0 ? -1 : 1
    let back = 0
    let index = corner.from
    let next = 0
    while (next < BRAKE_DISTANCES.length) {
      const a = at(index - 1)
      const b = at(index)
      back += Math.hypot(b.x - a.x, b.z - a.z)
      index--
      // Another corner in the way: the countdown starts after it
      if (inCorner.has(((index % n) + n) % n)) break
      const wanted = BRAKE_DISTANCES[BRAKE_DISTANCES.length - 1 - next]!
      if (back < wanted) continue
      const here = at(index)
      const ahead = at(index + 1)
      const heading = Math.atan2(ahead.x - here.x, -(ahead.z - here.z))
      const reach = here.width / 2 + SIGN_OFFSET
      const x = here.x + Math.cos(heading) * out * reach
      const z = here.z + Math.sin(heading) * out * reach
      if (roadClearance(road, x, z) >= SIGN_OFFSET * 0.6) {
        boards.push({ x, z, index: ((index % n) + n) % n, heading, bars: (next + 1) as 1 | 2 | 3 })
      }
      next++
    }
  }
  return boards
}

/** A stretch this narrow, metres, between wider road is a gate ... */
export const GATE_WIDTH = 28.5
/** ... when the road is at least this much wider within GATE_REACH road points on either side */
const GATE_WIDER = 1.4
const GATE_REACH = 12

export interface GatePost {
  readonly x: number
  readonly z: number
  readonly index: number
}

/** A pair of posts, one at each kerb, where the road narrows to a gate and where it opens again */
export function gatePosts(road: readonly RoadPoint[]): GatePost[] {
  const n = road.length
  const at = (index: number) => road[((index % n) + n) % n]!
  const narrow = (index: number) => at(index).width <= GATE_WIDTH
  const posts: GatePost[] = []
  for (let index = 0; index < n; index++) {
    if (!narrow(index)) continue
    const enters = !narrow(index - 1) && at(index - GATE_REACH).width >= at(index).width + GATE_WIDER
    const leaves = !narrow(index + 1) && at(index + GATE_REACH).width >= at(index).width + GATE_WIDER
    if (!enters && !leaves) continue
    const here = at(index)
    const ahead = at(index + 1)
    const heading = Math.atan2(ahead.x - here.x, -(ahead.z - here.z))
    for (const side of [-1, 1]) {
      const reach = here.width / 2 + SIGN_OFFSET * 0.7
      const x = here.x + Math.cos(heading) * side * reach
      const z = here.z + Math.sin(heading) * side * reach
      if (roadClearance(road, x, z) >= SIGN_OFFSET * 0.4) posts.push({ x, z, index })
    }
  }
  return posts
}
