// N1 (e10-t02): the second track, single-player first. A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original fishing harbour at sunset, for the technical track the
// PRD asks for (E10: tight hairpins one after another, a place to practise chained boosts). It plays
// differently from Riverside: a long seafront straight, one fast sweeper, then a short, tight, 90
// degree flick into two switchback hairpins up the hillside, a chicane, and a long fast arc home
// that kinks once before the line. Flat, like every track so far: the physics is on a plane.
// Drawn the same way as Riverside (spline.ts). 2026-11-14, owner: "make them wide": the same layout,
// the road 15 to 18 m (it was 10 to 13), revision 2. Then "room for at least eight karts side by
// side, and more sharp corners" (revision 3): the layout drawn 1.6 times as big (HARBOUR_SCALE: the
// scenery is placed in the same drawn units, harbourArt.ts), the road 28 to 32 m, the sweeper at the
// end of the quay squared off into a tight right and the kink on the west side made a sharp
// left-right flick.
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

/** The layout below, and the scenery placed round it, are drawn this many times smaller than real */
export const HARBOUR_SCALE = 1.6

/** [x, z, width]: x and z in drawn units (times HARBOUR_SCALE for metres), the width in metres */
const DRAWN: readonly ControlPoint[] = [
  // The seafront straight, eastwards (+x), the sea on the left
  [-130, -112, 36],
  [-40, -112, 36],
  [60, -112, 36],
  // A tight right at the end of the quay
  [140, -112, 31],
  [178, -106, 31],
  [193, -80, 31],
  [195, -8, 29],
  // A short, tight right onto the first switchback leg, westwards
  [192, 44, 29],
  [174, 62, 29],
  [140, 64, 29],
  [95, 62, 29],
  [42, 60, 29],
  // Hairpin 1: left, round to the east
  [10, 66, 29],
  [-2, 87, 29],
  [12, 106, 29],
  [52, 110, 29],
  [95, 108, 29],
  // Hairpin 2: right, round to the west
  [127, 114, 29],
  [139, 134, 29],
  [125, 154, 29],
  // The chicane on the top leg
  [86, 158, 28],
  [56, 145, 28],
  [24, 167, 28],
  [-14, 158, 29],
  // A long fast right, down the west side, a sharp left-right flick, and the right onto the straight
  [-100, 151, 31],
  [-150, 128, 31],
  [-178, 80, 31],
  [-183, 25, 31],
  [-162, -10, 29],
  [-190, -54, 31],
  [-176, -98, 36],
]

const CONTROL: readonly ControlPoint[] = DRAWN.map(([x, z, width]) => [
  x * HARBOUR_SCALE,
  z * HARBOUR_SCALE,
  width,
])

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: the first road point on the straight past x = -70 (drawn) */
const FINISH = road.findIndex(
  (point) => point.z < -100 * HARBOUR_SCALE && point.x >= -70 * HARBOUR_SCALE,
)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const along = roadDirection(fromLine, 0)
const side = { dx: -along.dz, dz: along.dx }

export const HARBOUR: TrackJson = {
  format: TRACK_FORMAT,
  id: 'harbour',
  name: { en: 'Harbour Hairpins', 'zh-TW': '漁港髮夾彎' },
  // 2026-11-14: widened (owner: "make them wide"), then drawn bigger and wider still with sharper
  // corners (owner: eight karts side by side); old records are set aside
  // 2026-11-14 again (owner: much faster karts): straights 4 m wider, boost pads; old records
  // are set aside, the physics having changed too
  // 2026-11-14 once more (owner: the drift as a real slide, faster still): the road is the same,
  // the physics is not, so old records are set aside
  revision: 5,
  laps: 3,
  road: fromLine,
  gates,
  respawns,
  // Two by two behind the line, 7 m apart, staggered, facing along the straight
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
    [20, -8],
    [45, 8],
    [88, 8],
    [130, -8],
  ]),
  itemBoxes: [],
  decor: [],
}
