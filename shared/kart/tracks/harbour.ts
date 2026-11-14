// N1 (e10-t02): the second track, single-player first. A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original fishing harbour at sunset, for the technical track the
// PRD asks for (E10: tight hairpins one after another, a place to practise chained boosts). It plays
// differently from Riverside: a long seafront straight, one fast sweeper, then a short, tight, 90
// degree flick into two switchback hairpins up the hillside, a chicane, and a long fast arc home
// that kinks once before the line. Flat, like every track so far: the physics is on a plane.
// Drawn the same way as Riverside (spline.ts). 2026-11-14, owner: "make them wide": the same layout,
// the road 15 to 18 m (it was 10 to 13), revision 2.
import { gatesAlong, headingOf, roadDirection, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

const CONTROL: readonly ControlPoint[] = [
  // The seafront straight, eastwards (+x), the sea on the left
  [-130, -112, 18],
  [-40, -112, 18],
  [60, -112, 18],
  // A fast right sweeper round the end of the quay
  [135, -100, 17],
  [180, -62, 17],
  [195, -8, 16],
  // A short, tight right onto the first switchback leg, westwards
  [192, 44, 16],
  [174, 62, 16],
  [140, 64, 16],
  [95, 62, 16],
  [42, 60, 16],
  // Hairpin 1: left, round to the east
  [10, 66, 16],
  [-2, 87, 16],
  [12, 106, 16],
  [52, 110, 16],
  [95, 108, 16],
  // Hairpin 2: right, round to the west
  [127, 114, 16],
  [139, 134, 16],
  [125, 154, 16],
  // The chicane on the top leg
  [86, 158, 15],
  [56, 145, 15],
  [24, 167, 15],
  [-14, 158, 16],
  // A long fast right, down the west side, a kink, and the right onto the straight
  [-100, 151, 17],
  [-150, 128, 17],
  [-178, 80, 17],
  [-183, 25, 17],
  [-168, -22, 16],
  [-184, -62, 17],
  [-176, -98, 18],
]

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: the first road point on the straight past x = -70 */
const FINISH = road.findIndex((point) => point.z < -100 && point.x >= -70)

// The road starts at the line, so that gate 0 is the finish
const fromLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]
const { gates, respawns } = gatesAlong(fromLine, 7)
const along = roadDirection(fromLine, 0)
const side = { dx: -along.dz, dz: along.dx }

export const HARBOUR: TrackJson = {
  format: TRACK_FORMAT,
  id: 'harbour',
  name: { en: 'Harbour Hairpins', 'zh-TW': '漁港髮夾彎' },
  // 2026-11-14: widened (owner: "make them wide"); old records are set aside
  revision: 2,
  laps: 3,
  road: fromLine,
  gates,
  respawns,
  // Two by two behind the line, 7 m apart, staggered, facing along the straight
  grid: [0, 1, 2, 3, 4, 5].map((slot) => {
    const back = 10 + Math.floor(slot / 2) * 7 + (slot % 2) * 3.5
    const across = slot % 2 === 0 ? -3.5 : 3.5
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
