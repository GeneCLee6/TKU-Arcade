// e8-t05b: where a track's scenery may go, worked out from the track itself, so that no tree or
// house ever lands on the road whatever the layout. Pure and seeded: the same track always gets the
// same scenery.
import { createRng } from '../games/rng.ts'
import type { RoadPoint } from './track.ts'

/** Distance from (x, z) to the segment a→b */
function segmentDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x: number,
  z: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const length2 = dx * dx + dz * dz
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

/**
 * How far (x, z) is outside the road's kerbs, metres: negative on the road. Measured to the centre
 * line, less half the width at the nearer end of the nearest piece of it
 */
export function roadClearance(road: readonly RoadPoint[], x: number, z: number): number {
  let best = Infinity
  for (let index = 0; index < road.length; index++) {
    const a = road[index]!
    const b = road[(index + 1) % road.length]!
    const distance = segmentDistance(a.x, a.z, b.x, b.z, x, z) - Math.max(a.width, b.width) / 2
    if (distance < best) best = distance
  }
  return best
}

export interface Scattered {
  readonly x: number
  readonly z: number
  /** 0 to 1, for size and turn */
  readonly a: number
  readonly b: number
}

/**
 * Up to `count` places inside `box`, each at least `clearance` m off the road and accepted by
 * `fits`, at least `spacing` m from each other. Tries a bounded number of times, so a crowded box
 * gives fewer, never a hang
 */
export function scatter(
  road: readonly RoadPoint[],
  options: {
    seed: number
    count: number
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
    clearance: number
    spacing: number
    maxClearance?: number
    fits?: (x: number, z: number) => boolean
  },
): Scattered[] {
  const rng = createRng(options.seed)
  const out: Scattered[] = []
  const { box } = options
  for (let tries = 0; tries < options.count * 30 && out.length < options.count; tries++) {
    const x = box.minX + rng.float() * (box.maxX - box.minX)
    const z = box.minZ + rng.float() * (box.maxZ - box.minZ)
    const a = rng.float()
    const b = rng.float()
    const clear = roadClearance(road, x, z)
    if (clear < options.clearance) continue
    if (options.maxClearance !== undefined && clear > options.maxClearance) continue
    if (options.fits && !options.fits(x, z)) continue
    if (out.some((other) => Math.hypot(other.x - x, other.z - z) < options.spacing)) continue
    out.push({ x, z, a, b })
  }
  return out
}

/** The distance along the road at each point, from point 0, and the whole loop's length */
export function roadDistances(road: readonly RoadPoint[]): { along: number[]; length: number } {
  const along: number[] = []
  let length = 0
  road.forEach((point, index) => {
    along.push(length)
    const next = road[(index + 1) % road.length]!
    length += Math.hypot(next.x - point.x, next.z - point.z)
  })
  return { along, length }
}
