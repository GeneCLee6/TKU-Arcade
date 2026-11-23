// The leaderboard's walls (2026-11-23, docs/SECURITY.md §11, docs/ARCHITECTURE.md §4.93): whether a
// run uploaded to the board went through a wall between two of its samples. boardCheck.ts judges
// every sample as a room judges a frame; a room does not look at walls (a live frame may be late,
// and the walls are the browser's physics), so a forged file could cut a corner through the kerb as
// long as it kept to the gates. Here it cannot.
//
// The physics (walls.ts) never lets a kart's centre cross a wall's line: the centre is pushed back
// out at least every half kart radius, always on the side it came from. So two samples of a real
// run a tenth of a second apart are on the same side of every wall it was beside, and the straight
// line between them (the chord) crosses no wall's line, except where the real path went round the
// end of a wall, over it, or under it:
//
//   - round a free end (a kerb that stops at a fork's mouth, a pillar's corner): the chord may cut
//     inside the curve the kart drove, so a crossing within WALL_END_INSET of a wall's free end is
//     not one. Ends where two walls meet (a kerb's next segment) are not free: no gap at the joints
//   - over it: a wall with a `top` is flown over by a kart in the air at that height or more, and one
//     with a `base` (a kerb at a level crossing, a platform's face) stands only round its own road.
//     A sample has no height, so it is the height the replay draws it at (terrain.ts heightSeen: the
//     road, or the flight off the lip behind it, kept on its own road at a crossing), with
//     WALL_HEIGHT_SLACK of room either way, and a kart in the air at either end of the chord counts
//     (a sample every six steps may miss the very step of the take-off)
//   - a reset is a jump, not a drive: the chord to a reset sample is not looked at
//   - the moving obstacles are race.ts's (throughObstacle, by the race clock); not here
//
// A wall the kart slid along (#145) is touched, not crossed: the centre stays a radius off its line.
// What is left unjudged is written in docs/SECURITY.md §11. Pure: the Worker and the tests run it.
import { KART_BODY_HEIGHT, type Wall } from './walls.ts'
import { groundAt, TERRAIN_TUNING, type Terrain, type TerrainPoint } from './terrain.ts'
import { LEVEL_CLEARANCE, LEVEL_STEP, ZONE_PAD } from './levels.ts'

/** A crossing this close to a wall's free end, metres, is a chord round the end, not through it */
export const WALL_END_INSET = 1.2
/** The height a sample is drawn at may be this far off the kart's own, metres, either way */
export const WALL_HEIGHT_SLACK = 1
/** Two wall ends this close together, metres, are one joint: neither is free */
const JOINT = 0.05
/** The wall grid's cell, metres: a chord (a tenth of a second at the fastest) spans a cell or two */
const CELL = 16

/** Where a sample is, how high it is drawn, and whether it was in the air */
export interface WallSample {
  readonly x: number
  readonly z: number
  /** Its height, worked out when asked (only a wall with a top or a foot asks) */
  readonly height: () => number
  readonly airborne: boolean
}

/** A track's walls made ready to look up by place: worked out once per list of walls */
interface WallIndex {
  readonly walls: readonly Wall[]
  /** Each wall's length, and how far from each end a crossing must be (0 at a joint) */
  readonly length: Float64Array
  readonly insetA: Float64Array
  readonly insetB: Float64Array
  /** The grid: cell key to the walls that pass through it */
  readonly cells: Map<number, number[]>
  /** One mark per wall, so that a wall in two cells is looked at once a chord */
  readonly seen: Uint32Array
  stamp: number
}

const indexes = new WeakMap<readonly Wall[], WallIndex>()
const cellKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096)

