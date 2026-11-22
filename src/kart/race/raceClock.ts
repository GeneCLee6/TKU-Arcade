// 2026-11-22 (owner: "against the computer, Esc pauses"; docs/ARCHITECTURE.md §4.70): the clock a
// race in this browser runs by, which a pause stops. Everything that times a race here reads it in
// place of performance.now() and Date.now(): the race loop's steps (spikeLoop.ts), the room's clock
// and its pings (netRace.ts), the computer karts and the race room in this browser (bots/). Stopped,
// all of them stop together and pick up where they were: the clock offsets they keep between them
// do not move. A room on the server is never paused (its race goes on), so only a race with no one
// else in it ever stops the clock; otherwise it is performance.now() as ever.

let pausedAt: number | null = null
/** Milliseconds spent paused so far */
let pausedFor = 0
const listeners = new Set<() => void>()

/** performance.now(), less the time spent paused; stands still while paused */
export function raceNow(): number {
  return (pausedAt ?? performance.now()) - pausedFor
}

/** Date.now() moved by the same: the clock the race room in this browser keeps (ms since the epoch) */
export function raceEpochNow(): number {
  return Date.now() - pausedFor - (pausedAt === null ? 0 : performance.now() - pausedAt)
}

export const isRacePaused = (): boolean => pausedAt !== null

/** Stops the clock (again does nothing) */
export function pauseRace(): void {
  if (pausedAt !== null) return
  pausedAt = performance.now()
  for (const listener of listeners) listener()
}

/** Starts it again where it stopped */
export function resumeRace(): void {
  if (pausedAt === null) return
  pausedFor += performance.now() - pausedAt
  pausedAt = null
  for (const listener of listeners) listener()
}

export function subscribePause(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
