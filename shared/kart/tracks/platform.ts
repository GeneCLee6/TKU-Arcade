// 2026-11-23 (owner: "more high-platform shortcuts that take technique and enough speed"; shared/
// kart/ledges.ts): what a track's author lays a high platform with. The pattern every built-in one
// follows: a straight that ends in a jump lip, the road then swinging off round a block (a warehouse,
// a pier, a shed, a row of roofs) and back onto the same line (`blockDetour`), and the platform
// straight on from the lip over the block, down again where the road comes back (`straightPlatform`).
// The detour is the long way; the platform the short one, for whoever is fast enough off the lip.
// Pure.
import { mainHeightAt, platformRoad } from '../ledges.ts'
import type { BranchJson } from '../branches.ts'
import { roadDirection, type RoadPoint } from '../track.ts'
import { left, line, right, type Lay } from './lay.ts'

/**
 * The road round a block and back: a quarter turn to `side` (-1 left, 1 right) round `radius`, `out`
 * metres away from its line, a quarter turn back, `along` metres beside the block, a quarter turn
 * in, `out` + `shift` metres back, a quarter turn on: it goes on along its line moved `shift` metres
 * the other way from `side` (0: the same line), 4 × radius + along metres further on. A platform
 * beside it on that side saves 2π·radius − 4·radius + 2·out + shift of them. `mark` names the end
 * of its last corner (`${mark}Back`)
 */
export function blockDetour(
  side: -1 | 1,
  radius: number,
  out: number,
  along: number,
  width: number,
  mark: string,
  extra: { readonly mid?: string; readonly shift?: number } = {},
): Lay[] {
  const away = side < 0 ? left : right
  const back = side < 0 ? right : left
  return [
    away(90, radius, width),
    line(out, width),
    back(90, radius, width),
    line(along, width, extra.mid ? { mid: extra.mid } : {}),
    back(90, radius, width),
    line(out + (extra.shift ?? 0), width),
    away(90, radius, width, { mark: `${mark}Back` }),
  ]
}

/** A gap across a platform: a jump lip, a drop into a pit, and a ramp back up out of it */
export interface PlatformGap {
  /** Metres along the platform from the face where the lip is */
  readonly at: number
  /** How long the pit's floor is, and how deep, metres */
  readonly length: number
  readonly depth: number
}

/**
 * A kink on a platform: it steps `shift` metres sideways (+ right) over `length` metres from `at`
 * metres past the face
 */
export interface PlatformKink {
  readonly at: number
  readonly length: number
  readonly shift: number
}

export interface StraightPlatform {
  /** The platform's width, metres */
  readonly width: number
  /**
   * Metres along the line from the lip to the face, and how far right of the line (+; left −) the
   * platform runs: the road the lip is on runs on straight beside it, so that a kart that only
   * jumps comes down on its own road, and the one that means to reach the platform leaves the lip
   * slanting towards it
   */
  readonly face: number
  readonly side: number
  /** Past the face, over how many metres it eases round to run along the line (left out: 30) */
  readonly bend?: number
  /**
   * Over how many metres before `to` it swings back onto the line; 0 when the road comes back on
   * the platform's own line (blockDetour's `shift`), and the platform ends in a drop onto it
   */
  readonly merge: number
  /** The platform's height */
  readonly top: number
  /** Metres before the branch's end where the way down begins, and how long it is */
  readonly downAt: number
  readonly down: number
  readonly gaps?: readonly PlatformGap[]
  readonly kinks?: readonly PlatformKink[]
  /** The branch is this wide where it lies over the main road before its face; `width` if left out */
  readonly mouth?: number
  /**
   * ... and this wide past its drop, where it lies over the main road again (left out: `width`): a
   * narrow end, so that a kart beside it on the main road is taken to be on the main road
   */
  readonly end?: number
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * A platform straight on from main road point `from` (a jump lip) to `to`, where the road has come
 * back onto the same line: its road points about `sample` metres apart, the face `face` metres on,
 * the platform `top` high (gaps and kinks on it as asked), then down again to the road's height by
 * `downAt` metres before `to`. The branch's JSON: its points, its own jump lips (the gaps'), its `rise`
 */
