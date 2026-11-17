// e9-t06b: the three thrown and dropped items (docs/KART-NETCODE.md §10). Each is a "shot" kept in
// the game's state from the moment it is used: where and when it left, which way it goes and when it
// is gone. Where it is at any moment follows from those alone, so the state never has to be stepped:
// the room judges a hit whenever a kart's frame comes in (the kart's path since its last frame
// against the shot's path over the same time), and each browser draws the shots from the same
// numbers. Working titles of our own, like the five direct items (e10-t01 settles them):
//
//   hail    Hailstone     thrown straight ahead, fast; stops at the first wall; dodged by steering
//   cloud   Thundercloud  chases the kart just ahead and strikes it when it arrives; only a bubble stops it
//   puddle  Mud Puddle    dropped behind, lies on the road until someone drives into it (its owner too)
//
// A hit stuns the kart (itemEffects.ts's `stunStep`). A bubble up stops the hit, and both are gone.
//
// Pure and shared: the browser and the Worker read the same shots.
import { KART_TUNING } from './physics.ts'
import { KART_RADIUS, type Wall } from './walls.ts'

/** A seat in the room (shared/games/types.ts's SeatId) */
type SeatId = number

export const SHOT_ITEMS = ['hail', 'cloud', 'puddle'] as const
export type ShotItem = (typeof SHOT_ITEMS)[number]

export const isShotItem = (value: unknown): value is ShotItem =>
  typeof value === 'string' && (SHOT_ITEMS as readonly string[]).includes(value)

export const SHOT_TUNING = {
  /** Hail: speed on top of the thrower's own forward speed, m/s, and how far it flies at most, m */
  hailSpeed: KART_TUNING.topSpeed * 1.4,
  hailRange: 220,
  /** Hail: it leaves this far ahead of the thrower's centre, m */
  hailLead: 2.6,
  /** Hail: the ball's own radius, m; a kart's circle touching it is hit */
  hailRadius: 0.9,
  /** Cloud: how fast it closes in, m/s, and the longest and shortest flight, ms */
  cloudSpeed: 95,
  cloudMinMs: 700,
  cloudMaxMs: 3_500,
  /** Cloud: the kart just ahead, if it is no further than this, m */
  cloudReach: 320,
  /** Puddle: dropped this far behind the kart's centre, m; it lies there this long, ms */
  puddleBehind: 3.6,
  puddleMs: 20_000,
  /** Puddle: its radius, m; and its owner is safe from it for this long after dropping it, ms */
  puddleRadius: 1.6,
  puddleArmMs: 900,
  /** A shot past its time is kept this much longer, ms, for a late frame to still be judged */
  graceMs: 1_500,
  /** At most this many shots on the road; the oldest goes first */
  maxShots: 24,
  /** How long a hit stuns, ms, by item */
  stunMs: { hail: 1_100, cloud: 1_500, puddle: 1_000 } satisfies Record<ShotItem, number>,
  /** Stunned: held to this share of the top speed, brought down at this share per second */
  stunTopFactor: 0.25,
  stunDrag: 5,
} as const

/** A shot on the road, as the game's state keeps it */
export type KartShot = {
  /** The use event's number: one shot per use, so it names the shot */
  n: number
  item: ShotItem
  by: SeatId
  /** When it left, by the server's clock */
  at: number
  /** Where it left (a puddle: where it lies) */
  x: number
  z: number
  /** Its velocity, m/s (hail only; 0 for the others) */
  vx: number
  vz: number
  /** Gone after this: hail at the end of its flight, a puddle when it dries, a cloud when it strikes */
  until: number
  /** The kart a cloud chases; null for the others */
  target: SeatId | null
}

/** A kart's position at a moment, by the server's clock */
export type Fix = { readonly x: number; readonly z: number; readonly at: number }

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function isShot(value: unknown): value is KartShot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const shot = value as Record<string, unknown>
  return (
    Number.isInteger(shot.n) &&
    isShotItem(shot.item) &&
    Number.isInteger(shot.by) &&
    ['at', 'x', 'z', 'vx', 'vz', 'until'].every((key) => isNumber(shot[key])) &&
    (shot.target === null || Number.isInteger(shot.target))
  )
}

// ── Making one ───────────────────────────────────────────────────────────────────────────────

/** Where the first wall is along a ray from (x, z) in unit direction (dx, dz), or `max` if none nearer */
export function rayToWall(
  walls: readonly Wall[],
  x: number,
  z: number,
  dx: number,
  dz: number,
  max: number,
): number {
  let nearest = max
  for (const wall of walls) {
    const ex = wall.bx - wall.ax
    const ez = wall.bz - wall.az
    const denominator = dx * ez - dz * ex
    if (Math.abs(denominator) < 1e-9) continue
    const wx = wall.ax - x
    const wz = wall.az - z
    const along = (wx * ez - wz * ex) / denominator
    const share = (wx * dz - wz * dx) / denominator
    if (along >= 0 && along < nearest && share >= 0 && share <= 1) nearest = along
  }
  return nearest
}

/** The kart that throws or drops, as the server last saw it */
export type Thrower = {
  readonly seat: SeatId
  readonly x: number
  readonly z: number
  readonly heading: number
  readonly vx: number
  readonly vz: number
}

