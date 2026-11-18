// 2026-11-18 (owner: "the maps should be more fun, not so many straights ... technical"): what the
// hand-drawn tracks share, now that all of them are redrawn (docs/ARCHITECTURE.md §4.33). A circuit
// is its control points (spline.ts), each with a width and, on a track with hills, a height; from
// them come the road from the line on, the gates and respawns, a grid of eight, the jumps' ramps,
// rows of item boxes and the boost pads. Pure.
import type { Spot } from '../course.ts'
import type { Wall } from '../walls.ts'
import {
  gatesAlong,
  headingOf,
  padsAlong,
  roadDirection,
  type BoostPad,
  type Gate,
  type RoadPoint,
} from '../track.ts'

/** [x, z, width] or [x, z, width, height]: the middle of the road, in driving order */
export type CircuitPoint = readonly [number, number, number, number?]

export interface CircuitPlan {
  readonly control: readonly CircuitPoint[]
  /** Metres between road points */
  readonly sample?: number
  /** The start and finish line is at the road point nearest this */
  readonly line: readonly [number, number]
  /**
   * Jumps: a ramp up to a lip at the road point nearest each place, `height` metres over the road
   * (terrain.ts); the road must have heights
   */
  readonly jumps?: readonly (readonly [x: number, z: number, height: number])[]
  /** Boost pads: at the road point nearest each place, `across` metres right of the middle */
  readonly pads?: readonly (readonly [x: number, z: number, across: number])[]
  /** Rows of item boxes: across the road at the point nearest each place, metres right of the middle */
  readonly boxes?: readonly (readonly [x: number, z: number, offsets: readonly number[]])[]
  /**
   * An island of walls down the one stretch of road that is `from` metres wide or wider, between
   * `inner` and `outer` metres right of the middle (negative: left): two lanes, one of them a
   * shortcut (2026-11-18, as the old street's stall island is; walls.ts)
   */
  readonly island?: { readonly from: number; readonly inner: number; readonly outer: number }
}

export interface Circuit {
  readonly road: RoadPoint[]
  readonly gates: Gate[]
  readonly respawns: Spot[]
  readonly grid: Spot[]
  readonly jumps: number[]
  readonly boostPads: BoostPad[]
  readonly itemBoxes: { x: number; z: number }[]
  /** The island's walls, a closed loop; none without one */
  readonly walls: Wall[]
  /** The road point nearest (x, z) */
  nearest(x: number, z: number): number
  /** The place `across` metres right of road point `index` (negative: left) */
  across(index: number, across: number): { x: number; z: number }
}

/** Places on the grid: a full room */
export const GRID_PLACES = 8
/** Road points between gates */
const GATE_EVERY = 7

const round = (value: number) => Math.round(value * 100) / 100

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  )
}

/** The closed road through `control`, a point about every `sample` m; heights only if any is given */
export function circuitRoad(control: readonly CircuitPoint[], sample: number): RoadPoint[] {
  const hilly = control.some((point) => point[3] !== undefined)
  const points: RoadPoint[] = []
  const count = control.length
  for (let index = 0; index < count; index++) {
    const a = control[(index - 1 + count) % count]!
    const b = control[index]!
    const c = control[(index + 1) % count]!
    const d = control[(index + 2) % count]!
    const pieces = Math.max(1, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / sample))
    for (let piece = 0; piece < pieces; piece++) {
      const t = piece / pieces
      const x = round(catmullRom(a[0], b[0], c[0], d[0], t))
      const z = round(catmullRom(a[1], b[1], c[1], d[1], t))
      const width = Math.round((b[2] + (c[2] - b[2]) * t) * 10) / 10
      if (!hilly) {
        points.push({ x, z, width })
        continue
      }
      // Heights ease from one control point to the next: never over or under either
      const ease = t * t * (3 - 2 * t)
      points.push({ x, z, width, y: round((b[3] ?? 0) + ((c[3] ?? 0) - (b[3] ?? 0)) * ease) })
    }
  }
  return points
}

export function circuit(plan: CircuitPlan): Circuit {
  const drawn = circuitRoad(plan.control, plan.sample ?? 6)
  const near = (road: readonly RoadPoint[], x: number, z: number) => {
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
  // The road starts at the line, so that gate 0 is the finish
  const start = near(drawn, plan.line[0], plan.line[1])
  const road = [...drawn.slice(start), ...drawn.slice(0, start)]
  const count = road.length
  const nearest = (x: number, z: number) => near(road, x, z)
  const across = (index: number, metres: number) => {
    const at = ((index % count) + count) % count
    const point = road[at]!
    const { dx, dz } = roadDirection(road, at)
    // The road's right, facing along it, is (-dz, dx)
    return { x: round(point.x - dz * metres), z: round(point.z + dx * metres) }
  }

  // Each jump: the two road points up to the lip raised into a ramp (hillArt.ts draws it so)
  const jumps: number[] = []
  for (const [x, z, height] of plan.jumps ?? []) {
    const lip = nearest(x, z)
    const before = (lip - 1 + count) % count
    road[before] = { ...road[before]!, y: round((road[before]!.y ?? 0) + height / 2) }
    road[lip] = { ...road[lip]!, y: round((road[lip]!.y ?? 0) + height) }
    jumps.push(lip)
  }

  // Two by two behind the line, 7 m apart, staggered, along the road: the pole first
  const grid: Spot[] = []
  for (let slot = 0; slot < GRID_PLACES; slot++) {
    let back = 10 + Math.floor(slot / 2) * 7 + (slot % 2) * 3.5
    let index = 0
    for (;;) {
      const a = road[(index - 1 + count) % count]!
      const b = road[(index + count) % count]!
      const span = Math.hypot(b.x - a.x, b.z - a.z)
      if (span >= back) {
        const t = back / span
        const dx = (b.x - a.x) / span
        const dz = (b.z - a.z) / span
        const side = slot % 2 === 0 ? -4 : 4
        grid.push({
          x: round(b.x - dx * span * t - dz * side),
          z: round(b.z - dz * span * t + dx * side),
          heading: Math.round(headingOf({ dx, dz }) * 1e6) / 1e6,
        })
        break
      }
      back -= span
      index--
    }
  }

  // The island: along both its edges, closed by a pointed nose one road point beyond each end,
  // in the middle of it, so that a kart meeting it head-on glances off into a lane
  const walls: Wall[] = []
  if (plan.island) {
    const { from, inner, outer } = plan.island
    const first = road.findIndex((point) => point.width >= from)
    if (first > 0) {
      let last = first
      while (last + 1 < count && road[last + 1]!.width >= from) last++
      const near: { x: number; z: number }[] = []
      const far: { x: number; z: number }[] = []
      for (let index = first; index <= last; index++) {
        near.push(across(index, inner))
        far.push(across(index, outer))
      }
      const middle = (inner + outer) / 2
      const outline = [
        across(first - 1, middle),
        ...near,
        across(last + 1, middle),
        ...far.reverse(),
      ]
      outline.forEach((a, index) => {
        const b = outline[(index + 1) % outline.length]!
        walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z })
      })
    }
  }

  const { gates, respawns } = gatesAlong(road, GATE_EVERY)
  return {
    road,
    gates,
    respawns,
    grid,
    jumps,
    boostPads: padsAlong(
      road,
      (plan.pads ?? []).map(([x, z, metres]) => [nearest(x, z), metres] as const),
    ),
    itemBoxes: (plan.boxes ?? []).flatMap(([x, z, offsets]) => {
      const index = nearest(x, z)
      return offsets.map((offset) => across(index, offset))
    }),
    walls,
    nearest,
    across,
  }
}
