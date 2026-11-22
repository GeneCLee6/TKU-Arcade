// 2026-11-23 (owner: "more high-platform shortcuts that take technique and enough speed to get up
// onto; technique and the kart can both cut the time"): high platforms, docs/ARCHITECTURE.md §4.75.
// A branch (branches.ts) may be a platform: a roof, a container stack, a breakwater's crown, raised
// well above the road. It leaves the main road from a jump lip of the main road (terrain.ts), and a
// few metres on its road steps straight up, a face as tall as a wall (`rise`: the first point of
// the platform). Nothing drives up a face: the only way on is to fly over its top from the lip.
//
// The model keeps to what the game already has. The flight is terrain.ts's parabola (the upward
// speed `jumpLift` times the speed along the road at the lip, `gravity` pulling it down, the ground
// speed held), so how high a car is when it reaches the face is a closed form of its speed, and so
// is the least speed that clears it (`speedToClear`). The face is a wall across the branch with a
// foot and a top (walls.ts): a car below its top hits it, on the ground or in the air, and drops
// back onto the main road under it; a car at or above its top flies over and lands on the platform.
// Before the face the branch is at the main road's own height (its mouth), so a car that falls
// short lands where the main road is and drives on: time lost, no reset.
//
// What makes the speed: the kart's top speed, the climb up the ramp to the lip (a light kart loses
// less of it on a steep one, terrain.ts's `slopeWeight`), and whatever boost is running there (a
// charge, an instant boost, a landing's, a pad's). What makes the line: the face is off to one side
// of the lip, so the car must leave the lip already heading for it (`flightToFace`); too wide and it
// meets the platform's kerb, which stands to any height.
//
// A track without a platform has none of this: no branch has a `rise`, no wall is added, and every
// step is what it was. Pure.
import type { Fork } from './branches.ts'
import { TERRAIN_TUNING, type TerrainTuning } from './terrain.ts'
import type { RoadPoint } from './track.ts'
import type { Wall } from './walls.ts'

/** A platform's face is at least this tall, metres: higher than a kart, so nothing steps up it */
export const LEDGE_MIN_STEP = 2.5
/** ... and its top at most this far above the lip, metres (the flight barely climbs) */
export const LEDGE_MAX_ABOVE = 1.2
/** The face is this far from the lip at least, metres, along the line between their middles */
export const LEDGE_MIN_REACH = 12
/** No platform needs more than this speed off the lip, m/s (a stacked boost's top, near enough) */
export const LEDGE_MAX_NEED = 95
/** Where the branch lies over the main road, its height is the main road's within this, metres */
export const LEDGE_MATCH = 0.6
/** The face's foot, this far below the road in front of it */
const FACE_FOOT = 1.5

/** A platform, worked out from its branch */
export interface Ledge {
  /** The branch it is (index into the track's forks) */
  readonly fork: number
  /** The main road's lip it is flown onto from */
  readonly lip: {
    readonly x: number
    readonly z: number
    readonly y: number
    /** The main road's direction there, unit */
    readonly dx: number
    readonly dz: number
    readonly half: number
  }
  /** The face: a wall across the branch, kerb to kerb, its top the platform's height */
  readonly face: Wall & { readonly top: number; readonly base: number }
  /** Its middle */
  readonly faceX: number
  readonly faceZ: number
  /** The platform's height at the face */
  readonly top: number
  /** From the lip's middle to the face's, metres on the plan */
  readonly reach: number
  /** The cosine of the angle between the road at the lip and the line to the face */
  readonly cos: number
  /** The least speed off the lip, m/s, flying that line, that clears the face (`speedToClear`) */
  readonly need: number
}

/**
 * The least speed off a lip, m/s, that is still `rise` metres up (the face's top above the lip;
 * negative for a face below it) after `reach` metres of flight, flying at `cos` to the road at the
 * lip (its upward speed is `jumpLift` times the speed along the road). Infinity when no speed is
 * enough: the parabola y = jumpLift·cos·d − (gravity/2)·d²/v² is never that high there
 */
