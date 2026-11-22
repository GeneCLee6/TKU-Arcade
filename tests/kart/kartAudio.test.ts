import { describe, expect, it } from 'vitest'
import { ambienceFor } from '../../src/kart/audio/ambience.ts'
import { AUDIO_TIERS, audioTier, tierRecipe, voiceBudget } from '../../src/kart/audio/tiers.ts'
import { ENGINE_VOICES, engineFrequency, GEAR_SPEEDS, gearAt } from '../../src/kart/kartAudio.ts'

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

// 2026-11-22 (#108): a bike's engine is its own: higher, revving further, more gears, a rasp
describe('the bike engine', () => {
  const bike = ENGINE_VOICES.bike
  it('idles higher than a kart and stays above it at every speed', () => {
    expect(engineFrequency(0, false, bike)).toBe(bike.idleHz)
    for (let speed = 0; speed <= 90; speed += 3) {
      expect(engineFrequency(speed, true, bike)).toBeGreaterThan(engineFrequency(speed, true))
    }
  })

  it('climbs through more, shorter gears, dropping back at each change', () => {
    const gears = bike.gearSpeeds
    expect(gears.length).toBeGreaterThan(GEAR_SPEEDS.length)
    for (let gear = 1; gear < gears.length - 1; gear++) {
      const change = gears[gear]!
      expect(engineFrequency(change + 0.01, true, bike)).toBeLessThan(
        engineFrequency(change - 0.01, true, bike),
      )
      expect(gearAt(change + 0.01, gears).gear).toBe(gear)
    }
  })

  it('sounds unlike a kart: other waves, no octave below, a firing pulse and a whine', () => {
    const kart = ENGINE_VOICES.kart
    expect(bike.wave).not.toBe(kart.wave)
    expect(bike.lowRatio).toBe(1)
    expect(kart.lowRatio).toBe(0.5)
    expect(bike.pulseDepth).toBeGreaterThan(0)
    expect(bike.whineGain).toBeGreaterThan(0)
    expect(kart.pulseDepth).toBe(0)
  })
})

// 2026-11-22 (#105): the sound by the graphics quality
describe('the sound by the quality', () => {
  it('low has fewer voices, one ambient bed, nothing now and then, slower updates, one saw', () => {
    const { low, medium, high } = AUDIO_TIERS
    expect(low.maxVoices).toBeLessThan(medium.maxVoices)
    expect(medium.maxVoices).toBeLessThan(high.maxVoices)
    expect(low.ambienceLayers).toBe(1)
    expect(low.occasional).toBe(false)
    expect(low.updateEvery).toBeGreaterThan(high.updateEvery)
    expect(low.engineTwin).toBe(false)
    expect(high.engineTwin).toBe(true)
    expect(audioTier(undefined)).toBe(high)
  })

  it('keeps the loudest beds only', () => {
    const recipe = ambienceFor({ id: 'wharf' })
    expect(Object.keys(tierRecipe(recipe, AUDIO_TIERS.low).layers)).toEqual(['surf'])
    expect(Object.keys(tierRecipe(recipe, AUDIO_TIERS.medium).layers)).toHaveLength(2)
    expect(tierRecipe(recipe, AUDIO_TIERS.high).layers).toEqual(recipe.layers)
  })

  it('lets only so many one-shot sounds play at once', () => {
    const budget = voiceBudget(2)
    expect(budget.claim(0, 1)).toBe(true)
    expect(budget.claim(0.1, 1)).toBe(true)
    expect(budget.claim(0.2, 1)).toBe(false)
    expect(budget.playing(0.5)).toBe(2)
    // The first has ended: room for one more
    expect(budget.claim(1.05, 1)).toBe(true)
  })
})
