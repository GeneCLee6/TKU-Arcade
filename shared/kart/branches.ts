// 2026-11-20 (owner: "shortcuts only the skilled get through"; #109 noted that its shortcuts were
// lanes inside a wide road set apart by walls, not roads of their own): branches, docs/
// ARCHITECTURE.md §4.41. A track may have, besides its closed centre line, branches: a road that
// leaves the main road at one road point, runs on its own (its own centre line, widths, heights,
// jumps and kerbs) and joins the main road again at a later road point. Everything that went by the
// one centre line takes the branches into account here:
//
// - the kerbs: each road's two kerbs, cut away wherever they run across another road (the mouth of a
//   branch is open; the main road's kerb across it is gone, and so is the branch's inside the main
//   road), so that the roads together are one surface with walls round it (`forkKerbs`);
// - the gates: the main gates a branch goes round (those strictly between its two ends) each get a
//   stand-in on the branch, the same number, evenly along the stretch where the branch runs clear of
//   the main road, each with its own respawn point. Crossing either line counts as passing that gate
//   (course.ts's `passGates`), so a lap down a branch counts every gate in order, and the server
//   judges it with the same code (race.ts). The finish line is never on a branch; no gate of either
//   road touches the other road, so no car can pass one by going round its end;
// - a route: the main road with some branches taken, as one closed centre line (`routeRoad`), for
//   whatever drives by one (the computer karts, the drivers of `npm run kart:feel`);
// - where a car is (`placeOnTrack`): which road it is on and which way that road runs, for going the
//   wrong way.
//
// A track with no branches has none of this: every function here leaves it exactly as it was. Pure.
import type { Spot } from './course.ts'
import { hasLevels, levelPenalty, rememberLevels } from './levels.ts'
import type { Gate, RoadPoint } from './track.ts'
import type { Wall } from './walls.ts'

/** A branch as a track's JSON has it */
export interface BranchJson {
  /** The main road point it leaves from: its centre line begins there */
  readonly from: number
  /** The main road point it joins again: its centre line ends there. After `from`, never past the end */
  readonly to: number
  /** Its centre line between the two, in driving order (the two main road points left out) */
  readonly road: readonly RoadPoint[]
  /** Jump lips, as indices into `road` (terrain.ts) */
  readonly jumps?: readonly number[]
  /**
   * A high platform (2026-11-23, ledges.ts): the point of `road` where the platform begins, its
   * road stepping straight up there (a face only a flier clears). Left out on any other branch
   */
  readonly rise?: number
}

/** A branch, checked, with what it adds to the race worked out */
export interface Fork {
  readonly from: number
  readonly to: number
  /**
   * The whole centre line: main road point `from`, the branch's own points, main road point `to`
   * (the two ends as wide as the branch beside them)
   */
  readonly path: readonly RoadPoint[]
  /** Jump lips, as indices into `path` */
  readonly jumps: readonly number[]
  /** A high platform (2026-11-23, ledges.ts): where it begins, as an index into `path` */
  readonly rise?: number
  /** The main gates it goes round: the first one's index and how many (0: none) */
  readonly first: number
  readonly count: number
  /** Their stand-ins on the branch, in order, and where each sends a reset car */
  readonly gates: readonly Gate[]
  readonly respawns: readonly Spot[]
}

/** A line that counts as passing a gate: the gate itself (route 0) or a branch's stand-in for it */
export interface GateLine {
  readonly gate: Gate
  readonly respawn: Spot
  /** 0 the main road, k + 1 the track's branch k */
  readonly route: number
}

// ── Limits ─────────────────────────────────────────────────────────────────────────────────────

export const MAX_BRANCHES = 6
export const MAX_BRANCH_POINTS = 400
/** The main road's points and every branch's together */
export const MAX_ALL_POINTS = 2000
/** A branch's stand-in gates are at least this far apart, metres */
const GATE_SPACING = 2
/** A gate keeps this far off any other road, metres */
const GATE_CLEAR = 0.5
/** gatesClearOf fills a gap of more road points than this between two gates */
const GATE_GAP = 12
/** A stand-in's respawn keeps this far from any of the track's own walls, metres */
const WALL_CLEAR = 4
/** Kerbs are cut in pieces this long where they cross another road, metres */
const CLIP_PIECE = 0.25

