// 2026-11-22 (#94, #113: "the track format assumes a flat plan: no road over another"): level
// crossings and banked bends, docs/ARCHITECTURE.md §4.64. A track's main road may now run over
// itself, a figure of eight on a viaduct over an underpass, and lean across in its bends.
//
// A crossing is where two stretches of the main road's centre line cross on the plan. It is legal
// only when, wherever the two roads' footprints overlap round it, one is at least LEVEL_CLEARANCE
// metres above the other, and they cross at MIN_CROSS_DEGREES or more (a shallow crossing would
// overlap for a long way). Round each crossing is its zone (`reach`): nothing that is judged on the
// plan alone may stand in it (a gate, a respawn point, the grid, a jump lip, a boost pad, an item
// box, a branch, a wall of the track's own without a `base`, a banked road point), so that the
// server's lap judging (passGates, judgeFrame), which knows no heights, stays exactly right.
//
// What the car stands on in a zone is decided by its height: of the roads it is inside, the highest
// whose surface is at most LEVEL_STEP above the car (terrain.ts's `groundAt`, given the car's own
// height of the step before: the road it was on, carried on). A car on the viaduct keeps to the
// viaduct and one in the underpass to the underpass, though both are over the same place. The
// kerbs in a zone stand only as high as their own road (walls.ts's `base`, `top`): the viaduct's
// do not stop a car underneath, the underpass's not one above.
//
// A track without crossings or banks has none of this: parseTrack finds no crossing, the terrain
// has no `crossings`, and every step is what it was (tests/kart/flatGolden.test.ts,
// branchGolden.test.ts). Pure.
import type { RoadPoint } from './track.ts'
import type { Wall } from './walls.ts'

/** Wherever two roads overlap at a crossing, one is at least this far above the other, metres */
export const LEVEL_CLEARANCE = 6
/** Two stretches of road cross at this angle or more, degrees */
export const MIN_CROSS_DEGREES = 30
/** The most crossings a track may have */
export const MAX_CROSSINGS = 4
/** A car never steps up onto a road surface more than this above it, metres */
export const LEVEL_STEP = 2
/** Beyond the overlap, the zone keeps this much more room, metres */
export const ZONE_PAD = 8
/** A jump lip keeps this far off a crossing's zone (a car in flight must land on its own road) */
export const LIP_CLEAR = 60
/** The most a road point may lean across, degrees (banked bends) */
export const MAX_BANK = 18
/** ... and the lean changes by at most this much from one road point to the next */
export const MAX_BANK_STEP = 4
/** A kerb in a zone stands this far below its road (its foot) ... */
export const KERB_FOOT = 1.5
/** ... and this far above it (its top): under LEVEL_CLEARANCE less a kart's height */
export const KERB_TOP = 3.5

export interface Crossing {
  /** Where the two centre lines cross */
  readonly x: number
  readonly z: number
  /** The main road's segments that cross there (segment i runs from road point i to i + 1) */
  readonly upper: number
  readonly lower: number
  /** The two roads' heights there */
  readonly upperY: number
  readonly lowerY: number
  /** The angle between them, degrees (up to 90) */
  readonly degrees: number
  /** Within this of (x, z) the two roads overlap, or nearly: the zone */
  readonly reach: number
}

const degreesOf = (radians: number) => (radians * 180) / Math.PI

/** Where segments ab and cd cross, as shares along each (from a and c, not to b and d); else null */
function crossAt(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
): { s: number; t: number } | null {
  const rx = b.x - a.x
  const rz = b.z - a.z
  const sx = d.x - c.x
  const sz = d.z - c.z
  const denominator = rx * sz - rz * sx
  if (Math.abs(denominator) < 1e-12) return null
  const qx = c.x - a.x
  const qz = c.z - a.z
  const s = (qx * sz - qz * sx) / denominator
  const t = (qx * rz - qz * rx) / denominator
  // From each segment's start, not its end: a crossing on a road point is found once
  if (s < 0 || s >= 1 || t < 0 || t >= 1) return null
  return { s, t }
}

