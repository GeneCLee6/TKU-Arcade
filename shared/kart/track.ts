// e8-t04 (AC-8.2): the track format. A track is JSON (`TrackJson`), made from a Blender scene by
// scripts/kart/build-track.ts or written by hand, and checked here (`parseTrack`) before anything
// drives on it. Everything the game needs comes from the same data: the walls the car hits, the
// checkpoints that count laps, the respawn points, the start grid and the minimap. Pure.
//
// Coordinates are metres on the ground plane: x to the right, z towards the viewer, as in
// physics.ts; heading 0 faces -z and grows clockwise.
import type { Course, Spot } from './course.ts'
import type { Wall } from './walls.ts'

/** The format's version: a track says which one it was written for */
export const TRACK_FORMAT = 1

/** One point of the road's centre line, and how wide the road is there */
export interface RoadPoint {
  readonly x: number
  readonly z: number
  /** Kerb to kerb, metres */
  readonly width: number
}

/**
 * A line across the road that a lap must cross, in order: `a` on the left kerb and `b` on the
 * right, as a driver going the right way sees them, so that crossing it going that way is crossing
 * it forwards (`gateCrossing`). Gate 0 is the start and finish line
 */
export interface Gate {
  readonly ax: number
  readonly az: number
  readonly bx: number
  readonly bz: number
}

/** A strip that boosts whoever drives over it (used from E9) */
export interface BoostPad extends Spot {
  readonly length: number
  readonly width: number
}

/** A model placed by the scene, named by its id in the track's assets (K1) */
export interface Decor extends Spot {
  readonly model: string
  readonly scale: number
}

export interface TrackJson {
  readonly format: typeof TRACK_FORMAT
  /** Lower-case letters, digits and dashes: its file names and records go by it */
  readonly id: string
  readonly name: { readonly en: string; readonly 'zh-TW': string }
  /**
   * The layout's revision, 1 when left out. Raised whenever the road changes enough that old times
   * no longer compare (2026-11-14: Riverside and the harbour were widened), so that records and
   * ghosts kept for the old layout are set aside (`recordKey`)
   */
  readonly revision?: number
  readonly laps: number
  /** The centre line as a closed loop, in driving order; the last point joins the first */
  readonly road: readonly RoadPoint[]
  /** In driving order; gate 0 is the start and finish line */
  readonly gates: readonly Gate[]
  /** Where a car goes back to after passing each gate: one for each gate */
  readonly respawns: readonly Spot[]
  /** The starting grid, pole first; at least one place */
  readonly grid: readonly Spot[]
  /** Walls beyond the two kerbs, which the road gives by itself */
  readonly walls: readonly Wall[]
  readonly boostPads: readonly BoostPad[]
  readonly itemBoxes: readonly { readonly x: number; readonly z: number }[]
  readonly decor: readonly Decor[]
}

export interface Track extends TrackJson {
  /** The kerbs and `walls` together, as the physics wants them */
  readonly allWalls: readonly Wall[]
}

// ── Checking ───────────────────────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Far more than a track needs; a bigger file is a mistake */
const MAX_ROAD_POINTS = 2000
const MAX_GATES = 200
const MAX_THINGS = 500

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

type Problems = string[]

function numbers(
  value: unknown,
  keys: readonly string[],
  where: string,
  problems: Problems,
): boolean {
  if (!isObject(value)) {
    problems.push(`${where}: not an object`)
    return false
  }
  const missing = keys.filter((key) => !isNumber(value[key]))
  if (missing.length > 0) problems.push(`${where}: ${missing.join(', ')} must be numbers`)
  return missing.length === 0
}

function list<T>(
  value: unknown,
  where: string,
  max: number,
  problems: Problems,
  each: (item: unknown, at: string) => T | null,
): T[] {
  if (!Array.isArray(value)) {
    problems.push(`${where}: not a list`)
    return []
  }
  if (value.length > max) problems.push(`${where}: more than ${max}`)
  const out: T[] = []
  value.slice(0, max).forEach((item, index) => {
    const parsed = each(item, `${where}[${index}]`)
    if (parsed !== null) out.push(parsed)
  })
  return out
}

const spot = (item: unknown, at: string, problems: Problems): Spot | null =>
  numbers(item, ['x', 'z', 'heading'], at, problems)
    ? { x: (item as Spot).x, z: (item as Spot).z, heading: (item as Spot).heading }
    : null

const wall = (item: unknown, at: string, problems: Problems): Wall | null =>
  numbers(item, ['ax', 'az', 'bx', 'bz'], at, problems) ? (item as Wall) : null

