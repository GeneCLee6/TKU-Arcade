import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { FEEL_DRIVERS, feelRace } from '../../scripts/kart/feel.ts'

// The classic feel (2026-11-17, docs/KART-FEEL.md §5): what its techniques are worth. A novice, an
// average driver and an expert (scripts/kart/feel.ts) race three laps; the full table, all five
// tracks and the arcade (old) preset too, is `npm run kart:feel` and docs/ARCHITECTURE.md §4.27.

describe.each(['riverside', 'tamkang', 'oldstreet'])('the classic feel on %s', (id) => {
  const novice = feelRace(id, FEEL_DRIVERS.novice, KART_TUNING)
  const average = feelRace(id, FEEL_DRIVERS.average, KART_TUNING)
  const expert = feelRace(id, FEEL_DRIVERS.expert, KART_TUNING)

  it('every driver finishes', () => {
    for (const result of [novice, average, expert]) expect(result.finished).toBe(true)
  })

  it('pays for skill: the expert well ahead of the novice, the average between', () => {
    expect(expert.seconds).toBeLessThan(average.seconds)
    expect(average.seconds).toBeLessThan(novice.seconds)
    expect(expert.seconds).toBeLessThan(novice.seconds * 0.85)
  })

  it('the expert fires instant boosts all lap long; the average driver only by chance', () => {
    // The average driver never means to, but steering out of a drift with the throttle down is the
    // counter-steer, so a few come anyway (the owner's rule: counter-steer and forward boosts)
    expect(expert.dashes).toBeGreaterThan(30)
    expect(expert.dashes).toBeGreaterThan(average.dashes * 3)
  })
})