function indexOf(walls: readonly Wall[]): WallIndex {
  const known = indexes.get(walls)
  if (known) return known
  const count = walls.length
  const length = new Float64Array(count)
  const insetA = new Float64Array(count)
  const insetB = new Float64Array(count)
  // The free ends: an end no other wall's end meets (a bucket of ends by JOINT-sized cells)
  const ends = new Map<string, number>()
  const touch = (x: number, z: number) => {
    // Rounding may split one joint over two buckets: count it in all four round it
    const fx = Math.floor(x / JOINT)
    const fz = Math.floor(z / JOINT)
    for (const [ox, oz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const key = `${fx + ox},${fz + oz}`
      ends.set(key, (ends.get(key) ?? 0) + 1)
    }
  }
  const met = (x: number, z: number) => {
    const fx = Math.floor(x / JOINT)
    const fz = Math.floor(z / JOINT)
    let most = 0
    for (const [ox, oz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      most = Math.max(most, ends.get(`${fx + ox},${fz + oz}`) ?? 0)
    return most > 1
  }
  for (const wall of walls) {
    touch(wall.ax, wall.az)
    touch(wall.bx, wall.bz)
  }
  const cells = new Map<number, number[]>()
  walls.forEach((wall, index) => {
    length[index] = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
    insetA[index] = met(wall.ax, wall.az) ? 0 : WALL_END_INSET
    insetB[index] = met(wall.bx, wall.bz) ? 0 : WALL_END_INSET
    // Every cell the segment's box covers (a segment is short against a cell)
    const x0 = Math.floor(Math.min(wall.ax, wall.bx) / CELL)
    const x1 = Math.floor(Math.max(wall.ax, wall.bx) / CELL)
    const z0 = Math.floor(Math.min(wall.az, wall.bz) / CELL)
    const z1 = Math.floor(Math.max(wall.az, wall.bz) / CELL)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = cellKey(cx, cz)
        const list = cells.get(key)
        if (list) list.push(index)
        else cells.set(key, [index])
      }
    }
  })
  const index: WallIndex = { walls, length, insetA, insetB, cells, seen: new Uint32Array(count), stamp: 0 }
  indexes.set(walls, index)
  return index
}

/** Whether `wall` stands in the way of a kart at height `y`, in the air or not, with the slack */
function standsAt(wall: Wall, at: WallSample, airborne: boolean): boolean {
  // A wall to any height, or one with only a top and a kart on the ground: no height needed
  if (wall.base === undefined && (wall.top === undefined || !airborne)) return true
  const y = at.height()
  if (wall.top !== undefined && airborne && y >= wall.top - WALL_HEIGHT_SLACK) return false
  if (
    wall.base !== undefined &&
    (y + KART_BODY_HEIGHT <= wall.base + WALL_HEIGHT_SLACK ||
      y >= (wall.top ?? Infinity) - WALL_HEIGHT_SLACK)
  )
    return false
  return true
}

/**
 * The wall the straight line from `a` to `b` goes through, as its index in `walls`, or -1: it
 * crosses the wall's line, away from the wall's free ends, and the wall stands in the way at both
 * ends of the line (by their heights, WALL_HEIGHT_SLACK either way)
 */
export function wallCrossed(walls: readonly Wall[], a: WallSample, b: WallSample): number {
  if (walls.length === 0) return -1
  const index = indexOf(walls)
  index.stamp = (index.stamp + 1) >>> 0
  if (index.stamp === 0) {
    index.seen.fill(0)
    index.stamp = 1
  }
  const stamp = index.stamp
  const x0 = Math.floor(Math.min(a.x, b.x) / CELL)
  const x1 = Math.floor(Math.max(a.x, b.x) / CELL)
  const z0 = Math.floor(Math.min(a.z, b.z) / CELL)
  const z1 = Math.floor(Math.max(a.z, b.z) / CELL)
  // A chord longer than a few cells is a jump, which race.ts refuses first; never loop for long
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) return -1
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minZ = Math.min(a.z, b.z)
  const maxZ = Math.max(a.z, b.z)
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const list = index.cells.get(cellKey(cx, cz))
      if (!list) continue
      for (const at of list) {
        if (index.seen[at] === stamp) continue
        index.seen[at] = stamp
        const wall = walls[at]!
        if (
          Math.max(wall.ax, wall.bx) < minX ||
          Math.min(wall.ax, wall.bx) > maxX ||
          Math.max(wall.az, wall.bz) < minZ ||
          Math.min(wall.az, wall.bz) > maxZ
        )
          continue
        const length = index.length[at]!
        if (length === 0) continue
        const dx = (wall.bx - wall.ax) / length
        const dz = (wall.bz - wall.az) / length
        // Which side of the wall's line each end is on (on the line counts as the first side)
        const sideA = dx * (a.z - wall.az) - dz * (a.x - wall.ax)
        const sideB = dx * (b.z - wall.az) - dz * (b.x - wall.ax)
        if (sideA >= 0 === sideB >= 0) continue
        const share = sideA / (sideA - sideB)
        const along = (a.x + (b.x - a.x) * share - wall.ax) * dx + (a.z + (b.z - a.z) * share - wall.az) * dz
        if (along <= index.insetA[at]! || along >= length - index.insetB[at]!) continue
        if (!standsAt(wall, a, a.airborne || b.airborne) || !standsAt(wall, b, a.airborne || b.airborne))
          continue
        return at
      }
    }
  }
  return -1
}

