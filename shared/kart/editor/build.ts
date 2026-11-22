// e10-t07, e10-t08: a spec's pieces made into a track in the format every race reads (track.ts), and
// checked: the loop must close, never run into itself, keep its kerbs from folding in the bends, be
// neither too short nor too long and leave room on the grid for eight karts. Every problem names the
// pieces it is on, so that the editor can mark them. The Worker runs the same checks on any track a
// room is given (custom.ts). Pure.
import type { Spot } from '../course.ts'
import { roadClearance } from '../scenery.ts'
import { branchMouth, branchPath, gatesClearOf, type BranchJson } from '../branches.ts'
import { findCrossings, inZone, LEVEL_CLEARANCE, ZONE_PAD, type Crossing } from '../levels.ts'
import {
  gatesAlong,
  gatesClearOfCrossings,
  headingOf,
  padsAlong,
  parseTrack,
  roadDirection,
  TRACK_FORMAT,
  type RoadPoint,
  type TrackJson,
} from '../track.ts'
import { fence } from '../tracks/guide.ts'
import type { Wall } from '../walls.ts'
import { lineGrid, LINE_BACK, LINE_PLACES, LINE_SOLO_ACROSS } from '../startLine.ts'
import { KART_RADIUS } from '../walls.ts'
import { specHash } from './codec.ts'
import { layout, pieceLength, wrapAngle, type Laid } from './layout.ts'
import { BYPASS_EASE, LIMITS, type Bypass, type Piece, type TrackSpec } from './spec.ts'

/** The loop is closed when the last piece ends this near the start, facing this near its way */
export const CLOSE_GAP = 2.5
export const CLOSE_DEGREES = 4
/** Room between a bend's inside kerb and its centre: no tighter, or the kerb folds over */
export const KERB_MARGIN = 6
/** Two parts of the road this far apart along it must be this far apart on the ground */
const CROSS_MARGIN = 4
/** Places on the grid: a full room */
export const GRID_PLACES = LINE_PLACES
/** Road points between gates, as the hand-made tracks */
const GATE_EVERY = 7
/** Boxes in a row across the road */
const ROW = 5
/** The most item boxes a track may have: a pickup names its box in one byte */
const MAX_BOXES = 255

export type ProblemCode =
  | 'open'
  | 'crosses'
  | 'tight'
  | 'short'
  | 'long'
  | 'grid'
  | 'boxes'
  | 'pieces'
  // Slopes and jumps (2026-11-17): the loop must end at the height it began, never climb past
  // LIMITS.maxHeight either way, and no slope may be steeper than LIMITS.maxGrade
  | 'level'
  | 'high'
  | 'steep'
  | 'bypass'
  // 2026-11-22 (levels.ts): where the road runs over itself it must be high enough over, cross
  // squarely enough and keep pads, boxes, jumps, the start and bypasses away; a banked bend must be
  // long enough to lean in and out
  | 'crossing'
  | 'bank'

export interface Problem {
  readonly code: ProblemCode
  /** The pieces it is on, by index; empty for the track as a whole */
  readonly pieces: readonly number[]
  /** Numbers for the message: metres, degrees */
  readonly params?: Readonly<Record<string, number>>
}

export interface Built {
  readonly track: TrackJson
  readonly laid: Laid
  /** Of the whole loop, metres */
  readonly length: number
  readonly problems: readonly Problem[]
}

/** The road's cumulative length at each point, and the loop's */
function distances(road: Laid['road']): { at: number[]; total: number } {
  const at: number[] = []
  let total = 0
  road.forEach((point, index) => {
    at.push(total)
    const next = road[(index + 1) % road.length]!
    total += Math.hypot(next.x - point.x, next.z - point.z)
  })
  return { at, total }
}

/** Where the road is `distance` metres along it from point 0 (wrapping), facing along it */
function spotAlong(road: Laid['road'], at: number[], total: number, distance: number): Spot {
  const d = ((distance % total) + total) % total
  let index = 0
  while (index + 1 < at.length && at[index + 1]! <= d) index++
  const a = road[index]!
  const b = road[(index + 1) % road.length]!
  const span = Math.hypot(b.x - a.x, b.z - a.z) || 1
  const t = (d - at[index]!) / span
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    heading: headingOf({ dx: (b.x - a.x) / span, dz: (b.z - a.z) / span }),
  }
}

