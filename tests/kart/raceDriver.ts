// A kart driven along the middle of a track at a steady speed, as frames: what a browser would send
// 20 times a second, without any physics. For the race's judging tests (shared/kart/race.ts and the
// race room's realtime half)
import { encodeFrame, type KartFrame } from '../../shared/kart/net.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import type { Track } from '../../shared/kart/track.ts'

/** Frames from the grid, along the road, `metresPerFrame` apart, one every 3 steps (50 ms) */
export function* driveFrames(
  track: Track,
  slot: number,
  metresPerFrame = 2.5,
  firstTick = 0,
): Generator<KartFrame> {
  const start = gridSpot(track, slot)
  // Up to the line from the grid, then round and round the road
  const path: { x: number; z: number }[] = [start]
  for (let lap = 0; lap < 20; lap++) for (const point of track.road) path.push(point)
  let tick = firstTick
  let seq = 0
  let segment = 0
  let along = 0
  let x = start.x
  let z = start.z
  for (;;) {
    let left = metresPerFrame
    while (left > 0 && segment < path.length - 1) {
      const a = path[segment]!
      const b = path[segment + 1]!
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (along + left < length) {
        along += left
        left = 0
      } else {
        left -= length - along
        along = 0
        segment++
      }
      const from = path[segment]!
      const to = path[Math.min(segment + 1, path.length - 1)]!
      const span = Math.max(1e-6, Math.hypot(to.x - from.x, to.z - from.z))
      x = from.x + ((to.x - from.x) * along) / span
      z = from.z + ((to.z - from.z) * along) / span
    }
    tick += 3
    const speed = metresPerFrame * 20
    yield {
      tick,
      x,
      z,
      heading: 0,
      vx: 0,
      vz: -speed,
      reset: false,
      drifting: false,
      boosting: false,
      skidding: false,
      finished: false,
      driftDirection: 0,
      steer: 0,
      body: 0,
      crossings: 0,
      nextGate: 0,
      seq: seq++,
    }
  }
}

export const bytes = (frame: KartFrame): Uint8Array => encodeFrame(frame)