// ── Geometry ───────────────────────────────────────────────────────────────────────────────────

const round = (value: number) => Math.round(value * 100) / 100

/** Unit vector along a centre line at point `index`: closed round the loop, or open at the ends */
export function pathDirection(
  points: readonly RoadPoint[],
  index: number,
  closed: boolean,
): { dx: number; dz: number } {
  const count = points.length
  const before = closed ? points[(index - 1 + count) % count]! : points[Math.max(0, index - 1)]!
  const after = closed ? points[(index + 1) % count]! : points[Math.min(count - 1, index + 1)]!
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  return { dx: dx / length, dz: dz / length }
}

/** How deep (x, z) is inside a road: metres in from its kerb (negative: outside), nearest segment */
export function roadDepth(
  points: readonly RoadPoint[],
  closed: boolean,
  x: number,
  z: number,
): number {
  let best = -Infinity
  const count = points.length
  const last = closed ? count : count - 1
  for (let index = 0; index < last; index++) {
    const a = points[index]!
    const b = points[(index + 1) % count]!
    const sx = b.x - a.x
    const sz = b.z - a.z
    const lengthSq = sx * sx + sz * sz
    const t =
      lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
    const distance = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t))
    const half = (a.width + (b.width - a.width) * t) / 2
    best = Math.max(best, half - distance)
  }
  return best
}

/** The two kerbs of an open centre line, as walls from end to end */
function openKerbs(path: readonly RoadPoint[]): Wall[] {
  const left: { x: number; z: number }[] = []
  const right: { x: number; z: number }[] = []
  path.forEach((point, index) => {
    const { dx, dz } = pathDirection(path, index, false)
    const half = point.width / 2
    left.push({ x: point.x + dz * half, z: point.z - dx * half })
    right.push({ x: point.x - dz * half, z: point.z + dx * half })
  })
  const line = (points: { x: number; z: number }[]): Wall[] =>
    points.slice(1).map((b, index) => {
      const a = points[index]!
      return { ax: a.x, az: a.z, bx: b.x, bz: b.z }
    })
  return [...line(left), ...line(right)]
}

/** A wall with every stretch of it inside `inside` cut away; the wall itself when none is */
function clipWall(wall: Wall, inside: (x: number, z: number) => boolean): Wall[] {
  const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
  const pieces = Math.max(1, Math.ceil(length / CLIP_PIECE))
  const at = (t: number) => ({
    x: wall.ax + (wall.bx - wall.ax) * t,
    z: wall.az + (wall.bz - wall.az) * t,
  })
  const kept: [number, number][] = []
  let runFrom = -1
  for (let piece = 0; piece < pieces; piece++) {
    const middle = at((piece + 0.5) / pieces)
    const out = !inside(middle.x, middle.z)
    if (out && runFrom < 0) runFrom = piece
    if (!out && runFrom >= 0) {
      kept.push([runFrom, piece])
      runFrom = -1
    }
  }
  if (runFrom >= 0) kept.push([runFrom, pieces])
  if (kept.length === 1 && kept[0]![0] === 0 && kept[0]![1] === pieces) return [wall]
  return kept.map(([from, to]) => {
    const a = at(from / pieces)
    const b = at(to / pieces)
    const piece = { ax: round(a.x), az: round(a.z), bx: round(b.x), bz: round(b.z) }
    // A kerb at a crossing (2026-11-22, levels.ts) keeps its foot and top
    return wall.base === undefined ? piece : { ...piece, top: wall.top, base: wall.base }
  })
}

/** The smallest box round a centre line and its kerbs, grown by `margin` */
function boxOf(points: readonly RoadPoint[], margin: number) {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const point of points) {
    const half = point.width / 2 + margin
    minX = Math.min(minX, point.x - half)
    maxX = Math.max(maxX, point.x + half)
    minZ = Math.min(minZ, point.z - half)
    maxZ = Math.max(maxZ, point.z + half)
  }
  return { minX, minZ, maxX, maxZ }
}

