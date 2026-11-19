// 2026-11-18 (the four technical tracks, docs/ARCHITECTURE.md §4.37): where each one's own scenery
// stands, worked out from the track itself so that none of it is ever on the road (localArt.ts
// builds it). Each has one thing to know it by and to learn its corners against:
// - the mangrove channel: tidal pools ringed with mangroves, egrets standing in them, and a
//   boardwalk along the levee straight;
// - the fort hill: a red brick fort on the hilltop inside the top loop, its guns over the river;
// - the night circuit: a new town of towers with lit windows and neon roof lines, and a ring of
//   light inside the roundabout;
// - the ridgeline: silver grass and volcanic rock on the upper slopes, a weather dome on the ridge,
//   steam rising from vents below the second jump.
// All of it our own simple shapes: no model or image files, no real building, sign or logo copied.
// Pure and seeded: the same track always gets the same scenery.
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection, trackBounds, type RoadPoint, type Track } from '../../../shared/kart/track.ts'

export const LOCAL_TRACK_IDS = ['mangrove', 'fort', 'danhai', 'datun'] as const
export type LocalTrackId = (typeof LOCAL_TRACK_IDS)[number]

export interface Placed {
  readonly x: number
  readonly z: number
  /** Metres: a radius, a half-width or a scale, by the thing */
  readonly size: number
  /** A y rotation, radians */
  readonly turn: number
}

export interface Tower extends Placed {
  readonly depth: number
  readonly height: number
  /** Which neon its roof line is: 0, 1 or 2 */
  readonly neon: number
}

export interface LocalPlan {
  readonly id: LocalTrackId
  /** Mangrove: round tidal pools (size: radius) */
  readonly pools: readonly Placed[]
  /** Mangrove: bushes on stilt roots round the pools */
  readonly clumps: readonly Placed[]
  /** Mangrove: egrets, standing in the pools */
  readonly birds: readonly Placed[]
  /**
   * Lengths of something beside the road (size: length): the mangrove's boardwalk along the levee
   * straight, the fort's brick parapet along the crest
   */
  readonly planks: readonly Placed[]
  /** Fort: the fort (size: half its side), null elsewhere */
  readonly fort: Placed | null
  /** Night circuit: the new town's towers (size: width) */
  readonly towers: readonly Tower[]
  /** Night circuit: the ring of light inside the roundabout (size: radius) */
  readonly ring: Placed | null
  /** Ridgeline: tufts of silver grass */
  readonly grass: readonly Placed[]
  /** Ridgeline: rocks */
  readonly rocks: readonly Placed[]
  /** Ridgeline: the weather dome (size: radius) */
  readonly dome: Placed | null
  /** Ridgeline: steam vents */
  readonly vents: readonly Placed[]
  /** Whether the shared trees and the race-day dressing may stand at (x, z) */
  fits(x: number, z: number): boolean
}

export const isLocalTrack = (id: string): id is LocalTrackId =>
  LOCAL_TRACK_IDS.some((one) => one === id)

/** The road point nearest (x, z) */
function indexNear(road: readonly RoadPoint[], x: number, z: number): number {
  let best = 0
  let distance = Infinity
  road.forEach((point, index) => {
    const d = (point.x - x) ** 2 + (point.z - z) ** 2
    if (d < distance) {
      distance = d
      best = index
    }
  })
  return best
}

/**
 * The place furthest from the road (up to `cap` metres counts) among those on a 12 m grid over the
 * track that `allowed` takes; null if none is `least` metres clear
 */
function clearest(
  road: readonly RoadPoint[],
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  least: number,
  cap: number,
  allowed: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let most = least
  for (let x = box.minX; x <= box.maxX; x += 12) {
    for (let z = box.minZ; z <= box.maxZ; z += 12) {
      if (!allowed(x, z)) continue
      const clear = Math.min(cap, roadClearance(road, x, z))
      if (clear > most) {
        most = clear
        best = { x, z }
      }
    }
  }
  return best
}

const EMPTY = {
  pools: [],
  clumps: [],
  birds: [],
  planks: [],
  fort: null,
  towers: [],
  ring: null,
  grass: [],
  rocks: [],
  dome: null,
  vents: [],
} as const

/** A fort's half side, metres; its walls stand this far inside what is kept clear of the road */
export const FORT_HALF = 24
/** The weather dome's radius, metres */
export const DOME_RADIUS = 7

