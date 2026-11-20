// 2026-11-20 (docs/ARCHITECTURE.md §4.40; #108 found 17 karts' ghosts on 9 tracks came to some
// 4.6 MB, near what localStorage holds, and a run that did not fit was not kept at all): the ghosts'
// samples live in IndexedDB, which holds far more; the records themselves (a run's time, its kart, a
// lap's time) stay small in localStorage (records.ts). This is the store: an interface, so that
// records.ts can be tested with any, and the IndexedDB one. Every call may fail (a private window,
// blocked site data, a full disk): callers catch, and then go without the ghost.
import type { Ghost } from '../../shared/kart/ghost.ts'
import type { KartId } from '../../shared/kart/karts.ts'

/** One ghost as kept: the track's overall best (`kart` null) or a kart's own best on it */
export interface StoredGhost {
  /** `overall|<track>` or `kart|<kart>|<track>` (ghostKeyOf) */
  readonly key: string
  readonly track: string
  readonly kart: KartId | null
  readonly ghost: Ghost
  /** When it was kept, ms since 1970: the oldest go first when the store is over its limit */
  readonly savedAt: number
}

export interface GhostStore {
  get(key: string): Promise<StoredGhost | undefined>
  put(entry: StoredGhost): Promise<void>
  remove(keys: readonly string[]): Promise<void>
  /** Every key kept, the oldest first */
  keysByAge(): Promise<string[]>
}

export const ghostKeyOf = (track: string, kart: KartId | null): string =>
  kart === null ? `overall|${track}` : `kart|${kart}|${track}`

const DB_NAME = 'tku-arcade-kart'
const DB_VERSION = 1
const STORE = 'ghosts'
const BY_AGE = 'savedAt'

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb'))
  })

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb'))
    tx.onabort = () => reject(tx.error ?? new Error('indexeddb aborted'))
  })

/** The IndexedDB store, or null where there is none or it will not open (a private window) */
export async function openIndexedGhostStore(
  /** Left out: the browser's own; null: none */
  given?: IDBFactory | null,
): Promise<GhostStore | null> {
  let db: IDBDatabase
  try {
    // Even reaching for it can throw (blocked site data)
    const factory = given === undefined ? globalThis.indexedDB : given
    if (!factory) return null
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex(BY_AGE, 'savedAt')
    }
    db = await done(request)
  } catch {
    return null
  }
  return {
    async get(key) {
      const tx = db.transaction(STORE, 'readonly')
      return (await done(tx.objectStore(STORE).get(key))) as StoredGhost | undefined
    },
    async put(entry) {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      await finished(tx)
    },
    async remove(keys) {
      if (keys.length === 0) return
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const key of keys) store.delete(key)
      await finished(tx)
    },
    async keysByAge() {
      const tx = db.transaction(STORE, 'readonly')
      const keys = await done(tx.objectStore(STORE).index(BY_AGE).getAllKeys())
      return keys.map(String)
    },
  }
}

/**
 * A store in memory (tests). `capacity`: how many ghosts it takes before a put fails as a full
 * IndexedDB does (QuotaExceededError)
 */
export function memoryGhostStore(capacity = Infinity): GhostStore & { size(): number } {
  const kept = new Map<string, StoredGhost>()
  return {
    size: () => kept.size,
    get: async (key) => kept.get(key),
    async put(entry) {
      if (!kept.has(entry.key) && kept.size >= capacity) {
        throw new DOMException('full', 'QuotaExceededError')
      }
      kept.set(entry.key, entry)
    },
    async remove(keys) {
      for (const key of keys) kept.delete(key)
    },
    keysByAge: async () =>
      [...kept.values()].sort((a, b) => a.savedAt - b.savedAt).map((one) => one.key),
  }
}
