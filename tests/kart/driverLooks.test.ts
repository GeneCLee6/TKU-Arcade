import { Box3, Mesh } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { DRIVER_IDS } from '../../shared/kart/karts.ts'
import { KART_DRIVER_MESSAGES } from '../../shared/kart/i18n.drivers.ts'
import { DEFAULT_OUTFIT, OUTFIT_IDS, OUTFIT_UNLOCK, outfitOpen } from '../../shared/kart/outfits.ts'
import { RULE_IDS } from '../../src/achievements/rules.ts'
import { BUILD_LIMITS, DRIVER_LOOKS } from '../../src/kart/art/driverLooks.ts'
import { buildKartModel } from '../../src/kart/art/kartModel.ts'
import { loadOutfit, saveOutfit } from '../../src/kart/bodies.ts'
import {
  gesturePose,
  HEART_COUNT,
  heartFlight,
  keyed,
  KISS_AT,
  KISS_FLIGHT,
  REST,
  SHOWPIECE_SECONDS,
} from '../../src/kart/driverGestures.ts'
import { kartFeatures, kartOutfits } from '../../src/styles/kartTokens.ts'

// 2026-11-23 (docs/KART-WORLD.md §3.1–3.3): every driver their own build, helmet, thing of their own,
// three outfits and a win; the outfits kept per driver; the win's pure parts

const HEX = /^#[0-9A-F]{6}$/

describe("the drivers' looks, as data", () => {
  it('gives each driver a build within the limits, and no two the same outline', () => {
    const outlines = new Set<string>()
    for (const driver of DRIVER_IDS) {
      const { build, helmet, feature } = DRIVER_LOOKS[driver]
      for (const factor of [build.height, build.shoulders, build.girth]) {
        expect(factor).toBeGreaterThanOrEqual(BUILD_LIMITS.min)
        expect(factor).toBeLessThanOrEqual(BUILD_LIMITS.max)
      }
      outlines.add(`${build.height}:${build.shoulders}`)
      outlines.add(helmet)
      outlines.add(feature)
    }
    // Four builds, four helmets, four features
    expect(outlines.size).toBe(DRIVER_IDS.length * 3)
  })

  it('dresses every driver in three outfits, each its own cut and colours', () => {
    for (const driver of DRIVER_IDS) {
      const look = DRIVER_LOOKS[driver]
      expect(look.outfits[DEFAULT_OUTFIT]).toBe('suit')
      expect(new Set(OUTFIT_IDS.map((one) => look.outfits[one])).size).toBe(OUTFIT_IDS.length)
      const palettes = new Set<string>()
      for (const outfit of OUTFIT_IDS) {
        const dress = kartOutfits[driver][outfit]
        for (const tint of Object.values(dress)) expect(tint).toMatch(HEX)
        palettes.add(`${dress.body}${dress.sleeve}${dress.legs}`)
      }
      expect(palettes.size).toBe(OUTFIT_IDS.length)
      for (const tint of Object.values(kartFeatures[driver])) expect(tint).toMatch(HEX)
    }
    // No two drivers wear the same colours in the same outfit
    for (const outfit of OUTFIT_IDS) {
      expect(new Set(DRIVER_IDS.map((driver) => kartOutfits[driver][outfit].body)).size).toBe(
        DRIVER_IDS.length,
      )
    }
  })

  it('has every profile and outfit name in both languages', () => {
    const { en, 'zh-TW': zh } = KART_DRIVER_MESSAGES
    for (const driver of DRIVER_IDS) {
      for (const field of ['build', 'personality', 'origin', 'catchphrase', 'tracks', 'win']) {
        const key = `kart.profile.${driver}.${field}` as keyof typeof en
        expect(en[key], key).toBeTruthy()
        expect(zh[key], key).toBeTruthy()
      }
      for (const other of DRIVER_IDS.filter((one) => one !== driver)) {
        expect(en[`kart.profile.${driver}.rel.${other}` as keyof typeof en]).toBeTruthy()
      }
      for (const outfit of OUTFIT_IDS)
        expect(en[`kart.outfit.${driver}.${outfit}` as keyof typeof en]).toBeTruthy()
    }
  })

  it('opens every outfit for now, and names a real achievement for each one to open with later', () => {
    for (const outfit of OUTFIT_IDS) {
      expect(outfitOpen(outfit)).toBe(true)
      const gate = OUTFIT_UNLOCK[outfit]
      if (gate !== null) expect(RULE_IDS.has(gate), gate).toBe(true)
    }
    expect(OUTFIT_UNLOCK[DEFAULT_OUTFIT]).toBeNull()
  })
})

describe('the outfit kept in this browser', () => {
  beforeEach(() => localStorage.clear())

  it('keeps each driver in what they wore last, the race suit at first or when what is kept is not an outfit', () => {
    expect(loadOutfit('heart')).toBe('race')
    saveOutfit('heart', 'street')
    saveOutfit('club', 'campus')
    expect(loadOutfit('heart')).toBe('street')
    expect(loadOutfit('club')).toBe('campus')
    expect(loadOutfit('spade')).toBe('race')
    localStorage.setItem('tku-arcade.kart.outfit.diamond', 'tuxedo')
    expect(loadOutfit('diamond')).toBe('race')
  })
})

