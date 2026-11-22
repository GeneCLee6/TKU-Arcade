// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): a second
// way to draw a circuit (docs/ARCHITECTURE.md §4.37). circuit.ts smooths hand-placed control points,
// which is right for a road that follows a place; a track designed corner by corner wants each
// corner's radius and angle to be exactly what was meant (a hairpin of 30 m is a different corner
// from one of 36 m), so here the road is laid like a turtle's path: straights and arcs from the
// start line, in driving order, sampled every few metres. Two of the straights are left to be
// fitted: their lengths are solved so that the loop closes on the line. The result is a list of
// circuit points, one per road point, which circuit.ts turns into a track as it does any other.
// Pure.
import type { RoadPoint } from '../track.ts'
import type { CircuitPoint } from './circuit.ts'

export type Lay =
  | {
      readonly kind: 'line'
      readonly length: number
      /** The road's width at the end of the step: it changes evenly along it */
      readonly width: number
      /** The road's height at the end of the step: eased along it */
      readonly height?: number
      /** Its length is solved for, so that the loop closes: exactly two steps of a plan */
      readonly fit?: boolean
      /** A name for the place at its end, or (`mid`) half-way along it */
      readonly mark?: string
      readonly mid?: string
      /** How far the road leans at the end of the step, degrees (levels.ts): eased along it */
      readonly bank?: number
    }
  | {
      readonly kind: 'arc'
      /** Degrees turned: positive to the right */
      readonly degrees: number
      readonly radius: number
      readonly width: number
      readonly height?: number
      readonly mark?: string
      readonly mid?: string
      readonly bank?: number
    }

type Extra = { height?: number; mark?: string; mid?: string; bank?: number }

export const line = (length: number, width: number, extra: Extra = {}): Lay => ({
  kind: 'line',
  length,
  width,
  ...extra,
})
/** A straight whose length is solved for (the number is only where the search starts) */
export const fitted = (width: number, extra: Extra = {}): Lay => ({
  kind: 'line',
  length: 0,
  width,
  fit: true,
  ...extra,
})
export const right = (degrees: number, radius: number, width: number, extra: Extra = {}): Lay => ({
  kind: 'arc',
  degrees,
  radius,
  width,
  ...extra,
})
export const left = (degrees: number, radius: number, width: number, extra: Extra = {}): Lay =>
  right(-degrees, radius, width, extra)

export interface Laid {
  /** One per road point (pass to circuit.ts with the same `sample`) */
  readonly control: CircuitPoint[]
  /** The named places */
  readonly marks: Readonly<Record<string, readonly [number, number]>>
  /** The lengths the two fitted straights came to, in order */
  readonly fits: readonly number[]
}

/** Metres between road points */
export const LAY_SAMPLE = 6
/** A fitted straight is never shorter than this, metres */
const FIT_LEAST = 12

const RAD = Math.PI / 180

/**
 * The closed road laid from (0, 0), first heading `heading` degrees (0 faces -z, clockwise), that
 * starts `width` wide and `height` high. Throws if the steps do not turn a whole circle, or the two
 * fitted straights cannot close the loop
 */