const wallInBox = (wall: Wall, box: ReturnType<typeof boxOf>) =>
  Math.max(wall.ax, wall.bx) >= box.minX &&
  Math.min(wall.ax, wall.bx) <= box.maxX &&
  Math.max(wall.az, wall.bz) >= box.minZ &&
  Math.min(wall.az, wall.bz) <= box.maxZ

/**
 * The kerbs of a track with branches: the main road's (`mainKerbs`, as track.ts's `kerbs` gives
 * them) and each branch's, every stretch that runs across another road cut away
 */
export function forkKerbs(
  road: readonly RoadPoint[],
  mainKerbs: readonly Wall[],
  forks: readonly Pick<Fork, 'path'>[],
): Wall[] {
  if (forks.length === 0) return [...mainKerbs]
  const boxes = forks.map((fork) => boxOf(fork.path, 1))
  const out: Wall[] = []
  for (const wall of mainKerbs) {
    const near = forks.filter((_, index) => wallInBox(wall, boxes[index]!))
    if (near.length === 0) {
      out.push(wall)
      continue
    }
    out.push(
      ...clipWall(wall, (x, z) => near.some((fork) => roadDepth(fork.path, false, x, z) > 0.02)),
    )
  }
  forks.forEach((fork, index) => {
    const others = forks.filter((_, other) => other !== index)
    for (const wall of openKerbs(fork.path)) {
      out.push(
        ...clipWall(
          wall,
          (x, z) =>
            roadDepth(road, true, x, z) > 0.02 ||
            others.some((other) => roadDepth(other.path, false, x, z) > 0.02),
        ),
      )
    }
  })
  return out
}

/** Distance along a centre line at each point, from its first */
function distances(points: readonly RoadPoint[]): number[] {
  const along = [0]
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!
    const b = points[index]!
    along.push(along[index - 1]! + Math.hypot(b.x - a.x, b.z - a.z))
  }
  return along
}

/** The place `s` metres along an open centre line, with the way it runs and its width there */
function alongPath(points: readonly RoadPoint[], along: readonly number[], s: number) {
  let index = 0
  while (index < points.length - 2 && along[index + 1]! < s) index++
  const a = points[index]!
  const b = points[index + 1]!
  const span = Math.max(1e-9, along[index + 1]! - along[index]!)
  const t = Math.max(0, Math.min(1, (s - along[index]!) / span))
  const dx = (b.x - a.x) / span
  const dz = (b.z - a.z) / span
  const length = Math.hypot(dx, dz) || 1
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    dx: dx / length,
    dz: dz / length,
    width: a.width + (b.width - a.width) * t,
  }
}

/** A gate from the left kerb to the right one, `half` out either side of (x, z) facing (dx, dz) */
const gateAcross = (x: number, z: number, dx: number, dz: number, half: number): Gate => ({
  ax: round(x + dz * half),
  az: round(z - dx * half),
  bx: round(x - dz * half),
  bz: round(z + dx * half),
})

/** Places along a gate's line, ends included */
const gateSamples = (gate: Gate, count = 9) =>
  Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1)
    return { x: gate.ax + (gate.bx - gate.ax) * t, z: gate.az + (gate.bz - gate.az) * t }
  })

/** Whether segments ab and cd cross (touching at an end does not count) */
function segmentsCross(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
): boolean {
  const cross = (o: typeof a, p: typeof a, q: typeof a) =>
    (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x)
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** How far (x, z) is from the nearest of `walls` */
function nearestWall(walls: readonly Wall[], x: number, z: number): number {
  let best = Infinity
  for (const wall of walls) {
    const sx = wall.bx - wall.ax
    const sz = wall.bz - wall.az
    const lengthSq = sx * sx + sz * sz
    const t =
      lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - wall.ax) * sx + (z - wall.az) * sz) / lengthSq))
    best = Math.min(best, Math.hypot(x - (wall.ax + sx * t), z - (wall.az + sz * t)))
  }
  return best
}

