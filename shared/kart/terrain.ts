// 2026-11-17 (owner: "keep developing the kart"; #83 and #92 both noted that the physics was flat):
// slopes and jumps, docs/ARCHITECTURE.md §4.26. A track may give its road points a height (`y`) and
// mark some of them as jump lips (`jumps`); a track that does neither has no terrain at all, and its
// cars take exactly the path they always took (course.ts never calls in here: the flat physics is
// bit for bit what it was, tests/kart/flatGolden.test.ts).
//
// The model is kept small on purpose:
//
// - The ground is the centre line's height, carried straight across the road: no camber. A point's
//   height is that of the nearest centre-line segment, interpolated along it.
// - On the ground the car is the flat car (physics.ts), its x and z as before; the slope only nudges
//   its speed: uphill the top speed is a little lower and gravity pulls it back, downhill the other
//   way (`slopeLimit`, `slopeGravity`), both gentle.
// - Crossing a jump lip forwards launches the car: its height leaves the ground with an upward speed
//   in proportion to its speed along the road (`jumpLift`), and it flies a parabola under `gravity`
//   with its ground speed held, until it comes down on the ground again. The faster it goes the
//   higher and longer it flies. In the air it cannot drift or fill the gauge, its steering only
//   turns the nose a little (`airTurnRate`), and the throttle and boost do nothing; timers run on.
//   Landing with the throttle held, nose in line, after a real flight, gives a small release boost.
//   A drift held through the landing starts again at once, the way any drift starts.
// - The drift jump (2026-11-19, the classic feel only; docs/KART-FEEL.md §11): a car that crosses
//   the lip in a real drift (the tail out `driftJumpSlip` or more, the drift key down) carries the
//   drift through the air. It flies the way it was sliding, not the way the road runs; while the
//   drift key stays down the nose can be swung much faster (`airDriftTurnRate`), as far as a drift
//   goes; and it lands in the drift it left in, already turning, the instant boost it has earned
//   still there to be fired. A car that takes off straight lands straight, and only then begins
//   to turn. Letting go of the drift key in the air drops the drift.
// - Walls, gates, item boxes, other karts: all as before, on the ground plane. A car in the air is
//   where its shadow is, as far as anything else in the game knows.
//
// Pure, like physics.ts: the browser, the Worker and the load test all run it.
import {
  GAUGE_FULL,
  stepKart,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from './physics.ts'
import { pathDirection, type Fork } from './branches.ts'
import {
  cantOf,
  inZone,
  LEVEL_CLEARANCE,
  LEVEL_STEP,
  ZONE_PAD,
  type Crossing,
} from './levels.ts'
import { gateCrossing, roadDirection, type Gate, type RoadPoint } from './track.ts'

/** The terrain's own numbers, apart from KART_TUNING so that the tuning panel and presets stay as they were */
export const TERRAIN_TUNING = {
  /** Gravity in the air, m/s²: more than the real 9.8, for snappy jumps */
  gravity: 30,
  /** How hard a slope pulls along the road, m/s² for each unit of grade (rise over run) */
  slopeGravity: 9,
  /** How much the top speed changes for each unit of grade: a 10% climb is 5% slower */
  slopeLimit: 0.5,
  /** The top speed never changes by more than this share on a slope */
  slopeLimitMax: 0.12,
  /** The upward speed at a jump lip, as a share of the speed along the road there */
  jumpLift: 0.18,
  /** Below this speed along the road a car crossing a lip just rolls off it */
  jumpMinSpeed: 6,
  /** The nose turns this fast in the air at full steer, rad/s: a small correction, no more */
  airTurnRate: 0.55,
  /** A landing earns its boost only after this long in the air ... */
  landingMinAir: 0.45,
  /** ... with the nose this near the way the car flies, radians ... */
  landingAlign: (16 * Math.PI) / 180,
  /** ... and lasts this long, as a release boost does */
  landingBoost: 0.5,
  /**
   * The timed landing (2026-11-22, docs/KART-FEEL.md §22): a fresh press of the throttle within this
   * long before the wheels touch, or after, on a landing that earns the boost above (long enough in
   * the air, the nose in line) ...
   */
  landingTapWindow: 0.1,
  /**
   * ... makes that boost this long instead: in place of it, not on top of it (a perfect instant
   * boost is 1.4 times a good one; this is 1.5 times the plain landing's)
   */
  landingTimedBoost: 0.75,
  /** The drift jump: the tail must be out this far at the lip for the drift to be carried, radians */
  driftJumpSlip: (10 * Math.PI) / 180,
  /** ... and the nose then swings this fast in the air at full steer, rad/s */
  airDriftTurnRate: 1.7,
  /**
   * ... and landing it fills the gauge by this much (of 100), in full after `landingMinAir` in
   * the air: what the clean landing's boost is to a car that took off straight
   */
  driftJumpGauge: 45,
  /**
   * 2026-11-21 (docs/KART-META.md): a kart's weight on a steep slope. Past `slopeMassGrade` of grade,
   * the top speed changes by a further `slopeMass` × (mass − 1) × the grade beyond it, held to
   * `slopeMassMax`: a heavy kart is slower up a steep climb and faster down a steep descent, a light
   * one the other way round. Only the steep part counts, because a loop climbs as far as it falls:
   * an effect in proportion to the grade alone would cancel out over a lap on every track, while
   * this one favours the light karts where the climbs are the steep side and the heavy ones where
   * the descents are
   */
  slopeMass: 5,
  slopeMassGrade: 0.03,
  slopeMassMax: 0.06,
  /**
   * 2026-11-22 (levels.ts): a banked bend. Steering towards its low side (into the bend), the kart's
   * way and nose swing on by this much lateral pull, m/s² for each unit of the lean (tan): what the
   * road's tilt lends the tyres. Its speed is kept as it is, so the bank gives no speed, only a
   * tighter line at the same speed
   */
  bankGravity: 14,
} as const

export type TerrainTuning = { readonly [K in keyof typeof TERRAIN_TUNING]: number }

/** A jump lip: the line across the road the car leaves the ground from */
export interface Lip {
  /** The road point it is at (of its branch's centre line, on a branch) */
  readonly index: number
  /** On a track with branches (2026-11-20): the branch it is on; absent on the main road */
  readonly fork?: number
  readonly x: number
  readonly z: number
  /** The road's direction there, unit */
  readonly dx: number
  readonly dz: number
  /** The lip's height */
  readonly y: number
  /** Half the road's width there */
  readonly half: number
  /** Kerb to kerb, crossed forwards to take off */
  readonly gate: Gate
}

export interface TerrainPoint {
  readonly x: number
  readonly z: number
  readonly y: number
  /** A banked road point (2026-11-22, levels.ts): tan of its lean, + its left kerb higher */
  readonly cant?: number
}

export interface Terrain {
  /** The centre line with heights, as the track has it; missing heights are 0 */
  readonly points: readonly TerrainPoint[]
  readonly lips: readonly Lip[]
  /**
   * On a track with branches (2026-11-20, branches.ts): each branch's centre line with heights and
   * half widths, and the main road's half widths. The ground is then the road a place is deepest
   * inside, not merely the nearest centre line (two roads run side by side). Absent on any other
   */
  readonly forks?: readonly (readonly (TerrainPoint & { readonly half: number })[])[]
  readonly halves?: readonly number[]
  /**
   * Where the main road runs over itself (2026-11-22, levels.ts): round each, the ground is the road
   * the car is on, by its height. Absent on a track without (`halves` is then given too)
   */
  readonly crossings?: readonly Crossing[]
  /** Whether any road point leans (2026-11-22): absent when none does */
  readonly banked?: true
}

type TerrainSource = {
  readonly road: readonly RoadPoint[]
  readonly jumps?: readonly number[]
  readonly forks?: readonly Pick<Fork, 'path' | 'jumps'>[]
  readonly crossings?: readonly Crossing[]
}

/** Whether a track has any terrain: a height on any road point, a lean, or a jump */
export const hasTerrain = (track: TerrainSource): boolean =>
  (track.jumps?.length ?? 0) > 0 ||
  track.road.some((point) => point.y !== undefined || point.bank !== undefined) ||
  (track.forks ?? []).some(
    (fork) => fork.jumps.length > 0 || fork.path.some((point) => point.y !== undefined),
  )

/** The terrain of a track; null for a flat one, which then never comes here */
export function terrainOf(track: TerrainSource): Terrain | null {
  if (!hasTerrain(track)) return null
  const { road } = track
  const banked = road.some((point) => (point.bank ?? 0) !== 0)
  const points: TerrainPoint[] = road.map((point) =>
    banked && point.bank
      ? { x: point.x, z: point.z, y: point.y ?? 0, cant: cantOf(point) }
      : { x: point.x, z: point.z, y: point.y ?? 0 },
  )
  // Crossings and leans are new (2026-11-22): a track with neither has the terrain it had
  const more = {
    ...(banked ? { banked: true as const } : {}),
    ...(track.crossings && track.crossings.length > 0
      ? { crossings: track.crossings, halves: road.map((point) => point.width / 2) }
      : {}),
  }
  const lips = (track.jumps ?? []).map((index): Lip => {
    const point = road[index]!
    const { dx, dz } = roadDirection(road, index)
    const half = point.width / 2
    return {
      index,
      x: point.x,
      z: point.z,
      dx,
      dz,
      y: point.y ?? 0,
      half,
      // From the left kerb to the right one, as track.ts's gates
      gate: {
        ax: point.x + dz * (half + 1),
        az: point.z - dx * (half + 1),
        bx: point.x - dz * (half + 1),
        bz: point.z + dx * (half + 1),
      },
    }
  })
  const forks = track.forks ?? []
  if (forks.length === 0) return { points, lips, ...more }
  forks.forEach((fork, k) => {
    for (const index of fork.jumps) {
      const point = fork.path[index]!
      const { dx, dz } = pathDirection(fork.path, index, false)
      const half = point.width / 2
      lips.push({
        index,
        fork: k,
        x: point.x,
        z: point.z,
        dx,
        dz,
        y: point.y ?? 0,
        half,
        gate: {
          ax: point.x + dz * (half + 1),
          az: point.z - dx * (half + 1),
          bx: point.x - dz * (half + 1),
          bz: point.z + dx * (half + 1),
        },
      })
    }
  })
  return {
    points,
    lips,
    halves: road.map((point) => point.width / 2),
    forks: forks.map((fork) =>
      fork.path.map((point) => ({ x: point.x, z: point.z, y: point.y ?? 0, half: point.width / 2 })),
    ),
    ...more,
  }
}

export interface Ground {
  /** The ground's height here */
  readonly y: number
  /** The rise per metre along the world's x and z: the slope, as a vector on the ground plane */
  readonly gx: number
  readonly gz: number
  /** How far (x, z) is from the centre line, metres */
  readonly distance: number
  /**
   * On a banked road (2026-11-22): tan of its lean here (+ the left kerb higher) and the road's right
   * as a unit vector. The slope above is still the one along the road; absent where it is level
   */
  readonly cant?: number
  readonly rx?: number
  readonly rz?: number
}

/**
 * The ground under (x, z): the height of the nearest centre-line segment, interpolated along it,
 * and that segment's slope. The road being flat across, the slope points along the road; a banked
 * road (2026-11-22) leans across, its height there moved by how far right of the centre line the
 * place is. At a crossing (levels.ts), `near` is the car's height a moment ago: of the roads there,
 * the one it is on (`groundOnLevels`); left out, the lowest
 */
export function groundAt(terrain: Terrain, x: number, z: number, near?: number): Ground {
  if (terrain.crossings && inZone(terrain.crossings, x, z, ZONE_PAD)) {
    const level = groundOnLevels(terrain, x, z, near)
    if (level) return level
  }
  if (terrain.forks) return groundOfRoads(terrain, terrain.forks, x, z)
  const { points } = terrain
  const count = points.length
  let best = Infinity
  let ground: Ground = { y: points[0]?.y ?? 0, gx: 0, gz: 0, distance: Infinity }
  let found = -1
  let foundT = 0
  for (let index = 0; index < count; index++) {
    const a = points[index]!
    const b = points[(index + 1) % count]!
    const sx = b.x - a.x
    const sz = b.z - a.z
    const lengthSq = sx * sx + sz * sz
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
    const px = a.x + sx * t
    const pz = a.z + sz * t
    const distance = (x - px) * (x - px) + (z - pz) * (z - pz)
    if (distance >= best) continue
    best = distance
    const rise = (b.y - a.y) / lengthSq
    ground = { y: a.y + (b.y - a.y) * t, gx: rise * sx, gz: rise * sz, distance: 0 }
    found = index
    foundT = t
  }
  const flat = { ...ground, distance: Math.sqrt(best) }
  if (!terrain.banked || found < 0) return flat
  return bankedGround(flat, points[found]!, points[(found + 1) % count]!, foundT, x, z)
}

/** The ground of a banked segment ab at share t: its height moved across the road, and its lean */
function bankedGround(
  ground: Ground,
  a: TerrainPoint,
  b: TerrainPoint,
  t: number,
  x: number,
  z: number,
): Ground {
  const cant = (a.cant ?? 0) + ((b.cant ?? 0) - (a.cant ?? 0)) * t
  if (cant === 0) return ground
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
  const dx = (b.x - a.x) / length
  const dz = (b.z - a.z) / length
  // The road's right, facing along it, is (-dz, dx)
  const across = (x - (a.x + (b.x - a.x) * t)) * -dz + (z - (a.z + (b.z - a.z) * t)) * dx
  return { ...ground, y: ground.y - across * cant, cant, rx: -dz, rz: dx }
}

/** Of the roads (x, z) is this far outside or less, metres, the one a car may be on */
const LEVEL_MARGIN = 3

/**
 * The ground at a crossing (2026-11-22, levels.ts): of the roads (x, z) is on (or within
 * LEVEL_MARGIN of), the highest whose surface is at most LEVEL_STEP above `near`, the car's height
 * a moment ago: the road it was on, carried on (none such, or no `near`: the lowest). Of that road,
 * the segment (x, z) is deepest inside. Null when it is on no road at all (the plain rule holds)
 */
function groundOnLevels(
  terrain: Terrain,
  x: number,
  z: number,
  near: number | undefined,
): Ground | null {
  type Candidate = { y: number; depth: number; gx: number; gz: number }
  const candidates: Candidate[] = []
  let nearest = Infinity
  const visit = (
    points: readonly TerrainPoint[],
    half: (index: number) => number,
    closed: boolean,
  ) => {
    const count = points.length
    const last = closed ? count : count - 1
    for (let index = 0; index < last; index++) {
      const a = points[index]!
      const b = points[(index + 1) % count]!
      const sx = b.x - a.x
      const sz = b.z - a.z
      const lengthSq = sx * sx + sz * sz
      if (lengthSq === 0) continue
      const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
      const distance = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t))
      nearest = Math.min(nearest, distance)
      const depth = half(index) + (half((index + 1) % count) - half(index)) * t - distance
      if (depth <= -LEVEL_MARGIN) continue
      const rise = (b.y - a.y) / lengthSq
      candidates.push({ y: a.y + (b.y - a.y) * t, depth, gx: rise * sx, gz: rise * sz })
    }
  }
  const halves = terrain.halves ?? []
  visit(terrain.points, (index) => halves[index] ?? 0, true)
  for (const fork of terrain.forks ?? []) visit(fork, (index) => fork[index]!.half, false)
  if (candidates.length === 0) return null
  let level = -Infinity
  if (near !== undefined) {
    for (const one of candidates) if (one.y <= near + LEVEL_STEP && one.y > level) level = one.y
  }
  if (level === -Infinity) {
    level = Infinity
    for (const one of candidates) level = Math.min(level, one.y)
  }
  let best: Candidate = candidates[0]!
  let bestDepth = -Infinity
  for (const one of candidates) {
    if (Math.abs(one.y - level) >= LEVEL_CLEARANCE / 2 || one.depth <= bestDepth) continue
    best = one
    bestDepth = one.depth
  }
  return { y: best.y, gx: best.gx, gz: best.gz, distance: nearest }
}

