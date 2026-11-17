// e10-t07: pieces to a road. Each piece is walked from where the one before ended, and sampled about
// every SAMPLE metres into the track format's road points (track.ts), each remembering the piece it
// came from so that a problem can name the piece. Pure.
import type { Spot } from '../course.ts'
import type { RoadPoint } from '../track.ts'
import { RAMP_LENGTH, type Piece } from './spec.ts'

/** Metres between road points, as the hand-made tracks */
export const SAMPLE = 6
/** A piece's width blends in from the one before over this many metres (or the whole piece) */
export const BLEND = 40
/** Road points closer than this to the one before are left out */
const MIN_GAP = 1

const RADIANS = Math.PI / 180

/** The way heading `h` faces, and its right, on the ground plane */
export const forward = (h: number) => ({ x: Math.sin(h), z: -Math.cos(h) })
export const rightOf = (h: number) => ({ x: Math.cos(h), z: Math.sin(h) })

/** How long a piece is along its centre line, metres */
export const pieceLength = (piece: Piece): number =>
  piece.kind === 'turn' ? piece.radius * Math.abs(piece.angle) * RADIANS : piece.length

/** Where a piece that starts at `from` puts you `distance` metres along it */
export function along(piece: Piece, from: Spot, distance: number): Spot {
  if (piece.kind !== 'turn') {
    const f = forward(from.heading)
    return { x: from.x + f.x * distance, z: from.z + f.z * distance, heading: from.heading }
  }
  const sign = Math.sign(piece.angle)
  const r = piece.radius
  const right = rightOf(from.heading)
  // The bend's centre is r to the side it turns to; the heading swings by distance / r
  const cx = from.x + sign * r * right.x
  const cz = from.z + sign * r * right.z
  const heading = from.heading + (sign * distance) / r
  const now = rightOf(heading)
  return { x: cx - sign * r * now.x, z: cz - sign * r * now.z, heading }
}

export interface Laid {
  /** The road through every piece, from the start line; the last point joins the first */
  readonly road: RoadPoint[]
  /** For each road point, the piece it is on */
  readonly pieceOf: number[]
  /** Where each piece starts, and (last) where the last one ends */
  readonly joints: Spot[]
  /** Each piece's length, metres */
  readonly lengths: number[]
  /** The road's height where each piece starts, and (last) where the last one ends (2026-11-17) */
  readonly heights: number[]
  /** The road points that are jump lips, in order */
  readonly jumps: number[]
}

const round = (value: number) => Math.round(value * 100) / 100

/** Whether any piece leaves the flat: then every road point has a height (track.ts) */
export const hasHeights = (pieces: readonly Piece[]): boolean =>
  pieces.some((piece) => piece.kind === 'slope' || piece.kind === 'jump')

/** Eases 0 to 1 in and out: a slope's share of its rise at that share of its length */
const ease = (t: number) => t * t * (3 - 2 * t)

/** A jump's ramp: RAMP_LENGTH, or half the piece if that is shorter */
const rampOf = (length: number) => Math.min(RAMP_LENGTH, length / 2)

/**
 * The distances along a piece its road points go at: evenly, as always; or for a jump, the ramp's
 * foot, middle and lip (the lip's index in the list as `lip`), then evenly on
 */
function samples(piece: Piece, length: number): { at: number[]; lip: number } {
  if (piece.kind === 'jump') {
    const ramp = rampOf(length)
    const at = [0, ramp / 2, ramp]
    for (let d = ramp + 3; d < length - 1; d += SAMPLE) at.push(d)
    return { at, lip: 2 }
  }
  const count = Math.max(1, Math.round(length / SAMPLE))
  return { at: Array.from({ length: count }, (_, step) => (length * step) / count), lip: -1 }
}

/** The road's height `distance` metres along a piece that starts at height `base` */
function heightOn(piece: Piece, base: number, distance: number, length: number): number {
  if (piece.kind === 'slope') return base + piece.rise * ease(Math.min(1, distance / length))
  if (piece.kind === 'jump') {
    const ramp = rampOf(length)
    return distance <= ramp ? base + piece.height * (distance / ramp) : base
  }
  return base
}

/** The road the pieces make, from the origin facing heading 0 */
export function layout(pieces: readonly Piece[]): Laid {
  const road: RoadPoint[] = []
  const pieceOf: number[] = []
  const joints: Spot[] = [{ x: 0, z: 0, heading: 0 }]
  const lengths: number[] = []
  const heights: number[] = [0]
  const jumps: number[] = []
  // Heights only when a piece leaves the flat: a flat track's road is exactly what it always was
  const lifted = hasHeights(pieces)
  pieces.forEach((piece, index) => {
    const from = joints[index]!
    const base = heights[index]!
    const length = pieceLength(piece)
    const before = pieces[(index - 1 + pieces.length) % pieces.length]!.width
    const blend = Math.min(length, BLEND)
    const { at: distances, lip } = samples(piece, length)
    distances.forEach((distance, sample) => {
      const at = along(piece, from, distance)
      const mix = blend > 0 ? Math.min(1, distance / blend) : 1
      // A short piece's point too near the last one is left out: the format wants them apart
      const last = road[road.length - 1]
      if (last && Math.hypot(at.x - last.x, at.z - last.z) < MIN_GAP) return
      const width = Math.round((before + (piece.width - before) * mix) * 10) / 10
      if (sample === lip) jumps.push(road.length)
      const y = round(heightOn(piece, base, distance, length))
      road.push(
        lifted
          ? { x: round(at.x), z: round(at.z), width, y }
          : { x: round(at.x), z: round(at.z), width },
      )
      pieceOf.push(index)
    })
    lengths.push(length)
    joints.push(along(piece, from, length))
    heights.push(base + (piece.kind === 'slope' ? piece.rise : 0))
  })
  // Nor may the last point sit on the first, where the loop closes
  while (road.length > 1) {
    const last = road[road.length - 1]!
    if (Math.hypot(last.x - road[0]!.x, last.z - road[0]!.z) >= MIN_GAP) break
    road.pop()
    pieceOf.pop()
  }
  return {
    road,
    pieceOf,
    joints,
    lengths,
    heights,
    jumps: jumps.filter((at) => at < road.length),
  }
}

/** An angle brought into -π to π */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a < -Math.PI) a += 2 * Math.PI
  return a
}
