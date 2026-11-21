// 2026-11-21 (owner: "the track should not have people in front and behind, it is not fair; from
// the start every kart should be on the same starting line"): the grid is one row across the road,
// every place the same distance behind the start and finish line, instead of two by two going back.
// Every track's grid comes from here: the hand-drawn circuits (tracks/circuit.ts), the old street,
// the test oval and the editor's tracks (editor/build.ts). Pure (docs/KART-NETCODE.md §3).
import type { Spot } from './course.ts'
import { KART_RADIUS } from './kartRadius.ts'

/** Places on the line: a full room */
export const LINE_PLACES = 8
/** How far behind the start and finish line the row stands, metres (as the old pole did) */
export const LINE_BACK = 10
/** The outermost karts stand at least this far in from the kerb, metres (the editor's own check) */
export const LINE_EDGE = KART_RADIUS + 1.3
/** Never further apart than this, metres: two karts need not start across the whole road */
export const LINE_MAX_GAP = 4
/**
 * Never closer than this: two karts side by side then have a metre between them, so that neither
 * touches the other at GO (a kart is a circle of KART_RADIUS, walls.ts)
 */
export const LINE_MIN_GAP = 2 * KART_RADIUS + 0.8
/**
 * A road too narrow for eight in a row (none of the built-in tracks, whose starts are 34 m wide or
 * more, nor the editor's, 28 m at least): every other lane stands this much further back, so that
 * the karts can come closer across. Each still has the same run to the line as its neighbours'
 * neighbours, and the row is one zigzag rather than two rows
 */
export const LINE_ZIGZAG_BACK = 3
/**
 * A kart racing alone (the time trial) starts LINE_BACK behind the line and this far right of the
 * middle (left, being negative): where the pole stood before the row, so that its records and
 * ghosts still stand (TrackJson.solo)
 */
export const LINE_SOLO_ACROSS = -4

/** The lanes from the middle out, left first: with two racers both are in the middle */
const LANE_ORDER = [3, 4, 2, 5, 1, 6, 0, 7] as const

/** Where each place stands relative to the middle of the road on the line: metres right, metres further back */
export function lineOffsets(width: number): { across: number; back: number }[] {
  const lanes = LINE_PLACES - 1
  let gap = Math.min(LINE_MAX_GAP, (width - 2 * LINE_EDGE) / lanes)
  const zigzag = gap < LINE_MIN_GAP
  if (zigzag) gap = Math.max(KART_RADIUS * 1.4, (width - 2 * KART_RADIUS) / lanes)
  return LANE_ORDER.map((lane) => ({
    across: Math.round((lane - lanes / 2) * gap * 100) / 100,
    back: zigzag && lane % 2 === 1 ? LINE_ZIGZAG_BACK : 0,
  }))
}

/**
 * The grid: `centre` is the middle of the road LINE_BACK metres behind the line, facing along it,
 * and `width` the road's width there. Pole (slot 0) first, the slots from the middle out
 */
export function lineGrid(centre: Spot, width: number): Spot[] {
  // Facing along the road (sin h, -cos h), its right is (cos h, sin h)
  const right = { x: Math.cos(centre.heading), z: Math.sin(centre.heading) }
  const forward = { x: Math.sin(centre.heading), z: -Math.cos(centre.heading) }
  const heading = Math.round(centre.heading * 1e6) / 1e6
  return lineOffsets(width).map(({ across, back }) => ({
    x: Math.round((centre.x + right.x * across - forward.x * back) * 100) / 100,
    z: Math.round((centre.z + right.z * across - forward.z * back) * 100) / 100,
    heading,
  }))
}
