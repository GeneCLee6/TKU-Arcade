// The way the hand-written tracks are drawn (J5, N1): a few control points smoothed by a closed
// Catmull-Rom spline, sampled about every `sample` metres into the track format's road points.
// build-track.ts makes the same kind of road from a Blender scene's `road.NNN` empties.
import type { RoadPoint } from '../track.ts'

/** [x, z, width]: a point on the line through the middle of the road, in driving order */
export type ControlPoint = readonly [number, number, number]

/** A point `t` (0 to 1) of the way from b to c, with a and d shaping the curve */
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  )
}

/** The closed road through `control`, a point about every `sample` m, widths blended between */
export function splineRoad(control: readonly ControlPoint[], sample: number): RoadPoint[] {
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
      points.push({
        x: Math.round(catmullRom(a[0], b[0], c[0], d[0], t) * 100) / 100,
        z: Math.round(catmullRom(a[1], b[1], c[1], d[1], t) * 100) / 100,
        width: Math.round((b[2] + (c[2] - b[2]) * t) * 10) / 10,
      })
    }
  }
  return points
}
