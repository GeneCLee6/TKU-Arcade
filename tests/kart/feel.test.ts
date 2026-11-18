import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { FEEL_DRIVERS, feelRace } from '../../scripts/kart/feel.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'

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
    // 2026-11-18, the tracks redrawn: 0.84 to 0.86 (docs/KART-FEEL.md §10 has the table)
    expect(expert.seconds).toBeLessThan(novice.seconds * 0.87)
  })

  // 2026-11-18, owner: "a player can drift a little and boost, drift a little and boost, all lap
  // long ... it should take a big drift to boost". Before: 87 to 122 instant boosts in three laps.
  // With the marks at 32° and 0.45 s: 10 to 30, and "now it drifts too big again: a drift that
  // really slid should boost". Now every drift through a corner earns one
  it('the expert fires an instant boost out of the corners it drifts; the others next to none', () => {
    expect(expert.dashes).toBeGreaterThanOrEqual(8)
    // Not all lap long: about fifteen a lap at the very most
    expect(expert.dashes).toBeLessThanOrEqual(48)
    // A landing boost off a jump counts here too: one a lap for everyone on a track with a jump
    const landings = 3 * (raceTrack(id)?.jumps?.length ?? 0)
    expect(expert.dashes - landings).toBeGreaterThanOrEqual((average.dashes - landings) * 3)
    // By chance only (the brake let go in a slide is a fresh press of the throttle)
    expect(novice.dashes - landings).toBeLessThanOrEqual(9)
  })
})