/**
 * The lowest road surface within `margin` metres of (x, z) at a crossing, for the ground drawn
 * under it (hillArt.ts): the underpass's, not the viaduct's over it. Null away from any crossing
 */
export function lowestRoadNear(
  terrain: Terrain,
  x: number,
  z: number,
  margin: number,
): number | null {
  if (!terrain.crossings || !inZone(terrain.crossings, x, z, ZONE_PAD + margin)) return null
  let low = Infinity
  const halves = terrain.halves ?? []
  const count = terrain.points.length
  for (let index = 0; index < count; index++) {
    const a = terrain.points[index]!
    const b = terrain.points[(index + 1) % count]!
    const sx = b.x - a.x
    const sz = b.z - a.z
    const lengthSq = sx * sx + sz * sz
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
    const distance = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t))
    if (distance - (halves[index] ?? 0) > margin) continue
    low = Math.min(low, a.y + (b.y - a.y) * t)
  }
  return low === Infinity ? null : low
}

/**
 * The ground on a track with branches: of the road (x, z) is deepest inside, the nearest segment's
 * height and slope; `distance` is still to the nearest centre line
 */
function groundOfRoads(
  terrain: Terrain,
  forks: NonNullable<Terrain['forks']>,
  x: number,
  z: number,
): Ground {
  let bestDepth = -Infinity
  let nearest = Infinity
  let ground: Ground = { y: terrain.points[0]?.y ?? 0, gx: 0, gz: 0, distance: Infinity }
  const visit = (
    points: readonly TerrainPoint[],
    half: (index: number) => number,
    closed: boolean,
  ) => {
    const count = points.length
    const last = closed ? count : count - 1
    for (let index = 0; index < last; index++) {
      const a = points[index]!
      const b = points[(index + 1) % count]!
      const sx = b.x - a.x
      const sz = b.z - a.z
      const lengthSq = sx * sx + sz * sz
      if (lengthSq === 0) continue
      const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
      const distance = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t))
      nearest = Math.min(nearest, distance)
      const depth = half(index) + (half((index + 1) % count) - half(index)) * t - distance
      if (depth <= bestDepth) continue
      bestDepth = depth
      const rise = (b.y - a.y) / lengthSq
      ground = { y: a.y + (b.y - a.y) * t, gx: rise * sx, gz: rise * sz, distance: 0 }
      chosen = { a, b, t }
    }
  }
  let chosen: { a: TerrainPoint; b: TerrainPoint; t: number } | null = null
  const halves = terrain.halves ?? []
  visit(terrain.points, (index) => halves[index] ?? 0, true)
  for (const fork of forks) visit(fork, (index) => fork[index]!.half, false)
  const found = { ...ground, distance: nearest }
  // A banked main road (2026-11-22); a branch never leans
  if (!terrain.banked || !chosen) return found
  const { a, b, t } = chosen as { a: TerrainPoint; b: TerrainPoint; t: number }
  return bankedGround(found, a, b, t, x, z)
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const wrapAngle = (angle: number): number => {
  const wrapped = angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
  return wrapped === -Math.PI ? Math.PI : wrapped
}

