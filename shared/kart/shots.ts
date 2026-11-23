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
// 2026-11-20 (docs/ARCHITECTURE.md §4.48), two more:
//
//   fog     Sea Fog       a bank of fog laid on the road ahead of the kart in front; it lies a while,
//                         and every kart but its owner that drives in is fogged for a moment (its
//                         view clouds over and the damp air holds it back a little). Not a blow: no
//                         bubble or mirror stops it, and it stays for the next kart
//   decoy   Fake Box      dropped behind like a puddle, and made to look like an item box
//
// A mirror up (items.ts) sends a stunning shot back to whoever threw it.
//
// 2026-11-23 (docs/ARCHITECTURE.md §4.87): heights. On a track with terrain every shot carries the
// height it left at (`y`): a puddle, a fake box and a fog bank the road's surface where they lie, a
// hailstone the thrower's, from which it flies along the road beneath it (falling to it if thrown
// in the air). A kart further from a shot in height than a body's (KART_BODY_HEIGHT) passes it by:
// on the viaduct over it, under it, or in the air over it; walls and obstacles stop a hailstone
// only where it meets them. A shot without `y` (a flat track, a race or a replay from before) is
// judged on the plan alone, exactly as it was.
//
// Pure and shared: the browser and the Worker read the same shots.
import { KART_RADIUS } from './kartRadius.ts'
import { inZone, ZONE_PAD } from './levels.ts'
import {
  clearOfObstacles,
  obstacleAtHeight,
  obstacleStop,
  obstacleWalls,
  type Obstacle,
} from './obstacles.ts'
import { groundAt, TERRAIN_TUNING, type Terrain } from './terrain.ts'
import { KART_BODY_HEIGHT, type Wall } from './walls.ts'

/** A seat in the room (shared/games/types.ts's SeatId) */
type SeatId = number

export const SHOT_ITEMS = ['hail', 'cloud', 'puddle', 'fog', 'decoy'] as const
export type ShotItem = (typeof SHOT_ITEMS)[number]

export const isShotItem = (value: unknown): value is ShotItem =>
  typeof value === 'string' && (SHOT_ITEMS as readonly string[]).includes(value)

/** The shots that stun whoever they hit: all but the fog */
export type StunItem = Exclude<ShotItem, 'fog'>
export const isStunItem = (value: unknown): value is StunItem => isShotItem(value) && value !== 'fog'

/** Shots that lie still on the road where they were dropped */
const LYING: ReadonlySet<ShotItem> = new Set(['puddle', 'decoy', 'fog'])

export const SHOT_TUNING = {
  /** Hail: speed on top of the thrower's own forward speed, m/s, and how far it flies at most, m */
  // 1.4 times the arcade feel's top speed of 60 m/s: kept when the classic feel raised the top speed
  // (2026-11-17), since it adds to the thrower's own speed anyway
  hailSpeed: 60 * 1.4,
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
  /**
   * Fog (2026-11-20): laid this far ahead of the kart in front along its way, s of its speed (at
   * least fogLeadMin metres), stopped short of a wall; it lies there this long, this wide, ms and m
   */
  fogLeadSeconds: 0.9,
  fogLeadMin: 25,
  fogMs: 7_000,
  fogRadius: 7,
  /** Fog: the kart in front, if it is no further than this, m */
  fogReach: 320,
  /** Fogged: the view clouds over this long, ms, and the top speed is held to this share meanwhile */
  fogBlindMs: 1_600,
  fogTopFactor: 0.82,
  /** Decoy: dropped like a puddle; its radius, m (a box's), and how long it lies, ms */
  decoyRadius: 1.3,
  decoyMs: 25_000,
  /** How long a hit stuns, ms, by item */
  stunMs: {
    hail: 1_100,
    cloud: 1_500,
    puddle: 1_000,
    decoy: 1_000,
  } satisfies Record<StunItem, number>,
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
  /** Fog (2026-11-20): the karts it has fogged already, each once; absent for the others */
  struck?: SeatId[]
  /**
   * Its height (2026-11-23): a lying shot, the road's surface where it lies; hail, the height it
   * left at. Absent on a track without terrain, and in a race (or replay) from before: then only
   * the plan counts. Never on a cloud (it strikes its target wherever)
   */
  y?: number
}

