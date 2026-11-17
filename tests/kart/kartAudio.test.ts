import { describe, expect, it } from 'vitest'
import { engineFrequency, GEAR_SPEEDS, gearAt } from '../../src/kart/kartAudio.ts'

// e8-t13: the engine note follows the speed. 2026-11-17: through gears, like an engine

describe('the engine note', () => {
  it('idles low and rises with speed and throttle', () => {
    expect(engineFrequency(0, false)).toBe(52)
    expect(engineFrequency(30, true)).toBeGreaterThan(engineFrequency(30, false))
    expect(engineFrequency(12, false)).toBeGreaterThan(engineFrequency(4, false))
    // Reversing sounds like going forwards as fast
    expect(engineFrequency(-10, false)).toBe(engineFrequency(10, false))
  })

  it('climbs through each gear and drops back at the change, but never below the gear before', () => {
    for (let gear = 1; gear < GEAR_SPEEDS.length - 1; gear++) {
      const change = GEAR_SPEEDS[gear]!
      const before = engineFrequency(change - 0.01, true)
      const after = engineFrequency(change + 0.01, true)
      // The drop of a change up
      expect(after).toBeLessThan(before)
      // Each gear starts higher than the last did
      expect(after).toBeGreaterThan(engineFrequency(GEAR_SPEEDS[gear - 1]! + 0.01, true))
      expect(gearAt(change + 0.01).gear).toBe(gear)
    }
    // Within a gear, only up
    expect(engineFrequency(20, true)).toBeGreaterThan(engineFrequency(15, true))
    // Flat out in a boost, past the last gear, still rising
    expect(engineFrequency(88, true)).toBeGreaterThan(engineFrequency(74, true))
  })
})