/** The throttle went down since the last step: not held before, or let go and pressed between */
const pressedAfresh = (state: KartState, input: KartInput): boolean =>
  input.throttle && (!state.throttleHeld || (input.throttleTap ?? false))

/** `airTap` never counts past this, seconds: long before any landing window */
const AIR_TAP_CAP = 9

/** Whether the car is in the air */
export const airborne = (kart: KartState): boolean => (kart.air ?? 0) > 0

/** The grade along the way the car goes: rise over run, + uphill */
function gradeOf(ground: Ground, vx: number, vz: number): number {
  const speed = Math.hypot(vx, vz)
  return speed > 0.5 ? (ground.gx * vx + ground.gz * vz) / speed : 0
}

/**
 * How much a kart's weight changes its top speed on a slope of `grade` (+ uphill), as a share
 * (2026-11-21): 0 for the standard weight and on any slope gentler than `slopeMassGrade`; + slower
 */
export function slopeWeight(
  tuning: Pick<KartTuning, 'mass'>,
  grade: number,
  numbers: TerrainTuning = TERRAIN_TUNING,
): number {
  const mass = tuning.mass
  if (mass === undefined || mass === 1) return 0
  const steep = Math.max(0, Math.abs(grade) - numbers.slopeMassGrade) * Math.sign(grade)
  if (steep === 0) return 0
  return clamp(numbers.slopeMass * (mass - 1) * steep, -numbers.slopeMassMax, numbers.slopeMassMax)
}

