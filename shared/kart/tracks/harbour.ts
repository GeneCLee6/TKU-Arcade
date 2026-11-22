// N1 (e10-t02): the second track, single-player first. Named Fisherman's Wharf (settled in
// KART-WORLD.md, 2026-11-22): an original fishing harbour at sunset, for the technical track the
// PRD asks for (E10: tight hairpins one after another, a place to practise chained boosts). It plays
// differently from Riverside: a long seafront straight, one fast sweeper, then a short, tight, 90
// degree flick into two switchback hairpins up the hillside, a chicane, and a long fast arc home
// that kinks once before the line. Flat, like every track so far: the physics is on a plane.
// Drawn the same way as Riverside (spline.ts). 2026-11-14, owner: "make them wide": the same layout,
// the road 15 to 18 m (it was 10 to 13), revision 2. Then "room for at least eight karts side by
// side, and more sharp corners" (revision 3): the layout drawn 1.6 times as big (HARBOUR_SCALE: the
// scenery is placed in the same drawn units, harbourArt.ts), the road 28 to 32 m, the sweeper at the
// end of the quay squared off into a tight right and the kink on the west side made a sharp
// left-right flick. Then "the maps are still too simple" (revision 6): the long fast arc home is
// gone; the top leg runs on westwards into two more switchbacks down towards the sea, and the flick
// along the shore stays.
//
// 2026-11-18, owner: "more fun, not so many straights ... technical, like the classic maps"
// (revision 10; docs/KART-FEEL.md §10). Redrawn as the hairpin track its name promises: the seafront
// straight (the one place to pass and to fire a boost); a right at the end of the quay that keeps
// tightening; esses down the east side; then the hillside switchbacks, four hairpins one after
// another with the legs between them short, the third leg kinked by a chicane; a run west under
// the hill; a fast right along the beach; the beach chicane through its narrow gate; and the right
// onto the seafront. Written in metres now (the scenery still places itself in drawn units).
import type { ObstacleJson } from '../obstacles.ts'
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit, type CircuitPoint } from './circuit.ts'

/** The scenery (harbourArt.ts) is placed in drawn units, this many metres each */
export const HARBOUR_SCALE = 1.6

/** [x, z, width]: the line through the middle of the road, in driving order, metres */
const CONTROL: readonly CircuitPoint[] = [
  // The seafront straight, eastwards (+x), the sea on the left
  [-200, -180, 36],
  [-110, -180, 36],
  [-40, -180, 36],
  // The fish-market kink: right, then left, onto the quay's end
  [25, -176, 34],
  [88, -150, 32],
  [150, -148, 34],
  // The quay's end: a right that keeps tightening, round to the south
  [215, -144, 32],
  [268, -138, 30],
  [291, -129, 29],
  [300, -106, 29],
  // Esses down the east side: left, right, left
  [300, -50, 29],
  [316, -5, 28],
  [284, 55, 28],
  [314, 115, 28],
  [302, 148, 29],
  // Hairpin 1: right, round to the north
  [300, 170, 29],
  [288, 200, 29],
  [258, 212, 29],
  [228, 200, 29],
  [216, 170, 29],
  [216, 120, 30],
  [216, 80, 30],
  // Hairpin 2: left, round to the south
  [216, 45, 29],
  [204, 15, 29],
  [174, 3, 29],
  [144, 15, 29],
  [132, 45, 29],
  [132, 100, 30],
  [132, 150, 30],
  // Hairpin 3: right, round to the north
  [132, 175, 29],
  [120, 205, 29],
  [90, 217, 29],
  [60, 205, 29],
  [48, 175, 29],
  // The third leg's chicane: left, then right
  [48, 125, 30],
  [32, 78, 28],
  [64, 18, 28],
  [48, -30, 29],
  // Hairpin 4: left, round to the south
  [48, -55, 29],
  [36, -85, 29],
  [6, -97, 29],
  [-24, -85, 29],
  [-36, -55, 29],
  // Down past the net lofts: a long S
  [-36, 0, 30],
  [-56, 55, 29],
  [-34, 110, 30],
  // A right under the hill, and the run west
  [-36, 172, 30],
  [-45, 195, 30],
  [-68, 204, 30],
  [-120, 205, 31],
  [-170, 206, 32],
  [-215, 204, 32],
  // A fast right along the beach, northwards
  [-268, 204, 30],
  [-291, 193, 30],
  [-300, 170, 30],
  [-300, 125, 30],
  // The beach chicane, through its narrow gate
  [-300, 70, 30],
  [-276, 15, 28],
  [-316, -45, 28],
  [-300, -95, 30],
  // The right onto the seafront
  [-300, -150, 30],
  [-291, -171, 32],
  [-270, -180, 34],
]

const made = circuit({
  control: CONTROL,
  line: [-110, -180],
  // Off the middle: taking one is a choice of line
  pads: [
    [-40, -180, -8],
    [216, 100, 6],
    [132, 120, -6],
    [-180, 205, 8],
  ],
})

/**
 * 2026-11-22 (#103, obstacles.ts): the quay's two container trolleys, sliding across the road out
 * of step with each other (one holds left while the other holds right, so the way through is a
 * weave), and the level crossing under the hill: a boom over each half of the road, the left down
 * while the right is up and then the other way round, never both. Steps of 1/60 s from GO
 */
export const HARBOUR_OBSTACLES: readonly ObstacleJson[] = [
  { kind: 'slider', at: 44, length: 6.1, size: 12, a: -7.6, b: 7.6, period: 360, shift: 0, move: 72, warn: 48 },
  { kind: 'slider', at: 53, length: 6.1, size: 12, a: 7, b: -7, period: 360, shift: 0, move: 72, warn: 48 },
  { kind: 'boom', at: 346.5, from: -16.2, to: 0, period: 480, shift: 60, closed: 150, warn: 60 },
  { kind: 'boom', at: 346.5, from: 0, to: 16.2, period: 480, shift: 300, closed: 150, warn: 60 },
]

export const HARBOUR: TrackJson = {
  format: TRACK_FORMAT,
  id: 'harbour',
  name: { en: "Fisherman's Wharf", 'zh-TW': '漁人碼頭' },
  // 2026-11-14: widened (owner: "make them wide"), then drawn bigger and wider still with sharper
  // corners (owner: eight karts side by side); old records are set aside
  // 2026-11-14 again (owner: much faster karts): straights 4 m wider, boost pads; old records
  // are set aside, the physics having changed too
  // 2026-11-14 once more (owner: the drift as a real slide, faster still): the road is the same,
  // the physics is not, so old records are set aside
  // 2026-11-14, last (owner: "the maps are still too simple"; the slide-out and the counter-steer):
  // two more switchbacks down the west side, where the long fast arc was; old records are set aside
  // 7: the classic feel (2026-11-17): the physics changed, so the old times are set aside
  // 10: redrawn round four switchback hairpins (2026-11-18)
  // 11: the same layout under new physics (2026-11-18: any real drift earns the instant boost)
  // 13: the quay's sliding containers and the level crossing's booms (2026-11-22, obstacles.ts)
  revision: 13,
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  solo: made.solo,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: [],
  decor: [],
  obstacles: HARBOUR_OBSTACLES,
}