/** The road point nearest (x, z); at a crossing (2026-11-22, levels.ts), of the road at height `y` */
function nearestPoint(points: readonly RoadPoint[], x: number, z: number, y?: number): number {
  let best = 0
  let bestDistance = Infinity
  const levels = y !== undefined && hasLevels(points)
  points.forEach((point, index) => {
    const distance =
      (point.x - x) ** 2 + (point.z - z) ** 2 + (levels ? levelPenalty(point.y ?? 0, y) : 0)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

// ── Checking ───────────────────────────────────────────────────────────────────────────────────

/**
 * The branches in a track's JSON, checked against its main road and gates, with their gates worked
 * out; every problem found goes into `problems`. `point` checks one road point as parseTrack does
 */
export function parseBranches(
  value: unknown,
  road: readonly RoadPoint[],
  gates: readonly Gate[],
  heading: (direction: { dx: number; dz: number }) => number,
  point: (item: unknown, at: string) => RoadPoint | null,
  maxGrade: number,
  problems: string[],
  /** The main road's jump lips */
  mainJumps: readonly number[] = [],
  /** The track's own walls: a stand-in's respawn keeps clear of them */
  walls: readonly Wall[] = [],
): Fork[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    problems.push('branches: not a list')
    return []
  }
  if (value.length > MAX_BRANCHES) {
    problems.push(`branches: more than ${MAX_BRANCHES}`)
    return []
  }
  const count = road.length
  if (count < 4) return []
  const before = problems.length
  const drafts: {
    from: number
    to: number
    path: RoadPoint[]
    jumps: number[]
    rise?: number
    at: string
  }[] = []
  let total = count
  value.forEach((item, index) => {
    const at = `branches[${index}]`
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      problems.push(`${at}: not an object`)
      return
    }
    const { from, to, road: own, jumps, rise } = item as Record<string, unknown>
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      (from as number) < 0 ||
      (to as number) >= count ||
      (to as number) - (from as number) < 2
    ) {
      problems.push(`${at}: from and to are main road points, to at least two after from`)
      return
    }
    if (!Array.isArray(own) || own.length < 1 || own.length > MAX_BRANCH_POINTS) {
      problems.push(`${at}.road: from 1 to ${MAX_BRANCH_POINTS} points`)
      return
    }
    total += own.length
    const points: RoadPoint[] = []
    own.forEach((one, k) => {
      const parsed = point(one, `${at}.road[${k}]`)
      if (parsed) points.push(parsed)
    })
    if (points.length !== own.length) return
    // Its two ends are the main road's points, as wide as the branch is there: inside the main road
    const path = branchPath(road, { from: from as number, to: to as number, road: points })
    const lips = jumps ?? []
    if (
      !Array.isArray(lips) ||
      lips.length > 20 ||
      lips.some((lip) => !Number.isInteger(lip) || lip < 0 || lip >= points.length) ||
      new Set(lips).size !== lips.length
    ) {
      problems.push(`${at}.jumps: each a point of its road, once`)
      return
    }
    // A platform's first point (2026-11-23, ledges.ts checks the rest once the branch is sound)
    if (
      rise !== undefined &&
      (!Number.isInteger(rise) || (rise as number) < 1 || (rise as number) >= points.length)
    ) {
      problems.push(`${at}.rise: a point of its road, not the first`)
      return
    }
    drafts.push({
      from: from as number,
      to: to as number,
      path,
      jumps: lips.map((lip) => lip + 1),
      ...(rise !== undefined ? { rise: (rise as number) + 1 } : {}),
      at,
    })
  })
  if (total > MAX_ALL_POINTS)
    problems.push(`branches: more than ${MAX_ALL_POINTS} road points in all`)
  if (problems.length > before) return []

  // Spans apart, in order along the lap
  const spans = drafts.map((draft) => [draft.from, draft.to] as const).sort((a, b) => a[0] - b[0])
  for (let index = 1; index < spans.length; index++) {
    if (spans[index]![0] <= spans[index - 1]![1]) {
      problems.push('branches: each leaves after the one before has joined again')
    }
  }

  // Where each main gate is along the main road
  const gateAt = gates.map((gate) =>
    nearestPoint(road, (gate.ax + gate.bx) / 2, (gate.az + gate.bz) / 2),
  )
  const hilly = road.some((one) => one.y !== undefined)
  const forks: Fork[] = []
  for (const draft of drafts) {
    const { path, at } = draft
    const n = path.length
    for (let index = 0; index + 1 < n; index++) {
      const a = path[index]!
      const b = path[index + 1]!
      const run = Math.hypot(b.x - a.x, b.z - a.z)
      if (run < 0.5) problems.push(`${at}: point ${index} closer than 0.5 m to the next`)
      if (
        (hilly || path.some((one) => one.y !== undefined)) &&
        !draft.jumps.includes(index) &&
        // A branch that leaves from a jump lip of the main road falls away with it, flown over
        !(index === 0 && mainJumps.includes(draft.from)) &&
        // A platform's face (2026-11-23, ledges.ts): straight up, flown over
        !(draft.rise !== undefined && index === draft.rise - 1) &&
        Math.abs((b.y ?? 0) - (a.y ?? 0)) > maxGrade * run
      ) {
        problems.push(`${at}: point ${index} steeper than ${maxGrade} to the next`)
      }
    }
    // Never across itself, nor across the main road's centre line but at its two ends
    for (let i = 0; i + 1 < n; i++) {
      for (let j = i + 2; j + 1 < n; j++) {
        if (segmentsCross(path[i]!, path[i + 1]!, path[j]!, path[j + 1]!)) {
          problems.push(`${at}: crosses itself`)
          i = n
          break
        }
      }
    }
    outer: for (let i = 0; i + 1 < n; i++) {
      for (let k = 0; k < count; k++) {
        // The main road's segments either side of the two ends meet the branch there
        if (
          (i === 0 && (k === draft.from || k === draft.from - 1)) ||
          (i === n - 2 && (k === draft.to || k === draft.to - 1))
        )
          continue
        if (segmentsCross(path[i]!, path[i + 1]!, road[k]!, road[(k + 1) % count]!)) {
          problems.push(`${at}: crosses the main road`)
          break outer
        }
      }
    }
    // Off the main road once, then back: overlapping at each end, clear in between
    const clear = path.map(
      (one, index) =>
        index > 0 && index < n - 1 && roadDepth(road, true, one.x, one.z) < -one.width / 2,
    )
    const first = clear.indexOf(true)
    const last = clear.lastIndexOf(true)
    if (first < 0) {
      problems.push(`${at}: never runs clear of the main road`)
      continue
    }
    if (clear.slice(first, last + 1).some((one) => !one)) {
      problems.push(`${at}: runs into the main road between its ends`)
      continue
    }
    // The main gates it goes round, and their stand-ins along its clear stretch
    const skipped = gateAt.flatMap((index, gate) =>
      index > draft.from && index < draft.to ? [gate] : [],
    )
    if (skipped.includes(0)) problems.push(`${at}: goes round the finish line`)
    if (skipped.some((gate, index) => index > 0 && gate !== skipped[index - 1]! + 1)) {
      problems.push(`${at}: the gates it goes round are not in a row`)
    }
    const along = distances(path)
    // On a platform (2026-11-23) the stand-ins are on the platform, never in front of its face
    const startAt = along[Math.max(first, draft.rise ?? 0)]!
    const endAt = along[last]!
    const own: Gate[] = []
    const respawns: Spot[] = []
    if (skipped.length > 0 && (endAt - startAt) / skipped.length < GATE_SPACING) {
      problems.push(
        `${at}: too short a clear stretch for the ${skipped.length} gates it stands in for`,
      )
      continue
    }
    const spacing = (endAt - startAt) / Math.max(1, skipped.length)
    skipped.forEach((_, index) => {
      // Evenly along the clear stretch, but a few metres off any wall standing on the branch (a
      // shed's slot): a kart put back there must be able to drive on
      const even = startAt + spacing * (index + 0.5)
      let s = even
      for (let shift = 0; shift <= spacing / 2; shift += 0.5) {
        const ahead = alongPath(path, along, even + shift)
        const behind = alongPath(path, along, even - shift)
        if (nearestWall(walls, ahead.x, ahead.z) >= WALL_CLEAR) {
          s = even + shift
          break
        }
        if (nearestWall(walls, behind.x, behind.z) >= WALL_CLEAR) {
          s = even - shift
          break
        }
      }
      const place = alongPath(path, along, s)
      own.push(gateAcross(place.x, place.z, place.dx, place.dz, place.width / 2))
      respawns.push({
        x: round(place.x),
        z: round(place.z),
        heading: Math.round(heading({ dx: place.dx, dz: place.dz }) * 1e6) / 1e6,
      })
    })
    forks.push({
      from: draft.from,
      to: draft.to,
      path,
      jumps: draft.jumps,
      ...(draft.rise !== undefined ? { rise: draft.rise } : {}),
      first: skipped[0] ?? 0,
      count: skipped.length,
      gates: own,
      respawns,
    })
  }
  if (problems.length > before) return []

  // No two branches touch; no gate touches another road
  forks.forEach((fork, index) => {
    const at = `branches[${index}]`
    forks.forEach((other, k) => {
      if (k <= index) return
      if (fork.path.some((one) => roadDepth(other.path, false, one.x, one.z) > -one.width / 2)) {
        problems.push(`${at}: touches branches[${k}]`)
      }
    })
    const others = forks.filter((_, k) => k !== index)
    for (const gate of fork.gates) {
      if (
        gateSamples(gate).some(
          (place) =>
            roadDepth(road, true, place.x, place.z) > -GATE_CLEAR ||
            others.some((other) => roadDepth(other.path, false, place.x, place.z) > -GATE_CLEAR),
        )
      ) {
        problems.push(`${at}: a gate of its own touches another road`)
        break
      }
    }
    gates.forEach((gate, k) => {
      if (
        gateSamples(gate).some(
          (place) => roadDepth(fork.path, false, place.x, place.z) > -GATE_CLEAR,
        )
      ) {
        problems.push(`${at}: touches gates[${k}] (keep the gates of the main road off it)`)
      }
    })
  })
  return problems.length > before ? [] : forks
}