/**
 * One step in the air: the ground speed held, the height a parabola, the nose turned only a little.
 * No drift, no gauge, no throttle; boosts and windows run down as the clock goes
 */
function stepAir(
  state: KartState,
  input: KartInput,
  tuning: KartTuning,
  terrain: TerrainTuning,
): KartState {
  const dt = STEP_SECONDS
  const steer = clamp(input.steer, -1, 1)
  const vy = (state.vy ?? 0) - terrain.gravity * dt
  const boostSeconds = Math.max(0, state.boostSeconds - dt)
  // The drift jump: carried for as long as the drift key stays down
  const carried = input.drift ? (state.airDrift ?? 0) : 0
  // A combo holds through a carried drift, as it does through one on the ground
  const chainWindow = carried !== 0 ? state.chainWindow : Math.max(0, state.chainWindow - dt)
  let heading = wrapAngle(state.heading + steer * terrain.airTurnRate * dt)
  if (carried !== 0) {
    // The nose swings fast, between the way the car flies and the deepest a drift goes
    const flight = Math.atan2(state.vx, -state.vz)
    const slip =
      wrapAngle(state.heading - flight) * carried + steer * carried * terrain.airDriftTurnRate * dt
    heading = wrapAngle(flight + carried * clamp(slip, 0, tuning.driftMaxSlip))
  }
  return {
    ...state,
    x: state.x + state.vx * dt,
    z: state.z + state.vz * dt,
    y: (state.y ?? 0) + vy * dt,
    vy,
    air: (state.air ?? 0) + dt,
    heading,
    ...(state.airDrift === undefined
      ? {}
      : {
          airDrift: carried as -1 | 0 | 1,
          airHeld: carried !== 0 ? (state.airHeld ?? 0) + dt : 0,
        }),
    boostSeconds,
    stackSeconds: boostSeconds > 0 ? Math.max(0, state.stackSeconds - dt) : 0,
    miniSeconds: Math.max(0, state.miniSeconds - dt),
    releaseWindow: Math.max(0, state.releaseWindow - dt),
    chainWindow,
    chain: chainWindow === 0 ? 0 : state.chain,
    doubleWindow: Math.max(0, state.doubleWindow - dt),
    catchSeconds: Math.max(0, state.catchSeconds - dt),
    stallSeconds: Math.max(0, state.stallSeconds - dt),
    traction: Math.min(1, state.traction + dt / Math.max(dt, tuning.driftRecovery)),
    boostHeld: input.boost,
    throttleHeld: input.throttle,
    // The timed landing: how long since the throttle was last pressed afresh in this flight
    airTap: pressedAfresh(state, input) ? 0 : Math.min(AIR_TAP_CAP, (state.airTap ?? AIR_TAP_CAP) + dt),
    // The classic feel's start boost runs down in the air too; the arcade feel never has one
    ...(state.launchSeconds === undefined
      ? {}
      : { launchSeconds: Math.max(0, state.launchSeconds - dt) }),
  }
}

