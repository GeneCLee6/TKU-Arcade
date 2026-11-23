// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): the badges waiting to be shown, one at a time, top
// right. A burst (the first visit after an update, where earlier progress unlocks a handful at once)
// shows the first few and one "and N more", not a minute of badges. While a race runs they wait
// (track.ts's hold); the component (Popups.tsx) loads with the first badge, in a root of its own.

export type PopupItem =
  | { readonly kind: 'rule'; readonly id: string }
  | { readonly kind: 'more'; readonly count: number }

/** The most badges in the queue; past it, the last place says how many more */
export const MAX_QUEUED = 3

/** The queue with `ids` added; the first item (on screen, maybe) stays first */
export function enqueue(queue: readonly PopupItem[], ids: readonly string[]): PopupItem[] {
  const rules = [
    ...queue.flatMap((item) => (item.kind === 'rule' ? [item.id] : [])),
    ...ids.filter((id) => !queue.some((item) => item.kind === 'rule' && item.id === id)),
  ]
  const more = queue.reduce((sum, item) => sum + (item.kind === 'more' ? item.count : 0), 0)
  const items: PopupItem[] = rules.map((id) => ({ kind: 'rule', id }))
  if (items.length + (more > 0 ? 1 : 0) <= MAX_QUEUED) {
    return more > 0 ? [...items, { kind: 'more', count: more }] : items
  }
  const kept = items.slice(0, MAX_QUEUED - 1)
  return [...kept, { kind: 'more', count: more + items.length - kept.length }]
}

let queue: readonly PopupItem[] = []
const listeners = new Set<() => void>()
let mounting: Promise<void> | null = null

const changed = () => {
  for (const listener of listeners) listener()
}

export const popupQueue = (): readonly PopupItem[] => queue

export function subscribePopups(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The badge on screen is done: the next one's turn */
export function nextPopup(): void {
  queue = queue.slice(1)
  changed()
}

/** Queues badges for these rules, and puts the component on the page the first time */
export function showUnlocks(ids: readonly string[]): void {
  if (ids.length === 0) return
  queue = enqueue(queue, ids)
  changed()
  mounting ??= import('./popupsRoot.tsx').then(
    ({ mountPopups }) => mountPopups(),
    () => {
      // Could not load: the unlocks are kept all the same, and the profile shows them
      mounting = null
    },
  )
}

/** Tests: an empty queue */
export function clearPopups(): void {
  queue = []
  changed()
}
