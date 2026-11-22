// 2026-11-22 (owner, docs/NEXT.md §2.2): the cyan and amber marks on the tracks to learn by heart
// (art/skillCues.ts, #115) can be turned off in the controls panel, like the tips during a race.
// On unless turned off; kept through lib/storage.ts, which never throws (blocked, the choice lasts
// until the page closes). A race already on the screen follows the switch at once.
import { readStored, writeStored } from '../lib/storage.ts'

const KEY = 'tku-arcade.kart.trackCues'
const listeners = new Set<(on: boolean) => void>()

export const loadTrackCuesOn = (): boolean => readStored(KEY) !== 'off'

export function saveTrackCuesOn(on: boolean): void {
  writeStored(KEY, on ? 'on' : 'off')
  for (const listener of listeners) listener(on)
}

/** Calls `listener` whenever the switch changes; returns the unsubscribe */
export function onTrackCuesChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