/**
 * The physics step on a track with terrain: in the air, the flight; on the ground, the flat car with
 * the slope's pull on its speed. The height itself is settled after the walls (`settleTerrain`)
 */
export function stepOnTerrain(
  state: KartState,
  input: KartInput,
  terrain: Terrain,
  tuning: KartTuning,
  rules: KartRules,
  numbers: TerrainTuning = TERRAIN_TUNING,
): KartState {
  if (airborne(state)) return stepAir(state, input, tuning, numbers)
  const ground = groundAt(terrain, state.x, state.z, state.y)
  const grade = gradeOf(ground, state.vx, state.vz)
  const limitScale =
    1 -
    clamp(numbers.slopeLimit * grade, -numbers.slopeLimitMax, numbers.slopeLimitMax) -
    // A heavy kart slower up a steep climb and faster down a steep descent (2026-11-21)
    slopeWeight(tuning, grade, numbers)
  const next = stepKart(state, input, tuning, rules, limitScale)
  let { vx, vz } = next
  let heading = next.heading
  const speed = Math.hypot(vx, vz)
  if (speed > 0.5 && grade !== 0) {
    // Gravity along the slope: back down it, whichever way the car is going
    const kept = Math.max(0, speed - numbers.slopeGravity * grade * STEP_SECONDS) / speed
    vx *= kept
    vz *= kept
  }
  if (ground.cant !== undefined && speed > 1) {
    // A banked bend (2026-11-22): steering towards its low side, the bank's pull swings the kart's
    // way and nose on together, its speed kept
    const low = Math.sign(ground.cant)
    const into = Math.max(0, clamp(input.steer, -1, 1) * low)
    if (into > 0) {
      const turn = (low * numbers.bankGravity * Math.abs(ground.cant) * into * STEP_SECONDS) / speed
      const cos = Math.cos(turn)
      const sin = Math.sin(turn)
      const turnedX = vx * cos - vz * sin
      vz = vz * cos + vx * sin
      vx = turnedX
      heading = wrapAngle(heading + turn)
    }
  }
  return {
    ...next,
    vx,
    vz,
    heading,
    y: state.y ?? ground.y,
    vy: 0,
    air: 0,
    // The count of drift jumps landed is the terrain's, not the flat car's
    ...(state.driftJumps === undefined ? {} : { driftJumps: state.driftJumps }),
    // and so are the timed landings
    ...(state.timedLandings === undefined ? {} : { timedLandings: state.timedLandings }),
  }
}

