// N1 (e10-t02): the second track, single-player first. A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original fishing harbour at sunset, for the technical track the
// PRD asks for (E10: tight hairpins one after another, a place to practise chained boosts). It plays
// differently from Riverside: a long seafront straight, one fast sweeper, then a short, tight, 90
// degree flick into two switchback hairpins up the hillside, a chicane, and a long fast arc home
// that kinks once before the line. Flat, like every track so far: the physics is on a plane.
// Drawn the same way as Riverside (spline.ts); widths 10 to 13 m, a little wider in the hairpins
// than Riverside's so that a drift fits.
import { gatesAlong, headingOf, roadDirection, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { splineRoad, type ControlPoint } from './spline.ts'

/** Metres between road points */
const SAMPLE = 6

const CONTROL: readonly ControlPoint[] = [
  // The seafront straight, eastwards (+x), the sea on the left
  [-130, -112, 13],
  [-40, -112, 13],
  [60, -112, 13],
  // A fast right sweeper round the end of the quay
  [135, -100, 12],
  [180, -62, 12],
  [195, -8, 11],
  // A short, tight right onto the first switchback leg, westwards
  [192, 44, 11],
  [174, 62, 11],
  [140, 64, 11],
  [95, 62, 11],
  [42, 60, 11],
  // Hairpin 1: left, round to the east
  [10, 66, 11],
  [-2, 87, 11],
  [12, 106, 11],
  [52, 110, 11],
  [95, 108, 11],
  // Hairpin 2: right, round to the west
  [127, 114, 11],
  [139, 134, 11],
  [125, 154, 11],
  // The chicane on the top leg
  [86, 158, 10],
  [56, 145, 10],
  [24, 167, 10],
  [-14, 158, 11],
  // A long fast right, down the west side, a kink, and the right onto the straight
  [-100, 151, 12],
  [-150, 128, 12],
  [-178, 80, 12],
  [-183, 25, 12],
  [-168, -22, 11],
  [-184, -62, 12],
  [-176, -98, 13],
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
