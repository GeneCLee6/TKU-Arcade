import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { createDriver, DRIVERS } from '../../src/kart/bots/drivers.ts'
import { runLesson } from '../../src/kart/school/headless.ts'
import { LESSON_IDS } from '../../src/kart/school/lessons.ts'

// 2026-11-20 (docs/ARCHITECTURE.md §4.50, docs/KART-FEEL.md §17): every lesson of the driving
// school can be passed. The master driver of `npm run kart:feel` (src/kart/bots/drivers.ts: an
// expert's hands and the tracks known by heart) drives each one, judged step by step as the page
// judges a player, and passes it first time with three stars. A novice's hands (late, shaky, no
// instant boost meant) do not pass the lessons of the techniques it never does.

const master = (seed: number) => (track: Parameters<typeof createDriver>[1]) =>
  createDriver(DRIVERS.master, track, KART_TUNING, seed)

describe('the master driver passes every lesson', () => {
  for (const id of LESSON_IDS) {
    it(`${id}: passed, first time, three stars`, () => {
      const result = runLesson(id, master(7), KART_TUNING)
      expect(result.passed, JSON.stringify(result.judge.mistakes)).toBe(true)
      expect(result.judge.attempts).toBeLessThanOrEqual(1)
      expect(result.stars).toBe(3)
    })
  }
})

describe('a novice does not pass the techniques it never does', () => {
  it('no drift jump, no gates, no perfect start; and says why', () => {
    const novice = (track: Parameters<typeof createDriver>[1]) =>
      createDriver(DRIVERS.novice, track, KART_TUNING, 7)
    const jump = runLesson('jump', novice, KART_TUNING, 2)
    expect(jump.passed).toBe(false)
    expect(jump.judge.mistakes.jumpNoDrift).toBe(2)
    const start = runLesson('start', novice, KART_TUNING, 2)
    expect(start.passed).toBe(false)
    expect(start.judge.mistakes.startEarly).toBe(2)
  })
})