export function lay(
  steps: readonly Lay[],
  /**
   * `eight` (2026-11-22): a figure of eight, whose turns add up to none (its road runs over itself,
   * levels.ts), not to a whole circle
   */
  start: { heading?: number; width: number; height?: number; eight?: boolean },
): Laid {
  const turned = steps.reduce((sum, step) => sum + (step.kind === 'arc' ? step.degrees : 0), 0)
  if (Math.abs(Math.abs(turned) - (start.eight ? 0 : 360)) > 1e-6) {
    throw new Error(`lay: the steps turn ${turned} degrees, not ${start.eight ? 'none' : 'a whole circle'}`)
  }
  const free = steps.flatMap((step, index) => (step.kind === 'line' && step.fit ? [index] : []))
  if (free.length !== 2) throw new Error('lay: exactly two straights are fitted')

  const run = (lengths: readonly [number, number], emit: boolean) => {
    const control: CircuitPoint[] = []
    const marks: Record<string, readonly [number, number]> = {}
    let x = 0
    let z = 0
    let heading = (start.heading ?? 0) * RAD
    let width = start.width
    let height = start.height ?? 0
    let bank = 0
    const hilly = start.height !== undefined || steps.some((step) => step.height !== undefined)
    const banked = steps.some((step) => step.bank !== undefined)
    steps.forEach((step, index) => {
      const toWidth = step.width
      const toHeight = step.height ?? height
      const toBank = step.bank ?? bank
      const fit = free.indexOf(index)
      const length =
        step.kind === 'line'
          ? fit >= 0
            ? lengths[fit]!
            : step.length
          : Math.abs(step.degrees) * RAD * step.radius
      const pieces = Math.max(1, Math.round(length / LAY_SAMPLE))
      const fromX = x
      const fromZ = z
      const fromHeading = heading
      const at = (t: number): [number, number] => {
        if (step.kind === 'line') {
          return [
            fromX + Math.sin(fromHeading) * length * t,
            fromZ - Math.cos(fromHeading) * length * t,
          ]
        }
        const way = Math.sign(step.degrees)
        const centreX = fromX + way * step.radius * Math.cos(fromHeading)
        const centreZ = fromZ + way * step.radius * Math.sin(fromHeading)
        const now = fromHeading + step.degrees * RAD * t
        return [
          centreX - way * step.radius * Math.cos(now),
          centreZ - way * step.radius * Math.sin(now),
        ]
      }
      if (emit) {
        for (let piece = 0; piece < pieces; piece++) {
          const t = piece / pieces
          const [px, pz] = at(t)
          const ease = t * t * (3 - 2 * t)
          const w = Math.round((width + (toWidth - width) * t) * 10) / 10
          const point: CircuitPoint = hilly
            ? [px, pz, w, Math.round((height + (toHeight - height) * ease) * 100) / 100]
            : [px, pz, w]
          // A banked bend (2026-11-22): its lean, eased as the height is
          control.push(
            banked
              ? [point[0], point[1], point[2], point[3], Math.round((bank + (toBank - bank) * ease) * 10) / 10]
              : point,
          )
        }
        if (step.mid) marks[step.mid] = at(0.5)
      }
      ;[x, z] = at(1)
      if (emit && step.mark) marks[step.mark] = [x, z]
      if (step.kind === 'arc') heading += step.degrees * RAD
      width = toWidth
      height = toHeight
      bank = toBank
    })
    return { control, marks, x, z, height }
  }

  // The end's place is linear in the two fitted lengths: three runs give the 2 by 2 system
  const base = run([0, 0], false)
  const one = run([1, 0], false)
  const two = run([0, 1], false)
  const ax = one.x - base.x
  const az = one.z - base.z
  const bx = two.x - base.x
  const bz = two.z - base.z
  const det = ax * bz - az * bx
  if (Math.abs(det) < 1e-6) throw new Error('lay: the two fitted straights are parallel')
  const first = (-base.x * bz + base.z * bx) / det
  const second = (-ax * base.z + az * base.x) / det
  if (first < FIT_LEAST || second < FIT_LEAST) {
    throw new Error(
      `lay: the loop does not close (the fitted straights come to ${first.toFixed(1)} and ${second.toFixed(1)} m)`,
    )
  }
  const laid = run([first, second], true)
  if (Math.abs(laid.height - (start.height ?? 0)) > 1e-6) {
    throw new Error(`lay: the road ends ${laid.height} m high, not where it began`)
  }
  return { control: laid.control, marks: laid.marks, fits: [first, second] }
}

/** A branch laid (2026-11-20, shared/kart/branches.ts): its own road points, and its named places */
export interface LaidBranch {
  /** Between the two main road points, which are left out (a branch's JSON `road`) */
  readonly road: RoadPoint[]
  readonly marks: Readonly<Record<string, readonly [number, number]>>
  readonly fits: readonly number[]
}

/**
 * A branch laid like a loop (2026-11-20): from main road point `from`, facing the way the road runs
 * there, step by step, two straights fitted so that it ends on main road point `to`. It begins
 * `width` wide and as high as the road at `from`, and must end as high as the road at `to`. Throws
 * if the fitted straights cannot reach it
 */