/**
 * The track in `json`, checked, with its walls worked out; or every problem found, so that whoever
 * made it can fix them all at once
 */
export function parseTrack(json: unknown): { track: Track } | { problems: string[] } {
  const problems: Problems = []
  if (!isObject(json)) return { problems: ['not an object'] }
  if (json.format !== TRACK_FORMAT) problems.push(`format: must be ${TRACK_FORMAT}`)
  if (typeof json.id !== 'string' || !ID.test(json.id))
    problems.push('id: lower-case letters, digits and dashes')
  const name = json.name
  if (
    !isObject(name) ||
    typeof name.en !== 'string' ||
    typeof name['zh-TW'] !== 'string' ||
    !name.en ||
    !name['zh-TW']
  ) {
    problems.push('name: an en and a zh-TW name')
  }
  if (
    json.revision !== undefined &&
    (!Number.isInteger(json.revision) ||
      (json.revision as number) < 1 ||
      (json.revision as number) > 999)
  ) {
    problems.push('revision: a whole number from 1 to 999')
  }
  if (!Number.isInteger(json.laps) || (json.laps as number) < 1 || (json.laps as number) > 20) {
    problems.push('laps: a whole number from 1 to 20')
  }

  const road = list(json.road, 'road', MAX_ROAD_POINTS, problems, (item, at) => {
    if (!numbers(item, ['x', 'z', 'width'], at, problems)) return null
    const point = item as unknown as RoadPoint
    if (point.width < 4 || point.width > 60) {
      problems.push(`${at}: width from 4 to 60 m`)
      return null
    }
    return { x: point.x, z: point.z, width: point.width }
  })
  if (road.length < 4) problems.push('road: at least 4 points')
  for (let index = 0; index < road.length; index++) {
    const a = road[index]!
    const b = road[(index + 1) % road.length]!
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.5)
      problems.push(`road[${index}]: closer than 0.5 m to the next point`)
  }

  const gates = list(json.gates, 'gates', MAX_GATES, problems, (item, at) =>
    wall(item, at, problems),
  )
  if (gates.length < 2) problems.push('gates: at least 2 (the finish line and one more)')
  const respawns = list(json.respawns, 'respawns', MAX_GATES, problems, (item, at) =>
    spot(item, at, problems),
  )
  if (respawns.length !== gates.length) problems.push('respawns: one for each gate')
  const grid = list(json.grid, 'grid', 12, problems, (item, at) => spot(item, at, problems))
  if (grid.length === 0) problems.push('grid: at least one place')
  const walls = list(json.walls ?? [], 'walls', MAX_THINGS, problems, (item, at) =>
    wall(item, at, problems),
  )
  const boostPads = list(json.boostPads ?? [], 'boostPads', MAX_THINGS, problems, (item, at) =>
    numbers(item, ['x', 'z', 'heading', 'length', 'width'], at, problems)
      ? (item as unknown as BoostPad)
      : null,
  )
  const itemBoxes = list(json.itemBoxes ?? [], 'itemBoxes', MAX_THINGS, problems, (item, at) =>
    numbers(item, ['x', 'z'], at, problems)
      ? { x: (item as { x: number }).x, z: (item as { z: number }).z }
      : null,
  )
  const decor = list(json.decor ?? [], 'decor', MAX_THINGS, problems, (item, at) => {
    if (!numbers(item, ['x', 'z', 'heading', 'scale'], at, problems)) return null
    const model = (item as { model?: unknown }).model
    if (typeof model !== 'string' || !ID.test(model)) {
      problems.push(`${at}: model must be an asset id`)
      return null
    }
    return item as unknown as Decor
  })

  if (problems.length > 0) return { problems }
  const base: TrackJson = {
    format: TRACK_FORMAT,
    id: json.id as string,
    name: { en: (name as { en: string }).en, 'zh-TW': (name as { 'zh-TW': string })['zh-TW'] },
    ...(json.revision !== undefined && json.revision !== 1
      ? { revision: json.revision as number }
      : {}),
    laps: json.laps as number,
    road,
    gates,
    respawns,
    grid,
    walls,
    boostPads,
    itemBoxes,
    decor,
  }
  return { track: { ...base, allWalls: [...kerbs(road), ...walls] } }
}

/**
 * What a track's records and ghost are kept under: its id, and its revision after the first, so
 * that a widened or redrawn layout starts with no records rather than times from another road
 */
