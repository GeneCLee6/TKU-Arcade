// 2026-11-17 (owner: keep developing the kart; outside the roadmap): the first track with slopes and
// jumps (terrain.ts, docs/ARCHITECTURE.md §4.25), a working name: Guanyin Hill Road (觀音山坡道), an
// original mountain road across the river from Tamsui. Laid with the track editor's own pieces
// (editor/spec.ts), so it is built and checked exactly as a shared track is: the long start straight,
// a right onto a 16 m climb, an S over the shoulder of the hill, the first jump on the hilltop, a
// hairpin down a fall with a boost pad, a left, a straight of boxes, a right onto the second
// (higher) jump, and a sweeping descent back to the line. 1.8 km.
import { buildSpec } from '../editor/build.ts'
import { jump, slope, straight, turn, type Piece } from '../editor/spec.ts'
import type { TrackJson } from '../track.ts'

const W = 34

/** The pieces, from the start line; checked by tests/kart/terrain.test.ts to make a legal track */
export const GUANYIN_PIECES: readonly Piece[] = [
  straight(150, 38, { boxes: true }),
  turn(90, 60, 36),
  slope(160, 16, W),
  turn(-70, 85, W),
  turn(70, 85, W),
  straight(40, W),
  jump(150, 2.5, W),
  turn(160, 50, W),
  slope(160, -10, W, { pad: 'left' }),
  turn(-90, 70, W),
  straight(80, W, { boxes: true }),
  turn(90, 60, W),
  jump(140, 3, W),
  turn(46.4, 100, W),
  slope(168.6, -6, W),
  turn(63.6, 45, W),
]

const built = buildSpec({ name: '', theme: 'day', pieces: GUANYIN_PIECES })

export const GUANYIN: TrackJson = {
  ...built.track,
  id: 'guanyin',
  // A working name (2026-11-17): the owner may rename it
  name: { en: 'Guanyin Hill Road', 'zh-TW': '觀音山坡道' },
  theme: 'day',
  laps: 3,
}
