// e8-t05a: the first track, as a graybox: only the road and its kerbs, no art (that is e8-t05b).
// Its theme is the PRD's own, an original riverside circuit (淡水河畔); this is just its layout, made
// for drifting (owner, 2026-11-13: proportions like the classic kart racers'). 2026-11-14, owner:
// "make them wide" (revision 2), then "room for at least eight karts side by side, and more sharp
// corners so that drifting matters" (revision 3): redrawn with a 28 to 34 m road (eight karts' 2.4 m
// collision circles take 19.2 m) round a long straight to the line, a tight right, two hairpins in
// a row (right, then left), a fast run onto the far side, a third hairpin, two quick lefts and a
// last right onto the straight. Written in code as control points smoothed by a closed Catmull-Rom
// spline, then sampled about every SAMPLE metres; build-track.ts will make the same JSON from the
// Blender scene.
import { gatesAlong, padsAlong, headingOf, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly ControlPoint[] = [
  // The main straight, up to the line and beyond (towards -z)
  [0, 250, 38],
  [0, 60, 38],
  [0, -120, 38],
  // A tight right
  [4, -165, 32],
  [28, -192, 30],
  [70, -200, 30],
  [150, -200, 30],
  // Hairpin 1, right, back westwards
  [200, -196, 28],
  [228, -172, 28],
  [222, -140, 28],
  [190, -128, 28],
  [130, -126, 30],
  // Hairpin 2, left, eastwards again
  [90, -120, 28],
  [70, -96, 28],
  [80, -66, 28],
  [115, -58, 28],
  // A long run east and a fast right onto the far side
  [220, -60, 32],
  [300, -50, 32],
  [340, -10, 32],
  [345, 70, 32],
  [345, 180, 30],
  // Hairpin 3, right, back northwards
  [340, 225, 28],
  [310, 245, 28],
  [280, 225, 28],
  [275, 180, 28],
  [275, 120, 30],
  // Two quick lefts: westwards, then south
  [265, 95, 30],
  [240, 88, 30],
  [200, 90, 30],
  [175, 100, 30],
  [168, 130, 30],
  [168, 220, 32],
  // A right onto the run home, and the last right onto the straight
  [160, 265, 32],
  [130, 285, 32],
  [100, 292, 38],
  [60, 300, 38],
  [24, 300, 38],
  [4, 282, 38],
  [0, 262, 38],
]

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: on the main straight, the road point at z = 60 */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 60)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const up = { dx: 0, dz: -1 }

export const RIVERSIDE: TrackJson = {
  format: TRACK_FORMAT,
  id: 'riverside',
  name: { en: 'Riverside (graybox)', 'zh-TW': '河畔（灰盒）' },
  // 2026-11-14: widened (owner: "make them wide"), then redrawn wider still with hairpins (owner:
  // eight karts side by side, more sharp corners); old records are set aside
  // 2026-11-14 again (owner: much faster karts): straights 4 m wider, boost pads; old records
  // are set aside, the physics having changed too
  // 2026-11-14 once more (owner: the drift as a real slide, faster still): the road is the same,
  // the physics is not, so old records are set aside
  revision: 5,
  laps: 3,
  road: fromLine,
  gates,
  respawns,
  // Two by two behind the line, 7 m apart, staggered
  grid: [0, 1, 2, 3, 4, 5].map((slot) => ({
    x: slot % 2 === 0 ? -4 : 4,
    z: fromLine[0]!.z + 10 + Math.floor(slot / 2) * 7 + (slot % 2) * 3.5,
    heading: headingOf(up),
  })),
  walls: [],
  // Off the middle of the straights: taking one is a choice of line
  boostPads: padsAlong(fromLine, [
    [14, 8],
    [132, -8],
    [180, 8],
    [325, -8],
  ]),
  itemBoxes: [],
  decor: [],
}