/** One row across the road behind the line, as the hand-made tracks (startLine.ts): the pole first */
function gridOf(road: Laid['road'], at: number[], total: number): Spot[] {
  const centre = spotAlong(road, at, total, total - LINE_BACK)
  // The road's width there: the narrower of the two points either side
  let index = 0
  const d = total - LINE_BACK
  while (index + 1 < at.length && at[index + 1]! <= d) index++
  const width = Math.min(road[index]!.width, road[(index + 1) % road.length]!.width)
  return lineGrid(centre, width)
}

/** The time trial's start (TrackJson.solo): where the pole stood before the row, to the centimetre */
function soloOf(road: Laid['road'], at: number[], total: number): Spot {
  const spot = spotAlong(road, at, total, total - LINE_BACK)
  // The road's right, facing along it
  const right = { x: Math.cos(spot.heading), z: Math.sin(spot.heading) }
  return {
    x: Math.round((spot.x + right.x * LINE_SOLO_ACROSS) * 100) / 100,
    z: Math.round((spot.z + right.z * LINE_SOLO_ACROSS) * 100) / 100,
    heading: Math.round(spot.heading * 1e6) / 1e6,
  }
}

/** The road point nearest the middle of each piece */
function middles(laid: Laid): number[] {
  return laid.lengths.map((_, piece) => {
    const points = laid.pieceOf.flatMap((owner, index) => (owner === piece ? [index] : []))
    return points.length > 0 ? points[Math.floor(points.length / 2)]! : -1
  })
}

/**
 * Pairs of pieces whose road runs into each other; at most `max` of them. Where it runs over itself
 * at a crossing (2026-11-22, levels.ts), high enough apart, it does not
 */
function crossings(
  laid: Laid,
  at: number[],
  total: number,
  max: number,
  levels: readonly Crossing[] = [],
): [number, number][] {
  const { road, pieceOf } = laid
  const found = new Map<string, [number, number]>()
  for (let i = 0; i < road.length && found.size < max; i++) {
    const a = road[i]!
    for (let j = i + 1; j < road.length; j++) {
      const b = road[j]!
      const forward = at[j]! - at[i]!
      const apart = Math.min(forward, total - forward)
      // Neighbours along the road are close by nature
      if (apart < Math.max(90, (a.width + b.width) * 1.2)) continue
      const reach = (a.width + b.width) / 2 + CROSS_MARGIN
      const dx = a.x - b.x
      const dz = a.z - b.z
      if (dx * dx + dz * dz > reach * reach) continue
      if (
        levels.length > 0 &&
        inZone(levels, a.x, a.z, ZONE_PAD) &&
        inZone(levels, b.x, b.z, ZONE_PAD) &&
        Math.abs((a.y ?? 0) - (b.y ?? 0)) >= LEVEL_CLEARANCE
      )
        continue
      const pair: [number, number] = [pieceOf[i]!, pieceOf[j]!]
      found.set(pair.join(','), pair)
      if (found.size >= max) break
    }
  }
  return [...found.values()]
}

/**
 * A bypass's road (2026-11-20): the main road's centre line from where piece `from` begins to where
 * piece `to` ends, moved `offset` to its side, eased out over BYPASS_EASE metres and back in; the
 * main road points it leaves from and joins again. Null when the pieces leave no room for it
 */
export function bypassRoad(
  laid: Laid,
  bypass: Bypass,
): { from: number; to: number; road: RoadPoint[] } | null {
  const { road, pieceOf } = laid
  const from = pieceOf.indexOf(bypass.from)
  const lastOf = pieceOf.lastIndexOf(bypass.to)
  if (from < 1 || lastOf < 0 || lastOf + 1 >= road.length) return null
  const to = lastOf + 1
  const along = [0]
  for (let index = from + 1; index <= to; index++) {
    const a = road[index - 1]!
    const b = road[index]!
    along.push(along[along.length - 1]! + Math.hypot(b.x - a.x, b.z - a.z))
  }
  const total = along[along.length - 1]!
  if (total < BYPASS_EASE * 2 + 12) return null
  const points: RoadPoint[] = []
  for (let index = from + 1; index < to; index++) {
    const s = along[index - from]!
    const t = Math.min(1, s / BYPASS_EASE, (total - s) / BYPASS_EASE)
    const share = t * t * (3 - 2 * t)
    const point = road[index]!
    const { dx, dz } = roadDirection(road, index)
    // The road's right, facing along it, is (-dz, dx)
    const across = bypass.side * bypass.offset * share
    const width = Math.round((point.width + (bypass.width - point.width) * Math.min(1, t * 3)) * 10) / 10
    points.push({
      x: Math.round((point.x - dz * across) * 100) / 100,
      z: Math.round((point.z + dx * across) * 100) / 100,
      width,
      ...(point.y !== undefined ? { y: point.y } : {}),
    })
  }
  return { from, to, road: points }
}