/** A sample of the replay as far as the walls go */
export interface WallStep {
  readonly tick: number
  readonly x: number
  readonly z: number
  readonly vx: number
  readonly vz: number
  readonly reset: boolean
  readonly airborne?: boolean
}

/** A flight off a lip: its height then, its upward speed, and the tick (fractional) it left */
interface Flight {
  readonly y: number
  readonly vy: number
  readonly tick: number
}

/**
 * The flight a kart in the air at `here` is on, having been on the ground at `before`: the lip
 * whose line the step between them crossed forwards, within its width (and a little), at a speed
 * along the road that throws a kart up (terrain.ts settleTerrain). In the air the ground speed holds
 * (stepAir), so the sample's own velocity says when it left the lip. Null when no lip is there: a
 * kart is in the air only off a lip, so a sample that says otherwise is taken as on the ground
 */
function takeoff(terrain: Terrain, before: WallStep, here: WallStep): Flight | null {
  for (const lip of terrain.lips) {
    const from = (before.x - lip.x) * lip.dx + (before.z - lip.z) * lip.dz
    const to = (here.x - lip.x) * lip.dx + (here.z - lip.z) * lip.dz
    if (!(from <= 0 && to > 0)) continue
    const share = from / (from - to)
    const crossX = before.x + (here.x - before.x) * share - lip.x
    const crossZ = before.z + (here.z - before.z) * share - lip.z
    if (Math.abs(crossX * -lip.dz + crossZ * lip.dx) > lip.half + LIP_REACH) continue
    const along = here.vx * lip.dx + here.vz * lip.dz
    if (along < TERRAIN_TUNING.jumpMinSpeed) continue
    return { y: lip.y, vy: along * TERRAIN_TUNING.jumpLift, tick: here.tick - (to / along) * 60 }
  }
  return null
}

/** terrain.ts's own: of the roads a place is this far outside or less, the one a car may be on */
const LEVEL_MARGIN = 3

/** A road segment near a crossing: its ends' places, heights and half widths */
interface ZoneSegment {
  readonly ax: number
  readonly az: number
  readonly ay: number
  readonly bx: number
  readonly bz: number
  readonly by: number
  readonly ha: number
  readonly hb: number
}

/** Each crossing's zone and the road segments that reach into it, worked out once per terrain */
const zonesOf = new WeakMap<Terrain, { x: number; z: number; reach: number; segments: ZoneSegment[] }[]>()

function zones(terrain: Terrain) {
  const known = zonesOf.get(terrain)
  if (known) return known
  const segments: ZoneSegment[] = []
  const add = (points: readonly TerrainPoint[], half: (index: number) => number, closed: boolean) => {
    const count = points.length
    for (let index = 0; index < (closed ? count : count - 1); index++) {
      const a = points[index]!
      const b = points[(index + 1) % count]!
      segments.push({ ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, ha: half(index), hb: half((index + 1) % count) })
    }
  }
  const halves = terrain.halves ?? []
  add(terrain.points, (index) => halves[index] ?? 0, true)
  for (const fork of terrain.forks ?? []) add(fork, (index) => fork[index]!.half, false)
  const list = (terrain.crossings ?? []).map((crossing) => {
    const reach = crossing.reach + ZONE_PAD
    // A segment whose road (and margin) comes within the zone: every one terrain.ts could pick there
    const near = segments.filter((one) => {
      const sx = one.bx - one.ax
      const sz = one.bz - one.az
      const lengthSq = sx * sx + sz * sz || 1
      const t = Math.max(0, Math.min(1, ((crossing.x - one.ax) * sx + (crossing.z - one.az) * sz) / lengthSq))
      const distance = Math.hypot(crossing.x - (one.ax + sx * t), crossing.z - (one.az + sz * t))
      return distance <= reach + Math.max(one.ha, one.hb) + LEVEL_MARGIN + 1
    })
    return { x: crossing.x, z: crossing.z, reach, segments: near }
  })
  zonesOf.set(terrain, list)
  return list
}

