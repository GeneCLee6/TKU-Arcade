// 2026-11-14, owner: "try making a Tamkang University map". A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original circuit through a stylised 淡江大學 淡水校園 on its
// hillside above the river. The layout is ours, not a map of the real roads: a long run up the
// lantern-lined avenue to the line, a fast left at the top round the tall memorial tower, a kink past
// the library and the scroll plaza, esses along the campus's western edge (the old stairway down to
// the town below on the right, the river and the mountain across it beyond), a right hairpin by the
// ship-shaped museum, a run back up through the lawn, a left hairpin at the top, a run down past the
// business tower and a last left hairpin onto the avenue. Wide like the others (18 to 22 m), flat
// (the physics is on a plane; the hill only falls away beyond the edge of the campus).
import { gatesAlong, headingOf, roadDirection, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

const CONTROL: readonly ControlPoint[] = [
  // The lantern avenue, northwards (-z), up to the line and beyond
  [0, 150, 22],
  [0, 40, 22],
  [0, -90, 22],
  // A fast left at the top, round the memorial tower, westwards past the library
  [-15, -160, 21],
  [-60, -200, 20],
  [-120, -205, 20],
  // A kink round the scroll plaza
  [-160, -195, 19],
  [-185, -215, 19],
  [-215, -205, 19],
  // Left, onto the western edge, and its esses southwards
  [-248, -165, 20],
  [-255, -110, 20],
  [-240, -55, 19],
  [-250, 0, 19],
  [-238, 55, 19],
  // The museum hairpin: right, round to the north
  [-232, 110, 18],
  [-210, 150, 18],
  [-175, 155, 18],
  [-155, 120, 18],
  // Up through the lawn
  [-152, 50, 19],
  [-150, -30, 19],
  // The top hairpin: left, round to the south
  [-140, -85, 18],
  [-112, -112, 18],
  [-84, -88, 18],
  // Down past the business tower
  [-82, -20, 19],
  [-86, 60, 20],
  [-84, 140, 20],
  // The last hairpin, left, onto the avenue
  [-74, 200, 21],
  [-44, 230, 22],
  [-10, 222, 22],
  [2, 190, 22],
]

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: on the avenue, the road point at z = 40 */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 40)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const along = roadDirection(fromLine, 0)
const side = { dx: -along.dz, dz: along.dx }

export const TAMKANG: TrackJson = {
  format: TRACK_FORMAT,
  id: 'tamkang',
  name: { en: 'Tamkang Campus', 'zh-TW': '淡江校園' },
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
  boostPads: [],
  itemBoxes: [],
  decor: [],
}
