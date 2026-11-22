import { describe, expect, it } from 'vitest'
import {
  BUDGET_STATS,
  CURRENT_SEASON,
  inSeason,
  isFlagship,
  KART_IDS,
  KART_SEASONS,
  KARTS,
  kartSpec,
  seasonFlagship,
  STAT_MAX,
  STAT_MIN,
  type KartId,
} from '../../shared/kart/karts.ts'
import { TRACK_CHARACTERS, TRACK_META, trackMeta } from '../../shared/kart/meta.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { FEEL_TRACKS } from '../../scripts/kart/feel.ts'
import {
  fairness,
  flagshipLead,
  median,
  podiums,
  raceMatrix,
  ranking,
  trackTraits,
  UNFINISHED_SECONDS,
  winCounts,
  without,
  type Matrix,
} from '../../scripts/kart/meta.ts'
import { DRIVERS } from '../../scripts/kart/drivers.ts'

// Which vehicle is quickest where (2026-11-21, docs/KART-META.md): the matrix's pure logic, the
// tracks' traits, the garage's static picks, and the season's flagship. The races themselves take
// minutes (npm run kart:meta); tests/kart/flagship.test.ts drives a few.

const M: Matrix = {
  a: { tide: 60, heron: 59, comet: 61, kite: 58.5 },
  b: { tide: 70, heron: 71, comet: 69.5, kite: 69 },
  c: { tide: 80, heron: 79.5, comet: 81, kite: 80.2 },
}

describe('the matrix', () => {
  it('takes the median of the races, and an unfinished race as UNFINISHED_SECONDS', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    const times: Record<number, number> = { 7: 60, 14: 62, 21: 0 }
    const matrix = raceMatrix(DRIVERS.expert, ['x'], ['tide'], 3, (_track, _kart, seed) =>
      seed === 21 ? { finished: false, seconds: 1 } : { finished: true, seconds: times[seed]! },
    )
    // 60, 62 and an unfinished race: the middle is 62
    expect(matrix.x!.tide).toBe(62)
    expect(UNFINISHED_SECONDS).toBeGreaterThan(300)
  })

  it('ranks a track quickest first, its podium the first three', () => {
    expect(ranking(M.a!).map((one) => one.kart)).toEqual(['kite', 'heron', 'tide', 'comet'])
    expect(podiums(without(M, ['kite']))).toEqual({
      a: ['heron', 'tide', 'comet'],
      b: ['comet', 'tide', 'heron'],
      c: ['heron', 'tide', 'comet'],
    })
    expect(winCounts(without(M, ['kite']))).toEqual({ heron: 2, comet: 1 })
  })

  it('the flagship’s lead: the tracks it wins, and by how much against the best of the rest', () => {
    const lead = flagshipLead(M, 'kite')
    expect(lead.wins).toBe(2)
    expect(lead.tracks).toBe(3)
    expect(lead.margins.a).toBeCloseTo(0.5 / 59, 9)
    expect(lead.margins.c).toBeLessThan(0)
  })

  it('the fairness rule: no vehicle but the flagship wins everywhere, nor on more than half', () => {
    expect(fairness(M, ['kite'])).toEqual(['heron is the quickest on 2 of 3 tracks'])
    const everywhere: Matrix = { a: { tide: 1, heron: 2 }, b: { tide: 1, heron: 2 } }
    expect(fairness(everywhere, [])).toEqual(['tide is the quickest on every track'])
    // The flagship may win everywhere
    expect(fairness({ a: { kite: 1, tide: 2, heron: 3 }, b: { kite: 1, heron: 2, tide: 3 } }, ['kite'])).toEqual([])
  })
})

