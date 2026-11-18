// 2026-11-17 (owner: keep developing the kart; outside the roadmap): the first track with slopes and
// jumps (terrain.ts, docs/ARCHITECTURE.md §4.26), a working name: Guanyin Hill Road (觀音山坡道), an
// original mountain road across the river from Tamsui. Laid with the track editor's own pieces
// (editor/spec.ts), so it is built and checked exactly as a shared track is: the long start straight,
// a right onto a 16 m climb, an S over the shoulder of the hill, the first jump on the hilltop, a
// hairpin down a fall with a boost pad, a left, a straight of boxes, a right onto the second
// (higher) jump, and a sweeping descent back to the line. 1.8 km.
import { buildSpec } from '../editor/build.ts'
import { jump, slope, straight, turn, type Piece } from '../editor/spec.ts'
import type { TrackJson } from '../track.ts'

const W = 32

/**
 * The pieces, from the start line; checked by tests/kart/terrain.test.ts to make a legal track.
 * 2026-11-18 (owner: "more fun, not so many straights ... technical"; docs/KART-FEEL.md §9), the
 * jump track: a short start straight; a right onto the climb; a deep S over the shoulder; the
 * first jump on the hilltop, into a right that wants the car lined up again at once; a long fall
 * with a boost pad into the omega (right, a left hairpin through a 28 m gate, right: three drifts
 * on end); an S; the run of boxes along the foot of the hill; two chicanes back to back; a right
 * that tightens; a last fall, an S, and the second jump, which lands on the start straight.
 */
export const GUANYIN_PIECES: readonly Piece[] = [
  straight(95, 38, { boxes: true }),
  turn(90, 45, 34),
  slope(170, 14, W),
  turn(-70, 45, W),
  turn(70, 45, W),
  jump(110, 3, 34),
  turn(90, 40, W),
  slope(160, -8, W, { pad: 'left' }),
  turn(90, 36, 30),
  turn(-180, 36, 28),
  turn(90, 36, 30),
  turn(45, 50, W),
  turn(-45, 50, W),
  straight(45, W),
  turn(90, 50, W),
  straight(89.2, 34, { boxes: true }),
  turn(-60, 45, 30),
  turn(60, 45, 30),
  turn(60, 45, 30),
  turn(-60, 45, 30),
  straight(40, W, { pad: 'right' }),
  turn(50, 60, W),
  turn(40, 30, W),
  slope(100, -6, W),
  turn(-45, 55, W),
  turn(45, 55, W),
  jump(92, 3.5, 34),
]

/** Its own revision: the layout's, on top of the physics' (editor/build.ts CUSTOM_REVISION) */
export const GUANYIN_REVISION = 5

const built = buildSpec({ name: '', theme: 'day', pieces: GUANYIN_PIECES })

export const GUANYIN: TrackJson = {
  ...built.track,
  id: 'guanyin',
  // One more than a custom track's (the physics' version): redrawn 2026-11-18
  revision: GUANYIN_REVISION,
  // A working name (2026-11-17): the owner may rename it
  name: { en: 'Guanyin Hill Road', 'zh-TW': '觀音山坡道' },
  theme: 'day',
  laps: 3,
}
