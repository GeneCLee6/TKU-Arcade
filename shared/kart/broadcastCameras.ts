// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): the roadside cameras a race broadcast cuts
// to, worked out from the track itself so that every track (an editor's too) has them. A camera
// stands on the outside of each of the sharpest bends, back from the kerb and up on a pole, where a
// kart sweeps round towards it and away; one more stands beside the finish line, a little past it,
// for the crossing. Pure: the director (broadcast.ts) picks one, src/kart/broadcastShots.ts aims it.
import type { Track } from './track.ts'

export interface TracksideCamera {
  readonly x: number
  readonly z: number
  /** Metres over the road where it stands (the road's own height added where the track has one) */
  readonly y: number
  /** The finish line's camera */
  readonly finish: boolean
}

/** At most this many bend cameras on a track (the finish's comes on top) */
export const MAX_BEND_CAMERAS = 6
/** A bend's camera stands this far beyond the kerb, metres, and this high */
export const CAMERA_SETBACK = 7
export const CAMERA_HEIGHT = 4.2
/** A bend counts when the road turns at least this much over BEND_SPAN either side, radians */
export const MIN_BEND = 0.55
const BEND_SPAN = 18
/** Two cameras no nearer than this along the road, metres */
export const CAMERA_SPACING = 70
/** The finish's camera: this far past the line, this far beyond the kerb, metres */
const FINISH_PAST = 9
const FINISH_SETBACK = 5

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** The road's cameras: the sharpest bends' first, spaced out along it, then the finish's */
export function tracksideCameras(
  track: Pick<Track, 'road' | 'gates' | 'respawns'>,
): TracksideCamera[] {
  const road = track.road
  const count = road.length
  const cameras: TracksideCamera[] = []
  if (count >= 3) {
    // Distance along the road at each point
    const along: number[] = [0]
    for (let i = 1; i <= count; i++) {
      const a = road[i - 1]!
      const b = road[i % count]!
      along.push(along[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z))
    }
    const total = along[count]!
    /** The point `metres` along from point `i` (either way), round the loop */
    const pointAt = (i: number, metres: number) => {
      let j = i
      let left = Math.abs(metres)
      const step = metres >= 0 ? 1 : -1
      for (let guard = 0; guard < count && left > 0; guard++) {
        const a = road[((j % count) + count) % count]!
        const b = road[(((j + step) % count) + count) % count]!
        left -= Math.hypot(b.x - a.x, b.z - a.z)
        j += step
      }
      return road[((j % count) + count) % count]!
    }
    const bends: { i: number; turn: number }[] = []
    for (let i = 0; i < count; i++) {
      const here = road[i]!
      const before = pointAt(i, -BEND_SPAN)
      const after = pointAt(i, BEND_SPAN)
      const inHeading = Math.atan2(here.x - before.x, -(here.z - before.z))
      const outHeading = Math.atan2(after.x - here.x, -(after.z - here.z))
      const turn = wrap(outHeading - inHeading)
      if (Math.abs(turn) >= MIN_BEND) bends.push({ i, turn })
    }
    bends.sort((a, b) => Math.abs(b.turn) - Math.abs(a.turn))
    const chosen: number[] = []
    const gap = (a: number, b: number) => {
      const d = Math.abs(along[a]! - along[b]!)
      return Math.min(d, total - d)
    }
    for (const bend of bends) {
      if (chosen.length >= MAX_BEND_CAMERAS) break
      if (chosen.some((i) => gap(i, bend.i) < CAMERA_SPACING)) continue
      chosen.push(bend.i)
      const here = road[bend.i]!
      const before = pointAt(bend.i, -4)
      const after = pointAt(bend.i, 4)
      const fx = after.x - before.x
      const fz = after.z - before.z
      const length = Math.max(1e-6, Math.hypot(fx, fz))
      // The road's right, as a heading turns clockwise: (-fz, fx) over its length; a right-hand
      // bend (turn > 0) has its outside on the left
      const rightX = -fz / length
      const rightZ = fx / length
      const outside = bend.turn > 0 ? -1 : 1
      const off = here.width / 2 + CAMERA_SETBACK
      cameras.push({
        x: here.x + rightX * off * outside,
        z: here.z + rightZ * off * outside,
        y: (here.y ?? 0) + CAMERA_HEIGHT,
        finish: false,
      })
    }
    // Back in driving order, so that a list of them reads round the lap
    cameras.sort((a, b) => nearestIndex(road, a) - nearestIndex(road, b))
  }
  const line = track.gates[0]
  const spot = track.respawns[0]
  if (line && spot) {
    const fx = Math.sin(spot.heading)
    const fz = -Math.cos(spot.heading)
    const across = { x: line.bx - line.ax, z: line.bz - line.az }
    const span = Math.max(1e-6, Math.hypot(across.x, across.z))
    cameras.push({
      x: line.bx + (across.x / span) * FINISH_SETBACK + fx * FINISH_PAST,
      z: line.bz + (across.z / span) * FINISH_SETBACK + fz * FINISH_PAST,
      y: (road[0]?.y ?? 0) + CAMERA_HEIGHT - 1.4,
      finish: true,
    })
  }
  return cameras
}

function nearestIndex(road: Track['road'], point: { x: number; z: number }): number {
  let best = 0
  let bestDistance = Infinity
  road.forEach((one, i) => {
    const d = Math.hypot(one.x - point.x, one.z - point.z)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  })
  return best
}

/** A camera watches a kart this near at most, metres */
export const CAMERA_REACH = 48
/** The finish line's camera watches a kart coming down to it from this far, metres (a long shot) */
export const FINISH_REACH = 220

/** The camera nearest `kart` within `reach` (the finish's alone, if `finish`), or null */
export function cameraFor(
  cameras: readonly TracksideCamera[],
  kart: { readonly x: number; readonly z: number },
  finish = false,
  reach = CAMERA_REACH,
): TracksideCamera | null {
  let best: TracksideCamera | null = null
  let bestDistance = reach
  for (const camera of cameras) {
    if (finish && !camera.finish) continue
    const d = Math.hypot(camera.x - kart.x, camera.z - kart.z)
    if (d <= bestDistance) {
      bestDistance = d
      best = camera
    }
  }
  return best
}