export const recordKey = (track: Pick<TrackJson, 'id' | 'revision'>): string =>
  (track.revision ?? 1) > 1 ? `${track.id}@${track.revision}` : track.id

// ── Geometry ───────────────────────────────────────────────────────────────────────────────────

/** Unit vector along the road at point `index`: from the point before to the point after */
export function roadDirection(
  road: readonly RoadPoint[],
  index: number,
): { dx: number; dz: number } {
  const before = road[(index - 1 + road.length) % road.length]!
  const after = road[(index + 1) % road.length]!
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  return { dx: dx / length, dz: dz / length }
}

/** The heading that faces along `direction` (heading 0 faces -z, clockwise) */
export const headingOf = (direction: { dx: number; dz: number }): number =>
  Math.atan2(direction.dx, -direction.dz)

/** The two kerbs as walls: each road point moved half the width to either side, joined round */
export function kerbs(road: readonly RoadPoint[]): Wall[] {
  const left: { x: number; z: number }[] = []
  const right: { x: number; z: number }[] = []
  road.forEach((point, index) => {
    const { dx, dz } = roadDirection(road, index)
    // The road's right, when facing along it: (-dz, dx) is its left on this plane
    const half = point.width / 2
    left.push({ x: point.x + dz * half, z: point.z - dx * half })
    right.push({ x: point.x - dz * half, z: point.z + dx * half })
  })
  const ring = (points: { x: number; z: number }[]): Wall[] =>
    points.map((a, index) => {
      const b = points[(index + 1) % points.length]!
      return { ax: a.x, az: a.z, bx: b.x, bz: b.z }
    })
  return [...ring(left), ...ring(right)]
}

/**
 * Gates and respawn points at every `every`-th road point, gate 0 at the first: a line from kerb to
 * kerb, and a place on the centre line facing along the road. What build-track.ts uses when the
 * scene has no gates of its own
 */
export function gatesAlong(
  road: readonly RoadPoint[],
  every: number,
): { gates: Gate[]; respawns: Spot[] } {
  const gates: Gate[] = []
  const respawns: Spot[] = []
  for (let index = 0; index < road.length; index += Math.max(1, every)) {
    const point = road[index]!
    const direction = roadDirection(road, index)
    const half = point.width / 2
    // From the left kerb to the right one: crossing it going forwards is crossing it left to right
    gates.push({
      ax: point.x + direction.dz * half,
      az: point.z - direction.dx * half,
      bx: point.x - direction.dz * half,
      bz: point.z + direction.dx * half,
    })
    respawns.push({ x: point.x, z: point.z, heading: headingOf(direction) })
  }
  return { gates, respawns }
}

/** Which side of the gate's line P is: > 0 the side a driver comes from, < 0 the side they go to */
const side = (gate: Gate, x: number, z: number): number =>
  (gate.bx - gate.ax) * (z - gate.az) - (gate.bz - gate.az) * (x - gate.ax)

/**
 * Whether going from (x0, z0) to (x1, z1) crossed `gate`: 1 forwards (the way a driver with `a` on
 * the left goes), -1 backwards, 0 not at all. Ending exactly on the line counts as crossing it and
 * starting on it does not, so that a step that stops on a gate and the next that leaves it count once
 */
export function gateCrossing(
  gate: Gate,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): -1 | 0 | 1 {
  const before = side(gate, x0, z0)
  const after = side(gate, x1, z1)
  const direction = before > 0 && after <= 0 ? 1 : before < 0 && after >= 0 ? -1 : 0
  if (direction === 0) return 0
  // The step's own line must separate the gate's ends too, or it passed beside the gate
  const dx = x1 - x0
  const dz = z1 - z0
  const a = dx * (gate.az - z0) - dz * (gate.ax - x0)
  const b = dx * (gate.bz - z0) - dz * (gate.bx - x0)
  if (a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b)) return 0
  return direction
}

/** The course the physics drives on: every wall, and the pole position */
export const courseOf = (track: Track): Course => ({
  walls: track.allWalls,
  start: track.grid[0]!,
  checkpoints: { gates: track.gates, respawns: track.respawns, laps: track.laps },
})

/** The smallest box holding the road and its kerbs, for the minimap */
export function trackBounds(track: Pick<Track, 'road'>): {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
} {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const point of track.road) {
    const half = point.width / 2
    minX = Math.min(minX, point.x - half)
    maxX = Math.max(maxX, point.x + half)
    minZ = Math.min(minZ, point.z - half)
    maxZ = Math.max(maxZ, point.z + half)
  }
  return { minX, minZ, maxX, maxZ }
}