// ── The race ───────────────────────────────────────────────────────────────────────────────────

/**
 * For each main gate, every line that passes it: the gate itself first, then any branch's stand-in.
 * Null for a track without branches, which then judges every gate as it always did
 */
export function gateLines(
  gates: readonly Gate[],
  respawns: readonly Spot[],
  forks: readonly Fork[] | undefined,
): GateLine[][] | null {
  if (!forks || forks.length === 0) return null
  const lines: GateLine[][] = gates.map((gate, index) => [
    { gate, respawn: respawns[index]!, route: 0 },
  ])
  forks.forEach((fork, k) => {
    fork.gates.forEach((gate, index) => {
      lines[fork.first + index]?.push({ gate, respawn: fork.respawns[index]!, route: k + 1 })
    })
  })
  return lines
}

/** A route round the track: the main road with the branches `taken` (indices into `forks`) */
export interface Route {
  /** One closed centre line */
  readonly road: readonly RoadPoint[]
  /** Its jump lips */
  readonly jumps: readonly number[]
  /** Each point's place on the track: the main road (-1) or a branch, and its index there */
  readonly from: readonly { readonly fork: number; readonly index: number }[]
  /** The route's point for each main road point (the nearest kept one, for a point it goes round) */
  readonly main: readonly number[]
}

