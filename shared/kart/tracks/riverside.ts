// e8-t05a: the first track, as a graybox: only the road and its kerbs, no art (that is e8-t05b).
// Its theme is the PRD's own, an original riverside circuit (淡水河畔); this is just its layout, made
// for drifting, about seven kart widths wide (owner, 2026-11-13: proportions like the classic kart
// racers'): a long straight to the line, a fast right sweeper, an S, a tight hairpin and a
// flowing run home. Written in code as control points smoothed by a closed Catmull-Rom spline, then
// sampled about every SAMPLE metres; build-track.ts will make the same JSON from the Blender scene.
import { gatesAlong, headingOf, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly ControlPoint[] = [
  // The main straight, up to the line and beyond (towards -z)
  [0, 150, 13],
  [0, 40, 13],
  [0, -70, 13],
  // A fast right sweeper
  [25, -160, 12],
  [95, -205, 11],
  [175, -190, 11],
  // Down the far side into the S
  [215, -125, 10],
  [195, -60, 10],
  [140, -40, 10],
  [125, 10, 10],
  [165, 55, 10],
  // The hairpin: tight, a place to drift
  [215, 95, 9],
  [225, 150, 9],
  [190, 185, 9],
  [140, 165, 9],
  // Home through a long left onto the straight
  [95, 140, 11],
  [60, 190, 12],
  [20, 215, 13],
]

const road = splineRoad(CONTROL, SAMPLE)

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