export function straightPlatform(
  road: readonly RoadPoint[],
  from: number,
  to: number,
  plan: StraightPlatform,
  sample = 6,
): BranchJson {
  const a = road[from]!
  const b = road[to]!
  // Along the road's line at the lip; the road comes back on it, or `side` and the bend's run off it
  const { dx, dz } = roadDirection(road, from)
  const length = (b.x - a.x) * dx + (b.z - a.z) * dz
  // Straight from the lip to the face (the line a flight takes), then easing round over `bend`
  // metres to run along the road's line again: `side` and half the bend's sideways run off it
  const slope = plan.side / plan.face
  const bend = plan.bend ?? 30
  const offLine = plan.side + (slope * bend) / 2
  const kinks: PlatformKink[] = [
    ...(plan.kinks ?? []).map((kink) => ({ ...kink, at: plan.face + bend + kink.at })),
    ...(plan.merge > 0 ? [{ at: length - plan.merge, length: plan.merge - 3, shift: -offLine }] : []),
  ]
  const shiftAt = (d: number) => {
    let shift =
      d <= plan.face
        ? slope * d
        : d <= plan.face + bend
          ? plan.side + slope * (d - plan.face) - (slope * (d - plan.face) ** 2) / (2 * bend)
          : offLine
    for (const kink of kinks) {
      if (d <= kink.at) continue
      const t = Math.min(1, (d - kink.at) / kink.length)
      shift += kink.shift * (t * t * (3 - 2 * t))
    }
    return shift
  }
  // Where it comes down, the road's height under the end of the way down
  const endAt = length - plan.downAt
  const low = mainHeightAt(road, a.x + dx * endAt, a.z + dz * endAt)
  const heightAt = (d: number): { y: number; lip: boolean } => {
    const fromEnd = length - d
    if (fromEnd <= plan.downAt) return { y: low, lip: false }
    if (fromEnd <= plan.downAt + plan.down) {
      return { y: low + (plan.top - low) * ((fromEnd - plan.downAt) / plan.down), lip: false }
    }
    for (const gap of plan.gaps ?? []) {
      const start = plan.face + gap.at
      const floor = start + gap.length
      const climb = (gap.depth / 0.35)
      if (d > start && d <= floor) return { y: plan.top - gap.depth, lip: false }
      if (d > floor && d < floor + climb) {
        return { y: plan.top - gap.depth * (1 - (d - floor) / climb), lip: false }
      }
    }
    return { y: plan.top, lip: false }
  }
  const lips = new Set((plan.gaps ?? []).map((gap) => plan.face + gap.at))
  const pieces = Math.max(2, Math.round(length / sample))
  const step = length / pieces
  const points: RoadPoint[] = []
  const jumps: number[] = []
  let face = -1
  for (let k = 1; k < pieces; k++) {
    const d = step * k
    // A gap's lip and the face fall on a road point of their own (a sample too near after one
    // is left out: the face's head goes in 0.6 m past its foot)
    let crowded = false
    for (const at of [...lips, plan.face]) {
      if (at > step * (k - 1) && at <= d && at > 0.5) {
        if (d - at < (at === plan.face ? 1.4 : 0.8)) crowded = true
        // ... and so is the sample just before it
        if (at - step * (k - 1) < 0.6 && k > 1) points.pop()
        const shift = shiftAt(at)
        const level = at === plan.face ? 0 : heightAt(at).y
        if (lips.has(at)) jumps.push(points.length)
        if (at === plan.face) face = points.length + 1
        points.push({
          x: round(a.x + dx * at - dz * shift),
          z: round(a.z + dz * at + dx * shift),
          width: plan.width,
          y: round(at === plan.face ? 0 : level),
        })
      }
    }
    if (crowded) continue
    const shift = shiftAt(d)
    const over = d < plan.face || length - d <= plan.downAt
    const x = a.x + dx * d - dz * shift
    const z = a.z + dz * d + dx * shift
    points.push({
      x: round(x),
      z: round(z),
      width:
        d < plan.face
          ? (plan.mouth ?? plan.width)
          : over
            ? (plan.end ?? plan.width)
            : plan.width,
      // Over the main road, its height
      y: round(length - d <= plan.downAt ? mainHeightAt(road, x, z) : d < plan.face ? 0 : heightAt(d).y),
    })
  }
  if (face < 0) throw new Error('straightPlatform: the face is not on the branch')
  // Ending in a drop (no way down): its last high point is a lip
  if (plan.down === 0) {
    const last = points.findLastIndex((point) => (point.y ?? 0) >= plan.top - 0.01)
    if (last > 0) jumps.push(last)
  }
  // The face's foot is the point put in at it; the platform begins with the next
  const raised = platformRoad(road, points, face)
  // A gap's lip after the face moved one on with the face's head put in
  return {
    from,
    to,
    road: raised.road,
    rise: raised.rise,
    ...(jumps.length > 0 ? { jumps: jumps.map((index) => (index >= raised.rise ? index + 1 : index)) } : {}),
  }
}
