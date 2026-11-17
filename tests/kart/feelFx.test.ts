import { describe, expect, it } from 'vitest'
import {
  INITIAL_KART,
  KART_TUNING,
  kartSkidding,
  kartSlip,
  kartSpeed,
  NO_INPUT,
  STEP_SECONDS,
  stepKart,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import {
  cameraPull,
  cameraShake,
  fieldOfView,
  followCar,
  KICK_SECONDS,
  kickRig,
  startRig,
} from '../../src/kart/camera.ts'
import {
  BRAKE_SKID_SPEED,
  BURST_POWER,
  burstBetween,
  SKID_FULL_SLIP,
  SKID_MIN_SLIP,
  SKID_MIN_SPEED,
  skidStrength,
  SQUEAL_GAIN,
  squealVoice,
} from '../../src/kart/feelFx.ts'
import { speedLineStrength } from '../../src/kart/art/speedLines.ts'

// 2026-11-17 (owner: "a perfect start has to feel like a launch; a drift needs the tyres' squeal and
// skid marks"; docs/KART-FEEL.md §7): when the road is marked, how loud the tyres are and how hard a
// boost kicks, as the numbers the scene and the sound are driven by.

const DEG = Math.PI / 180
const T = KART_TUNING
const GAS: KartInput = { ...NO_INPUT, throttle: true }

function run(state: KartState, input: KartInput, seconds: number): KartState {
  let current = state
  for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step++) {
    current = stepKart(current, input)
  }
  return current
}

const strengthOf = (state: KartState, braking = false) =>
  skidStrength(kartSlip(state), kartSpeed(state), kartSkidding(state), braking)

describe('skid marks and smoke', () => {
  it('nothing while the tyres roll: a straight, a grip turn, a standstill', () => {
    const flat = run(INITIAL_KART, GAS, 5)
    expect(strengthOf(flat)).toBe(0)
    // Full lock on grip at speed has a slip angle too, but the car is not sliding
    const turning = run(flat, { ...GAS, steer: 1 }, 0.5)
    expect(Math.abs(kartSlip(turning))).toBeGreaterThan(0)
    expect(strengthOf(turning)).toBe(0)
    expect(skidStrength(40 * DEG, 0, true)).toBe(0)
    expect(skidStrength(40 * DEG, SKID_MIN_SPEED - 0.1, true)).toBe(0)
  })

  it('a drift marks the road from its first moment, darker the deeper it slides', () => {
    const flat = run(INITIAL_KART, GAS, 5)
    const early = run(flat, { ...GAS, steer: 1, drift: true }, 0.035)
    const deep = run(flat, { ...GAS, steer: 1, drift: true }, 0.6)
    expect(strengthOf(early)).toBeGreaterThan(0.3)
    expect(strengthOf(deep)).toBeGreaterThan(strengthOf(early))
    // The classic feel's drift, steering in, is as dark as a mark gets
    expect(Math.abs(kartSlip(deep))).toBeGreaterThan(SKID_FULL_SLIP)
    expect(strengthOf(deep)).toBe(1)
  })

  it('goes on through the slide-out, fading as the car straightens, and stops once it has', () => {
    const drift = run(run(INITIAL_KART, GAS, 5), { ...GAS, steer: 1, drift: true }, 0.6)
    let state = stepKart(drift, GAS)
    expect(state.slideDirection).toBe(1)
    let last = strengthOf(state)
    expect(last).toBeGreaterThan(0.5)
    let marked = 0
    while (state.slideDirection !== 0) {
      state = stepKart(state, GAS)
      const now = strengthOf(state)
      expect(now).toBeLessThanOrEqual(last + 1e-9)
      if (now > 0) marked++
      last = now
    }
    // Most of the slide-out still marks the road
    expect(marked).toBeGreaterThan(10)
    expect(strengthOf(state)).toBe(0)
  })

  it('is between its ends by the slip angle', () => {
    expect(skidStrength(SKID_MIN_SLIP, 50, true)).toBe(0)
    const mid = skidStrength((SKID_MIN_SLIP + SKID_FULL_SLIP) / 2, 50, true)
    expect(mid).toBeGreaterThan(0.6)
    expect(mid).toBeLessThan(0.8)
    expect(skidStrength(-SKID_FULL_SLIP, 50, true)).toBe(1)
  })

  it('a locked brake at speed marks the road too, a gentle stop does not', () => {
    expect(skidStrength(0, BRAKE_SKID_SPEED + 1, false, true)).toBeGreaterThan(0.5)
    expect(skidStrength(0, BRAKE_SKID_SPEED - 1, false, true)).toBe(0)
    expect(skidStrength(0, 40, false, false)).toBe(0)
  })
})

