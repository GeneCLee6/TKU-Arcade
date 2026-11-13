import { describe, expect, it } from 'vitest'
import { engineFrequency } from '../../src/kart/kartAudio.ts'

// e8-t13: the engine note follows the speed

describe('the engine note', () => {
  it('idles low and rises with speed and throttle', () => {
    expect(engineFrequency(0, false)).toBe(52)
    expect(engineFrequency(30, true)).toBeGreaterThan(engineFrequency(30, false))
    expect(engineFrequency(30, false)).toBeGreaterThan(engineFrequency(10, false))
    // Reversing sounds like going forwards as fast
    expect(engineFrequency(-10, false)).toBe(engineFrequency(10, false))
  })
})
