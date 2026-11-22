// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.81): the race engine's side of the achievements, small:
// the game loop (spikeLoop.ts) hands it every step; the watch itself (kartRun.ts) loads in the
// countdown, and the steps until then wait for it. Never throws into the loop.
import type { Track } from '../../shared/kart/track.ts'
import type { KartRunEvent } from './events.ts'
import type { RunStep } from './kartRun.ts'
import { trackAchievement } from './track.ts'

/** Steps kept while the watch loads: far more than a countdown */
const MAX_WAITING = 20_000

/** A race on `track` in `kart`: returns what takes each step */
export function watchKartRun(track: Track, kart: string): (step: RunStep) => void {
  let watch: ((step: RunStep) => KartRunEvent | null) | null = null
  let waiting: RunStep[] | null = []
  const feed = (step: RunStep) => {
    const event = watch?.(step)
    if (event) trackAchievement(event)
  }
  import('./kartRun.ts').then(
    ({ watchRun }) => {
      watch = watchRun(track, kart)
      for (const step of waiting ?? []) feed(step)
      waiting = null
    },
    () => {
      waiting = null
    },
  )
  return (step) => {
    try {
      if (watch) feed(step)
      else if (waiting && waiting.length < MAX_WAITING) waiting.push(step)
    } catch {
      // A feat uncounted, never a race stopped
    }
  }
}