/** Metres along the closed road at each point, and the loop's length */
function along(road: readonly RoadPoint[]): { at: number[]; total: number } {
  const at: number[] = []
  let total = 0
  road.forEach((point, index) => {
    at.push(total)
    const next = road[(index + 1) % road.length]!
    total += Math.hypot(next.x - point.x, next.z - point.z)
  })
  return { at, total }
}

/**
 * The crossings of a closed road, checked: every problem found goes into `problems`. A road that
 * never crosses itself has none and no problem (every track made before 2026-11-22)
 */
export function findCrossings(road: readonly RoadPoint[], problems: string[]): Crossing[] {
  const count = road.length
  if (count < 4) return []
  const before = problems.length
  const { at, total } = along(road)
  const found: Crossing[] = []
  // A box round each segment, to pass over the pairs far apart quickly
  for (let i = 0; i < count; i++) {
    const a = road[i]!
    const b = road[(i + 1) % count]!
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minZ = Math.min(a.z, b.z)
    const maxZ = Math.max(a.z, b.z)
    for (let j = i + 2; j < count; j++) {
      // The last segment joins the first
      if (i === 0 && j === count - 1) continue
      const c = road[j]!
      const d = road[(j + 1) % count]!
      if (
        Math.max(c.x, d.x) < minX ||
        Math.min(c.x, d.x) > maxX ||
        Math.max(c.z, d.z) < minZ ||
        Math.min(c.z, d.z) > maxZ
      )
        continue
      const hit = crossAt(a, b, c, d)
      if (!hit) continue
      const yi = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * hit.s
      const yj = (c.y ?? 0) + ((d.y ?? 0) - (c.y ?? 0)) * hit.t
      const ux = (b.x - a.x) / (Math.hypot(b.x - a.x, b.z - a.z) || 1)
      const uz = (b.z - a.z) / (Math.hypot(b.x - a.x, b.z - a.z) || 1)
      const vx = (d.x - c.x) / (Math.hypot(d.x - c.x, d.z - c.z) || 1)
      const vz = (d.z - c.z) / (Math.hypot(d.x - c.x, d.z - c.z) || 1)
      const sine = Math.abs(ux * vz - uz * vx)
      const degrees = degreesOf(Math.asin(Math.min(1, sine)))
      const wi = a.width + (b.width - a.width) * hit.s
      const wj = c.width + (d.width - c.width) * hit.t
      const reach = Math.min(400, ((wi + wj) / 2 + ZONE_PAD) / Math.max(0.2, sine))
      const crossing: Crossing = {
        x: Math.round((a.x + (b.x - a.x) * hit.s) * 100) / 100,
        z: Math.round((a.z + (b.z - a.z) * hit.s) * 100) / 100,
        upper: yi >= yj ? i : j,
        lower: yi >= yj ? j : i,
        upperY: Math.max(yi, yj),
        lowerY: Math.min(yi, yj),
        degrees,
        reach,
      }
      const where = `road[${i}]`
      if (degrees < MIN_CROSS_DEGREES) {
        problems.push(`${where}: crosses road[${j}] at under ${MIN_CROSS_DEGREES} degrees`)
        continue
      }
      // Far enough apart along the road that the two are not one bend folding over itself
      const apart = Math.min(Math.abs(at[j]! - at[i]!), total - Math.abs(at[j]! - at[i]!))
      if (apart < reach * 3) {
        problems.push(`${where}: crosses road[${j}] too soon after it`)
        continue
      }
      found.push(crossing)
    }
  }
  if (found.length > MAX_CROSSINGS) problems.push(`road: more than ${MAX_CROSSINGS} crossings`)
  const kept = found.slice(0, MAX_CROSSINGS)
  for (let k = 0; k < kept.length; k++) {
    for (let other = k + 1; other < kept.length; other++) {
      const one = kept[k]!
      const two = kept[other]!
      if (Math.hypot(one.x - two.x, one.z - two.z) < one.reach + two.reach) {
        problems.push(`road[${one.upper}]: two crossings too close together`)
      }
    }
  }
  // Wherever the two roads overlap round each crossing, far enough apart in height
  for (const crossing of kept) {
    const side = (index: number) => {
      const from = (s: number) => {
        const d = Math.abs(at[index]! - at[s]!)
        return Math.min(d, total - d)
      }
      return from(crossing.upper) <= from(crossing.lower) ? 'upper' : 'lower'
    }
    const near: { point: RoadPoint; side: 'upper' | 'lower' }[] = []
    road.forEach((point, index) => {
      if (Math.hypot(point.x - crossing.x, point.z - crossing.z) <= crossing.reach + ZONE_PAD) {
        near.push({ point, side: side(index) })
      }
    })
    let low = Infinity
    for (const one of near) {
      if (one.side !== 'upper') continue
      for (const two of near) {
        if (two.side !== 'lower') continue
        const overlap = (one.point.width + two.point.width) / 2 + 2
        if (Math.hypot(one.point.x - two.point.x, one.point.z - two.point.z) > overlap) continue
        low = Math.min(low, (one.point.y ?? 0) - (two.point.y ?? 0))
      }
    }
    low = Math.min(low, crossing.upperY - crossing.lowerY)
    if (low < LEVEL_CLEARANCE) {
      problems.push(
        `road[${crossing.upper}]: crosses road[${crossing.lower}] only ${Math.max(0, Math.round(low * 10) / 10)} m above it (at least ${LEVEL_CLEARANCE})`,
      )
    }
    if (near.some(({ point }) => (point.bank ?? 0) !== 0)) {
      problems.push(`road[${crossing.upper}]: no banked road at a crossing`)
    }
  }
  return problems.length > before ? [] : kept
}

