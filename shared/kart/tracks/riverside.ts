// e8-t05a: the first track, as a graybox: only the road and its kerbs, no art (that is e8-t05b).
// Its theme is the PRD's own, an original riverside circuit (淡水河畔); this is just its layout, made
// for drifting (owner, 2026-11-13: proportions like the classic kart racers'). 2026-11-14, owner:
// "make them wide" (revision 2), then "room for at least eight karts side by side, and more sharp
// corners so that drifting matters" (revision 3): redrawn with a 28 to 34 m road (eight karts' 2.4 m
// collision circles take 19.2 m) round a long straight to the line, a tight right, two hairpins in
// a row (right, then left), a fast run onto the far side, a third hairpin, two quick lefts and a
// last right onto the straight. Then "the maps are still too simple" (revision 6): redrawn again
// as a technical circuit, 2.5 km of short straights between corners that chain: a tight right,
// esses, a right-left pair of hairpins, a flick down the far side, a third hairpin, two more
// switchbacks through the middle and a long last right onto the straight. Written in code as control points smoothed by a closed Catmull-Rom
// spline, then sampled about every SAMPLE metres; build-track.ts will make the same JSON from the
// Blender scene.
import { gatesAlong, padsAlong, headingOf, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly ControlPoint[] = [
  // The main straight, up to the line and beyond (towards -z)
  [0, 230, 38],
  [0, 60, 38],
  [0, -70, 38],
  // Turn 1: a tight right, eastwards
  [5, -105, 32],
  [28, -128, 30],
  [62, -134, 30],
  // The first esses: left, then right
  [100, -134, 30],
  [135, -150, 29],
  [165, -185, 29],
  [200, -200, 29],
  [245, -196, 30],
  // Hairpin 1, right, back westwards
  [290, -196, 28],
  [318, -172, 28],
  [312, -140, 28],
  [282, -126, 28],
  // Hairpin 2, left, eastwards again: a switchback
  [240, -122, 28],
  [212, -108, 28],
  [204, -80, 28],
  [222, -56, 28],
  [255, -50, 30],
  // A short run east and a right onto the far side, southwards
  [330, -48, 32],
  [365, -36, 30],
  [380, -5, 30],
  // The far side: a left-right-left flick
  [380, 40, 30],
  [360, 85, 29],
  [385, 130, 29],
  [380, 175, 30],
  // Hairpin 3, right, back northwards
  [378, 215, 28],
  [358, 245, 28],
  [325, 248, 28],
  [305, 222, 28],
  [305, 180, 30],
  // North, and a left westwards
  [305, 120, 32],
  [300, 75, 30],
  [280, 50, 30],
  [245, 45, 30],
  [170, 45, 32],
  // Hairpin 4, left, eastwards: the first of two switchbacks in the middle
  [95, 45, 28],
  [68, 58, 28],
  [60, 85, 28],
  [75, 110, 28],
  [105, 115, 30],
  [215, 115, 32],
  // Hairpin 5, right, westwards
  [240, 120, 28],
  [262, 142, 28],
  [256, 172, 28],
  [228, 185, 28],
  [135, 185, 32],
  // A left southwards, then the long last right onto the straight
  [100, 191, 30],
  [78, 212, 30],
  [72, 245, 30],
  [62, 282, 32],
  [36, 300, 36],
  [10, 288, 38],
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
  // 2026-11-14, last (owner: "the maps are still too simple"; the slide-out and the counter-steer):
  // redrawn with esses, five hairpins and short straights; old records are set aside
  // 7: the classic feel (2026-11-17): the physics changed, so the old times are set aside
  revision: 10,
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
    [255, -8],
    [298, 8],
    [400, -8],
  ]),
  itemBoxes: [],
  decor: [],
}
