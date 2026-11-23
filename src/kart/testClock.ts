// 2026-11-23 (QA follow-up of docs/QA-SWEEP-2026-11-23.md): the browser tests' own clock for a race.
// The physics steps by the wall clock (shared/kart/clock.ts), and under a busy machine's software
// drawing a frame can take longer than a whole window the test waits for (the half second after a
// drift in which the throttle fires a release boost): the test missed it, now and then. A test that
// sets `window.__kartTest = { manual: true }` before the page loads (e2e/kartClock.ts) takes the
// clock instead: no step happens until it asks for some, `step(n, until)`, and it can stop on the
// very step a condition first holds. The steps themselves are the same as ever: the feel, the
// goldens and anyone not running such a test never meet this. Nothing here unless a test set it.
import type { KartInput, KartState } from '../../shared/kart/physics.ts'

export interface KartTestHook {
  /** Set by the test: the race steps only when asked */
  readonly manual: true
  /**
   * Set by the race: runs `steps` steps (a frame takes up to PER_FRAME of them), stopping early after
   * the first step where `until` holds. Resolves with how many ran. A new call replaces one waiting
   */
  step?: (steps: number, until?: (state: KartState, input: KartInput) => boolean) => Promise<number>
}

declare global {
  interface Window {
    __kartTest?: KartTestHook
  }
}

/** At most this many steps in one frame (two seconds of race): the page keeps drawing meanwhile */
export const PER_FRAME = 120

export interface TestClock {
  /** How many steps this frame may run */
  take(): number
  /** After each step: true when the test's request is done (the frame then stops stepping) */
  stepped(state: KartState, input: KartInput): boolean
}

/** The test's clock, when a test asked for it; null otherwise (always, outside tests) */
export function testClock(): TestClock | null {
  const hook = typeof window === 'undefined' ? undefined : window.__kartTest
  if (hook?.manual !== true) return null
  let left = 0
  let done = 0
  let until: ((state: KartState, input: KartInput) => boolean) | undefined
  let resolve: ((steps: number) => void) | null = null
  const finish = () => {
    const answer = resolve
    resolve = null
    left = 0
    until = undefined
    answer?.(done)
  }
  hook.step = (steps, stop) =>
    new Promise<number>((ok) => {
      finish()
      done = 0
      left = Math.max(0, Math.floor(steps))
      until = stop
      resolve = ok
      if (left === 0) finish()
    })
  return {
    take: () => Math.min(left, PER_FRAME),
    stepped(state, input) {
      left--
      done++
      if (left > 0 && !until?.(state, input)) return false
      finish()
      return true
    },
  }
}
