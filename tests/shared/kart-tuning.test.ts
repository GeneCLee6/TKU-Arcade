import { describe, expect, it } from 'vitest'
import {
  ARCADE_TUNING,
  KART_TUNING,
  MODEL_ARCADE,
  MODEL_CLASSIC,
} from '../../shared/kart/physics.ts'
import {
  MAX_TUNING_TEXT,
  parseStoredTuning,
  parseTuning,
  PRESET_IDS,
  presetOf,
  shownKeys,
  PRESETS,
  serializeTuning,
  shownValue,
  steadySlips,
  storedValue,
  TUNING_KEYS,
  TUNING_SPECS,
  validValue,
} from '../../shared/kart/tuning.ts'

describe('the tuning specs', () => {
  it('cover every number in KART_TUNING, and nothing else', () => {
    expect([...TUNING_KEYS].sort()).toEqual(Object.keys(KART_TUNING).sort())
  })

  it('have sane ranges and steps that land on the ends', () => {
    for (const key of TUNING_KEYS) {
      const { min, max, step } = TUNING_SPECS[key]
      expect(min, key).toBeLessThan(max)
      expect(step, key).toBeGreaterThan(0)
      const steps = (max - min) / step
      expect(Math.abs(steps - Math.round(steps)), key).toBeLessThan(1e-6)
    }
  })

  it('round a slider value to its step, and turn degrees into radians', () => {
    expect(storedValue('turnRate', 2.2000000001)).toBe(2.2)
    expect(storedValue('boostTopSpeedFactor', 1.3)).toBe(1.3)
    expect(storedValue('chainGrace', 0.30000000000000004)).toBe(0.3)
    expect(storedValue('driftMaxSlip', 40)).toBeCloseTo((40 * Math.PI) / 180, 12)
    expect(shownValue('driftMaxSlip', KART_TUNING.driftMaxSlip)).toBeCloseTo(50, 9)
    expect(shownValue('driftMaxSlip', ARCADE_TUNING.driftMaxSlip)).toBeCloseTo(58, 9)
  })
})

describe('the presets', () => {
  it('are four, with standard being the physics defaults (the classic feel), and the arcade (old)', () => {
    expect(PRESET_IDS).toEqual(['standard', 'planted', 'loose', 'arcade'])
    expect(PRESETS.standard).toBe(KART_TUNING)
    expect(PRESETS.arcade).toBe(ARCADE_TUNING)
    for (const id of ['standard', 'planted', 'loose'] as const) {
      expect(PRESETS[id].model).toBe(MODEL_CLASSIC)
    }
    expect(ARCADE_TUNING.model).toBe(MODEL_ARCADE)
  })

  it('show on the panel only the numbers their own physics reads', () => {
    const classic = shownKeys(KART_TUNING)
    const arcade = shownKeys(ARCADE_TUNING)
    expect(classic).toContain('dashMinSlip')
    expect(classic).not.toContain('driftAlign')
    expect(arcade).toContain('driftAlign')
    expect(arcade).not.toContain('dashMinSlip')
    expect(classic).not.toContain('model')
    expect(arcade).not.toContain('model')
  })

  for (const id of PRESET_IDS) {
    it(`${id}: every number is valid and survives JSON both ways`, () => {
      const preset = PRESETS[id]
      for (const key of TUNING_KEYS) expect(validValue(key, preset[key]), key).toBe(true)
      const parsed = parseTuning(serializeTuning(preset))
      expect(parsed).toEqual({ ok: true, tuning: preset, missing: [], ignored: [] })
      expect(presetOf(preset)).toBe(id)
    })
  }

  it('differ from each other in the drift as they say: planted narrower, loose wider', () => {
    const standard = steadySlips(PRESETS.standard)
    const planted = steadySlips(PRESETS.planted)
    const loose = steadySlips(PRESETS.loose)
    // The measured angles, rounded (2026-11-14, the drift as a real slide; they were 33°, 23°, 13°;
    // then the classic feel, 2026-11-17, whose drift swings to the angle it is told)
    expect(standard).toEqual({ into: 42, centred: 30, out: 18 })
    expect(steadySlips(PRESETS.arcade)).toEqual({ into: 50, centred: 38, out: 21 })
    expect(planted.into).toBeLessThan(standard.into)
    expect(planted.centred).toBeLessThan(standard.centred)
    expect(loose.into).toBeGreaterThan(standard.into)
    expect(loose.centred).toBeGreaterThan(standard.centred)
    expect(PRESETS.planted.grip).toBeGreaterThan(KART_TUNING.grip)
    expect(PRESETS.loose.grip).toBeLessThan(KART_TUNING.grip)
  })

  it('tells a changed set of numbers from every preset', () => {
    expect(presetOf({ ...KART_TUNING, grip: 11 })).toBeUndefined()
  })
})