export function routeRoad(
  track: {
    readonly road: readonly RoadPoint[]
    readonly jumps?: readonly number[]
    readonly forks?: readonly Pick<Fork, 'from' | 'to' | 'path' | 'jumps'>[]
  },
  taken: readonly number[],
): Route {
  const forks = track.forks ?? []
  const mainJumps = new Set(track.jumps ?? [])
  const road: RoadPoint[] = []
  const jumps: number[] = []
  const from: { fork: number; index: number }[] = []
  const main: number[] = []
  const count = track.road.length
  for (let index = 0; index < count; index++) {
    const k = forks.findIndex((fork, at) => taken.includes(at) && fork.from === index)
    main[index] = road.length
    if (mainJumps.has(index)) jumps.push(road.length)
    road.push(track.road[index]!)
    from.push({ fork: -1, index })
    if (k < 0) continue
    const fork = forks[k]!
    for (let at = 1; at < fork.path.length - 1; at++) {
      if (fork.jumps.includes(at)) jumps.push(road.length)
      road.push(fork.path[at]!)
      from.push({ fork: k, index: at })
    }
    // The main road points it goes round map to where it joins again
    for (let skip = index + 1; skip < fork.to; skip++) main[skip] = road.length
    index = fork.to - 1
  }
  // A route over a road that crosses itself crosses itself too (2026-11-22, levels.ts)
  if (hasLevels(track.road)) rememberLevels(road)
  return { road, jumps, from, main }
}

