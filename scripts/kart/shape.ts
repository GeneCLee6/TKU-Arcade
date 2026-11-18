// 2026-11-18 (owner: "the maps should be more fun, not so many straights ... technical"): how much
// of a lap is straight, measured on the road itself (docs/KART-FEEL.md §10). A stretch counts as
// straight where the centre line's radius, smoothed over five road points, is wider than
// STRAIGHT_RADIUS (at racing speed the grip alone holds that line with the stick barely moved) for
// STRAIGHT_RUN metres or more: the moment between two esses where the road stops turning one way
// and starts turning the other is not a straight.
// scripts/kart-feel.ts prints it for every built-in track; tests/kart/technical.test.ts pins it.
import type { RoadPoint } from '../../shared/kart/track.ts'

/** A bend wider than this, metres, drives as a straight */
export const STRAIGHT_RADIUS = 150
/** ... once it runs on for this long, metres */
export const STRAIGHT_RUN = 50

export interface RoadShape {
  /** The whole loop, metres */
  readonly length: number
  /** The share of the loop that drives as a straight, 0 to 1 */
  readonly straightShare: number
  /** The longest unbroken straight, metres */
  readonly longestStraight: number
  /** How many times the road changes the way it turns (left to right or back) in a lap */
  readonly flips: number
}

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** The road's curvature at each point (1/m, positive to the right), smoothed over five points */
export function curvatures(road: readonly RoadPoint[]): { curve: number[]; step: number[] } {
  const n = road.length
  const at = (index: number) => road[((index % n) + n) % n]!
  const heading = (index: number) => {
    const a = at(index)
    const b = at(index + 1)
    return Math.atan2(b.x - a.x, -(b.z - a.z))
  }
  const step = road.map((_, index) => {
    const a = at(index)
    const b = at(index + 1)
    return Math.hypot(b.x - a.x, b.z - a.z)
  })
  const turns = road.map((_, index) => wrap(heading(index) - heading(index - 1)))
  const curve = road.map((_, index) => {
    let turned = 0
    let run = 0
    for (let near = index - 2; near <= index + 2; near++) {
      const k = ((near % n) + n) % n
      turned += turns[k]!
      run += (step[(k - 1 + n) % n]! + step[k]!) / 2
    }
    return run > 0 ? turned / run : 0
  })
  return { curve, step }
}

export function roadShape(road: readonly RoadPoint[]): RoadShape {
  const n = road.length
  const { curve, step } = curvatures(road)
  const gentle = curve.map((k) => Math.abs(k) < 1 / STRAIGHT_RADIUS)
  const length = step.reduce((sum, s) => sum + s, 0)
  // Runs of gentle road, begun where the road bends so that the loop's seam cuts none in two
  let start = gentle.findIndex((is) => !is)
  if (start < 0) start = 0
  let straightLength = 0
  let longest = 0
  let run = 0
  let flips = 0
  let way = 0
  const close = () => {
    if (run >= STRAIGHT_RUN) straightLength += run
    longest = Math.max(longest, run)
    run = 0
  }
  for (let i = 0; i < n; i++) {
    const index = (start + i) % n
    if (gentle[index]) run += step[index]!
    else {
      close()
      const here = Math.sign(curve[index]!)
      if (way !== 0 && here !== way) flips++
      way = here
    }
  }
  close()
  return { length, straightShare: straightLength / length, longestStraight: longest, flips }
}
