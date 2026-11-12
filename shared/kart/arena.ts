// e8-t02b: a walled test arena for /kart/spike, until the first track (e8-t04, e8-t05a). Not a track:
// a fenced yard with a few things to drive into. Original, and plain on purpose.
//
// The car starts at the origin facing -z (heading 0). Straight ahead, 120 m away, a short wall to
// hit head-on; to the right a square pillar; to the left a long slanted wall to slide along.
import type { Course } from './course.ts'
import type { Wall } from './walls.ts'

/** Walls through a list of corners, closing the loop when `closed` */
function chain(points: readonly (readonly [number, number])[], closed: boolean): Wall[] {
  const walls: Wall[] = []
  const count = closed ? points.length : points.length - 1
  for (let index = 0; index < count; index++) {
    const [ax, az] = points[index]!
    const [bx, bz] = points[(index + 1) % points.length]!
    walls.push({ ax, az, bx, bz })
  }
  return walls
}

/** The fence: 140 by 180 m, its corners cut off so that a car driving along it is turned, not stopped */
const FENCE = chain(
  [
    [-55, 30],
    [55, 30],
    [70, 15],
    [70, -135],
    [55, -150],
    [-55, -150],
    [-70, -135],
    [-70, 15],
  ],
  true,
)

/** 12 m square, right of the start */
const PILLAR = chain(
  [
    [30, -58],
    [42, -58],
    [42, -70],
    [30, -70],
  ],
  true,
)

/** Left of the start, slanted, to scrape along */
const SLANT = chain(
  [
    [-55, -40],
    [-25, -100],
  ],
  false,
)

/** Across the way, straight ahead of the start: a head-on hit at full speed */
const BARRIER = chain(
  [
    [-15, -120],
    [15, -120],
  ],
  false,
)

export const TEST_ARENA: Course = {
  walls: [...FENCE, ...PILLAR, ...SLANT, ...BARRIER],
  start: { x: 0, z: 0, heading: 0 },
}