export function speedToClear(
  rise: number,
  reach: number,
  cos: number,
  numbers: Pick<TerrainTuning, 'gravity' | 'jumpLift'> = TERRAIN_TUNING,
): number {
  const room = numbers.jumpLift * cos * reach - rise
  if (!(room > 0) || !(reach > 0)) return Infinity
  return Math.sqrt((numbers.gravity / 2) * (reach * reach) / room)
}

/** How high above the lip a car off it at `speed` (m/s, at `cos` to the road) is `reach` metres on */
export function flightHeight(
  speed: number,
  reach: number,
  cos: number,
  numbers: Pick<TerrainTuning, 'gravity' | 'jumpLift'> = TERRAIN_TUNING,
): number {
  if (!(speed > 0)) return -Infinity
  return numbers.jumpLift * cos * reach - (numbers.gravity / 2) * (reach * reach) / (speed * speed)
}

/** What a flight from a lip comes to at a platform */
export type FaceOutcome = 'on' | 'short' | 'wide' | 'grounded'

/**
 * Where a car leaving `ledge`'s lip at (x, z) with ground velocity (vx, vz) goes: over the face
 * onto the platform (`on`), into it (`short`: below its top, so back down onto the main road),
 * past either end of it (`wide`), or not off the lip at all (`grounded`: too slow to take off, or
 * going the wrong way). The flight as terrain.ts flies it, without the little steering the air
 * allows. `clearance` is how far over the top (negative: under) it crosses the face's line
 */
export function flightToFace(
  ledge: Ledge,
  x: number,
  z: number,
  vx: number,
  vz: number,
  numbers: TerrainTuning = TERRAIN_TUNING,
): { outcome: FaceOutcome; clearance: number; reach: number } {
  const speed = Math.hypot(vx, vz)
  const along = vx * ledge.lip.dx + vz * ledge.lip.dz
  if (along < numbers.jumpMinSpeed || speed === 0) {
    return { outcome: 'grounded', clearance: -Infinity, reach: Infinity }
  }
  const ux = vx / speed
  const uz = vz / speed
  const { face } = ledge
  // Where the ray from (x, z) along (ux, uz) crosses the face's segment
  const sx = face.bx - face.ax
  const sz = face.bz - face.az
  const denominator = ux * sz - uz * sx
  if (Math.abs(denominator) < 1e-9) return { outcome: 'wide', clearance: -Infinity, reach: Infinity }
  const qx = face.ax - x
  const qz = face.az - z
  const reach = (qx * sz - qz * sx) / denominator
  const share = (qx * uz - qz * ux) / denominator
  if (reach <= 0) return { outcome: 'wide', clearance: -Infinity, reach: Infinity }
  const height = ledge.lip.y + flightHeight(speed, reach, along / speed, numbers)
  const clearance = height - ledge.top
  if (share < 0 || share > 1) return { outcome: 'wide', clearance, reach }
  return { outcome: clearance >= 0 ? 'on' : 'short', clearance, reach }
}

/** The main road's height under (x, z): its nearest segment's, interpolated along it */
export function mainHeightAt(road: readonly RoadPoint[], x: number, z: number): number {
  let best = Infinity
  let y = road[0]?.y ?? 0
  const count = road.length
  for (let index = 0; index < count; index++) {
    const a = road[index]!
    const b = road[(index + 1) % count]!
    const sx = b.x - a.x
    const sz = b.z - a.z
    const lengthSq = sx * sx + sz * sz
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
    const distance = (x - a.x - sx * t) ** 2 + (z - a.z - sz * t) ** 2
    if (distance >= best) continue
    best = distance
    y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t
  }
  return y
}

const round = (value: number) => Math.round(value * 100) / 100