/**
 * A kart's position at a moment, by the server's clock; `y` its height (2026-11-23), left out on
 * a track without terrain
 */
export type Fix = { readonly x: number; readonly z: number; readonly at: number; readonly y?: number }

export const SHOT_HEIGHTS = {
  /** A kart and a shot further apart in height than this pass each other by, m: a body's height */
  reach: KART_BODY_HEIGHT,
  /** A fog bank stands this tall over its road, m: a kart that jumps through it is fogged too */
  fogTop: 4,
  /** Along a hailstone's flight through a crossing, the road under it is followed every this, m */
  step: 3,
} as const

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
    (shot.target === null || Number.isInteger(shot.target)) &&
    (shot.y === undefined || isNumber(shot.y)) &&
    (shot.struck === undefined ||
      (Array.isArray(shot.struck) && shot.struck.every((seat) => Number.isInteger(seat))))
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
  /** 2026-11-23: whether what flies along the ray passes over or under `wall`, met `along` metres on */
  passes?: (wall: Wall, along: number) => boolean,
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
    if (along >= 0 && along < nearest && share >= 0 && share <= 1) {
      if (passes && (wall.top !== undefined || wall.base !== undefined) && passes(wall, along)) continue
      nearest = along
    }
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
  /** Its height (2026-11-23), on a track with terrain; left out, the road's under it */
  readonly y?: number
}

/**
 * The moving obstacles on the road (obstacles.ts, 2026-11-23, #150) and the race clock's step at the
 * moment the item leaves: a hailstone stops at a boom that is down or a container in its way, a fog
 * bank short of them, and a puddle or a fake box lies clear of them
 */
export type ShotBlockers = { readonly obstacles: readonly Obstacle[]; readonly tick: number }

/**
 * The road's surface under (x, z) for something `near` that high (2026-11-23): at a crossing the
 * road it is on, or the one under it (terrain.ts `groundAt`)
 */
const roadUnder = (terrain: Terrain, x: number, z: number, near?: number): number =>
  groundAt(terrain, x, z, near).y

/** A thing's height for a shot it leaves: its own, or the road's under it */
const heightOf = (terrain: Terrain, kart: { x: number; z: number; y?: number }): number =>
  kart.y ?? roadUnder(terrain, kart.x, kart.z)

/** A hailstone thrown from `kart` at `at`: straight ahead, gone at the first wall or its range */
export function throwHail(
  n: number,
  kart: Thrower,
  at: number,
  walls: readonly Wall[],
  blockers?: ShotBlockers,
  /** 2026-11-23: the track's terrain, when it has any: the stone carries its height */
  terrain?: Terrain | null,
): KartShot {
  const dx = Math.sin(kart.heading)
  const dz = -Math.cos(kart.heading)
  const forward = Math.max(0, kart.vx * dx + kart.vz * dz)
  const speed = SHOT_TUNING.hailSpeed + forward
  const x = kart.x + dx * SHOT_TUNING.hailLead
  const z = kart.z + dz * SHOT_TUNING.hailLead
  const shot: KartShot = {
    n,
    item: 'hail',
    by: kart.seat,
    at,
    x,
    z,
    vx: dx * speed,
    vz: dz * speed,
    until: at + Math.round((SHOT_TUNING.hailRange / speed) * 1000),
    target: null,
    ...(terrain ? { y: heightOf(terrain, kart) } : {}),
  }
  // Where it flies, s after it left (a whole flight's numbers, before its end is known)
  const heightAfter = terrain ? (seconds: number) => hailHeight(shot, seconds, terrain) : null
  const passes = heightAfter
    ? (wall: Wall, along: number) => passesWall(wall, heightAfter(along / speed))
    : undefined
  let range = rayToWall(walls, x, z, dx, dz, SHOT_TUNING.hailRange, passes)
  if (blockers) {
    const stop = obstacleStop(
      blockers.obstacles,
      x,
      z,
      dx * speed,
      dz * speed,
      blockers.tick,
      range / speed,
      heightAfter ?? undefined,
    )
    if (stop !== null) range = stop * speed
  }
  return { ...shot, until: at + Math.round((range / speed) * 1000) }
}

/** Whether something `height` high passes over or under `wall` (walls.ts, as a kart would) */
function passesWall(wall: Wall, height: number): boolean {
  if (wall.top !== undefined && height >= wall.top) return true
  return wall.base !== undefined && height + KART_BODY_HEIGHT <= wall.base
}