/**
 * Where (x, z) is on a track with branches: the road it is deepest inside (the main road, -1, or a
 * branch), the nearest point of that road and the way the road runs there
 */
export function placeOnTrack(
  road: readonly RoadPoint[],
  forks: readonly (readonly RoadPoint[])[],
  x: number,
  z: number,
  /** The car's height: at a crossing (2026-11-22), the road it is on */
  y?: number,
): { fork: number; index: number; dx: number; dz: number } {
  let fork = -1
  let best = roadDepth(road, true, x, z)
  forks.forEach((one, k) => {
    const depth = roadDepth(one, false, x, z)
    if (depth > best) {
      best = depth
      fork = k
    }
  })
  const points = fork < 0 ? road : forks[fork]!
  const index = nearestPoint(points, x, z, y)
  return { fork, index, ...pathDirection(points, index, fork < 0) }
}

/** The branch whose clear stretch (x, z) is on, or -1: the main road, or where they overlap */
export function forkAt(
  road: readonly RoadPoint[],
  forks: readonly (readonly RoadPoint[])[],
  x: number,
  z: number,
): number {
  if (roadDepth(road, true, x, z) > -1) return -1
  return forks.findIndex((fork) => roadDepth(fork, false, x, z) > -1)
}

const linesCache = new WeakMap<object, GateLine[][] | null>()

/** `gateLines` for a track, worked out once */
export function trackLines(track: {
  readonly gates: readonly Gate[]
  readonly respawns?: readonly Spot[]
  readonly forks?: readonly Fork[]
}): GateLine[][] | null {
  if (!track.forks || track.forks.length === 0 || !track.respawns) return null
  let lines = linesCache.get(track)
  if (lines === undefined) {
    lines = gateLines(track.gates, track.respawns, track.forks)
    linesCache.set(track, lines)
  }
  return lines
}

const roadForks = new WeakMap<object, readonly (readonly RoadPoint[])[]>()

/**
 * A track's branches, kept by its main road's own list of points (parseTrack does this), so that
 * whatever measures how far a place is off the road (scenery.ts's `roadClearance`: trees, houses,
 * boards) counts the branches as road too, without each caller having to pass them
 */
export function rememberForks(
  road: readonly RoadPoint[],
  paths: readonly (readonly RoadPoint[])[],
): void {
  if (paths.length > 0) roadForks.set(road, paths)
}

/** The branches remembered for a main road; undefined for a track without any */
export const forksOfRoad = (
  road: readonly RoadPoint[],
): readonly (readonly RoadPoint[])[] | undefined => roadForks.get(road)

/** A branch's whole centre line from its JSON: the main road's two points, as wide as it is there */
export function branchPath(road: readonly RoadPoint[], branch: BranchJson): RoadPoint[] {
  return [
    { ...road[branch.from]!, width: branch.road[0]!.width },
    ...branch.road,
    { ...road[branch.to]!, width: branch.road[branch.road.length - 1]!.width },
  ]
}