describe('the tyres squeal', () => {
  it('is silent while nothing slides', () => {
    expect(squealVoice(0, 60).gain).toBe(0)
  })

  it('is louder the harder and the faster the tyres slide, and never over its gain', () => {
    expect(squealVoice(1, 60).gain).toBeGreaterThan(squealVoice(0.5, 60).gain)
    expect(squealVoice(1, 60).gain).toBeGreaterThan(squealVoice(1, 20).gain)
    expect(squealVoice(1, 20).gain).toBeGreaterThan(0)
    expect(squealVoice(1, 200).gain).toBeLessThanOrEqual(SQUEAL_GAIN)
  })

  it('is higher the faster and the harder', () => {
    expect(squealVoice(1, 60).hz).toBeGreaterThan(squealVoice(1, 20).hz)
    expect(squealVoice(1, 40).hz).toBeGreaterThan(squealVoice(0.5, 40).hz)
    // A howl, not a whistle: between about 0.8 and 1.6 kHz
    expect(squealVoice(0.4, 10).hz).toBeGreaterThan(700)
    expect(squealVoice(1, 90).hz).toBeLessThan(1700)
  })
})

describe('a boost kicks', () => {
  const still = { boostSeconds: 0, miniSeconds: 0, launchSeconds: 0 }

  it('tells the start, the boost and the instant boost apart', () => {
    const full = T.startBoostDuration
    expect(burstBetween(still, { ...still, launchSeconds: full }, full)).toBe('start')
    expect(burstBetween(still, { ...still, launchSeconds: full - STEP_SECONDS }, full)).toBe('start')
    expect(burstBetween(still, { ...still, launchSeconds: full * T.startEarlyShare }, full)).toBe(
      'quick',
    )
    expect(burstBetween(still, { ...still, boostSeconds: T.boostDuration }, full)).toBe('boost')
    expect(burstBetween(still, { ...still, miniSeconds: T.chainDuration }, full)).toBe('dash')
    // Running down is no burst; nor is a kart without a start boost at all
    expect(burstBetween({ ...still, boostSeconds: 2 }, { ...still, boostSeconds: 1.98 }, full)).toBe(
      null,
    )
    expect(burstBetween({ boostSeconds: 0, miniSeconds: 0 }, { boostSeconds: 0, miniSeconds: 0 }, full)).toBe(null)
  })

  it('a perfect start kicks hardest, an instant boost least', () => {
    expect(BURST_POWER.start).toBe(1)
    expect(BURST_POWER.start).toBeGreaterThan(BURST_POWER.boost)
    expect(BURST_POWER.boost).toBeGreaterThan(BURST_POWER.quick)
    expect(BURST_POWER.quick).toBeGreaterThan(BURST_POWER.dash)
    expect(BURST_POWER.dash).toBeGreaterThan(0.3)
  })

  it('lurches the camera: left behind, a wider view and a shake, all gone in about a second', () => {
    const car = { heading: 0, vx: 0, vz: -20, boosting: true }
    const calm = startRig(0)
    const kicked = kickRig(calm, BURST_POWER.start)
    expect(kicked.kick).toBe(1)
    expect(cameraPull(kicked)).toBeGreaterThan(2)
    expect(cameraShake(kicked)).toBeGreaterThan(0.05)
    expect(fieldOfView(60, kicked, false)).toBeGreaterThan(fieldOfView(60, calm, false) + 8)
    // Nothing of it for a viewer who asked for less motion
    expect(fieldOfView(60, kicked, true)).toBe(60)
    // A weaker boost never lowers a kick still dying away
    expect(kickRig(kicked, BURST_POWER.dash).kick).toBe(1)
    expect(kickRig(calm, BURST_POWER.dash).kick).toBe(BURST_POWER.dash)
    // It dies away, the same at 30 and at 144 frames a second
    let slow = kicked
    for (let frame = 0; frame < 30 * KICK_SECONDS; frame++) slow = followCar(slow, car, 1 / 30)
    let fast = kicked
    for (let frame = 0; frame < 144 * KICK_SECONDS; frame++) fast = followCar(fast, car, 1 / 144)
    expect(slow.kick!).toBeCloseTo(0.1, 2)
    expect(fast.kick!).toBeCloseTo(0.1, 2)
    expect(cameraShake(slow)).toBeLessThan(0.005)
    let later = slow
    for (let frame = 0; frame < 60; frame++) later = followCar(later, car, 1 / 60)
    expect(later.kick!).toBeLessThan(0.01)
  })

  it('brings the speed lines even from a standstill', () => {
    // No boost: only near the top speed
    expect(speedLineStrength(0.5, 0)).toBe(0)
    expect(speedLineStrength(1, 0)).toBeGreaterThan(0)
    expect(speedLineStrength(1, 0)).toBeLessThan(0.3)
    // A boost: at once, whatever the speed
    expect(speedLineStrength(0, 1)).toBeGreaterThan(0.8)
    expect(speedLineStrength(1.3, 1)).toBeLessThanOrEqual(1)
  })
})