/** Raised whenever the physics changes enough that old times on custom tracks mean nothing */
export const CUSTOM_REVISION = 7

/** A bypass's slot (2026-11-22): this wide, in the middle of the wall across it */
const BYPASS_SLOT = 9
/** A bypass's wall leaves this many road points of its mouth open */
const BYPASS_MOUTH = 3
/** How high a bypass's walls stand over the road, and its jump's lip */
const BYPASS_WALL = 9
const BYPASS_JUMP = 2.5

/**
 * What stands on a bypass (2026-11-22, #113): its road with a jump raised in its middle, or the
 * walls of its mouth or its slot. `path` is the bypass's whole centre line (branches.ts)
 */
function bypassFeature(
  road: readonly RoadPoint[],
  bypass: Bypass,
  laidBy: { from: number; to: number; road: RoadPoint[] },
): { road: RoadPoint[]; jumps?: number[]; walls: Wall[] } {
  const middle = Math.floor(laidBy.road.length / 2)
  if (bypass.feature === 'jump') {
    // The two points up to the lip raised into a ramp, as circuit.ts's jumps
    const raised = laidBy.road.map((point, index) => {
      const lift = index === middle ? BYPASS_JUMP : index === middle - 1 ? BYPASS_JUMP / 2 : 0
      return { ...point, y: Math.round(((point.y ?? 0) + lift) * 100) / 100 }
    })
    return { road: raised, jumps: [middle], walls: [] }
  }
  const path = branchPath(road, { from: laidBy.from, to: laidBy.to, road: laidBy.road })
  if (bypass.feature === 'slot') {
    const at = middle + 1
    const edge = bypass.width / 2 + 1
    return {
      road: laidBy.road,
      walls: [
        ...fence(path, [[at, -edge], [at, -BYPASS_SLOT / 2]], BYPASS_WALL),
        ...fence(path, [[at, BYPASS_SLOT / 2], [at, edge]], BYPASS_WALL),
      ],
    }
  }
  if (bypass.feature === 'wall') {
    // Along the main road's kerb on the bypass's side, but for the first few points of its mouth
    const [first, last] = branchMouth(road, path, laidBy.from, bypass.side)
    const kerb: [number, number][] = []
    for (let index = first + BYPASS_MOUTH; index <= last + 1; index++) {
      kerb.push([index, bypass.side * (road[index % road.length]!.width / 2 - 0.4)])
    }
    return { road: laidBy.road, walls: kerb.length > 1 ? fence(road, kerb, BYPASS_WALL) : [] }
  }
  return { road: laidBy.road, walls: [] }
}