export function layBranch(
  road: readonly RoadPoint[],
  from: number,
  to: number,
  steps: readonly Lay[],
  width: number,
): LaidBranch {
  const free = steps.flatMap((step, index) => (step.kind === 'line' && step.fit ? [index] : []))
  if (free.length !== 2) throw new Error('layBranch: exactly two straights are fitted')
  const start = road[from]!
  const end = road[to]!
  const count = road.length
  const before = road[(from - 1 + count) % count]!
  const after = road[(from + 1) % count]!
  const startHeading = Math.atan2(after.x - before.x, -(after.z - before.z))
  const hilly = road.some((point) => point.y !== undefined)
  const run = (lengths: readonly [number, number], emit: boolean) => {
    const points: RoadPoint[] = []
    const marks: Record<string, readonly [number, number]> = {}
    let x = start.x
    let z = start.z
    let heading = startHeading
    let w = width
    let height = start.y ?? 0
    steps.forEach((step, index) => {
      const toWidth = step.width
      const toHeight = step.height ?? height
      const fit = free.indexOf(index)
      const length =
        step.kind === 'line'
          ? fit >= 0
            ? lengths[fit]!
            : step.length
          : Math.abs(step.degrees) * RAD * step.radius
      const pieces = Math.max(1, Math.round(length / LAY_SAMPLE))
      const fromX = x
      const fromZ = z
      const fromHeading = heading
      const at = (t: number): [number, number] => {
        if (step.kind === 'line') {
          return [
            fromX + Math.sin(fromHeading) * length * t,
            fromZ - Math.cos(fromHeading) * length * t,
          ]
        }
        const way = Math.sign(step.degrees)
        const centreX = fromX + way * step.radius * Math.cos(fromHeading)
        const centreZ = fromZ + way * step.radius * Math.sin(fromHeading)
        const now = fromHeading + step.degrees * RAD * t
        return [
          centreX - way * step.radius * Math.cos(now),
          centreZ - way * step.radius * Math.sin(now),
        ]
      }
      if (emit) {
        for (let piece = 0; piece < pieces; piece++) {
          // The branch's first point is the main road's own: left out
          if (index === 0 && piece === 0) continue
          const t = piece / pieces
          const [px, pz] = at(t)
          const ease = t * t * (3 - 2 * t)
          const pw = Math.round((w + (toWidth - w) * t) * 10) / 10
          const point: RoadPoint = hilly
            ? {
                x: Math.round(px * 100) / 100,
                z: Math.round(pz * 100) / 100,
                width: pw,
                y: Math.round((height + (toHeight - height) * ease) * 100) / 100,
              }
            : { x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100, width: pw }
          points.push(point)
        }
        if (step.mid) marks[step.mid] = at(0.5)
      }
      ;[x, z] = at(1)
      if (emit && step.mark) marks[step.mark] = [x, z]
      if (step.kind === 'arc') heading += step.degrees * RAD
      w = toWidth
      height = toHeight
    })
    return { points, marks, x, z, height }
  }
  const base = run([0, 0], false)
  const one = run([1, 0], false)
  const two = run([0, 1], false)
  const ax = one.x - base.x
  const az = one.z - base.z
  const bx = two.x - base.x
  const bz = two.z - base.z
  const det = ax * bz - az * bx
  if (Math.abs(det) < 1e-6) throw new Error('layBranch: the two fitted straights are parallel')
  const tx = end.x - base.x
  const tz = end.z - base.z
  const first = (tx * bz - tz * bx) / det
  const second = (ax * tz - az * tx) / det
  if (first < 1 || second < 1) {
    throw new Error(
      `layBranch: cannot reach road point ${to} (the fitted straights come to ${first.toFixed(1)} and ${second.toFixed(1)} m)`,
    )
  }
  const laid = run([first, second], true)
  if (Math.abs(laid.height - (end.y ?? 0)) > 1e-6) {
    throw new Error(`layBranch: ends ${laid.height} m high, not ${end.y ?? 0}`)
  }
  return { road: laid.points, marks: laid.marks, fits: [first, second] }
}

/**
 * A branch round the inside of a hairpin (2026-11-20): from main road point `from`, where a turn of
 * 180° begins, to `to`, where it ends, a road that peels off the main road's centre line towards the
 * turn's centre, runs round it `inner` metres from the centre, and peels back, easing in and out over
 * `ease` radians at each end. `width` wide, as high as the road. Its own points only (a branch's
 * JSON `road`), about LAY_SAMPLE apart
 */
export function layInside(
  road: readonly RoadPoint[],
  from: number,
  to: number,
  inner: number,
  width: number,
  ease = Math.PI / 4,
): RoadPoint[] {
  const start = road[from]!
  const end = road[to]!
  const centre = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }
  const outer = Math.hypot(start.x - centre.x, start.z - centre.z)
  const count = road.length
  const next = road[(from + 1) % count]!
  // Which way round: the way the road goes on from `from`
  const a0 = Math.atan2(start.z - centre.z, start.x - centre.x)
  const way = Math.sign(
    (start.x - centre.x) * (next.z - start.z) - (start.z - centre.z) * (next.x - start.x),
  )
  const steps = Math.max(8, Math.round((Math.PI * (inner + outer)) / 2 / LAY_SAMPLE))
  const points: RoadPoint[] = []
  for (let step = 1; step < steps; step++) {
    const share = step / steps
    const angle = a0 + way * Math.PI * share
    const into = Math.min(1, (Math.PI * share) / ease, (Math.PI * (1 - share)) / ease)
    const smooth = into * into * (3 - 2 * into)
    const radius = outer - (outer - inner) * smooth
    const y = (start.y ?? 0) + ((end.y ?? 0) - (start.y ?? 0)) * share
    const point = {
      x: Math.round((centre.x + Math.cos(angle) * radius) * 100) / 100,
      z: Math.round((centre.z + Math.sin(angle) * radius) * 100) / 100,
      width,
    }
    points.push(start.y === undefined && end.y === undefined ? point : { ...point, y })
  }
  return points
}
