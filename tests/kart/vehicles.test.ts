import { describe, expect, it } from 'vitest'
import { FEEL_DRIVERS, vehicleTable } from '../../scripts/kart/feel.ts'

// 2026-11-19 (the series and the bikes): the same hands in different vehicles. The whole table,
// seventeen vehicles on nine tracks, is `npm run kart:feel -- --karts` (docs/KART-FEEL.md §12);
// this pins a corner of it, the expert on the two shortest tracks in the standard kart, the fastest
// kart and the three bikes: a bike is another way round a lap, not a quicker one.
describe('the same expert in different vehicles', () => {
  const tracks = ['guanyin', 'fort'] as const
  const table = vehicleTable(FEEL_DRIVERS.expert, 1, tracks, [
    'tide',
    'heron',
    'swift',
    'hornet',
    'petrel',
  ])
  const row = (kart: string) => table.rows.find((one) => one.kart === kart)!

  it('finishes in every one of them', () => {
    for (const one of table.rows) expect(one.finished, one.kart).toBe(true)
  })

  it('laps a bike within a few per cent of the standard kart, either way', () => {
    for (const bike of ['swift', 'hornet', 'petrel']) {
      const share = row(bike).seconds / row('tide').seconds
      expect(share, bike).toBeGreaterThan(0.95)
      expect(share, bike).toBeLessThan(1.05)
    }
  })

  it('keeps the whole spread small: under 5% of a race between the quickest and the slowest', () => {
    expect(table.spreadShare).toBeLessThan(0.05)
  })

  it('has no vehicle that is the quickest on both and by a margin', () => {
    for (const one of table.rows) {
      const others = table.rows.filter((other) => other !== one)
      const clear = one.behind.every(
        (gap, at) => gap === 0 && others.every((other) => other.behind[at]! > 1.5),
      )
      expect(clear, one.kart).toBe(false)
    }
  })
})
