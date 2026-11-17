// e10-t07: "close the loop". Pieces laid by hand rarely end exactly where the track began, so the
// editor offers the pieces that join the end back to the start: a bend, a straight and a bend (the
// shortest such path between two places and headings, a Dubins path of its CSC kinds), for a few
// bend radii, the shortest first, keeping the first that makes a legal track. Pure.
import type { Spot } from '../course.ts'
import { buildSpec } from './build.ts'
import { along, layout, pieceLength, wrapAngle } from './layout.ts'
import { LIMITS, tenth, type Piece, type TrackSpec } from './spec.ts'

/** Bend radii tried, metres: from tight to sweeping */
const RADII = [45, 60, 80, 110, 150]

type Side = 1 | -1 // 1 turns right, -1 left

/** The centre of the bend of radius r that a kart at `spot` turning to `side` goes round */
function centre(spot: Spot, side: Side, r: number) {
  return {
    x: spot.x + side * r * Math.cos(spot.heading),
    z: spot.z + side * r * Math.sin(spot.heading),
  }
}

/** Turning to `side` from heading `from` to heading `to`: how far, radians, from 0 to 2π */
function sweep(from: number, to: number, side: Side): number {
  let a = (side * (to - from)) % (2 * Math.PI)
  if (a < 0) a += 2 * Math.PI
  return a
}

/** One way from `start` to `goal` as a bend, a straight and a bend; null when this kind cannot */
function path(
  start: Spot,
  goal: Spot,
  first: Side,
  second: Side,
  r: number,
  width: number,
): Piece[][] {
  const c1 = centre(start, first, r)
  const c2 = centre(goal, second, r)
  const dx = c2.x - c1.x
  const dz = c2.z - c1.z
  const d = Math.hypot(dx, dz)
  // The heading that faces from c1 to c2
  const towards = Math.atan2(dx, -dz)
  const options: { heading: number; length: number }[] = []
  if (first === second) {
    options.push({ heading: towards, length: d })
  } else {
    if (d < 2 * r) return []
    const offset = Math.asin((2 * r) / d)
    const length = Math.sqrt(d * d - 4 * r * r)
    options.push({ heading: towards + offset, length }, { heading: towards - offset, length })
  }
  return options.map(({ heading, length }) => {
    const a1 = sweep(start.heading, heading, first)
    const a2 = sweep(heading, goal.heading, second)
    const pieces: Piece[] = []
    const bend = (angle: number, side: Side) => {
      const degrees = tenth((side * angle * 180) / Math.PI)
      if (Math.abs(degrees) >= 0.1) {
        pieces.push({ kind: 'turn', angle: degrees, radius: r, width, pad: 'none', boxes: false })
      }
    }
    bend(a1, first)
    if (length >= 0.5) {
      // A straight longer than a piece may be is laid as several
      const count = Math.ceil(length / LIMITS.maxLength)
      for (let k = 0; k < count; k++) {
        pieces.push({
          kind: 'straight',
          length: tenth(Math.max(LIMITS.minLength, length / count)),
          width,
          pad: 'none',
          boxes: false,
        })
      }
    }
    bend(a2, second)
    return pieces
  })
}

/** Where pieces laid from `start` end */
function endOf(pieces: readonly Piece[], start: Spot): Spot {
  return pieces.reduce((spot, piece) => along(piece, spot, pieceLength(piece)), start)
}

/**
 * The pieces to add after the last one so that the track closes and is legal, shortest first; null
 * when none of the tries makes a legal track (or the track has no pieces to close)
 */
export function closeLoop(spec: TrackSpec): Piece[] | null {
  if (spec.pieces.length === 0) return null
  const { joints } = layout(spec.pieces)
  const end = joints[joints.length - 1]!
  const goal: Spot = { x: 0, z: 0, heading: 0 }
  const width = spec.pieces[spec.pieces.length - 1]!.width
  const tries: Piece[][] = []
  for (const r of RADII) {
    if (r < width / 2 + 6) continue
    for (const [first, second] of [
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ] as [Side, Side][]) {
      for (const pieces of path(end, goal, first, second, r, width)) {
        // Only a path that really arrives (of the two ways round, one does), rounding and all
        const arrived = endOf(pieces, end)
        if (Math.hypot(arrived.x, arrived.z) > 1 || Math.abs(wrapAngle(arrived.heading)) > 0.02) {
          continue
        }
        if (pieces.length > 0) tries.push(pieces)
      }
    }
  }
  const lengthOf = (pieces: Piece[]) => pieces.reduce((sum, piece) => sum + pieceLength(piece), 0)
  tries.sort((a, b) => lengthOf(a) - lengthOf(b))
  for (const pieces of tries) {
    const next = [...spec.pieces, ...pieces]
    if (next.length > LIMITS.maxPieces) continue
    if (buildSpec({ ...spec, pieces: next }).problems.length === 0) return pieces
  }
  return null
}
