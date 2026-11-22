import { describe, expect, it } from 'vitest'
import { applyKart, kartSpec, type KartId } from '../../shared/kart/karts.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { speedCapFor } from '../../shared/kart/race.ts'
import { FEEL_DRIVERS, feelRace } from '../../scripts/kart/feel.ts'
import { median } from '../../scripts/kart/meta.ts'

// The first season's flagship, driven (2026-11-21, docs/KART-META.md §3): in exact hands the
// quickest there is, and in a novice's not. The whole table (every vehicle, every track, nine races
// each) is `npm run kart:meta`; here a few of its cells, the same races, so the same numbers.

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((seed) => seed * 7)

const races = new Map<string, number>()
const raced = (track: string, who: keyof typeof FEEL_DRIVERS, kart: KartId): number => {
  const key = `${track}/${who}/${kart}`
  const known = races.get(key)
  if (known !== undefined) return known
  const time = median(
    SEEDS.map((seed) => feelRace(track, FEEL_DRIVERS[who], applyKart(KART_TUNING, kart), seed).seconds),
  )
  races.set(key, time)
  return time
}

/**
 * The flagship's target (owner 2026-11-22, docs/KART-META.md §3.1): against each track's quickest
 * other vehicle, the master's lead is at most this on any one track (and at most 1% on average over
 * the twelve: `npm run kart:meta`, too long for a test)
 */
const MOST_LEAD = 0.035

describe('the season flagship', () => {
  it('is faster on a straight than any other vehicle, and the room allows for it', () => {
    const kite = applyKart(KART_TUNING, 'kite')
    for (const other of ['heron', 'whale', 'hornet'] as const) {
      expect(kite.topSpeed).toBeGreaterThan(applyKart(KART_TUNING, other).topSpeed)
      expect(speedCapFor('kite')).toBeGreaterThan(speedCapFor(other))
    }
    // ... and harder to drive: twitchier, and a wall costs more
    expect(kite.steerResponse).toBeGreaterThan(KART_TUNING.steerResponse * 2)
    expect(kite.wallImpactLoss).toBeGreaterThan(KART_TUNING.wallImpactLoss)
    expect(kite.wallGaugeKeep).toBeLessThan(KART_TUNING.wallGaugeKeep)
    expect(kartSpec('kite').tier).toBe('flagship')
  })

  it('the master is quicker in it than in the quickest other vehicle on the harbour', () => {
    // heron is the harbour's quickest of the rest (shared/kart/meta.ts)
    expect(raced('harbour', 'master', 'kite')).toBeLessThan(raced('harbour', 'master', 'heron'))
  }, 120_000)

  it('... but by no more than 3.5%, there (its biggest lead) and on the old street (the next)', () => {
    // The two tracks of its biggest leads (3.45% and 3.37%, docs/KART-META.md §3.1); heron is the
    // quickest of the rest on both (shared/kart/meta.ts)
    for (const track of ['harbour', 'oldstreet']) {
      const other = raced(track, 'master', 'heron')
      const lead = (other - raced(track, 'master', 'kite')) / other
      expect(lead, track).toBeLessThanOrEqual(MOST_LEAD)
    }
  }, 240_000)

  it('a novice is not: on the hillside lanes the entry bike is quicker in a novice’s hands', () => {
    expect(raced('lanes', 'novice', 'swift')).toBeLessThan(raced('lanes', 'novice', 'kite'))
  }, 180_000)
})