describe("each driver's win (KART-WORLD §3.3)", () => {
  it('eases from key to key and holds the last', () => {
    const keys = [
      [0, {}],
      [1, { leftUp: 2, leftHand: 'open' }],
    ] as const
    expect(keyed(0, keys)).toEqual(REST)
    expect(keyed(0.5, keys).leftUp).toBeCloseTo(1, 5)
    expect(keyed(2, keys).leftUp).toBe(2)
    expect(keyed(0.4, keys).leftHand).toBeUndefined()
    expect(keyed(0.6, keys).leftHand).toBe('open')
  })

  it('draws the sword low across the body before pointing at the sky', () => {
    const draw = gesturePose('cheer', 0.5, 0, 'spade')
    expect(draw.rightOut).toBeLessThan(-0.5)
    expect(draw.twist).toBeGreaterThan(0.2)
    const sky = gesturePose('cheer', 2, 0, 'spade')
    expect(sky.rightUp).toBeGreaterThan(2.8)
    expect(sky.rightHand).toBe('point')
  })

  it("throws Hartie's kiss: the hearts fly out one after another, fanned, and are gone by the end", () => {
    expect(gesturePose('cheer', KISS_AT - 0.1, 0, 'heart').burst).toBe(0)
    const flying = gesturePose('cheer', KISS_AT + KISS_FLIGHT / 2, 0, 'heart')
    expect(flying.burst).toBeGreaterThan(0.3)
    expect(gesturePose('cheer', SHOWPIECE_SECONDS, 0, 'heart').burst).toBe(1)
    expect(heartFlight(0, 0)).toBeNull()
    expect(heartFlight(1, 0)).toBeNull()
    const mid = Array.from({ length: HEART_COUNT }, (_, index) => heartFlight(0.5, index))
    for (const one of mid) {
      expect(one).not.toBeNull()
      // In front of the driver and up
      expect(one!.z).toBeLessThan(-0.25)
      expect(one!.y).toBeGreaterThan(0.72)
    }
    expect(mid[0]!.x).toBeLessThan(0)
    expect(mid[HEART_COUNT - 1]!.x).toBeGreaterThan(0)
    // The first leaves first
    expect(heartFlight(0.05, 0)!.scale).toBeGreaterThan(heartFlight(0.05, 1)?.scale ?? 0)
    // No other driver throws one
    for (const style of ['spade', 'diamond', 'club'] as const) {
      expect(gesturePose('cheer', KISS_AT + 0.5, 0, style).burst).toBe(0)
    }
  })

  it("shows Dee's calculator and Clover's dumbbell only while they are used", () => {
    expect(gesturePose('cheer', 0, 0, 'diamond').prop).toBe(0)
    expect(gesturePose('cheer', 1.4, 0, 'diamond').prop).toBe(1)
    expect(gesturePose('cheer', 0.8, 0, 'club').prop).toBe(1)
    expect(gesturePose('cheer', 1.7, 0, 'club').rightUp).toBeGreaterThan(2.7)
    expect(gesturePose('cheer', SHOWPIECE_SECONDS, 0, 'club').prop).toBe(0)
    // Clover curls it twice: the elbow bends and straightens
    const bends = Array.from(
      { length: 40 },
      (_, i) => gesturePose('cheer', 0.3 + i * 0.0225, 0, 'club').rightBend,
    )
    expect(Math.max(...bends)).toBeGreaterThan(1.8)
    expect(Math.min(...bends)).toBeLessThan(0.5)
    for (const style of ['spade', 'heart'] as const) {
      for (let t = 0; t < 4; t += 0.25) expect(gesturePose('cheer', t, 0, style).prop).toBe(0)
    }
  })
})

/** The model's size, standing, and how many meshes it has */
function measure(
  driver: (typeof DRIVER_IDS)[number],
  outfit: (typeof OUTFIT_IDS)[number],
  detail: 'low' | 'high' = 'high',
) {
  const model = buildKartModel(
    false,
    false,
    'tide',
    driver,
    { driver: detail },
    { standing: true, outfit },
  )
  model.update({ speed: 0, steer: 0, drift: 0, boosting: false }, 1 / 30)
  model.group.updateMatrixWorld(true)
  return model
}

describe('the drivers built', () => {
  it('builds every driver in every outfit at every detail', () => {
    for (const driver of DRIVER_IDS) {
      for (const outfit of OUTFIT_IDS) {
        for (const detail of ['low', 'high'] as const) {
          const model = measure(driver, outfit, detail)
          expect(model.outfit).toBe(outfit)
          model.dispose()
        }
      }
    }
  })

  it('stands each driver at their own height, Spade the tallest and Hartie the smallest', () => {
    const tops = Object.fromEntries(
      DRIVER_IDS.map((driver) => {
        const model = measure(driver, 'race')
        // The top of the head: the highest point of the kart and its driver standing beside it
        const box = new Box3().setFromObject(model.group)
        model.dispose()
        return [driver, box.max.y]
      }),
    )
    expect(tops.spade).toBeGreaterThan(tops.heart!)
    expect(tops.club).toBeGreaterThan(tops.heart!)
  })

  it('puts the prop in the hand and throws the hearts in a win', () => {
    const count = (model: ReturnType<typeof buildKartModel>) => {
      let shown = 0
      model.group.traverse((object) => {
        // Shown: not scaled to nothing
        if (object instanceof Mesh && Math.abs(object.matrixWorld.determinant()) > 1e-9) shown++
      })
      return shown
    }
    for (const driver of ['diamond', 'club', 'heart'] as const) {
      const model = buildKartModel(false, false, 'tide', driver)
      for (let i = 0; i < 20; i++)
        model.update({ speed: 0, steer: 0, drift: 0, boosting: false }, 1 / 30)
      model.group.updateMatrixWorld(true)
      const resting = count(model)
      for (let i = 0; i < 42; i++)
        model.update({ speed: 0, steer: 0, drift: 0, boosting: false, gesture: 'cheer' }, 1 / 30)
      model.group.updateMatrixWorld(true)
      expect(count(model), driver).toBeGreaterThan(resting)
      model.dispose()
    }
  })
})
