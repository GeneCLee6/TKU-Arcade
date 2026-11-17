import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  stepKart,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import {
  buttonPx,
  DEFAULT_TOUCH_SETTINGS,
  MIN_BUTTON_PX,
  mergeInputs,
  parseTouchSettings,
  serializeTouchSettings,
  sliderSteer,
  touchInput,
  type TouchButton,
  type TouchMoment,
  type TouchSettings,
} from '../../shared/kart/touch.ts'

const RACING: TouchMoment = { racing: true, burstWaiting: false }
const MANUAL: TouchSettings = { ...DEFAULT_TOUCH_SETTINGS, autoThrottle: false }

const reading = (held: TouchButton[] = [], tapped: TouchButton[] = [], slider = 0) => ({
  held: new Set(held),
  tapped: new Set(tapped),
  slider,
})

describe('touch settings', () => {
  it('round-trips and falls back field by field', () => {
    const custom: TouchSettings = {
      steer: 'slider',
      autoThrottle: false,
      scale: 1.2,
      opacity: 0.4,
      leftHanded: true,
      vibrate: false,
    }
    expect(parseTouchSettings(serializeTouchSettings(custom))).toEqual(custom)
    expect(parseTouchSettings(null)).toEqual(DEFAULT_TOUCH_SETTINGS)
    expect(parseTouchSettings('not json')).toEqual(DEFAULT_TOUCH_SETTINGS)
    expect(parseTouchSettings('[1,2]')).toEqual(DEFAULT_TOUCH_SETTINGS)
    expect(parseTouchSettings('{"steer":"wheel","leftHanded":true,"scale":"big"}')).toEqual({
      ...DEFAULT_TOUCH_SETTINGS,
      leftHanded: true,
    })
  })

  it('keeps the size and the opacity in range, and a button never under 48 px', () => {
    const wild = parseTouchSettings('{"scale":9,"opacity":-1}')
    expect(wild.scale).toBe(1.4)
    expect(wild.opacity).toBe(0.3)
    const small = parseTouchSettings('{"scale":0}')
    expect(buttonPx(small)).toBeGreaterThanOrEqual(MIN_BUTTON_PX)
    expect(buttonPx(DEFAULT_TOUCH_SETTINGS)).toBe(64)
  })
})

describe('the slider', () => {
  it('has a dead zone, then steers in proportion up to full', () => {
    expect(sliderSteer(0, 70)).toBe(0)
    expect(sliderSteer(5, 70)).toBe(0)
    expect(sliderSteer(-70, 70)).toBe(-1)
    expect(sliderSteer(200, 70)).toBe(1)
    const half = sliderSteer(35, 70)
    expect(half).toBeGreaterThan(0.4)
    expect(half).toBeLessThan(0.5)
    expect(sliderSteer(-35, 70)).toBe(-half)
    expect(sliderSteer(10, 0)).toBe(0)
  })

  it('steers from the slider, not the buttons, when it is the style', () => {
    const slider = { ...MANUAL, steer: 'slider' as const }
    expect(touchInput(reading(['left'], [], 0.6), slider, RACING).steer).toBe(0.6)
    expect(touchInput(reading(['left'], [], 0.6), MANUAL, RACING).steer).toBe(-1)
  })
})