/** The track the spec makes, under its own id (`custom-<hash>`), and everything wrong with it */
export function buildSpec(spec: TrackSpec): Built {
  const pieces: readonly Piece[] = spec.pieces
  const laid = layout(pieces)
  const { road, joints, pieceOf } = laid
  const problems: Problem[] = []
  const last = pieces.length - 1

  if (pieces.length < LIMITS.minPieces || pieces.length > LIMITS.maxPieces) {
    problems.push({
      code: 'pieces',
      pieces: [],
      params: { min: LIMITS.minPieces, max: LIMITS.maxPieces },
    })
  }

  // Closed: the last piece ends where the first began, facing the same way
  const end = joints[joints.length - 1]!
  const gap = Math.hypot(end.x, end.z)
  const off = Math.abs(wrapAngle(end.heading)) * (180 / Math.PI)
  const open = gap > CLOSE_GAP || off > CLOSE_DEGREES
  if (open) {
    problems.push({
      code: 'open',
      pieces: last >= 0 ? [last] : [],
      params: { gap: Math.round(gap), degrees: Math.round(off) },
    })
  }

  // A bend tighter than half the road (and a margin) folds its inside kerb over
  pieces.forEach((piece, index) => {
    if (piece.kind !== 'turn') return
    const before = pieces[(index - 1 + pieces.length) % pieces.length]!.width
    const least = Math.max(piece.width, before) / 2 + KERB_MARGIN
    if (piece.radius < least) {
      problems.push({ code: 'tight', pieces: [index], params: { radius: Math.ceil(least) } })
    }
  })

  // Slopes: none too steep, the loop back at the start's height, never too high or too low
  pieces.forEach((piece, index) => {
    if (piece.kind === 'slope' && Math.abs(piece.rise) > piece.length * LIMITS.maxGrade + 1e-9) {
      problems.push({
        code: 'steep',
        pieces: [index],
        params: { rise: Math.floor(piece.length * LIMITS.maxGrade) },
      })
    }
  })
  const { heights } = laid
  const finalHeight = heights[heights.length - 1] ?? 0
  if (Math.abs(finalHeight) > 0.05) {
    problems.push({
      code: 'level',
      pieces: last >= 0 ? [last] : [],
      params: { gap: Math.round(finalHeight * 10) / 10 },
    })
  }
  const highest = heights.findIndex((height) => Math.abs(height) > LIMITS.maxHeight + 1e-9)
  if (highest >= 0) {
    problems.push({
      code: 'high',
      pieces: [Math.max(0, highest - 1)],
      params: { max: LIMITS.maxHeight },
    })
  }

  const { at, total } = road.length > 1 ? distances(road) : { at: [0], total: 0 }
  if (total < LIMITS.minTrack) {
    problems.push({ code: 'short', pieces: [], params: { min: LIMITS.minTrack } })
  }
  if (total > LIMITS.maxTrack) {
    problems.push({ code: 'long', pieces: [], params: { max: LIMITS.maxTrack } })
  }

  // Banked bends (2026-11-22): long enough to lean in and out no faster than the format allows
  pieces.forEach((piece, index) => {
    if (piece.kind !== 'turn' || !piece.bank) return
    if (pieceLength(piece) < piece.bank * 4.5) {
      problems.push({ code: 'bank', pieces: [index], params: { length: Math.ceil(piece.bank * 4.5) } })
    }
  })

  // Where the road runs over itself (2026-11-22, levels.ts): high enough over, squarely enough
  const levelProblems: string[] = []
  const levels = road.length > 3 && !open ? findCrossings(road, levelProblems) : []
  const pieceAt = (problem: string) => {
    const found = [...problem.matchAll(/road\[(\d+)\]/g)].map((match) => pieceOf[Number(match[1])]!)
    return [...new Set(found.filter((one) => one !== undefined))]
  }
  for (const problem of levelProblems) problems.push({ code: 'crossing', pieces: pieceAt(problem) })

  // Never running into itself (the checks the hand-made tracks' tests make, oldstreet.test.ts)
  if (road.length > 3 && total <= LIMITS.maxTrack) {
    for (const pair of crossings(laid, at, total, 6, levels)) {
      problems.push({ code: 'crosses', pieces: pair[0] === pair[1] ? [pair[0]] : pair })
    }
  }

  const grid = road.length > 3 ? gridOf(road, at, total) : []
  // Every place on the road, a kart's reach and more in from the kerbs
  const blocked = grid.some((spot) => roadClearance(road, spot.x, spot.z) > -(KART_RADIUS + 1))
  if (blocked && !open) problems.push({ code: 'grid', pieces: last >= 0 ? [last] : [] })

  const mids = middles(laid)
  const rows = pieces.filter((piece) => piece.boxes).length
  if (rows * ROW > MAX_BOXES) {
    problems.push({ code: 'boxes', pieces: [], params: { max: Math.floor(MAX_BOXES / ROW) } })
  }

  // Bypasses (2026-11-20): each laid beside the road; the main road's gates kept off where they part
  const bypasses = spec.bypasses ?? []
  const branches: BranchJson[] = []
  const branchOf: Bypass[] = []
  const bypassWalls: Wall[] = []
  if (bypasses.length > LIMITS.maxBypasses) {
    problems.push({ code: 'bypass', pieces: [] })
  }
  for (const bypass of bypasses.slice(0, LIMITS.maxBypasses)) {
    const laidBy = road.length > 3 ? bypassRoad(laid, bypass) : null
    if (!laidBy) {
      problems.push({ code: 'bypass', pieces: [bypass.from, bypass.to] })
      continue
    }
    // What stands on it (2026-11-22): a jump, the walls of its mouth or its slot
    const dressed = bypass.feature ? bypassFeature(road, bypass, laidBy) : null
    branches.push({
      from: laidBy.from,
      to: laidBy.to,
      road: dressed ? dressed.road : laidBy.road,
      ...(dressed?.jumps ? { jumps: dressed.jumps } : {}),
    })
    if (dressed) bypassWalls.push(...dressed.walls)
    branchOf.push(bypass)
  }
  const along =
    road.length > 0 ? gatesAlong(road, GATE_EVERY) : { gates: [], respawns: [] }
  const forked =
    branches.length > 0 ? gatesClearOf(road, along.gates, along.respawns, branches) : along
  // ... and off any crossing (2026-11-22): a road that never crosses itself keeps them as they were
  const { gates, respawns } =
    levels.length > 0 ? gatesClearOfCrossings(road, forked.gates, forked.respawns) : forked
  const padSpots: [number, number][] = []
  const boxes: { x: number; z: number }[] = []
  pieces.forEach((piece, index) => {
    const mid = mids[index]!
    if (mid < 0) return
    const width = road[mid]!.width
    // A jump has neither: a car flies over them
    if (piece.kind === 'jump') return
    if (piece.pad !== 'none') {
      const across = piece.pad === 'left' ? -width / 4 : piece.pad === 'right' ? width / 4 : 0
      padSpots.push([mid, across])
    }
    if (piece.boxes) {
      const step = width / 7
      const { dx, dz } = roadDirection(road, mid)
      // The road's right, facing along it
      const right = { x: -dz, z: dx }
      for (let k = -(ROW - 1) / 2; k <= (ROW - 1) / 2; k++) {
        boxes.push({
          x: Math.round((road[mid]!.x + right.x * k * step) * 100) / 100,
          z: Math.round((road[mid]!.z + right.z * k * step) * 100) / 100,
        })
      }
    }
  })

  const hash = specHash(pieces, spec.bypasses)
  const named = spec.name.trim()
  const track: TrackJson = {
    format: TRACK_FORMAT,
    id: `custom-${hash}`,
    // The physics' version (2: the classic feel, 2026-11-17): the hash is the layout's alone, so
    // times driven with the old physics are set aside by this (recordKey)
    revision: CUSTOM_REVISION,
    name: { en: named || 'Custom track', 'zh-TW': named || '自訂賽道' },
    theme: spec.theme,
    laps: 3,
    road,
    gates,
    respawns,
    grid,
    ...(road.length > 3 ? { solo: soloOf(road, at, total) } : {}),
    walls: bypassWalls,
    boostPads: road.length > 0 ? padsAlong(road, padSpots) : [],
    itemBoxes: boxes.slice(0, MAX_BOXES),
    decor: [],
    ...(laid.jumps.length > 0 ? { jumps: laid.jumps } : {}),
    ...(branches.length > 0 ? { branches } : {}),
  }
  // A crossing's zone (2026-11-22): whatever parseTrack finds there names the crossing's pieces
  if (levels.length > 0 && problems.length === 0) {
    const parsed = parseTrack(track)
    if ('problems' in parsed && parsed.problems.some((problem) => /crossing/.test(problem))) {
      const named = new Set(
        levels.flatMap((crossing) => [pieceOf[crossing.upper]!, pieceOf[crossing.lower]!]),
      )
      problems.push({ code: 'crossing', pieces: [...named] })
    }
  }
  // A bypass is checked as any branch is (branches.ts): clear of the road, never across it or
  // itself or another, its gates clear; the pieces it runs beside are named
  if (branches.length > 0 && problems.length === 0) {
    const parsed = parseTrack(track)
    if ('problems' in parsed) {
      const named = new Set<number>()
      for (const problem of parsed.problems) {
        const which = /^branches[(d+)]/.exec(problem)
        const bypass = which ? branchOf[Number(which[1])] : undefined
        if (bypass) named.add(bypasses.indexOf(bypass))
      }
      if (named.size === 0) problems.push({ code: 'bypass', pieces: [] })
      for (const index of named) {
        problems.push({ code: 'bypass', pieces: [bypasses[index]!.from, bypasses[index]!.to] })
      }
    }
  }
  return { track, laid, length: total, problems }
}