/** What happened to the car's height in a step, for the sound and the look */
export type TerrainEvent = 'none' | 'takeoff' | 'landing'

/**
 * After the walls: a car on the ground that crossed a jump lip forwards takes off; one in the air
 * that has come down to the ground lands (with a small boost for a clean landing); one on the ground
 * sits on it
 */
export function settleTerrain(
  before: KartState,
  after: KartState,
  input: KartInput,
  terrain: Terrain,
  numbers: TerrainTuning = TERRAIN_TUNING,
  /** How many charges a kart holds at the most (the drift jump's gauge may fill one) */
  maxStoredBoosts = 2,
): { kart: KartState; event: TerrainEvent } {
  if (airborne(after)) {
    const ground = groundAt(terrain, after.x, after.z, after.y)
    if ((after.y ?? 0) > ground.y) return { kart: after, event: 'none' }
    const air = after.air ?? 0
    const speed = Math.hypot(after.vx, after.vz)
    const slip =
      speed > 1 ? Math.abs(wrapAngle(Math.atan2(after.vx, -after.vz) - after.heading)) : 0
    const earned = air >= numbers.landingMinAir && slip <= numbers.landingAlign
    const clean = earned && input.throttle
    // A press just before the touch: the timed landing at once
    const timed = earned && (after.airTap ?? AIR_TAP_CAP) <= numbers.landingTapWindow + 1e-9
    const carried = input.drift ? (after.airDrift ?? 0) : 0
    if (carried !== 0 && speed > 1) {
      // The drift jump: down in the drift it left in, as deep as the nose now is and as long as
      // it has been held; what it had earned is still there
      const deep = Math.max(0, wrapAngle(after.heading - Math.atan2(after.vx, -after.vz)) * carried)
      // The gauge's share: a charge once it is full, as a drift's is (classic.ts)
      let { gauge, storedBoosts } = after
      if (storedBoosts < maxStoredBoosts) {
        gauge += numbers.driftJumpGauge * Math.min(1, air / Math.max(1e-3, numbers.landingMinAir))
        if (gauge >= GAUGE_FULL) {
          storedBoosts++
          gauge = storedBoosts < maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
        }
      }
      return {
        kart: {
          ...after,
          gauge,
          storedBoosts,
          gaugeGain: gauge - after.gauge + (storedBoosts - after.storedBoosts) * GAUGE_FULL,
          y: ground.y,
          vy: 0,
          air: 0,
          airDrift: 0,
          airHeld: 0,
          drifting: true,
          driftDirection: carried,
          driftSeconds: after.airHeld ?? 0,
          driftPeak: Math.max(after.driftPeak ?? 0, deep),
          slideDirection: 0,
          driftKey: true,
          driftLatch: false,
          driftJumps: (after.driftJumps ?? 0) + 1,
        },
        event: 'landing',
      }
    }
    const boost = timed ? numbers.landingTimedBoost : clean ? numbers.landingBoost : 0
    return {
      kart: {
        ...after,
        y: ground.y,
        vy: 0,
        air: 0,
        ...(after.airDrift === undefined ? {} : { airDrift: 0 as const, airHeld: 0 }),
        miniSeconds: Math.max(after.miniSeconds, boost),
        airTap: AIR_TAP_CAP,
        // Not timed yet: a press in the next `landingTapWindow` still is
        landWindow: earned && !timed ? numbers.landingTapWindow : 0,
        ...(timed ? { timedLandings: (after.timedLandings ?? 0) + 1 } : {}),
      },
      event: 'landing',
    }
  }
  for (const lip of terrain.lips) {
    if (gateCrossing(lip.gate, before.x, before.z, after.x, after.z) !== 1) continue
    // Along the road at the lip: its share of the speed is what the ramp throws upwards
    const along = after.vx * lip.dx + after.vz * lip.dz
    if (along < numbers.jumpMinSpeed) break
    // The drift jump (the classic feel, which alone has `steerNow`): a real drift, the key down,
    // is carried through the air
    const way =
      after.steerNow !== undefined && after.drifting && input.drift ? after.driftDirection : 0
    const out = way === 0 ? 0 : wrapAngle(after.heading - Math.atan2(after.vx, -after.vz)) * way
    if (way !== 0 && out >= numbers.driftJumpSlip) {
      return {
        kart: {
          ...after,
          y: lip.y,
          vy: along * numbers.jumpLift,
          air: STEP_SECONDS / 2,
          drifting: false,
          driftDirection: 0,
          sliding: false,
          slideDirection: 0,
          doubleDrift: false,
          airDrift: way,
          airHeld: after.driftSeconds,
          airTap: AIR_TAP_CAP,
          landWindow: 0,
          driftSeconds: 0,
          driftPeak: Math.max(after.driftPeak ?? 0, out),
        },
        event: 'takeoff',
      }
    }
    return {
      kart: {
        ...after,
        y: lip.y,
        vy: along * numbers.jumpLift,
        air: STEP_SECONDS / 2,
        // A drift does not survive leaving the ground; nor does what it was earning
        drifting: false,
        driftDirection: 0,
        driftSeconds: 0,
        sliding: false,
        slideDirection: 0,
        burstReady: false,
        doubleDrift: false,
        airTap: AIR_TAP_CAP,
        landWindow: 0,
      },
      event: 'takeoff',
    }
  }
  const y = groundAt(terrain, after.x, after.z, after.y).y
  const window = before.landWindow ?? 0
  if (window <= 0) return { kart: { ...after, y }, event: 'none' }
  // Just down: a fresh press now times the landing, its boost the timed one (in place of the plain
  // one, which has run this long already)
  if (pressedAfresh(before, input)) {
    return {
      kart: {
        ...after,
        y,
        landWindow: 0,
        miniSeconds: Math.max(after.miniSeconds, numbers.landingTimedBoost - (numbers.landingTapWindow - window)),
        timedLandings: (after.timedLandings ?? 0) + 1,
      },
      event: 'none',
    }
  }
  return { kart: { ...after, y, landWindow: Math.max(0, window - STEP_SECONDS) }, event: 'none' }
}

