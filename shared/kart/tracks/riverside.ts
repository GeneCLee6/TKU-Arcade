// e8-t05a: the first track, as a graybox: only the road and its kerbs, no art (that is e8-t05b).
// Its theme is the PRD's own, an original riverside circuit (淡水河畔); this is just its layout, made
// for drifting: a long straight to the line, a fast right sweeper, an S, a tight hairpin and a
// flowing run home. Written in code as control points smoothed by a closed Catmull-Rom spline, then
// sampled about every SAMPLE metres; build-track.ts will make the same JSON from the Blender scene.
import { gatesAlong, headingOf, TRACK_FORMAT, type RoadPoint, type TrackJson } from '../track.ts'

/** Metres between road points */
const SAMPLE = 6

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly (readonly [number, number, number])[] = [
  // The main straight, up to the line and beyond (towards -z)
  [0, 150, 16],
  [0, 40, 16],
  [0, -70, 16],
  // A fast right sweeper
  [25, -160, 15],
  [95, -205, 14],
  [175, -190, 14],
  // Down the far side into the S
  [215, -125, 13],
  [195, -60, 13],
  [140, -40, 13],
  [125, 10, 13],
  [165, 55, 13],
  // The hairpin: tight, a place to drift
  [215, 95, 12],
  [225, 150, 12],
  [190, 185, 12],
  [140, 165, 12],
  // Home through a long left onto the straight
  [95, 140, 14],
  [60, 190, 15],
  [20, 215, 16],
]

/** A point `t` (0 to 1) of the way from b to c, with a and d shaping the curve */
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
}

function centreLine(): RoadPoint[] {
  const points: RoadPoint[] = []
  const count = CONTROL.length
  for (let index = 0; index < count; index++) {
    const a = CONTROL[(index - 1 + count) % count]!
    const b = CONTROL[index]!
    const c = CONTROL[(index + 1) % count]!
    const d = CONTROL[(index + 2) % count]!
    const pieces = Math.max(1, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / SAMPLE))
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

const road = centreLine()

/** The start and finish line: on the main straight, a road point near z = 0 */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 40)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const up = { dx: 0, dz: -1 }

export const RIVERSIDE: TrackJson = {
  format: TRACK_FORMAT,
  id: 'riverside',
  name: { en: 'Riverside (graybox)', 'zh-TW': '河畔（灰盒）' },
  laps: 3,
  road: fromLine,
  gates,
  respawns,
  // Two by two behind the line, 7 m apart, staggered
  grid: [0, 1, 2, 3, 4, 5].map((slot) => ({
    x: slot % 2 === 0 ? -3.5 : 3.5,
    z: fromLine[0]!.z + 10 + Math.floor(slot / 2) * 7 + (slot % 2) * 3.5,
    heading: headingOf(up),
  })),
  walls: [],
  boostPads: [],
  itemBoxes: [],
  decor: [],
}