describe('the buttons as an input', () => {
  it('maps each button, and both steering buttons cancel out', () => {
    const input = touchInput(reading(['right', 'brake', 'boost']), MANUAL, RACING)
    expect(input).toEqual({
      ...NO_INPUT,
      steer: 1,
      brake: true,
      boost: true,
    })
    expect(touchInput(reading(['left', 'right']), MANUAL, RACING).steer).toBe(0)
    expect(touchInput(reading(['left']), MANUAL, RACING).steer).toBe(-1)
  })

  it('counts a tap shorter than a step', () => {
    const input = touchInput(reading([], ['throttle', 'item', 'reset', 'boost']), MANUAL, RACING)
    expect(input.throttle).toBe(true)
    expect(input.item).toBe(true)
    expect(input.reset).toBe(true)
    expect(input.boost).toBe(true)
  })

  it('holds the throttle while drift is held, and lets go of both together', () => {
    expect(touchInput(reading(['drift', 'left']), MANUAL, RACING)).toMatchObject({
      drift: true,
      throttle: true,
      steer: -1,
    })
    expect(touchInput(reading(['left']), MANUAL, RACING).throttle).toBe(false)
    // Drift and brake: the brake wins the throttle
    expect(touchInput(reading(['drift', 'brake']), MANUAL, RACING).throttle).toBe(false)
  })

  describe('the automatic throttle', () => {
    const auto = DEFAULT_TOUCH_SETTINGS

    it('runs on its own once racing, not before GO', () => {
      expect(touchInput(reading(), auto, RACING).throttle).toBe(true)
      expect(touchInput(reading(), auto, { racing: false, burstWaiting: false }).throttle).toBe(
        false,
      )
      // Before GO, gas as pressed: the start boost is the player's to time
      expect(
        touchInput(reading(['throttle']), auto, { racing: false, burstWaiting: false }).throttle,
      ).toBe(true)
    })

    it('lets go while braking, to reverse', () => {
      expect(touchInput(reading(['brake']), auto, RACING)).toMatchObject({
        brake: true,
        throttle: false,
      })
    })

    it('lets go while a release boost waits, so that a tap is a fresh press', () => {
      const waiting = { racing: true, burstWaiting: true }
      expect(touchInput(reading(), auto, waiting).throttle).toBe(false)
      expect(touchInput(reading([], ['throttle']), auto, waiting).throttle).toBe(true)
    })
  })
})

describe('mergeInputs', () => {
  it('lets either press, and adds the steering up to full', () => {
    const a: KartInput = { ...NO_INPUT, throttle: true, steer: 0.7 }
    const b: KartInput = { ...NO_INPUT, drift: true, steer: 0.6, item: true }
    expect(mergeInputs(a, b)).toEqual({
      ...NO_INPUT,
      throttle: true,
      drift: true,
      steer: 1,
      item: true,
    })
    expect(mergeInputs(NO_INPUT, NO_INPUT)).toEqual(NO_INPUT)
  })
})

/**
 * The drift techniques of §4.12–4.13 driven through the touch mapping the way a thumb would: hold
 * DRIFT with a steering button, let go of DRIFT, press the other steering button, tap GAS
 */
describe('the drift techniques by touch', () => {
  function drive(
    settings: TouchSettings,
    script: (step: number) => [TouchButton[], TouchButton[]],
  ) {
    let kart: KartState = INITIAL_KART
    // Up to speed on a straight first, gas held
    for (let step = 0; step < 240; step++) {
      kart = stepKart(kart, { ...NO_INPUT, throttle: true }, KART_TUNING, DEFAULT_RULES)
    }
    let fired = false
    for (let step = 0; step < 150; step++) {
      const [held, tapped] = script(step)
      const input = touchInput(reading(held, tapped), settings, {
        racing: true,
        burstWaiting: kart.burstReady || kart.releaseWindow > 0,
      })
      const before = kart
      kart = stepKart(kart, input, KART_TUNING, DEFAULT_RULES)
      if (kart.miniSeconds > before.miniSeconds) fired = true
    }
    return fired
  }

  // 0.6 s of drift to the left, let go, counter-steer right; GAS tapped at 0.75 s
  const thumbs =
    (tapGas: boolean) =>
    (step: number): [TouchButton[], TouchButton[]] => {
      if (step < 36) return [['drift', 'left'], []]
      if (step < 45) return [['right'], []]
      if (step === 45 && tapGas) return [['right'], ['throttle']]
      return [[], []]
    }

  for (const [name, settings] of [
    ['manual throttle', MANUAL],
    ['automatic throttle', DEFAULT_TOUCH_SETTINGS],
  ] as const) {
    it(`fires a release boost with the ${name}, and not without the tap`, () => {
      expect(drive(settings, thumbs(true))).toBe(true)
      expect(drive(settings, thumbs(false))).toBe(false)
    })
  }
})
