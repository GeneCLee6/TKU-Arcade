// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.81): the achievements' one door, small enough for
// every first screen. A screen reports what happened; the engine (engine.ts, the rules, the store,
// the badges) loads only then. Never throws, never waits: an achievement must not cost a game anything.
import type { AchievementEvent } from './events.ts'

/** Reports something that happened; the engine counts it, and shows whatever it unlocks */
export function trackAchievement(event: AchievementEvent): void {
  import('./load.ts').then(
    ({ loadEngine }) => loadEngine().then((engine) => engine.record(event)),
    () => {
      // Offline, or a newer deployment: this one goes uncounted
    },
  )
}

// While a race is on, a badge waits (popups.ts): the race says when (spikeLoop.ts)
let held = false
const holdListeners = new Set<() => void>()

/** True while a race runs (not paused): badges wait for the finish or the pause menu */
export function holdAchievements(hold: boolean): void {
  if (held === hold) return
  held = hold
  for (const listener of holdListeners) listener()
}

export const achievementsHeld = (): boolean => held

export function onAchievementHold(listener: () => void): () => void {
  holdListeners.add(listener)
  return () => holdListeners.delete(listener)
}