/**
 * How high a car seen only from the ground plane is (another racer's frame, a ghost, a replay
 * sample): the ground, or the flight it would be on if it crossed a lip behind it at `speed`, the
 * higher. The real car's own flight is the same parabola, so this is near it; drawn only
 */
export function heightGuess(
  terrain: Terrain,
  x: number,
  z: number,
  speed: number,
  numbers: TerrainTuning = TERRAIN_TUNING,
  /** At a crossing (2026-11-22): the height it was drawn at a moment ago, to keep it on its road */
  near?: number,
): number {
  const ground = groundAt(terrain, x, z, near).y
  if (speed < numbers.jumpMinSpeed) return ground
  let best = ground
  for (const lip of terrain.lips) {
    const ox = x - lip.x
    const oz = z - lip.z
    const d = ox * lip.dx + oz * lip.dz
    if (d <= 0 || d > speed * 3) continue
    if (Math.abs(ox * -lip.dz + oz * lip.dx) > lip.half + 2) continue
    const y = lip.y + numbers.jumpLift * d - (numbers.gravity * d * d) / (2 * speed * speed)
    if (y > best) best = y
  }
  return best
}

/**
 * The nose's pitch for drawing, radians (+ nose up): along the ground's slope on the ground; in the
 * air, along the flight
 */
