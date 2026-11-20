import { describe, expect, it } from 'vitest'
import { KART_TUNING, NO_INPUT, type KartInput } from '../../shared/kart/physics.ts'
import {
  START_LATE_TELL,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack } from '../../shared/kart/track.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { DEFAULT_TOUCH_SETTINGS, mergeInputs, touchInput } from '../../shared/kart/touch.ts'
import { parseStoredTuning, serializeTuning } from '../../shared/kart/tuning.ts'
import { calloutAtStart } from '../../src/kart/callouts.ts'

// 2026-11-20 (owner: "the start boost window should be wider, I often press and get nothing"): the
// whole of the "1" before GO, and a quarter of a second after it, give the full start boost; earlier
// a smaller one, a little later the word "too late". Every timing, at 60 steps a second.

const T = KART_TUNING
const STEP = 1 / 60
const GAS: KartInput = { ...NO_INPUT, throttle: true }
const TAP: KartInput = { ...GAS, throttleTap: true }

const oval = parseTrack(TEST_OVAL)
if ('problems' in oval) throw new Error(oval.problems.join('; '))
const plain = courseOf(oval.track)
const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: oval.track.road }

/** Counts down with `input(left)` deciding each step, `left` the countdown before the step */
function countdown(input: (left: number) => KartInput): Trial {
  let trial = startTrial(course)
  while (trial.phase === 'countdown') trial = stepTrial(trial, input(trial.countdown), course)
  return trial
}

/** Steps on after GO, `input(seconds since GO)` deciding each step */
function after(trial: Trial, seconds: number, input: (since: number) => KartInput): Trial {
  let next = trial
  for (let step = 0; step < Math.round(seconds / STEP); step++) {
    next = stepTrial(next, input(step * STEP), course)
  }
  return next
}

/** Held from `at` seconds before GO on */
const heldFrom = (at: number) => countdown((left) => (left <= at + 1e-9 ? GAS : NO_INPUT))

describe('the start boost window (2026-11-20)', () => {
  it('is the whole of the "1" before GO, and a quarter of a second after it', () => {
    expect(T.startWindow).toBe(1)
    expect(T.startLate).toBe(0.25)
  })

  it('pressed anywhere in the "1" and held over GO: the full start boost', () => {
    for (const at of [0.98, 0.75, 0.5, 0.2, 0.05, STEP]) {
      const trial = heldFrom(at)
      expect(trial.start, `pressed ${at} s before GO`).toBe('boost')
      expect(trial.run.kart.launchSeconds).toBeCloseTo(T.startBoostDuration, 9)
    }
  })

  it('held from before the "1": a smaller start boost, told as too early, and never a stall', () => {
    for (const at of [1.1, 2, 2.9]) {
      const trial = heldFrom(at)
      expect(trial.start, `held from ${at} s before GO`).toBe('quick')
      expect(trial.run.kart.launchSeconds).toBeCloseTo(T.startBoostDuration * T.startEarlyShare, 9)
      expect(trial.run.kart.stallSeconds).toBe(0)
    }
    expect(calloutAtStart('quick')?.kind).toBe('quick')
  })

  it('held from too early, let go and pressed again in the "1": the full start boost', () => {
    const trial = countdown((left) => (left > 2 || (left <= 0.6 && left > 0) ? GAS : NO_INPUT))
    expect(trial.start).toBe('boost')
  })

  it('tapped in the "1" and let go before GO: nothing at GO, but a press just after still counts', () => {
    const tapped = countdown((left) => (left <= 0.6 && left > 0.4 ? GAS : NO_INPUT))
    expect(tapped.start).toBe('none')
    expect(tapped.run.kart.launchSeconds ?? 0).toBe(0)
    const pressed = after(tapped, 0.3, (since) => (since >= 0.1 ? GAS : NO_INPUT))
    expect(pressed.start).toBe('boost')
  })

  it('a fresh press up to a quarter of a second after GO: the full start boost', () => {
    for (const since of [0, 0.1, 0.2, T.startLate - STEP]) {
      const trial = after(heldFrom(-1), since + 2 * STEP, (at) =>
        at >= since - 1e-9 ? GAS : NO_INPUT,
      )
      expect(trial.start, `pressed ${since} s after GO`).toBe('boost')
    }
  })

  it('a press a little later than that: no start boost, told as too late', () => {
    for (const since of [T.startLate + STEP, 0.5, T.startLate + START_LATE_TELL - 2 * STEP]) {
      const trial = after(heldFrom(-1), since + 2 * STEP, (at) =>
        at >= since - 1e-9 ? GAS : NO_INPUT,
      )
      expect(trial.start, `pressed ${since} s after GO`).toBe('late')
      expect(trial.run.kart.launchSeconds ?? 0).toBeLessThan(T.startBoostDuration * 0.1)
    }
    expect(calloutAtStart('late')?.kind).toBe('startLate')
  })

  it('a press long after GO is just driving', () => {
    const trial = after(heldFrom(-1), 1.6, (at) => (at >= 1.5 ? GAS : NO_INPUT))
    expect(trial.start).toBe('none')
  })

  it('the on-screen automatic throttle earns nothing by itself; a tap of GAS over it does', () => {
    const auto: KartInput = { ...GAS, autoThrottle: true }
    const left = after(heldFrom(-1), 0.5, () => auto)
    expect(left.start).toBe('none')
    expect(left.run.kart.launchSeconds ?? 0).toBe(0)
    const tapped = after(heldFrom(-1), 0.3, (since) =>
      since < 0.1 ? auto : since < 0.1 + STEP ? TAP : GAS,
    )
    expect(tapped.start).toBe('boost')
  })
})

describe('the on-screen buttons and the start', () => {
  const reading = (held: string[] = []) => ({
    held: new Set(held) as never,
    tapped: new Set<never>(),
    slider: 0,
  })
  const racing = { racing: true, burstWaiting: false }

  it('marks a throttle held only by the automatic throttle', () => {
    const auto = touchInput(reading(), DEFAULT_TOUCH_SETTINGS, racing)
    expect(auto.throttle).toBe(true)
    expect(auto.autoThrottle).toBe(true)
    const pressed = touchInput(reading(['throttle']), DEFAULT_TOUCH_SETTINGS, racing)
    expect(pressed.throttle).toBe(true)
    expect(pressed.autoThrottle).toBeUndefined()
    // Before GO the throttle is GAS as pressed: the start boost is the player's to time
    const waiting = touchInput(reading(), DEFAULT_TOUCH_SETTINGS, { ...racing, racing: false })
    expect(waiting.throttle).toBe(false)
  })

  it('a key pressed with the automatic throttle on is a press', () => {
    const auto = touchInput(reading(), DEFAULT_TOUCH_SETTINGS, racing)
    expect(mergeInputs(NO_INPUT, auto).autoThrottle).toBe(true)
    expect(mergeInputs(GAS, auto).autoThrottle).toBeUndefined()
  })
})

describe('numbers saved before the window was widened', () => {
  it('take the new window in place of the old defaults, and keep any other choice', () => {
    const old = parseStoredTuning(serializeTuning({ ...T, startWindow: 0.5, startLate: 0.1 }))
    expect(old.tuning.startWindow).toBe(1)
    expect(old.tuning.startLate).toBe(0.25)
    const chosen = parseStoredTuning(serializeTuning({ ...T, startWindow: 0.7, startLate: 0.15 }))
    expect(chosen.tuning.startWindow).toBe(0.7)
    expect(chosen.tuning.startLate).toBe(0.15)
  })
})
