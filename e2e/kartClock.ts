import type { Page } from '@playwright/test'

// 2026-11-23 (QA follow-up of docs/QA-SWEEP-2026-11-23.md): the race's physics on the test's clock
// (src/kart/testClock.ts). Under a busy machine's software drawing a frame can outlast a window the
// test waits for (the half second after a drift in which the throttle fires a release boost), and the
// test missed it now and then. With this the race does not step at all until the test asks, and it
// can stop on the very step something first holds: what a test then sees does not hang on how fast
// the machine draws. The steps are the race's own; only who says when to take them changes.

/** Before the page loads: the race waits for the test's steps */
export const manualClock = (page: Page) =>
  page.addInitScript(() => {
    ;(window as unknown as { __kartTest: { manual: true } }).__kartTest = { manual: true }
  })

/** The kart's state as a test reads it (shared/kart/physics.ts KartState: the fields tests use) */
export interface KartStateReading {
  vx: number
  vz: number
  heading: number
  drifting: boolean
  driftDirection: number
  gauge: number
  storedBoosts: number
  boostSeconds: number
  chain: number
  slideDirection: number
  releaseWindow: number
  throttleHeld: boolean
  miniSeconds: number
}

interface Hook {
  step?: (steps: number, until?: (state: KartStateReading) => boolean) => Promise<number>
}

/** Waits for the race to take the test's clock (it does once its loop starts) */
const ready = (page: Page) =>
  page.waitForFunction(() => typeof (window as unknown as { __kartTest?: Hook }).__kartTest?.step === 'function', undefined, {
    timeout: 45_000,
  })

/** Runs `steps` steps of the race (60 a second of race time); resolves once they have run */
export async function step(page: Page, steps: number): Promise<number> {
  await ready(page)
  return page.evaluate((count) => (window as unknown as { __kartTest: Hook }).__kartTest.step!(count), steps)
}

/**
 * Steps until `until` (run in the page, after each step, on the kart's state) first holds, at most
 * `most` steps. Says whether it held: the race then stands on that very step. `until` must not use
 * anything from the test's side: only its source goes over (through the DevTools protocol, which the
 * site's CSP does not stop, as it stops `new Function`)
 */
export async function stepUntil(
  page: Page,
  until: (state: KartStateReading) => boolean,
  most = 1200,
): Promise<boolean> {
  await ready(page)
  const test = await page.evaluateHandle(`(${until.toString()})`)
  try {
    return await page.evaluate(
      async ([check, limit]) => {
        const hook = (window as unknown as { __kartTest: Hook }).__kartTest
        let held = false
        await hook.step!(limit, (state) => (held = (check as unknown as (state: unknown) => boolean)(state)))
        return held
      },
      [test, most] as const,
    )
  } finally {
    await test.dispose()
  }
}
