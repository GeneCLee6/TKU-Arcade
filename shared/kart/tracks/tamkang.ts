// 2026-11-14, owner: "try making a Tamkang University map". A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original circuit through a stylised 淡江大學 淡水校園 on its
// hillside above the river. The layout is ours, not a map of the real roads: a long run up the
// lantern-lined avenue to the line, a fast left at the top round the tall memorial tower, a kink past
// the library and the scroll plaza, esses along the campus's western edge (the old stairway down to
// the town below on the right, the river and the mountain across it beyond), a right hairpin by the
// ship-shaped museum, a run back up through the lawn, a left hairpin at the top, a run down past the
// business tower and a last left hairpin onto the avenue. Flat (the physics is on a plane; the hill
// only falls away beyond the edge of the campus). 2026-11-14 again, owner: "room for at least eight
// karts side by side, and more sharp corners" (revision 2): drawn 1.5 times as big (TAMKANG_SCALE:
// the campus is placed in the same drawn units, tamkangArt.ts), the road 28 to 34 m (it was 18 to
// 22), the fast left at the top tightened round the tower and the western esses made three sharp
// flicks. Then "the maps are still too simple" (revision 5): a right-left flick on the run up
// beside the lawn, and the run down past the business tower made four esses.
import {
  gatesAlong,
  padsAlong,
  headingOf,
  roadDirection,
  TRACK_FORMAT,
  type TrackJson,
} from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

/** The layout below, and the campus placed round it, are drawn this many times smaller than real */
export const TAMKANG_SCALE = 1.5

/** [x, z, width]: x and z in drawn units (times TAMKANG_SCALE for metres), the width in metres */
const DRAWN: readonly ControlPoint[] = [
  // The lantern avenue, northwards (-z), up to the line and beyond
  [0, 150, 38],
  [0, 40, 38],
  [0, -90, 38],
  // A tight left at the top, round the memorial tower, westwards past the library
  [0, -165, 33],
  [-7, -191, 31],
  [-30, -201, 31],
  [-120, -203, 31],
  // A kink round the scroll plaza
  [-160, -195, 29],
  [-185, -215, 29],
  [-215, -205, 29],
  // Left, onto the western edge, and its three sharp flicks southwards
  [-248, -165, 31],
  [-258, -110, 31],
  [-232, -70, 29],
  [-262, -25, 29],
  [-232, 20, 29],
  [-252, 60, 29],
  // The museum hairpin: right, round to the north
  [-232, 110, 28],
  [-210, 150, 28],
  [-175, 155, 28],
  [-155, 120, 28],
  // Up beside the lawn, past the business tower, and a right-left flick (revision 5)
  [-152, 60, 29],
  [-150, 12, 29],
  [-128, -22, 28],
  [-150, -56, 28],
  // The top hairpin: left, round to the south
  [-140, -88, 28],
  [-112, -112, 28],
  [-86, -90, 28],
  // Down past the business tower: esses, left-right-left-right (revision 5)
  [-84, -52, 28],
  [-62, -16, 28],
  [-84, 24, 28],
  [-62, 64, 28],
  [-84, 104, 29],
  [-84, 145, 31],
  // The last hairpin, left, onto the avenue
  [-74, 200, 33],
  [-44, 230, 38],
  [-10, 222, 38],
  [2, 190, 38],
]

const CONTROL: readonly ControlPoint[] = DRAWN.map(([x, z, width]) => [
  x * TAMKANG_SCALE,
  z * TAMKANG_SCALE,
  width,
])

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: on the avenue, the road point at z = 40 (drawn) */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 40 * TAMKANG_SCALE)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const along = roadDirection(fromLine, 0)
const side = { dx: -along.dz, dz: along.dx }

export const TAMKANG: TrackJson = {
  format: TRACK_FORMAT,
  id: 'tamkang',
  name: { en: 'Tamkang Campus', 'zh-TW': '淡江校園' },
  // 2026-11-14: drawn bigger and wider with sharper corners (owner: eight karts side by side); the
  // first layout's records are set aside
  // 2026-11-14 again (owner: much faster karts): straights 4 m wider, boost pads; old records
  // are set aside, the physics having changed too
  // 2026-11-14 once more (owner: the drift as a real slide, faster still): the road is the same,
  // the physics is not, so old records are set aside
  // 2026-11-14, last (owner: "the maps are still too simple"; the slide-out and the counter-steer):
  // a flick on the run up beside the lawn and esses down past the business tower; old records are set aside
  // 6: the classic feel (2026-11-17): the physics changed, so the old times are set aside
  revision: 9,
  laps: 3,
  road: fromLine,
  gates,
  respawns,
  // Two by two behind the line, 7 m apart, staggered, facing up the avenue
  grid: [0, 1, 2, 3, 4, 5].map((slot) => {
    const back = 10 + Math.floor(slot / 2) * 7 + (slot % 2) * 3.5
    const across = slot % 2 === 0 ? -4 : 4
    return {
      x: Math.round((fromLine[0]!.x - along.dx * back + side.dx * across) * 100) / 100,
      z: Math.round((fromLine[0]!.z - along.dz * back + side.dz * across) * 100) / 100,
      heading: headingOf(along),
    }
  }),
  walls: [],
  // Off the middle of the straights: taking one is a choice of line
  boostPads: padsAlong(fromLine, [
    [20, 8],
    [77, -8],
    [249, -8],
    [440, 8],
  ]),
  itemBoxes: [],
  decor: [],
}
