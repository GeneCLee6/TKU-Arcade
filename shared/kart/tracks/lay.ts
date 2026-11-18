// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): a second
// way to draw a circuit (docs/ARCHITECTURE.md §4.36). circuit.ts smooths hand-placed control points,
// which is right for a road that follows a place; a track designed corner by corner wants each
// corner's radius and angle to be exactly what was meant (a hairpin of 30 m is a different corner
// from one of 36 m), so here the road is laid like a turtle's path: straights and arcs from the
// start line, in driving order, sampled every few metres. Two of the straights are left to be
// fitted: their lengths are solved so that the loop closes on the line. The result is a list of
// circuit points, one per road point, which circuit.ts turns into a track as it does any other.
// Pure.
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
    }

type Extra = { height?: number; mark?: string; mid?: string }

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
  start: { heading?: number; width: number; height?: number },
): Laid {
  const turned = steps.reduce((sum, step) => sum + (step.kind === 'arc' ? step.degrees : 0), 0)
  if (Math.abs(Math.abs(turned) - 360) > 1e-6) {
    throw new Error(`lay: the steps turn ${turned} degrees, not a whole circle`)
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
    const hilly = start.height !== undefined || steps.some((step) => step.height !== undefined)
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
          const t = piece / pieces
          const [px, pz] = at(t)
          const ease = t * t * (3 - 2 * t)
          const w = Math.round((width + (toWidth - width) * t) * 10) / 10
          const point: CircuitPoint = hilly
            ? [px, pz, w, Math.round((height + (toHeight - height) * ease) * 100) / 100]
            : [px, pz, w]
          control.push(point)
        }
        if (step.mid) marks[step.mid] = at(0.5)
      }
      ;[x, z] = at(1)
      if (emit && step.mark) marks[step.mark] = [x, z]
      if (step.kind === 'arc') heading += step.degrees * RAD
      width = toWidth
      height = toHeight
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
