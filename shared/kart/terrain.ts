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
// - Walls, gates, item boxes, other karts: all as before, on the ground plane. A car in the air is
//   where its shadow is, as far as anything else in the game knows.
//
// Pure, like physics.ts: the browser, the Worker and the load test all run it.
import {
  stepKart,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from './physics.ts'
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
} as const

export type TerrainTuning = { readonly [K in keyof typeof TERRAIN_TUNING]: number }

/** A jump lip: the line across the road the car leaves the ground from */
export interface Lip {
  /** The road point it is at */
  readonly index: number
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

export interface Terrain {
  /** The centre line with heights, as the track has it; missing heights are 0 */
  readonly points: readonly { readonly x: number; readonly z: number; readonly y: number }[]
  readonly lips: readonly Lip[]
}

/** Whether a track has any terrain: a height on any road point, or a jump */
export const hasTerrain = (track: {
  readonly road: readonly RoadPoint[]
  readonly jumps?: readonly number[]
}): boolean => (track.jumps?.length ?? 0) > 0 || track.road.some((point) => point.y !== undefined)

/** The terrain of a track; null for a flat one, which then never comes here */
export function terrainOf(track: {
  readonly road: readonly RoadPoint[]
  readonly jumps?: readonly number[]
}): Terrain | null {
  if (!hasTerrain(track)) return null
  const { road } = track
  const points = road.map((point) => ({ x: point.x, z: point.z, y: point.y ?? 0 }))
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
  return { points, lips }
}

export interface Ground {
  /** The ground's height here */
  readonly y: number
  /** The rise per metre along the world's x and z: the slope, as a vector on the ground plane */
  readonly gx: number
  readonly gz: number
  /** How far (x, z) is from the centre line, metres */
  readonly distance: number
}

/**
 * The ground under (x, z): the height of the nearest centre-line segment, interpolated along it,
 * and that segment's slope. The road being flat across, the slope points along the road
 */
export function groundAt(terrain: Terrain, x: number, z: number): Ground {
  const { points } = terrain
  const count = points.length
  let best = Infinity
  let ground: Ground = { y: points[0]?.y ?? 0, gx: 0, gz: 0, distance: Infinity }
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
  }
  return { ...ground, distance: Math.sqrt(best) }
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const wrapAngle = (angle: number): number => {
  const wrapped = angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
  return wrapped === -Math.PI ? Math.PI : wrapped
}

/** Whether the car is in the air */
export const airborne = (kart: KartState): boolean => (kart.air ?? 0) > 0

/** The grade along the way the car goes: rise over run, + uphill */
function gradeOf(ground: Ground, vx: number, vz: number): number {
  const speed = Math.hypot(vx, vz)
  return speed > 0.5 ? (ground.gx * vx + ground.gz * vz) / speed : 0
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
  const chainWindow = Math.max(0, state.chainWindow - dt)
  return {
    ...state,
    x: state.x + state.vx * dt,
    z: state.z + state.vz * dt,
    y: (state.y ?? 0) + vy * dt,
    vy,
    air: (state.air ?? 0) + dt,
    heading: wrapAngle(state.heading + steer * terrain.airTurnRate * dt),
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
  const ground = groundAt(terrain, state.x, state.z)
  const grade = gradeOf(ground, state.vx, state.vz)
  const limitScale =
    1 - clamp(numbers.slopeLimit * grade, -numbers.slopeLimitMax, numbers.slopeLimitMax)
  const next = stepKart(state, input, tuning, rules, limitScale)
  let { vx, vz } = next
  const speed = Math.hypot(vx, vz)
  if (speed > 0.5 && grade !== 0) {
    // Gravity along the slope: back down it, whichever way the car is going
    const kept = Math.max(0, speed - numbers.slopeGravity * grade * STEP_SECONDS) / speed
    vx *= kept
    vz *= kept
  }
  return { ...next, vx, vz, y: state.y ?? ground.y, vy: 0, air: 0 }
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
): { kart: KartState; event: TerrainEvent } {
  if (airborne(after)) {
    const ground = groundAt(terrain, after.x, after.z)
    if ((after.y ?? 0) > ground.y) return { kart: after, event: 'none' }
    const air = after.air ?? 0
    const speed = Math.hypot(after.vx, after.vz)
    const slip =
      speed > 1 ? Math.abs(wrapAngle(Math.atan2(after.vx, -after.vz) - after.heading)) : 0
    const clean = air >= numbers.landingMinAir && input.throttle && slip <= numbers.landingAlign
    return {
      kart: {
        ...after,
        y: ground.y,
        vy: 0,
        air: 0,
        miniSeconds: clean ? Math.max(after.miniSeconds, numbers.landingBoost) : after.miniSeconds,
      },
      event: 'landing',
    }
  }
  for (const lip of terrain.lips) {
    if (gateCrossing(lip.gate, before.x, before.z, after.x, after.z) !== 1) continue
    // Along the road at the lip: its share of the speed is what the ramp throws upwards
    const along = after.vx * lip.dx + after.vz * lip.dz
    if (along < numbers.jumpMinSpeed) break
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
      },
      event: 'takeoff',
    }
  }
  return { kart: { ...after, y: groundAt(terrain, after.x, after.z).y }, event: 'none' }
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
): number {
  const ground = groundAt(terrain, x, z).y
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
  const ground = groundAt(terrain, x, z)
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