describe('parseTuning', () => {
  it('takes a bare object of numbers too, keeping the fallback for what it leaves out', () => {
    const parsed = parseTuning('{"grip": 12, "topSpeed": 33}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.tuning).toEqual({ ...KART_TUNING, grip: 12, topSpeed: 33 })
    // Missing: the numbers the panel shows for this feel, less the two given
    expect(parsed.missing).toHaveLength(shownKeys(KART_TUNING).length - 2)
    expect(parsed.missing).not.toContain('grip')
  })

  it('ignores names it does not know, and says which', () => {
    const parsed = parseTuning('{"grip": 12, "colour": "red", "__proto__": {"x": 1}}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.ignored).toContain('colour')
    expect(parsed.tuning).not.toHaveProperty('colour')
    expect(Object.getPrototypeOf(parsed.tuning)).toBe(Object.prototype)
  })

  it.each([
    ['empty', ''],
    ['not JSON', 'grip = 12'],
    ['cut short', '{"grip": 1'],
    ['far too long', `{"grip": 12, "pad": "${'x'.repeat(MAX_TUNING_TEXT)}"}`],
  ])('rejects text that is %s', (_, text) => {
    expect(parseTuning(text)).toEqual({ ok: false, error: { reason: 'notJson' } })
  })

  it.each([
    ['a number', '42'],
    ['a string', '"fast"'],
    ['null', 'null'],
    ['an array', '[1, 2, 3]'],
    ['an object with no tuning numbers', '{"hello": "world"}'],
    ['another kind of export', '{"kind": "tku-arcade.kart.bindings", "tuning": {"grip": 12}}'],
    ['a newer version', '{"kind": "tku-arcade.kart.tuning", "version": 3, "tuning": {"grip": 12}}'],
    ['a wrapper with no tuning object', '{"kind": "tku-arcade.kart.tuning", "tuning": [1]}'],
  ])('rejects JSON that is %s', (_, text) => {
    expect(parseTuning(text)).toEqual({ ok: false, error: { reason: 'notTuning' } })
  })

  it.each([
    ['a string', '{"grip": "12"}', 'grip'],
    ['below the range', '{"topSpeed": 1}', 'topSpeed'],
    ['above the range', '{"boostTopSpeedFactor": 9}', 'boostTopSpeedFactor'],
    ['not whole for a count', '{"maxStoredBoosts": 1.5}', 'maxStoredBoosts'],
    ['null', '{"wallBounce": null}', 'wallBounce'],
    ['a huge number', '{"grip": 1e400}', 'grip'],
    ['a slip cap of 80°', `{"driftMaxSlip": ${(80 * Math.PI) / 180}}`, 'driftMaxSlip'],
  ])('rejects the whole preset when one number is %s', (_, text, key) => {
    expect(parseTuning(text)).toEqual({ ok: false, error: { reason: 'badValue', key } })
  })

  it('reads an export from before the classic feel (version 1) as the arcade feel', () => {
    const old = JSON.stringify({ kind: 'tku-arcade.kart.tuning', version: 1, tuning: { grip: 12 } })
    const parsed = parseTuning(old)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.tuning).toEqual({ ...ARCADE_TUNING, grip: 12 })
    expect(parsed.tuning.model).toBe(MODEL_ARCADE)
  })

  it('takes nothing from a preset with one bad number among good ones', () => {
    const parsed = parseTuning('{"grip": 12, "topSpeed": 33, "driftAlign": -1}')
    expect(parsed).toEqual({ ok: false, error: { reason: 'badValue', key: 'driftAlign' } })
  })
})

describe('parseStoredTuning', () => {
  it('gives the standard preset for nothing stored, or anything broken', () => {
    for (const stored of [null, '', 'nonsense', '{"grip": -5}', '[]']) {
      expect(parseStoredTuning(stored)).toEqual({ tuning: KART_TUNING, preset: 'standard' })
    }
  })

  it('reads back what was stored and which preset it is', () => {
    expect(parseStoredTuning(serializeTuning(PRESETS.loose))).toEqual({
      tuning: PRESETS.loose,
      preset: 'loose',
    })
    const custom = { ...PRESETS.planted, chainGrace: 0.5 }
    expect(parseStoredTuning(serializeTuning(custom))).toEqual({
      tuning: custom,
      preset: undefined,
    })
  })
})
