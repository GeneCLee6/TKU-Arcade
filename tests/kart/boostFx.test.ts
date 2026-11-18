import { describe, expect, it } from 'vitest'
import {
  BOOST_FX,
  BOOST_KINDS,
  boostFx,
  boostKindOf,
  DERIVE_FULL_SECONDS,
  MORPH_IN_SECONDS,
  MORPH_OUT_SECONDS,
  morphEase,
  NO_BOOST,
  readBoost,
  type BoostInput,
  type BoostReading,
} from '../../src/kart/boostFx.ts'
import { kartBoost } from '../../src/styles/kartTokens.ts'

const FRAME = 1 / 60

/** Reads `look` for `seconds`, a frame at a time */
function run(from: BoostReading, look: BoostInput, seconds: number): BoostReading {
  let reading = from
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame++) {
    reading = readBoost(reading, look, FRAME)
  }
  return reading
}

describe('the boost effects (2026-11-18)', () => {
  it('has a style for every kind, and only the instant boost keeps the kart closed', () => {
    for (const kind of BOOST_KINDS) {
      expect(BOOST_FX[kind].core).toBe(kartBoost[kind].core)
      expect(BOOST_FX[kind].transforms).toBe(kind !== 'mini')
    }
    expect(BOOST_FX.mini.length).toBeLessThan(BOOST_FX.n2o.length)
    expect(BOOST_FX.team.flame).not.toBe(BOOST_FX.n2o.flame)
  })

  it('boostFx says which boost runs in a look', () => {
    expect(boostFx('team')).toEqual({ boosting: true, boostKind: 'team' })
    expect(boostFx(null)).toEqual({ boosting: false })
  })

  it("reads a kart's own boost from its state, the strongest first", () => {
    expect(boostKindOf({ boostSeconds: 0, miniSeconds: 0 })).toBeNull()
    expect(boostKindOf({ boostSeconds: 0, miniSeconds: 0.3 })).toBe('mini')
    expect(boostKindOf({ boostSeconds: 2, miniSeconds: 0.3 })).toBe('n2o')
    expect(boostKindOf({ boostSeconds: 0, miniSeconds: 0.3, launchSeconds: 1 })).toBe('start')
    expect(boostKindOf({ boostSeconds: 0, miniSeconds: 0, launchSeconds: 1 }, 'mini')).toBe('mini')
  })

  it('opens the shape in a quarter of a second for a full boost, and closes it after', () => {
    const lit = run(NO_BOOST, boostFx('n2o'), MORPH_IN_SECONDS / 2)
    expect(lit.kind).toBe('n2o')
    expect(lit.morph).toBeGreaterThan(0.4)
    expect(lit.morph).toBeLessThan(0.6)
    const open = run(lit, boostFx('n2o'), MORPH_IN_SECONDS)
    expect(open.morph).toBe(1)
    expect(open.heat).toBe(1)
    const closing = run(open, boostFx(null), MORPH_OUT_SECONDS / 2)
    expect(closing.kind).toBeNull()
    expect(closing.last).toBe('n2o')
    expect(closing.morph).toBeGreaterThan(0.4)
    expect(closing.morph).toBeLessThan(0.6)
    expect(run(closing, boostFx(null), MORPH_OUT_SECONDS).morph).toBe(0)
  })

  it('keeps the shape closed in an instant boost', () => {
    const lit = run(NO_BOOST, boostFx('mini'), 0.5)
    expect(lit.morph).toBe(0)
    expect(lit.heat).toBe(1)
  })

  it("fires with the caller's count where there is one, as hard as it says", () => {
    const still = readBoost(NO_BOOST, { boosting: false, bursts: 3 }, FRAME)
    expect(still.fired).toBe(0)
    const fired = readBoost(still, { ...boostFx('start'), bursts: 4, burstPower: 1 }, FRAME)
    expect(fired.fired).toBe(1)
    expect(fired.power).toBe(1)
    expect(fired.age).toBe(0)
    // The same count again fires nothing more
    expect(readBoost(fired, { ...boostFx('start'), bursts: 4, burstPower: 1 }, FRAME).fired).toBe(1)
  })

  it("works a kind out for a look that only says it boosts: another racer's kart", () => {
    const started = readBoost(NO_BOOST, { boosting: true }, FRAME)
    expect(started.kind).toBe('mini')
    expect(started.fired).toBe(1)
    expect(started.power).toBe(BOOST_FX.mini.power)
    // An instant boost ends before it could count as a full one
    const short = run(started, { boosting: true }, DERIVE_FULL_SECONDS - 0.1)
    expect(short.kind).toBe('mini')
    expect(short.morph).toBe(0)
    // Still running after that, it is a full boost: it fires again and the shape opens
    const long = run(short, { boosting: true }, 0.2)
    expect(long.kind).toBe('n2o')
    expect(long.fired).toBe(2)
    expect(long.power).toBe(BOOST_FX.n2o.power)
    expect(long.morph).toBeGreaterThan(0)
    // Over, then another: it starts as an instant boost again
    const over = run(long, { boosting: false }, 0.5)
    expect(over.morph).toBe(0)
    expect(readBoost(over, { boosting: true }, FRAME).kind).toBe('mini')
  })

  it('eases the change of shape from closed to open, with a small overshoot', () => {
    expect(morphEase(0)).toBeCloseTo(0)
    expect(morphEase(1)).toBeCloseTo(1)
    expect(morphEase(0.8)).toBeGreaterThan(1)
    expect(morphEase(0.8)).toBeLessThan(1.15)
  })
})