/** Whether (x, z) is within `pad` more than a crossing's zone */
export const inZone = (
  crossings: readonly Crossing[],
  x: number,
  z: number,
  pad = 0,
): boolean =>
  crossings.some((crossing) => Math.hypot(x - crossing.x, z - crossing.z) < crossing.reach + pad)

/**
 * The main road's kerbs (track.ts's `kerbs`: the left kerb's segments, then the right's) with those
 * in a zone standing only as high as their own road: from KERB_FOOT below it to KERB_TOP above it
 */
export function levelKerbs(
  road: readonly RoadPoint[],
  walls: readonly Wall[],
  crossings: readonly Crossing[],
): Wall[] {
  const count = road.length
  return walls.map((wall, index) => {
    if (!inZone(crossings, (wall.ax + wall.bx) / 2, (wall.az + wall.bz) / 2, ZONE_PAD)) return wall
    const segment = index % count
    const y = ((road[segment]!.y ?? 0) + (road[(segment + 1) % count]!.y ?? 0)) / 2
    return { ...wall, top: Math.round((y + KERB_TOP) * 100) / 100, base: Math.round((y - KERB_FOOT) * 100) / 100 }
  })
}

const levelRoads = new WeakMap<object, true>()

/**
 * A road (its own list of points) that crosses itself, kept so that whatever looks for the road
 * point nearest a kart (timeTrial.ts's `nearestRoadPoint`) can take its height into account
 * without each caller being told: parseTrack does it, and so does whatever makes a route of it
 */
export function rememberLevels(road: readonly RoadPoint[]): void {
  levelRoads.set(road, true)
}

export const hasLevels = (road: readonly RoadPoint[]): boolean => levelRoads.has(road)

/**
 * How far a road point at height `pointY` is from a kart at height `y`, in square metres added to
 * the distance on the plan: nothing for a point of the road the kart is on (at most LEVEL_STEP above
 * it, or not far below it), a great deal for one of the road over or under it
 */
export function levelPenalty(pointY: number, y: number): number {
  const above = Math.max(0, pointY - y - LEVEL_STEP)
  const below = Math.max(0, y - pointY - (LEVEL_CLEARANCE - 1.5))
  return 400 * (above * above + below * below)
}

/** tan of a road point's lean: + its left kerb higher (a right-hand bend's banking) */
export const cantOf = (point: Pick<RoadPoint, 'bank'>): number =>
  point.bank ? Math.tan((point.bank * Math.PI) / 180) : 0
