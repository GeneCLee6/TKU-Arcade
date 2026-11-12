// e8-t02b: the car against walls. Pure, like physics.ts: it runs after stepKart in the same fixed
// 1/60 s step, so walls are as frame-rate independent as the rest of the physics.
//
// A wall is a line segment seen from above, with no thickness and no side: the car is a circle of
// KART_RADIUS that may not come closer to it than that. Segments are the simplest thing a track JSON
// (e8-t04, J4) can list; a track's walls turn into these.
import { STEP_SECONDS, type KartState, type KartTuning } from './physics.ts'

export interface Wall {
  readonly ax: number
  readonly az: number
  readonly bx: number
  readonly bz: number
}

/** The car seen from above, as a circle: half its length, so the nose stops at the wall's face */
export const KART_RADIUS = 1.2

/**
 * The car moves at most this far between two checks for walls. Under half the radius, the centre can
 * never reach a wall's line between two checks, so it is always pushed back out on the side it came
 * from: no speed, however high, takes the car through a wall.
 */
const MAX_TRAVEL = KART_RADIUS / 2

/** Even a car tuned absurdly fast gets checked often enough (99 m/s at most, beyond any preset) */
const MAX_CHECKS = 200

/** Two passes, so that a car pushed out of one wall into another (in a corner) comes out of both */
const PASSES = 2

export interface WallResult {
  readonly state: KartState
  /**
   * How hard the worst hit of the step was, from 0 (no hit, or sliding along) to 1 (head on): the
   * cosine between the velocity and the wall's normal, so the HUD and the sound can scale with it.
   */
  readonly impact: number
  /** How fast the car was going into the wall at that hit, in m/s: how big a crash it was */
  readonly hitSpeed: number
  /** Whether the car touched a wall at all in this step */
  readonly touching: boolean
}

/** The point of the segment nearest to (x, z) */
function nearest(wall: Wall, x: number, z: number): { x: number; z: number } {
  const dx = wall.bx - wall.ax
  const dz = wall.bz - wall.az
  const lengthSquared = dx * dx + dz * dz
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - wall.ax) * dx + (z - wall.az) * dz) / lengthSquared))
  return { x: wall.ax + dx * along, z: wall.az + dz * along }
}

/** How far (x, z) is from the nearest wall: the course uses it to tell a safe place */
export function wallClearance(walls: readonly Wall[], x: number, z: number): number {
  let clearance = Infinity
  for (const wall of walls) {
    const point = nearest(wall, x, z)
    clearance = Math.min(clearance, Math.hypot(x - point.x, z - point.z))
  }
  return clearance
}

/**
 * Moves the car from `before` to where stepKart put it (`after`) without going into any wall. On a
 * hit the speed into the wall is taken away (and `wallBounce` of it sent back out), the speed along
 * the wall stays but loses `wallImpactLoss` of itself times how head-on the hit was, and touching a
 * wall costs `wallScrapeDrag` per second. The heading is left alone: steering away is the driver's.
 */
export function collideWalls(
  before: KartState,
  after: KartState,
  walls: readonly Wall[],
  tuning: KartTuning,
): WallResult {
  if (walls.length === 0) return { state: after, impact: 0, hitSpeed: 0, touching: false }
  const dt = STEP_SECONDS
  const travel = Math.hypot(after.x - before.x, after.z - before.z)
  const checks = Math.min(MAX_CHECKS, Math.max(1, Math.ceil(travel / MAX_TRAVEL)))

  let x = before.x
  let z = before.z
  let vx = after.vx
  let vz = after.vz
  let hit = false
  let touching = false
  let impact = 0
  let hitSpeed = 0

  for (let check = 1; check <= checks; check++) {
    if (!hit) {
      // Until a hit the car follows stepKart's own path, and lands exactly where it said
      x = check === checks ? after.x : before.x + ((after.x - before.x) * check) / checks
      z = check === checks ? after.z : before.z + ((after.z - before.z) * check) / checks
    } else {
      // After one, the rest of the step follows the new velocity
      x += (vx * dt) / checks
      z += (vz * dt) / checks
    }
    for (let pass = 0; pass < PASSES; pass++) {
      for (const wall of walls) {
        const point = nearest(wall, x, z)
        const awayX = x - point.x
        const awayZ = z - point.z
        const distance = Math.hypot(awayX, awayZ)
        if (distance >= KART_RADIUS) continue
        // A centre exactly on the line cannot happen (see MAX_TRAVEL); push it any way at all
        const nx = distance > 0 ? awayX / distance : 1
        const nz = distance > 0 ? awayZ / distance : 0
        x = point.x + nx * KART_RADIUS
        z = point.z + nz * KART_RADIUS
        hit = true
        touching = true

        const into = vx * nx + vz * nz
        if (into >= 0) continue
        const speed = Math.hypot(vx, vz)
        const headOn = -into / speed
        impact = Math.max(impact, headOn)
        hitSpeed = Math.max(hitSpeed, -into)
        // Along the wall, minus a share for how head-on it was; out of the wall, a small bounce
        const alongX = vx - into * nx
        const alongZ = vz - into * nz
        const kept = 1 - tuning.wallImpactLoss * headOn
        vx = alongX * kept - into * tuning.wallBounce * nx
        vz = alongZ * kept - into * tuning.wallBounce * nz
      }
    }
  }

  if (!touching) return { state: after, impact: 0, hitSpeed: 0, touching: false }

  const speed = Math.hypot(vx, vz)
  if (speed > 0) {
    const scraped = Math.max(0, speed - tuning.wallScrapeDrag * dt) / speed
    vx *= scraped
    vz *= scraped
  }
  return { state: { ...after, x, z, vx, vz }, impact, hitSpeed, touching }
}