/**
 * For whoever lays a track with branches (a track's author, the editor's bypasses): the main gates
 * and their respawn points without those that touch a branch (gate 0, the finish line, always
 * stays), which parseBranches would refuse
 */
export function gatesClearOf(
  road: readonly RoadPoint[],
  gates: readonly Gate[],
  respawns: readonly Spot[],
  branches: readonly BranchJson[],
): { gates: Gate[]; respawns: Spot[] } {
  const paths = branches.map((branch) => branchPath(road, branch))
  const touches = (gate: Gate) =>
    gateSamples(gate).some((place) =>
      paths.some((path) => roadDepth(path, false, place.x, place.z) > -GATE_CLEAR - 1),
    )
  const count = road.length
  const across = (index: number) => {
    const point = road[index]!
    const { dx, dz } = pathDirection(road, index, true)
    return {
      gate: gateAcross(point.x, point.z, dx, dz, point.width / 2),
      respawn: {
        x: point.x,
        z: point.z,
        heading: Math.round(Math.atan2(dx, -dz) * 1e6) / 1e6,
      },
    }
  }
  const out: { gate: Gate; respawn: Spot; at: number }[] = []
  gates.forEach((gate, index) => {
    const at = nearestPoint(road, (gate.ax + gate.bx) / 2, (gate.az + gate.bz) / 2)
    if (index === 0 || !touches(gate)) {
      out.push({ gate, respawn: respawns[index]!, at })
      return
    }
    // Moved along the road to the nearest place clear of every branch, if there is one near
    for (let shift = 1; shift <= 12; shift++) {
      for (const way of [1, -1]) {
        const moved = (at + way * shift + count) % count
        const one = across(moved)
        if (touches(one.gate) || out.some((kept) => kept.at === moved)) continue
        out.push({ ...one, at: moved })
        return
      }
    }
  })
  // In driving order from the finish line, each at most once
  const [first, ...rest] = out
  rest.sort((a, b) => a.at - b.at)
  const ordered = [first!, ...rest].filter(
    (one, index, all) => index === 0 || one.at !== all[index - 1]!.at,
  )
  // Where moving them left a long gap (a long mouth), one more in the clear stretch between
  for (let index = 0; index < ordered.length; index++) {
    const from = ordered[index]!.at
    const to = index + 1 < ordered.length ? ordered[index + 1]!.at : count
    if (to - from <= GATE_GAP) continue
    const clear: number[] = []
    for (let at = from + 4; at <= to - 4; at++) if (!touches(across(at).gate)) clear.push(at)
    if (clear.length === 0) continue
    const at = clear.reduce((best, one) =>
      Math.abs(one - (from + to) / 2) < Math.abs(best - (from + to) / 2) ? one : best,
    )
    ordered.splice(index + 1, 0, { ...across(at), at })
  }
  return {
    gates: ordered.map((one) => one.gate),
    respawns: ordered.map((one) => one.respawn),
  }
}

/**
 * For a track's author: a branch's mouth on the main road, the main road points from the first whose
 * kerb on `side` (-1 left, 1 right) the branch has cut away to the first after it that is whole
 * again. A fence or a shed across the mouth stands along the kerb between them
 */
export function branchMouth(
  road: readonly RoadPoint[],
  path: readonly RoadPoint[],
  from: number,
  side: -1 | 1,
): [number, number] {
  let first = -1
  for (let index = from + 1; index < road.length; index++) {
    const point = road[index]!
    const { dx, dz } = pathDirection(road, index, true)
    const half = (side * point.width) / 2
    // The road's right, facing along it, is (-dz, dx)
    const inside = roadDepth(path, false, point.x - dz * half, point.z + dx * half) > -0.5
    if (inside && first < 0) first = index
    else if (!inside && first >= 0) return [first, index]
  }
  return [from + 1, from + 1]
}