/**
 * The road's height at (x, z) in a crossing's zone, given the height a moment ago (`near`), as
 * terrain.ts's groundAt has it there (groundOnLevels: of the roads the place is on, the highest at
 * most LEVEL_STEP above `near`, else the lowest; of that road the segment it is deepest inside),
 * looking only at the road segments that reach into that zone. Undefined outside every zone, or on
 * no road there (groundAt's plain rule then holds)
 */
function zoneGround(
  terrain: Terrain,
  x: number,
  z: number,
  near: () => number | undefined,
): number | undefined {
  const zone = zones(terrain).find((one) => Math.hypot(x - one.x, z - one.z) < one.reach)
  if (!zone) return undefined
  const ys: number[] = []
  const depths: number[] = []
  for (const one of zone.segments) {
    const sx = one.bx - one.ax
    const sz = one.bz - one.az
    const lengthSq = sx * sx + sz * sz
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((x - one.ax) * sx + (z - one.az) * sz) / lengthSq))
    const distance = Math.hypot(x - (one.ax + sx * t), z - (one.az + sz * t))
    const depth = one.ha + (one.hb - one.ha) * t - distance
    if (depth <= -LEVEL_MARGIN) continue
    ys.push(one.ay + (one.by - one.ay) * t)
    depths.push(depth)
  }
  if (ys.length === 0) return undefined
  let level = -Infinity
  const from = near()
  if (from !== undefined) for (const y of ys) if (y <= from + LEVEL_STEP && y > level) level = y
  if (level === -Infinity) level = Math.min(...ys)
  let best = ys[0]!
  let bestDepth = -Infinity
  ys.forEach((y, index) => {
    if (Math.abs(y - level) >= LEVEL_CLEARANCE / 2 || depths[index]! <= bestDepth) return
    best = y
    bestDepth = depths[index]!
  })
  return best
}

/** A lip is crossed this far beyond its kerbs too, metres (the chord is not the path) */
const LIP_REACH = 3

/**
 * The first sample of `samples` reached through a wall (the chord to it crossed one), or -1. A
 * sample's height is the road's under it (terrain.ts groundAt, kept on the road of the sample before
 * at a crossing), or in the air the flight off the lip it left from; 0 everywhere on a flat track.
 * The road's height is worked out only when a crossing of a wall asks for it, except in a level
 * crossing's zone, where the road the kart is on is followed sample by sample from the one before
 */
export function throughWall(
  walls: readonly Wall[],
  terrain: Terrain | undefined,
  samples: readonly WallStep[],
): number {
  let last: WallSample | null = null
  let lastStep: WallStep | null = null
  let flight: Flight | null = null
  // In a crossing's zone, the road's height of the sample before, to keep to its road
  let near: number | undefined
  let nearAt = -1
  for (let at = 0; at < samples.length; at++) {
    const sample = samples[at]!
    if (sample.reset) flight = null
    else if (!sample.airborne) flight = null
    else if (!flight && terrain && lastStep && !lastStep.reset) flight = takeoff(terrain, lastStep, sample)
    const airborne = flight !== null
    let y: number | undefined
    if (flight) {
      const seconds = (sample.tick - flight.tick) / 60
      y = flight.y + flight.vy * seconds - (TERRAIN_TUNING.gravity * seconds * seconds) / 2
    } else if (!terrain) y = 0
    else if (terrain.crossings) {
      // In a zone: the road of the sample before, from its height (outside the zone, the one road
      // there) on entering
      const previous = last
      const before = () =>
        nearAt === at - 1 ? near : previous && !sample.reset ? previous.height() : undefined
      y = zoneGround(terrain, sample.x, sample.z, before)
      if (y !== undefined) {
        near = y
        nearAt = at
      }
    }
    const fixed = y
    let worked: number | undefined
    const height =
      fixed !== undefined ? () => fixed : () => (worked ??= groundAt(terrain!, sample.x, sample.z).y)
    const here: WallSample = { x: sample.x, z: sample.z, height, airborne }
    if (last && !sample.reset && wallCrossed(walls, last, here) >= 0) return at
    last = here
    lastStep = sample
  }
  return -1
}