export function pitchOf(
  terrain: Terrain,
  x: number,
  z: number,
  heading: number,
  speed: number,
  y: number,
  numbers: TerrainTuning = TERRAIN_TUNING,
): number {
  const ground = groundAt(terrain, x, z, y)
  const fx = Math.sin(heading)
  const fz = -Math.cos(heading)
  if (y <= ground.y + 0.05 || speed < 1) return Math.atan(ground.gx * fx + ground.gz * fz)
  // In the air: the parabola's slope from the lip behind, as heightGuess has it
  let slope = 0
  for (const lip of terrain.lips) {
    const d = (x - lip.x) * lip.dx + (z - lip.z) * lip.dz
    if (d <= 0 || d > speed * 3) continue
    slope = numbers.jumpLift - (numbers.gravity * d) / (speed * speed)
    break
  }
  return clamp(Math.atan(slope), -0.5, 0.5)
}

/**
 * The body's roll for drawing, radians (+ its right side down), on a banked road (2026-11-22): the
 * road's lean as seen across the kart's own way. 0 on a level road and in the air
 */
export function rollOf(terrain: Terrain, x: number, z: number, heading: number, y: number): number {
  if (!terrain.banked) return 0
  const ground = groundAt(terrain, x, z, y)
  if (ground.cant === undefined || y > ground.y + 0.05) return 0
  // The kart's right is (cos h, sin h); the road falls by `cant` a metre towards the road's right
  return Math.atan(ground.cant * (Math.cos(heading) * ground.rx! + Math.sin(heading) * ground.rz!))
}

/**
 * How high each kart seen only on the plan is (another racer's frames, a ghost, a replay), kept
 * kart by kart (2026-11-22): the height worked out for it a moment ago keeps it on its own road at a
 * crossing (`groundAt`'s `near`). `airborne` false keeps it on the road; true, or not known, the
 * guess of heightGuess decides. 0 for every kart on a flat track
 */
export function createHeightKeeper(
  terrain: Terrain | null,
): (id: number | string, x: number, z: number, speed: number, airborne?: boolean) => number {
  const last = new Map<number | string, number>()
  return (id, x, z, speed, airborne) => {
    if (!terrain) return 0
    const y = heightSeen(terrain, x, z, speed, airborne, last.get(id))
    last.set(id, y)
    return y
  }
}

/**
 * How high a kart seen only on the plan is, given how high it was a moment ago (`near`): on the
 * road when `airborne` is false, heightGuess's guess otherwise. createHeightKeeper's step, and the
 * room's for the items (2026-11-23, shared/games/kart/rules.ts)
 */
export function heightSeen(
  terrain: Terrain,
  x: number,
  z: number,
  speed: number,
  airborne: boolean | undefined,
  near: number | undefined,
): number {
  return airborne === false
    ? groundAt(terrain, x, z, near).y
    : heightGuess(terrain, x, z, speed, TERRAIN_TUNING, near)
}
