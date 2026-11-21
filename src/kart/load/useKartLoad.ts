// 2026-11-21 (docs/ARCHITECTURE.md §4.52): a screen's fetch of what its scene needs (kartLoad.ts),
// for React. `engine` is null until everything for this `key` is here; `failed` when the network let
// it down, and `retry` asks again for what is still missing. Everything already here (the second race
// on the same track): the engine at once, with no loading screen in between.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadKart, peekKartLoad, type KartLoadPlan, type LoadProgress } from './kartLoad.ts'

export interface KartLoad<E> {
  readonly engine: E | null
  readonly progress: LoadProgress
  readonly failed: boolean
  retry(): void
}

const NOTHING: LoadProgress = { done: 0, total: 1 }

/**
 * Fetches `plan` while `key` (whatever the plan is made from, as a string) stays the same; a new key
 * fetches anew. A null plan fetches nothing (the page cannot draw anyway)
 */
export function useKartLoad<E>(plan: KartLoadPlan<E> | null, key: string): KartLoad<E> {
  const [state, setState] = useState<{
    key: string
    attempt: number
    progress: LoadProgress
    failed: boolean
  }>({ key, attempt: 0, progress: NOTHING, failed: false })
  const [attempt, setAttempt] = useState(0)
  const ready = plan ? peekKartLoad(plan) : null
  // The plan is read when the key or the attempt changes, not on every render
  const asked = useRef(plan)
  useLayoutEffect(() => {
    asked.current = plan
  })

  useEffect(() => {
    const wanted = asked.current
    if (!wanted || peekKartLoad(wanted)) return
    let gone = false
    setState({ key, attempt, progress: NOTHING, failed: false })
    loadKart(wanted, (progress) => {
      if (!gone) setState((was) => ({ ...was, key, attempt, progress }))
    }).then(
      () => {
        if (!gone) setState((was) => ({ ...was, key, attempt, failed: false }))
      },
      (error: unknown) => {
        console.warn('kart: could not fetch the race', error)
        if (!gone) setState((was) => ({ ...was, key, attempt, failed: true }))
      },
    )
    return () => {
      gone = true
    }
  }, [key, attempt])

  const current = state.key === key && state.attempt === attempt
  return {
    engine: ready,
    progress: ready ? { done: 1, total: 1 } : current ? state.progress : NOTHING,
    failed: !ready && current && state.failed,
    retry: () => setAttempt((was) => was + 1),
  }
}
