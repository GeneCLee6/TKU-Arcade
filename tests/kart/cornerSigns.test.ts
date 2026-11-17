import { describe, expect, it } from 'vitest'
import {
  CORNER_TURN,
  cornerSigns,
  roadCorners,
  SIGN_OFFSET,
  SIGN_SPACING,
} from '../../shared/kart/cornerSigns.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import type { RoadPoint } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'

// 2026-11-17 (docs/KART-FEEL.md §8): the arrow boards along the outside of every corner, worked out
// from the road alone

const WIDTH = 30

/** A stadium: two straights `straight` m long joined by two half circles of `radius`, clockwise */
function stadium(straight: number, radius: number, spacing = 6): RoadPoint[] {
  const road: RoadPoint[] = []
  // Up the left straight (towards -z), heading 0
  for (let along = 0; along < straight; along += spacing) {
    road.push({ x: -radius, z: -along, width: WIDTH })
  }
  // Round to the right over the top
  const arc = Math.max(4, Math.round((Math.PI * radius) / spacing))
  for (let step = 0; step < arc; step++) {
    const angle = Math.PI - (step / arc) * Math.PI
    road.push({ x: Math.cos(angle) * radius, z: -straight - Math.sin(angle) * radius, width: WIDTH })
  }
  for (let along = 0; along < straight; along += spacing) {
    road.push({ x: radius, z: -straight + along, width: WIDTH })
  }
  for (let step = 0; step < arc; step++) {
    const angle = (step / arc) * Math.PI
    road.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, width: WIDTH })
  }
  return road
}

describe('the corners of a road', () => {
  it('finds both ends of a stadium, each a half turn to the right, and nothing on the straights', () => {
    const corners = roadCorners(stadium(240, 40))
    expect(corners).toHaveLength(2)
    for (const corner of corners) {
      expect(corner.turn).toBeGreaterThan(Math.PI * 0.85)
      expect(corner.turn).toBeLessThan(Math.PI * 1.15)
    }
  })

  it('takes a wide sweep for no corner: grip is enough there', () => {
    expect(roadCorners(stadium(240, 140))).toEqual([])
  })

  it('finds a left-hander when the same road is driven the other way', () => {
    const corners = roadCorners(stadium(240, 40).reverse())
    expect(corners).toHaveLength(2)
    for (const corner of corners) expect(corner.turn).toBeLessThan(-CORNER_TURN)
  })
})

describe('the arrow boards', () => {
  const road = stadium(240, 40)
  const signs = cornerSigns(road)

  it('stand outside the road, behind the barrier, never on it', () => {
    expect(signs.length).toBeGreaterThan(8)
    for (const sign of signs) {
      const clear = roadClearance(road, sign.x, sign.z)
      expect(clear).toBeGreaterThan(SIGN_OFFSET * 0.6)
      expect(clear).toBeLessThan(SIGN_OFFSET + 1)
    }
  })

  it('are on the outside of the corner and point the way it turns', () => {
    for (const sign of signs) {
      expect(sign.turn).toBe(1)
      const point = road[sign.index]!
      // A right-hander: the outside is to the left of the way the road runs
      const rightX = Math.cos(sign.heading)
      const rightZ = Math.sin(sign.heading)
      const across = (sign.x - point.x) * rightX + (sign.z - point.z) * rightZ
      expect(across).toBeLessThan(-(WIDTH / 2))
    }
    for (const sign of cornerSigns([...road].reverse())) expect(sign.turn).toBe(-1)
  })

  it('begin before the corner turns and are spaced along it', () => {
    // The first board of the top corner stands beside the straight, before the arc begins
    const first = signs[0]!
    expect(road[first.index]!.x).toBeCloseTo(-40, 6)
    for (let index = 1; index < signs.length; index++) {
      const a = signs[index - 1]!
      const b = signs[index]!
      const gap = Math.hypot(a.x - b.x, a.z - b.z)
      // Along the outside of the bend the boards are a little further apart than along the road
      if (gap < 60) expect(gap).toBeGreaterThan(SIGN_SPACING * 0.9)
    }
  })

  it('are thinned out for a lower graphics quality', () => {
    const fewer = cornerSigns(road, 0.35)
    expect(fewer.length).toBeLessThan(signs.length * 0.7)
    expect(fewer.length).toBeGreaterThan(signs.length * 0.3)
  })

  it.each(['riverside', 'harbour', 'tamkang', 'oldstreet', 'guanyin'])(
    '%s: every corner sharp enough has boards, none of them on the road',
    (id) => {
      const track = raceTrack(id)!
      const corners = roadCorners(track.road)
      const boards = cornerSigns(track.road)
      expect(corners.length).toBeGreaterThanOrEqual(5)
      expect(boards.length).toBeGreaterThanOrEqual(corners.length * 2)
      expect(boards.length).toBeLessThan(120)
      for (const sign of boards) {
        expect(roadClearance(track.road, sign.x, sign.z)).toBeGreaterThan(0.5)
      }
      // The same road, the same boards
      expect(cornerSigns(track.road)).toEqual(boards)
    },
  )
})
