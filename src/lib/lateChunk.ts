// A part of a screen that is not on its first paint (2026-11-23): a dynamic import, started once the
// screen has painted, so that `npm run budget` counts it after the first screen. Unlike React.lazy
// it renders at once when the chunk is already in (the tests load it up front, tests/setup.ts), and
// a screen that mounts later finds it loaded.
import { useEffect, useSyncExternalStore } from 'react'

export interface LateChunk<T> {
  /** Starts loading once; resolves with the module's value */
  load(): Promise<T>
  /** The value, or null until it has loaded; starts loading after the first paint */
  use(): T | null
  /** The value if it has loaded, without waiting or re-rendering */
  peek(): T | null
}

export function lateChunk<T>(importer: () => Promise<T>): LateChunk<T> {
  let value: T | null = null
  let loading: Promise<T> | null = null
  const listeners = new Set<() => void>()
  const load = () =>
    (loading ??= importer().then(
      (loaded) => {
        value = loaded
        for (const listener of listeners) listener()
        return loaded
      },
      (error: unknown) => {
        // A failed fetch (a deploy replaced the chunk, the network dropped) may be tried again
        loading = null
        throw error
      },
    ))
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const snapshot = () => value
  return {
    load,
    peek: snapshot,
    use() {
      const current = useSyncExternalStore(subscribe, snapshot, snapshot)
      useEffect(() => {
        if (value === null) load().catch(() => {})
      }, [])
      return current
    },
  }
}