/** A puddle dropped behind `kart` at `at` (clear of any obstacle, 2026-11-23) */
export function dropPuddle(
  n: number,
  kart: Thrower,
  at: number,
  blockers?: ShotBlockers,
  radius: number = SHOT_TUNING.puddleRadius,
  /** 2026-11-23: the track's terrain, when it has any: it lies on the road under where it fell */
  terrain?: Terrain | null,
): KartShot {
  const behind = {
    x: kart.x - Math.sin(kart.heading) * SHOT_TUNING.puddleBehind,
    z: kart.z + Math.cos(kart.heading) * SHOT_TUNING.puddleBehind,
  }
  const from = terrain ? heightOf(terrain, kart) : undefined
  // Only the obstacles on its own road move it (2026-11-23): not one on the viaduct over it
  const spot = blockers
    ? clearOfObstacles(blockers.obstacles, behind.x, behind.z, radius, from)
    : behind
  return {
    n,
    item: 'puddle',
    by: kart.seat,
    at,
    x: spot.x,
    z: spot.z,
    vx: 0,
    vz: 0,
    until: at + SHOT_TUNING.puddleMs,
    target: null,
    ...(terrain ? { y: roadUnder(terrain, spot.x, spot.z, from) } : {}),
  }
}

/** A fake item box dropped behind `kart` at `at` (2026-11-20): where a puddle would be */
export function dropDecoy(
  n: number,
  kart: Thrower,
  at: number,
  blockers?: ShotBlockers,
  terrain?: Terrain | null,
): KartShot {
  return {
    ...dropPuddle(n, kart, at, blockers, SHOT_TUNING.decoyRadius, terrain),
    item: 'decoy',
    until: at + SHOT_TUNING.decoyMs,
  }
}

/**
 * A bank of fog laid ahead of `target` (where the room last saw it, heading `heading` at `speed`)
 * by `kart` at `at` (2026-11-20): fogLeadSeconds of its speed on, at least fogLeadMin, and short of
 * the first wall that way by the fog's radius
 */
