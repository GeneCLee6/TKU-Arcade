import { describe, expect, it } from 'vitest'
import {
  HARBOUR_COAST,
  HARBOUR_SHORE,
  harbourGround,
  harbourTreeFits,
  inHarbourSea,
} from '../../src/kart/art/harbourArt.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'

// N1 (e10-t03): the harbour's land, sea and hillside keep clear of the road, which is flat

describe('the harbour scenery', () => {
  it('keeps the road and its surroundings flat and on land', () => {
    for (const point of HARBOUR.road) {
      expect(harbourGround(point.x, point.z)).toBe(0)
      // 10 m out from either kerb is still flat, dry ground
      expect(inHarbourSea(point.x, point.z, -(point.width / 2 + 10))).toBe(false)
    }
  })

  it('raises the hillside south of the track, down to the beach at the shore', () => {
    expect(harbourGround(0, 350)).toBeGreaterThan(30)
    expect(harbourGround(HARBOUR_SHORE, 350)).toBe(0)
    expect(harbourGround(0, 150)).toBe(0)
  })

  it('grows no shared trees on the quay, in the sea or on the road', () => {
    expect(harbourTreeFits(0, HARBOUR_COAST + 10)).toBe(false)
    expect(harbourTreeFits(HARBOUR_SHORE - 10, 0)).toBe(false)
    expect(roadClearance(HARBOUR.road, -120, 100)).toBeGreaterThan(7)
    expect(harbourTreeFits(-120, 100)).toBe(true)
  })
})
