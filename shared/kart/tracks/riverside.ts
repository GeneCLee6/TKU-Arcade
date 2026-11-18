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
//
// 2026-11-18, owner: "more fun, not so many straights ... technical, like the classic maps"
// (revision 10; docs/KART-FEEL.md §10). The beginner's track, so everything flows, and no corner
// here wants the brake. A short main straight; a fast right sweeper; four esses, each a little quicker
// than the last; a long double-apex right (two corners joined by a breath of straight: clip both
// kerbs); the levee chicane; an open left hairpin; a climb over the levee with a small jump on its
// crest, down into a right-hand sweeper that tightens as it goes; and a last flick before the right
// onto the straight. The first of the hand-drawn tracks with a hill.
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit, type CircuitPoint } from './circuit.ts'

/** [x, z, width, height]: the line through the middle of the road, in driving order */
const CONTROL: readonly CircuitPoint[] = [
  // The main straight, up to the line and beyond (towards -z), the river on the left
  [0, 170, 38, 0],
  [0, 90, 38, 0],
  [0, 0, 38, 0],
  // Turn 1: a right, eastwards
  [0, -74, 34, 0],
  [11, -101, 32, 0],
  [38, -112, 32, 0],
  // The esses: left, right, left, right
  [105, -110, 30, 0],
  [170, -92, 30, 0],
  [250, -136, 30, 0],
  [330, -92, 30, 0],
  [405, -134, 30, 0],
  // The double apex: two rights with a breath of straight between, round to the west
  [455, -118, 31, 0],
  [492, -92, 32, 0],
  [506, -50, 32, 0],
  [506, -5, 32, 0],
  [492, 36, 32, 0],
  [455, 52, 32, 0],
  // The levee chicane: right, then left
  [395, 52, 30, 0],
  [330, 26, 28, 0],
  [262, 72, 28, 0],
  [200, 50, 30, 0],
  [150, 50, 32, 0],
  // The open hairpin, left, round to the east
  [105, 52, 30, 0],
  [80, 62, 30, 0],
  [69, 88, 30, 0],
  [80, 114, 30, 0],
  [105, 124, 30, 0],
  // Over the levee: a climb, the jump on its crest, and down
  [150, 130, 32, 1],
  [215, 152, 34, 6],
  [265, 164, 34, 7],
  [330, 168, 34, 3],
  // The tightening right: opens wide, closes tight, round to the west
  [385, 178, 32, 0],
  [432, 206, 30, 0],
  [452, 248, 29, 0],
  [438, 286, 28, 0],
  [400, 300, 28, 0],
  // Home along the bank, a left-right flick, and the right onto the straight
  [335, 296, 32, 0],
  [270, 300, 34, 0],
  [205, 318, 32, 0],
  [140, 272, 32, 0],
  [80, 256, 34, 0],
  [36, 254, 36, 0],
  [11, 243, 38, 0],
  [0, 218, 38, 0],
]

const made = circuit({
  control: CONTROL,
  line: [0, 90],
  jumps: [[265, 164, 1.6]],
  // Off the middle: taking one is a choice of line
  pads: [
    [0, 20, 8],
    [150, 50, -8],
    [270, 300, 8],
  ],
})

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
  // 10: redrawn as a flowing beginner's circuit with a hill and a jump (2026-11-18)
  // 11: the same layout under new physics (2026-11-18: any real drift earns the instant boost)
  revision: 11,
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: [],
  decor: [],
  jumps: made.jumps,
}