export function layFog(
  n: number,
  kart: Thrower,
  target: {
    readonly x: number
    readonly z: number
    readonly heading: number
    readonly speed: number
    /** Its height (2026-11-23) */
    readonly y?: number
  },
  at: number,
  walls: readonly Wall[],
  blockers?: ShotBlockers,
  /** 2026-11-23: the track's terrain, when it has any: the bank lies on the target's road */
  terrain?: Terrain | null,
): KartShot {
  const level = terrain ? heightOf(terrain, target) : undefined
  // The obstacles in the way as it is laid count as walls (2026-11-23), those on its road only
  if (blockers && blockers.obstacles.length > 0) {
    const mine =
      level === undefined
        ? blockers.obstacles
        : blockers.obstacles.filter((one) => obstacleAtHeight(one, level))
    walls = [...walls, ...obstacleWalls(mine, blockers.tick)]
  }
  const dx = Math.sin(target.heading)
  const dz = -Math.cos(target.heading)
  const wanted = Math.max(SHOT_TUNING.fogLeadMin, target.speed * SHOT_TUNING.fogLeadSeconds)
  const passes =
    level === undefined ? undefined : (wall: Wall) => passesWall(wall, level)
  const room = rayToWall(walls, target.x, target.z, dx, dz, wanted + SHOT_TUNING.fogRadius, passes)
  const lead = Math.max(0, Math.min(wanted, room - SHOT_TUNING.fogRadius))
  const x = target.x + dx * lead
  const z = target.z + dz * lead
  return {
    n,
    item: 'fog',
    by: kart.seat,
    at,
    x,
    z,
    vx: 0,
    vz: 0,
    until: at + SHOT_TUNING.fogMs,
    target: null,
    struck: [],
    ...(terrain ? { y: roadUnder(terrain, x, z, level) } : {}),
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

// ── How high one is (2026-11-23) ─────────────────────────────────────────────────────────────

/**
 * A hailstone's height `seconds` after it left: the road under it, followed along its flight, and
 * whatever it was thrown above that road, falling under the terrain's gravity. Away from a crossing
 * the road under a place is the only one there; through a crossing's zone it is followed from where
 * the flight came in, every SHOT_HEIGHTS.step metres, so that a stone on the underpass stays under
 * the viaduct and one on the viaduct over the underpass
 */
function hailHeight(shot: KartShot, seconds: number, terrain: Terrain): number {
  const start = shot.y ?? 0
  const lift0 = Math.max(0, start - roadUnder(terrain, shot.x, shot.z, start))
  const lift = (s: number) => Math.max(0, lift0 - 0.5 * TERRAIN_TUNING.gravity * s * s)
  const px = (s: number) => shot.x + shot.vx * s
  const pz = (s: number) => shot.z + shot.vz * s
  const crossings = terrain.crossings
  if (!crossings || !inZone(crossings, px(seconds), pz(seconds), ZONE_PAD)) {
    return roadUnder(terrain, px(seconds), pz(seconds)) + lift(seconds)
  }
  const speed = Math.hypot(shot.vx, shot.vz)
  const step = speed > 0 ? SHOT_HEIGHTS.step / speed : seconds
  // Back to where the flight came into the zone (or to where it left)
  let s = seconds
  while (s > 0 && inZone(crossings, px(s), pz(s), ZONE_PAD)) s = Math.max(0, s - step)
  let height = s === 0 ? start : roadUnder(terrain, px(s), pz(s)) + lift(s)
  while (s < seconds) {
    s = Math.min(seconds, s + step)
    height = roadUnder(terrain, px(s), pz(s), height) + lift(s)
  }
  return height
}

/**
 * How high `shot` is at `now` (2026-11-23): a lying one where it lies, hail on its flight (above).
 * Null for a shot without a height (a flat track, from before) and for a cloud
 */
export function shotHeight(shot: KartShot, now: number, terrain: Terrain | null): number | null {
  if (shot.y === undefined || shot.item === 'cloud') return null
  if (shot.item !== 'hail' || !terrain) return shot.y
  const seconds = Math.max(0, Math.min(now, shot.until) - shot.at) / 1000
  return hailHeight(shot, seconds, terrain)
}

/**
 * Whether a kart `kartY` high and a shot `shotY` high are near enough in height for it to reach
 * the kart: a body's height either way; a fog bank from a body's height under it to its top
 */
export function heightsMeet(item: ShotItem, kartY: number, shotY: number): boolean {
  const above = kartY - shotY
  if (item === 'fog') return above >= -SHOT_HEIGHTS.reach && above <= SHOT_HEIGHTS.fogTop
  return Math.abs(above) <= SHOT_HEIGHTS.reach
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

/** How far from its centre a shot reaches, m (a cloud strikes its target, wherever) */
export const SHOT_RADIUS: Record<ShotItem, number> = {
  hail: SHOT_TUNING.hailRadius,
  cloud: 0,
  puddle: SHOT_TUNING.puddleRadius,
  fog: SHOT_TUNING.fogRadius,
  decoy: SHOT_TUNING.decoyRadius,
}

/** Whether a shot lies still where it was put (a puddle, a decoy, a fog bank) */
export const lyingShot = (item: ShotItem): boolean => LYING.has(item)

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
  const t = approachTime(gapX, gapZ, relX, relZ, seconds)
  return Math.hypot(gapX + relX * t, gapZ + relZ * t)
}

/** When closestApproach's two points are nearest, s from the start (0 to `seconds`) */
function approachTime(gapX: number, gapZ: number, relX: number, relZ: number, seconds: number): number {
  const speed2 = relX * relX + relZ * relZ
  return speed2 === 0 ? 0 : Math.max(0, Math.min(seconds, -(gapX * relX + gapZ * relZ) / speed2))
}

/**
 * Whether `shot` hits kart `seat`, which moved in a straight line from `from` to `to` (both by the
 * server's clock; `from` null when the kart jumped, a reset or a swap: then only where it is now
 * counts). Only over the time both were there: the kart's path before the shot left, or after it
 * was gone, never counts
 */
export function shotHits(
  shot: KartShot,
  seat: SeatId,
  from: Fix | null,
  to: Fix,
  /** Count only a hit this much closer than the edge, m (foreseeing one, below) */
  slack = 0,
  /** 2026-11-23: the track's terrain, for a hailstone's height along its flight */
  terrain: Terrain | null = null,
): boolean {
  if (shot.item === 'cloud') {
    return seat === shot.target && to.at >= shot.until && to.at <= shot.until + SHOT_TUNING.graceMs
  }
  if (shot.item === 'hail' && seat === shot.by) return false
  // A fog bank never fogs its owner, and each other kart only once
  if (shot.item === 'fog' && (seat === shot.by || shot.struck?.includes(seat))) return false
  const start = Math.max(shot.at, from?.at ?? to.at)
  // The owner of a puddle (or a decoy) is safe from it until it is armed
  const opens =
    (shot.item === 'puddle' || shot.item === 'decoy') && seat === shot.by
      ? shot.at + SHOT_TUNING.puddleArmMs
      : start
  const t0 = Math.max(start, opens)
  const t1 = Math.min(to.at, shot.until)
  if (t1 < t0) return false
  const reach = KART_RADIUS + SHOT_RADIUS[shot.item] - slack
  // The kart's straight path from `from` to `to`, at t0, and its velocity
  const span = from ? (to.at - from.at) / 1000 : 0
  const kvx = from && span > 0 ? (to.x - from.x) / span : 0
  const kvz = from && span > 0 ? (to.z - from.z) / span : 0
  const kx = from && span > 0 ? from.x + kvx * ((t0 - from.at) / 1000) : to.x
  const kz = from && span > 0 ? from.z + kvz * ((t0 - from.at) / 1000) : to.z
  const there = shotPosition(shot, t0)
  const gapX = kx - there.x
  const gapZ = kz - there.z
  const seconds = (t1 - t0) / 1000
  if (closestApproach(gapX, gapZ, kvx - shot.vx, kvz - shot.vz, seconds) > reach) return false
  // 2026-11-23: and near enough in height, at the moment they come nearest on the plan
  if (shot.y === undefined || to.y === undefined) return true
  const when = t0 + approachTime(gapX, gapZ, kvx - shot.vx, kvz - shot.vz, seconds) * 1000
  const kartY =
    from?.y !== undefined && span > 0
      ? from.y + (to.y - from.y) * Math.max(0, Math.min(1, (when - from.at) / (to.at - from.at)))
      : to.y
  return heightsMeet(shot.item, kartY, shotHeight(shot, when, terrain) ?? shot.y)
}

/**
 * How much closer than the edge a hit must be for a browser to foresee it on its own kart, m (#86):
 * the room judges the kart's 20 Hz frames at the time they arrive, the browser its own 60 Hz steps
 * now, so a shot that only grazes may go either way. A puddle lies still, so only the paths differ
 */
export const FORESEE_SLACK = { hail: 0.5, puddle: 0.3, decoy: 0.3 } as const

/**
 * The shot this browser can tell will hit its own kart `seat` on its way from `from` to `to` (its
 * own steps, by the server's clock as it reckons it), before the room says so; null for none. Not
 * with a bubble up (the room would pop it), nor a shot in `skip` (already foreseen). A cloud strikes
 * the kart it chases when its time is up, so that one is certain; hail and puddles need `slack`.
 * Only foreseen: the room still judges, and a hit it never confirms is simply not repeated. A mirror
 * up (2026-11-20) counts as a bubble here: the room sends the shot back, so nothing hits
 */
export function foreseeHit(
  shots: readonly KartShot[],
  seat: SeatId,
  from: Fix | null,
  to: Fix,
  shieldUntil: number,
  skip: ReadonlySet<number> = new Set(),
  /** 2026-11-23: the track's terrain (shotHits) */
  terrain: Terrain | null = null,
): (KartShot & { item: StunItem }) | null {
  if (shieldUntil > to.at) return null
  return (
    shots.find(
      (shot): shot is KartShot & { item: StunItem } =>
        // A fog bank only clouds the view (2026-11-20): nothing to foresee
        shot.item !== 'fog' &&
        !skip.has(shot.n) &&
        shotHits(
          shot,
          seat,
          from,
          to,
          shot.item === 'cloud' ? 0 : FORESEE_SLACK[shot.item],
          terrain,
        ),
    ) ?? null
  )
}

/** The shots still worth keeping at `now`, newest last, at most maxShots */
export function keepShots(shots: readonly KartShot[], now: number): KartShot[] {
  return shots
    .filter((shot) => shot.until + SHOT_TUNING.graceMs >= now)
    .slice(-SHOT_TUNING.maxShots)
}
