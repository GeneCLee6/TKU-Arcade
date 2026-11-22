// 2026-11-23 (e11-t06, AC-11.3; docs/ARCHITECTURE.md §4.81): the achievements' engine, loaded by the
// first event (track.ts). An event becomes the stats' events (a room's result, the kart's stores),
// the stats change (stats.ts), the rules are evaluated (rules.ts), what is new is kept (store.ts)
// and queued as a badge (popups.ts). One event at a time, each reading what is kept first, so that
// two tabs do not undo each other.
import type { AchievementEvent } from './events.ts'
import { isStandalone } from '../lib/installApp.ts'
import { showUnlocks } from './popups.ts'
import { roomEvent } from './room.ts'
import { newlyUnlocked } from './rules.ts'
import { applyEvent } from './stats.ts'
import { loadSaved, save, type Saved } from './store.ts'
import { KART_PROGRESS_EVENT } from './kartLists.ts'
import { readKartProgress } from './sync.ts'

let chain: Promise<unknown> = Promise.resolve()
let synced = false
const listeners = new Set<() => void>()

/** The events an event stands for */
function expand(event: AchievementEvent): AchievementEvent[] {
  switch (event.type) {
    case 'kart.sync':
      return [readKartProgress()]
    case 'room.result': {
      const derived = roomEvent(event.view, event.you)
      return derived ? [derived] : []
    }
    default:
      return [event]
  }
}

/** Applies events to what is kept; returns the rules they unlocked */
export function apply(events: readonly AchievementEvent[], now: Date = new Date()): string[] {
  const saved = loadSaved()
  let { stats } = saved
  for (const event of events) stats = applyEvent(stats, event, now)
  const fresh = newlyUnlocked(stats, saved.unlocked).map((rule) => rule.id)
  const unlocked = { ...saved.unlocked }
  for (const id of fresh) unlocked[id] = now.getTime()
  const next: Saved = { stats, unlocked }
  save(next)
  for (const listener of listeners) listener()
  return fresh
}

/** Counts an event; resolves with the rules it unlocked, once their badges are queued */
export function record(event: AchievementEvent): Promise<string[]> {
  const run = chain.then(() => {
    // The first event of a visit also reads the kart's stores: what was earned before counts
    const events = synced || event.type === 'kart.sync' ? expand(event) : [...expand(event), readKartProgress()]
    // Opened from the home screen (Pocket Arcade): told by the page itself, whatever the event
    if (isStandalone() && !loadSaved().stats.n['platform.app']) events.push({ type: 'platform.app' })
    synced = true
    const fresh = apply(events)
    showUnlocks(fresh)
    return fresh
  })
  chain = run.catch(() => undefined)
  return run
}

// The kart says a store changed (a medal, stars, a cup): read them again. A plain window event, so
// that the kart's stores import nothing of the achievements (kartLists.ts)
window.addEventListener(KART_PROGRESS_EVENT, () => void record({ type: 'kart.sync' }).catch(() => {}))

/** What is kept now */
export const currentSaved = (): Saved => loadSaved()

/** Called after every change (the profile page shows them as they come) */
export function subscribeAchievements(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tests: the next event reads the stores again */
export function resetEngine(): void {
  synced = false
  chain = Promise.resolve()
}
