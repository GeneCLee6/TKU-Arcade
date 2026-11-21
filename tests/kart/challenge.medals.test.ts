import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { createDriver, DRIVERS, type DriverId } from '../../src/kart/bots/drivers.ts'
import { missionTrack, runMission } from '../../src/kart/challenge/headless.ts'
import { medalFor, medalTimes } from '../../src/kart/challenge/medals.ts'
import { missionOf } from '../../src/kart/challenge/missions.ts'
import { measure } from '../../scripts/kart/drivers.ts'

// 2026-11-21 (docs/KART-FEEL.md §19): the medals and the missions hold for the drivers they were
// measured with (`npm run kart:medals`, which writes medalTable.ts): on a plain track, a technical
// one and one to know by heart, the top driver wins gold, the expert at least silver, the average
// driver at least bronze and the novice none; the master passes the missions of technique, and the
// novice does not pass the ones it has no technique for. After a change to the physics this fails
// until `npm run kart:medals` is run again.

const raced = (track: string, who: DriverId) =>
  measure(missionTrack(track), DRIVERS[who], KART_TUNING, 7).seconds

/** Each race is a few hundred milliseconds; a busy machine runs them slower */
const SLOW = 60_000

const rank = { bronze: 1, silver: 2, gold: 3, platinum: 4 } as const
const medalOf = (track: string, seconds: number) => {
  const medal = medalFor(medalTimes(track)!, seconds)
  return medal ? rank[medal] : 0
}

describe('the medals, as measured', () => {
  for (const track of ['riverside', 'mangrove', 'wharf']) {
    it(`${track}: gold for the top driver, silver for the expert, bronze for the average, none for the novice`, () => {
      const top = trackGuide(track) ? 'master' : 'expert'
      expect(medalOf(track, raced(track, top))).toBeGreaterThanOrEqual(rank.gold)
      expect(medalOf(track, raced(track, 'expert'))).toBeGreaterThanOrEqual(rank.silver)
      expect(medalOf(track, raced(track, 'average'))).toBeGreaterThanOrEqual(rank.bronze)
      expect(medalOf(track, raced(track, 'novice'))).toBe(0)
    }, SLOW)
  }
})

const hands = (who: DriverId) => (track: Parameters<typeof createDriver>[1], tuning: typeof KART_TUNING) =>
  createDriver(DRIVERS[who], track, tuning, 7)

describe('the missions, as measured', () => {
  for (const id of ['combo5', 'perfects', 'hops', 'slots', 'needle', 'branches', 'hopyard']) {
    it(`${id}: the master passes it`, () => {
      const result = runMission(missionOf(id), hands('master'))
      expect(result.passed, `${result.judge.why}`).toBe(true)
      expect(result.stars).toBeGreaterThanOrEqual(2)
    }, SLOW)
  }

  it('the novice passes none of the techniques', () => {
    for (const id of ['hops', 'slots', 'branches', 'combo10']) {
      expect(runMission(missionOf(id), hands('novice')).passed, id).toBe(false)
    }
  }, SLOW)
})