/** The face across a branch's centre line `path` in front of its platform (`rise`: a path index) */
export function faceOf(
  path: readonly RoadPoint[],
  rise: number,
): Wall & { readonly top: number; readonly base: number } {
  const foot = path[rise - 1]!
  const head = path[rise]!
  const dx0 = head.x - foot.x
  const dz0 = head.z - foot.z
  const length = Math.hypot(dx0, dz0) || 1
  const dx = dx0 / length
  const dz = dz0 / length
  // Kerb to kerb and a little past, so that no corner is left open
  const half = foot.width / 2 + 0.3
  return {
    ax: round(foot.x + dz * half),
    az: round(foot.z - dx * half),
    bx: round(foot.x - dz * half),
    bz: round(foot.z + dx * half),
    top: round(head.y ?? 0),
    base: round((foot.y ?? 0) - FACE_FOOT),
  }
}

/** A platform of a branch with a `rise` (and the main road's lip it leaves from), worked out */
export function ledgeOf(
  road: readonly RoadPoint[],
  fork: Pick<Fork, 'from' | 'path' | 'rise'>,
  index: number,
  numbers: TerrainTuning = TERRAIN_TUNING,
): Ledge | null {
  const rise = fork.rise
  if (rise === undefined) return null
  const count = road.length
  const point = road[fork.from]!
  const before = road[(fork.from - 1 + count) % count]!
  const after = road[(fork.from + 1) % count]!
  const ex = after.x - before.x
  const ez = after.z - before.z
  const length = Math.hypot(ex, ez) || 1
  const dx = ex / length
  const dz = ez / length
  const face = faceOf(fork.path, rise)
  const faceX = (face.ax + face.bx) / 2
  const faceZ = (face.az + face.bz) / 2
  const reach = Math.hypot(faceX - point.x, faceZ - point.z)
  const cos = reach > 0 ? ((faceX - point.x) * dx + (faceZ - point.z) * dz) / reach : 1
  const lipY = point.y ?? 0
  return {
    fork: index,
    lip: { x: point.x, z: point.z, y: lipY, dx, dz, half: point.width / 2 },
    face,
    faceX,
    faceZ,
    top: face.top,
    reach,
    cos,
    need: speedToClear(face.top - lipY, reach, cos, numbers),
  }
}

const ledgeCache = new WeakMap<object, readonly Ledge[]>()

/** Every platform of a track, worked out once; none on a track without */
export function trackLedges(track: {
  readonly road: readonly RoadPoint[]
  readonly forks?: readonly Fork[]
}): readonly Ledge[] {
  const forks = track.forks
  if (!forks || !forks.some((fork) => fork.rise !== undefined)) return []
  let ledges = ledgeCache.get(forks)
  if (!ledges) {
    ledges = forks.flatMap((fork, index) => {
      const ledge = ledgeOf(track.road, fork, index)
      return ledge ? [ledge] : []
    })
    ledgeCache.set(forks, ledges)
  }
  return ledges
}

/** The faces of a track's platforms, as walls: what parseTrack adds to the kerbs */
export const ledgeFaces = (forks: readonly Pick<Fork, 'path' | 'rise'>[]): Wall[] =>
  forks.flatMap((fork) => (fork.rise === undefined ? [] : [faceOf(fork.path, fork.rise)]))

/**
 * A platform checked, as parseBranches checks a branch: every problem found goes into `problems`.
 * `rise` is a path index; the branch must leave from a lip of the main road, step up at least
 * LEDGE_MIN_STEP at its face, which stands clear of the main road, LEDGE_MIN_REACH or more from the
 * lip and no more than LEDGE_MAX_ABOVE above it, a speed of at most LEDGE_MAX_NEED clearing it; and
 * wherever the branch lies over the main road, it is at the main road's height
 */