/** A hailstone thrown from `kart` at `at`: straight ahead, gone at the first wall or its range */
export function throwHail(n: number, kart: Thrower, at: number, walls: readonly Wall[]): KartShot {
  const dx = Math.sin(kart.heading)
  const dz = -Math.cos(kart.heading)
  const forward = Math.max(0, kart.vx * dx + kart.vz * dz)
  const speed = SHOT_TUNING.hailSpeed + forward
  const x = kart.x + dx * SHOT_TUNING.hailLead
  const z = kart.z + dz * SHOT_TUNING.hailLead
  const range = rayToWall(walls, x, z, dx, dz, SHOT_TUNING.hailRange)
  return {
    n,
    item: 'hail',
    by: kart.seat,
    at,
    x,
    z,
    vx: dx * speed,
    vz: dz * speed,
    until: at + Math.round((range / speed) * 1000),
    target: null,
  }
}

/** A puddle dropped behind `kart` at `at` */
export function dropPuddle(n: number, kart: Thrower, at: number): KartShot {
  return {
    n,
    item: 'puddle',
    by: kart.seat,
    at,
    x: kart.x - Math.sin(kart.heading) * SHOT_TUNING.puddleBehind,
    z: kart.z + Math.cos(kart.heading) * SHOT_TUNING.puddleBehind,
    vx: 0,
    vz: 0,
    until: at + SHOT_TUNING.puddleMs,
    target: null,
  }
}

/** A thundercloud sent from `kart` after `target`, `distance` metres away: it strikes on arrival */
export function sendCloud(
  n: number,
  kart: Thrower,
  target: SeatId,
  distance: number,
  at: number,
): KartShot {
  const flight = Math.max(
    SHOT_TUNING.cloudMinMs,
    Math.min(SHOT_TUNING.cloudMaxMs, (distance / SHOT_TUNING.cloudSpeed) * 1000),
  )
  return {
    n,
    item: 'cloud',
    by: kart.seat,
    at,
    x: kart.x,
    z: kart.z,
    vx: 0,
    vz: 0,
    until: at + Math.round(flight),
    target,
  }
}

// ── Where one is ─────────────────────────────────────────────────────────────────────────────

/** Still on the road at `now` (a cloud until it strikes, give or take the grace) */
export const shotLive = (shot: KartShot, now: number): boolean =>
  now >= shot.at && now <= shot.until

/**
 * Where a shot is at `now`. A cloud flies from where it left towards its target, wherever the target
 * is now (`targetAt`), arriving as its time runs out; without the target it stays where it left
 */
export function shotPosition(
  shot: KartShot,
  now: number,
  targetAt?: { readonly x: number; readonly z: number } | null,
): { x: number; z: number } {
  const seconds = Math.max(0, Math.min(now, shot.until) - shot.at) / 1000
  if (shot.item === 'cloud') {
    if (!targetAt) return { x: shot.x, z: shot.z }
    const share = Math.min(1, ((now - shot.at) / Math.max(1, shot.until - shot.at)) ** 1.5)
    return { x: shot.x + (targetAt.x - shot.x) * share, z: shot.z + (targetAt.z - shot.z) * share }
  }
  return { x: shot.x + shot.vx * seconds, z: shot.z + shot.vz * seconds }
}

// ── Hits ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The least distance between two points moving in straight lines over `seconds`: one starts `gap`
 * (x, z) from the other and moves at `relative` (vx, vz) to it
 */
export function closestApproach(
  gapX: number,
  gapZ: number,
  relX: number,
  relZ: number,
  seconds: number,
): number {
  const speed2 = relX * relX + relZ * relZ
  const t = speed2 === 0 ? 0 : Math.max(0, Math.min(seconds, -(gapX * relX + gapZ * relZ) / speed2))
  return Math.hypot(gapX + relX * t, gapZ + relZ * t)
}

/**
 * Whether `shot` hits kart `seat`, which moved in a straight line from `from` to `to` (both by the
 * server's clock; `from` null when the kart jumped, a reset or a swap: then only where it is now
 * counts). Only over the time both were there: the kart's path before the shot left, or after it
 * was gone, never counts
 */
export function shotHits(shot: KartShot, seat: SeatId, from: Fix | null, to: Fix): boolean {
  if (shot.item === 'cloud') {
    return seat === shot.target && to.at >= shot.until && to.at <= shot.until + SHOT_TUNING.graceMs
  }
  if (shot.item === 'hail' && seat === shot.by) return false
  const start = Math.max(shot.at, from?.at ?? to.at)
  // The owner of a puddle is safe from it until it is armed
  const opens =
    shot.item === 'puddle' && seat === shot.by ? shot.at + SHOT_TUNING.puddleArmMs : start
  const t0 = Math.max(start, opens)
  const t1 = Math.min(to.at, shot.until)
  if (t1 < t0) return false
  const reach =
    KART_RADIUS + (shot.item === 'hail' ? SHOT_TUNING.hailRadius : SHOT_TUNING.puddleRadius)
  // The kart's straight path from `from` to `to`, at t0, and its velocity
  const span = from ? (to.at - from.at) / 1000 : 0
  const kvx = from && span > 0 ? (to.x - from.x) / span : 0
  const kvz = from && span > 0 ? (to.z - from.z) / span : 0
  const kx = from && span > 0 ? from.x + kvx * ((t0 - from.at) / 1000) : to.x
  const kz = from && span > 0 ? from.z + kvz * ((t0 - from.at) / 1000) : to.z
  const there = shotPosition(shot, t0)
  return (
    closestApproach(kx - there.x, kz - there.z, kvx - shot.vx, kvz - shot.vz, (t1 - t0) / 1000) <=
    reach
  )
}

/** The shots still worth keeping at `now`, newest last, at most maxShots */
export function keepShots(shots: readonly KartShot[], now: number): KartShot[] {
  return shots
    .filter((shot) => shot.until + SHOT_TUNING.graceMs >= now)
    .slice(-SHOT_TUNING.maxShots)
}