/** One of the four tracks' own scenery; null for any other track. `density` is the quality's, 0 to 1 */
export function localPlan(
  track: Pick<Track, 'id' | 'road'> & Partial<Pick<Track, 'jumps'>>,
  density: number,
): LocalPlan | null {
  if (!isLocalTrack(track.id)) return null
  const { road } = track
  const box = trackBounds(track)
  const reach = (margin: number) => ({
    minX: box.minX - margin,
    maxX: box.maxX + margin,
    minZ: box.minZ - margin,
    maxZ: box.maxZ + margin,
  })
  const count = (high: number) => Math.max(1, Math.round(high * (0.4 + 0.6 * density)))
  const heightNear = (x: number, z: number) => road[indexNear(road, x, z)]!.y ?? 0
  const rng = createRng(1811)

  if (track.id === 'mangrove') {
    const pools = scatter(road, {
      seed: 31,
      count: count(46),
      box: reach(110),
      clearance: 13,
      spacing: 40,
    }).map((spot) => ({
      x: spot.x,
      z: spot.z,
      // Never nearer the kerb than 5 m
      size: Math.min(18, 8 + spot.a * 10, roadClearance(road, spot.x, spot.z) - 5),
      turn: spot.b * Math.PI * 2,
    }))
    const clumps: Placed[] = []
    const birds: Placed[] = []
    for (const pool of pools) {
      const round = 7 + Math.floor(rng.float() * 5)
      for (let index = 0; index < round; index++) {
        const angle = (index / round) * Math.PI * 2 + rng.float() * 0.5
        const out = pool.size * (0.82 + rng.float() * 0.4)
        clumps.push({
          x: pool.x + Math.cos(angle) * out,
          z: pool.z + Math.sin(angle) * out,
          size: 2.2 + rng.float() * 1.8,
          turn: rng.float() * Math.PI * 2,
        })
      }
      if (rng.float() < 0.7) {
        const angle = rng.float() * Math.PI * 2
        birds.push({
          x: pool.x + Math.cos(angle) * pool.size * 0.45,
          z: pool.z + Math.sin(angle) * pool.size * 0.45,
          size: 0.9 + rng.float() * 0.3,
          turn: rng.float() * Math.PI * 2,
        })
      }
    }
    // The boardwalk: beside the levee straight, on its left, from behind the grid to past the line
    const planks: Placed[] = []
    for (let step = -26; step <= 12; step++) {
      const index = (step + road.length) % road.length
      const point = road[index]!
      const next = road[(index + 1) % road.length]!
      const { dx, dz } = roadDirection(road, index)
      const offset = -(point.width / 2 + 9)
      const x = point.x - dz * offset
      const z = point.z + dx * offset
      if (roadClearance(road, x, z) < 6) continue
      planks.push({
        x,
        z,
        size: Math.hypot(next.x - point.x, next.z - point.z),
        turn: Math.atan2(dx, dz),
      })
    }
    return {
      ...EMPTY,
      id: track.id,
      pools,
      clumps: clumps.filter((clump) => roadClearance(road, clump.x, clump.z) > 3),
      birds,
      planks,
      fits: (x, z) =>
        !pools.some((pool) => Math.hypot(pool.x - x, pool.z - z) < pool.size + 1) &&
        !planks.some((plank) => Math.hypot(plank.x - x, plank.z - z) < 7),
    }
  }

  if (track.id === 'fort') {
    // On the hilltop, straight ahead of the jump: the crest straight looks at it all the way up,
    // and the road turns away under its walls. Failing that, wherever the hilltop has the room
    const top = Math.max(...road.map((point) => point.y ?? 0))
    const room = FORT_HALF * Math.SQRT2 + 8
    let spot: { x: number; z: number } | null = null
    const lip = track.jumps?.[0]
    if (lip !== undefined) {
      const from = road[lip]!
      const { dx, dz } = roadDirection(road, lip)
      for (let ahead = 80; ahead <= 320 && !spot; ahead += 4) {
        const x = from.x + dx * ahead
        const z = from.z + dz * ahead
        if (roadClearance(road, x, z) >= room) spot = { x, z }
      }
    }
    spot ??= clearest(road, reach(0), room, 60, (x, z) => heightNear(x, z) >= top - 6)
    const fort = spot ? { ...spot, size: FORT_HALF, turn: 0 } : null
    // The old parapet: along the outside of the crest, where the jump is
    const planks: Placed[] = []
    road.forEach((point, index) => {
      if ((point.y ?? 0) < top - 4) return
      const next = road[(index + 1) % road.length]!
      const { dx, dz } = roadDirection(road, index)
      const offset = point.width / 2 + 5
      const x = point.x - dz * offset
      const z = point.z + dx * offset
      if (roadClearance(road, x, z) < 4) return
      planks.push({
        x,
        z,
        size: Math.hypot(next.x - point.x, next.z - point.z),
        turn: Math.atan2(dx, dz),
      })
    })
    return {
      ...EMPTY,
      id: track.id,
      fort,
      planks,
      fits: (x, z) =>
        (!fort || Math.max(Math.abs(x - fort.x), Math.abs(z - fort.z)) > fort.size + 10) &&
        !planks.some((plank) => Math.hypot(plank.x - x, plank.z - z) < 5),
    }
  }

  if (track.id === 'danhai') {
    const towers = scatter(road, {
      seed: 47,
      count: count(120),
      box: reach(120),
      clearance: 20,
      spacing: 34,
    }).map((spot) => ({
      x: spot.x,
      z: spot.z,
      size: 14 + Math.round(spot.a * 2) * 4,
      depth: 14 + Math.round(spot.b * 2) * 4,
      height: 16 + Math.floor((spot.a * 7 + spot.b * 13) % 6) * 9,
      turn: 0,
      neon: Math.floor((spot.a * 31 + spot.b * 17) % 3),
    }))
    // Inside the roundabout: the middle of the circle the widest road turns about
    const wide = road.flatMap((point, index) => (point.width >= 82 ? [index] : []))
    let ring: Placed | null = null
    if (wide.length >= 3) {
      const a = road[wide[0]!]!
      const b = road[wide[Math.floor(wide.length / 2)]!]!
      const c = road[wide.at(-1)!]!
      // The circle through three of its points
      const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z))
      if (Math.abs(d) > 1e-6) {
        const a2 = a.x * a.x + a.z * a.z
        const b2 = b.x * b.x + b.z * b.z
        const c2 = c.x * c.x + c.z * c.z
        const x = (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / d
        const z = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
        const clear = roadClearance(road, x, z)
        if (clear > 6) ring = { x, z, size: Math.min(9, clear - 4), turn: 0 }
      }
    }
    return {
      ...EMPTY,
      id: track.id,
      towers,
      ring,
      fits: (x, z) =>
        !towers.some(
          (tower) =>
            Math.abs(tower.x - x) < tower.size / 2 + 3 && Math.abs(tower.z - z) < tower.depth / 2 + 3,
        ) && !(ring && Math.hypot(ring.x - x, ring.z - z) < ring.size + 4),
    }
  }

  // The ridgeline
  const top = Math.max(...road.map((point) => point.y ?? 0))
  const high = (x: number, z: number) => heightNear(x, z) >= top * 0.3
  const grass = scatter(road, {
    seed: 53,
    count: count(900),
    box: reach(70),
    clearance: 3,
    spacing: 2.6,
    maxClearance: 60,
    fits: high,
  }).map((spot) => ({ x: spot.x, z: spot.z, size: 0.8 + spot.a * 0.9, turn: spot.b * 6 }))
  const rocks = scatter(road, {
    seed: 59,
    count: count(110),
    box: reach(80),
    clearance: 5,
    spacing: 9,
    maxClearance: 70,
  }).map((spot) => ({ x: spot.x, z: spot.z, size: 0.7 + spot.a * 2.2, turn: spot.b * 6 }))
  const domeSpot = clearest(
    road,
    reach(30),
    DOME_RADIUS + 10,
    40,
    (x, z) => heightNear(x, z) >= top - 3,
  )
  const dome = domeSpot ? { ...domeSpot, size: DOME_RADIUS, turn: 0 } : null
  const vents = scatter(road, {
    seed: 67,
    count: 7,
    box: reach(20),
    clearance: 9,
    spacing: 30,
    maxClearance: 40,
    fits: (x, z) => {
      const height = heightNear(x, z)
      return height >= top * 0.3 && height <= top * 0.7
    },
  }).map((spot) => ({ x: spot.x, z: spot.z, size: 1.2 + spot.a, turn: spot.b * 6 }))
  return {
    ...EMPTY,
    id: track.id,
    grass,
    rocks,
    dome,
    vents,
    fits: (x, z) => !dome || Math.hypot(dome.x - x, dome.z - z) > dome.size + 8,
  }
}