describe('the tracks’ traits', () => {
  it('a flat track neither climbs nor falls; a hill track does, as far down as up', () => {
    // 2026-11-22: the harbour has a step now (#103); the mangrove channel is flat
    const flat = trackTraits(raceTrack('mangrove')!)
    expect(flat.climb).toBe(0)
    expect(flat.upShare).toBe(0)
    const hill = trackTraits(raceTrack('datun')!)
    expect(hill.climb).toBeGreaterThan(10)
    expect(hill.upShare).toBeGreaterThan(0.05)
    expect(hill.downShare).toBeGreaterThan(0.05)
  })

  it('the technical tracks have less straight than the fast ones', () => {
    const share = (id: string) => trackTraits(raceTrack(id)!).straightShare
    for (const technical of ['mangrove', 'fort', 'danhai', 'datun']) {
      for (const fast of ['oldstreet', 'guanyin']) expect(share(technical)).toBeLessThan(share(fast))
    }
  })
})

describe('the garage’s picks (shared/kart/meta.ts)', () => {
  it('has three different vehicles, none the flagship, for every track kart:feel drives', () => {
    expect(Object.keys(TRACK_META).sort()).toEqual([...FEEL_TRACKS].sort())
    for (const [track, meta] of Object.entries(TRACK_META)) {
      expect(new Set(meta.podium).size, track).toBe(3)
      for (const kart of meta.podium) {
        expect(KART_IDS, track).toContain(kart)
        expect(isFlagship(kart), track).toBe(false)
      }
      expect(meta.character.length, track).toBeGreaterThan(0)
      for (const one of meta.character) expect(TRACK_CHARACTERS).toContain(one)
    }
    expect(trackMeta('oval')).toBeNull()
    expect(trackMeta(undefined)).toBeNull()
  })

  it('is fair: no vehicle tops every track, and different kinds of track have different winners', () => {
    const firsts = Object.values(TRACK_META).map((meta) => meta.podium[0])
    const counts = new Map<KartId, number>()
    for (const kart of firsts) counts.set(kart, (counts.get(kart) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(firsts.length / 2)
    expect(counts.size).toBeGreaterThanOrEqual(4)
  })

  it('a hill track’s character agrees with its road: a climb or a descent only where it climbs', () => {
    for (const [track, meta] of Object.entries(TRACK_META)) {
      const traits = trackTraits(raceTrack(track)!)
      if (meta.character.includes('flat')) expect(traits.climb, track).toBe(0)
      if (meta.character.includes('climb') || meta.character.includes('descent')) {
        expect(traits.climb, track).toBeGreaterThan(0)
      }
    }
  })
})

describe('the season and its flagship', () => {
  it('season 1’s flagship is over the budget, within the bars, and of the flagship tier', () => {
    const flagship = seasonFlagship()!
    expect(flagship).toBe('kite')
    expect(CURRENT_SEASON).toBe(1)
    const spec = kartSpec(flagship)
    expect(spec.tier).toBe('flagship')
    expect(spec.season).toBe(1)
    expect(BUDGET_STATS.reduce((sum, stat) => sum + spec.stats[stat], 0)).toBeGreaterThan(0)
    for (const value of Object.values(spec.stats)) {
      expect(value).toBeGreaterThanOrEqual(STAT_MIN)
      expect(value).toBeLessThanOrEqual(STAT_MAX)
    }
    // Only a flagship is of that tier
    expect(KARTS.filter((one) => one.tier === 'flagship').map((one) => one.id)).toEqual(['kite'])
  })

  it('once its season is over it rejoins the others: its retired tier, back within the budget', () => {
    for (const season of KART_SEASONS) {
      const raw = KARTS.find((one) => one.id === season.flagship)!
      const later = inSeason(raw, season.season + 1)
      expect(later.tier).toBe(season.retired.tier)
      expect(later.tier).not.toBe('flagship')
      expect(later.season).toBeUndefined()
      expect(BUDGET_STATS.reduce((sum, stat) => sum + later.stats[stat], 0)).toBe(0)
      // In its own season it is the flagship as it stands
      expect(inSeason(raw, season.season)).toBe(raw)
    }
    // Any other vehicle is the same in every season
    expect(inSeason(kartSpec('tide'), 5)).toEqual(kartSpec('tide'))
  })
})