export function checkLedge(
  road: readonly RoadPoint[],
  fork: Pick<Fork, 'from' | 'to' | 'path'>,
  rise: number,
  mainJumps: readonly number[],
  at: string,
  depthIn: (x: number, z: number) => number,
  problems: string[],
): void {
  const { path } = fork
  if (!Number.isInteger(rise) || rise < 2 || rise > path.length - 2) {
    problems.push(`${at}.rise: a point of its road, not the first`)
    return
  }
  if (!mainJumps.includes(fork.from)) {
    problems.push(`${at}: a platform leaves from a jump lip of the main road`)
    return
  }
  const foot = path[rise - 1]!
  const head = path[rise]!
  const step = (head.y ?? 0) - (foot.y ?? 0)
  if (step < LEDGE_MIN_STEP) {
    problems.push(`${at}.rise: steps up ${round(step)} m (at least ${LEDGE_MIN_STEP})`)
    return
  }
  if (depthIn(foot.x, foot.z) >= -foot.width / 2) {
    problems.push(`${at}.rise: its face stands on the main road`)
    return
  }
  const ledge = ledgeOf(road, { from: fork.from, path, rise }, 0)!
  if (ledge.top - ledge.lip.y > LEDGE_MAX_ABOVE) {
    problems.push(`${at}.rise: more than ${LEDGE_MAX_ABOVE} m above the lip`)
  }
  if (ledge.reach < LEDGE_MIN_REACH) {
    problems.push(`${at}.rise: its face is closer than ${LEDGE_MIN_REACH} m to the lip`)
  }
  if (!(ledge.need <= LEDGE_MAX_NEED)) {
    problems.push(`${at}.rise: no kart can fly onto it (it needs more than ${LEDGE_MAX_NEED} m/s)`)
  }
  for (let index = 1; index < path.length - 1; index++) {
    const point = path[index]!
    if (depthIn(point.x, point.z) <= -point.width / 2) continue
    if (Math.abs((point.y ?? 0) - mainHeightAt(road, point.x, point.z)) > LEDGE_MATCH) {
      problems.push(`${at}: point ${index} lies over the main road but not at its height`)
      return
    }
  }
}

/** The face's head stands this far past its foot, metres: as near upright as a road point may be */
const FACE_DEPTH = 0.6

/**
 * For a track's author: a branch's own road points (layBranch's) made a platform from point `face`
 * on. Every point before it is put at the main road's height under it (the mouth, over or beside
 * the main road), and a point FACE_DEPTH past point `face` − 1, at point `face`'s height, is put in
 * after it: the face's head, straight up from its foot. Its own points and `rise` (BranchJson's)
 */
export function platformRoad(
  road: readonly RoadPoint[],
  points: readonly RoadPoint[],
  face: number,
): { road: RoadPoint[]; rise: number } {
  if (face < 1 || face >= points.length) throw new Error(`platformRoad: no point ${face} to rise at`)
  const low = points
    .slice(0, face)
    .map((point) => ({ ...point, y: round(mainHeightAt(road, point.x, point.z)) }))
  const foot = low[face - 1]!
  const next = points[face]!
  const span = Math.hypot(next.x - foot.x, next.z - foot.z) || 1
  const head: RoadPoint = {
    x: round(foot.x + ((next.x - foot.x) / span) * FACE_DEPTH),
    z: round(foot.z + ((next.z - foot.z) / span) * FACE_DEPTH),
    width: foot.width,
    y: next.y ?? 0,
  }
  return { road: [...low, head, ...points.slice(face)], rise: face }
}

/**
 * The platform a kart is up on (its branch, as `Ledge.fork`), or -1: on the branch's own stretch
 * past its face, no lower than a metre under the face's top. For the measures and the HUD
 */
export function onPlatform(
  track: { readonly road: readonly RoadPoint[]; readonly forks?: readonly Fork[] },
  ledges: readonly Ledge[],
  kart: { readonly x: number; readonly z: number; readonly y?: number },
): number {
  for (const ledge of ledges) {
    if ((kart.y ?? 0) < ledge.top - 1) continue
    const fork = track.forks?.[ledge.fork]
    if (!fork || fork.rise === undefined) continue
    let best = Infinity
    let at = -1
    fork.path.forEach((point, index) => {
      const distance = Math.hypot(point.x - kart.x, point.z - kart.z)
      if (distance < best) {
        best = distance
        at = index
      }
    })
    if (at >= fork.rise && best <= fork.path[at]!.width) return ledge.fork
  }
  return -1
}
