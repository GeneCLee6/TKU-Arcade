import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { FEEL_DRIVERS, feelRace } from '../../scripts/kart/feel.ts'

// The classic feel (2026-11-17, docs/KART-FEEL.md §5): what its techniques are worth. A novice, an
// average driver and an expert race three laps; the full table, all five tracks and the arcade
// (old) preset too, is `npm run kart:feel`.
//
// 2026-11-18 (owner: "the N2O fills too slowly: an expert should be able to boost all the way round
// and a novice not"): the drivers are people, mistakes and all (scripts/kart/drivers.ts), not the
// computer opponents, and what is pinned is the boost cover: the share of the race spent in any
// boost. The owner's targets: the expert 70% or more, the novice 15% or less, the average between
// (about 30 to 45%), and the expert's time a quarter or more under the novice's.

describe.each(['riverside', 'tamkang', 'guanyin'])('the classic feel on %s', (id) => {
  const novice = feelRace(id, FEEL_DRIVERS.novice, KART_TUNING)
  const average = feelRace(id, FEEL_DRIVERS.average, KART_TUNING)
  const expert = feelRace(id, FEEL_DRIVERS.expert, KART_TUNING)

  it('every driver finishes', () => {
    for (const result of [novice, average, expert]) expect(result.finished).toBe(true)
  })

  it('pays for skill: the expert a quarter or more under the novice, the average between', () => {
    expect(expert.seconds).toBeLessThan(average.seconds)
    expect(average.seconds).toBeLessThan(novice.seconds)
    expect(expert.seconds).toBeLessThan(novice.seconds * 0.75)
  })

  it('the expert boosts nearly all the way round, the novice hardly ever, the average between', () => {
    expect(expert.cover).toBeGreaterThanOrEqual(0.7)
    expect(novice.cover).toBeLessThanOrEqual(0.15)
    expect(average.cover).toBeGreaterThan(novice.cover + 0.05)
    expect(average.cover).toBeLessThan(0.5)
    expect(average.cover).toBeLessThan(expert.cover - 0.25)
  })

  it('the expert fires charge after charge; the novice a charge now and then at the most', () => {
    // Five a lap or more against one a lap at the very most
    expect(expert.fired).toBeGreaterThanOrEqual(15)
    expect(novice.fired).toBeLessThanOrEqual(3)
    expect(average.fired).toBeLessThan(expert.fired * 0.6)
  })

  it('the expert times the press: perfect nearly every time, and one after another', () => {
    expect(expert.dashes).toBeGreaterThanOrEqual(20)
    expect(expert.perfect).toBeGreaterThanOrEqual(expert.dashes * 0.85)
    expect(expert.combo).toBeGreaterThanOrEqual(4)
    // The novice never means to: what fires, fires by chance (a foot lifted for a corner coming
    // back down in a slide), and next to never on time
    expect(novice.perfect).toBeLessThanOrEqual(3)
    expect(novice.combo).toBeLessThanOrEqual(4)
  })

  it('the novice makes a novice of it: into the walls', () => {
    expect(novice.crashes).toBeGreaterThanOrEqual(5)
  })
})

// The old street is the item track: wide, with few corners that take a drift (docs/KART-FEEL.md
// §5). The expert's cover there is short of the target, and says so
describe('the classic feel on oldstreet, the item track', () => {
  const novice = feelRace('oldstreet', FEEL_DRIVERS.novice, KART_TUNING)
  const expert = feelRace('oldstreet', FEEL_DRIVERS.expert, KART_TUNING)

  it('still tells the two apart, with less room to', () => {
    expect(expert.finished && novice.finished).toBe(true)
    expect(expert.seconds).toBeLessThan(novice.seconds * 0.75)
    expect(expert.cover).toBeGreaterThanOrEqual(0.35)
    expect(novice.cover).toBeLessThanOrEqual(0.15)
  })
})
