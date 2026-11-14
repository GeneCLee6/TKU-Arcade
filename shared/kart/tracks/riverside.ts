// e8-t05a: the first track, as a graybox: only the road and its kerbs, no art (that is e8-t05b).
// Its theme is the PRD's own, an original riverside circuit (淡水河畔); this is just its layout, made
// for drifting (owner, 2026-11-13: proportions like the classic kart racers'). 2026-11-14, owner:
// "make them wide": the layout drawn 1.25 times as big and the road 18 to 22 m, twelve to fifteen
// kart widths, so that a full-speed drift fits (revision 2). A long straight to the line, a fast right sweeper, an S, a tight hairpin and a
// flowing run home. Written in code as control points smoothed by a closed Catmull-Rom spline, then
// sampled about every SAMPLE metres; build-track.ts will make the same JSON from the Blender scene.
import { gatesAlong, headingOf, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly ControlPoint[] = [
  // The main straight, up to the line and beyond (towards -z)
  [0, 188, 22],
  [0, 50, 22],
  [0, -88, 22],
  // A fast right sweeper
  [31, -200, 21],
  [119, -256, 20],
  [219, -238, 20],
  // Down the far side into the S
  [269, -156, 19],
  [244, -75, 19],
  [175, -50, 19],
  [156, 12, 19],
  [206, 69, 19],
  // The hairpin: tight, a place to drift
  [269, 119, 18],
  [281, 188, 18],
  [238, 231, 18],
  [178, 212, 18],
  // Home through a long left onto the straight
  [130, 196, 20],
  [88, 236, 21],
  [52, 270, 22],
  [14, 262, 22],
  [0, 228, 22],
]

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: on the main straight, the road point at z = 50 */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 50)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const up = { dx: 0, dz: -1 }

export const RIVERSIDE: TrackJson = {
  format: TRACK_FORMAT,
  id: 'riverside',
  name: { en: 'Riverside (graybox)', 'zh-TW': '河畔（灰盒）' },
  // 2026-11-14: widened (owner: "make them wide"); old records are set aside
  revision: 2,
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
