import { useEffect, useState } from 'react'
import { CELEBRATE_SECONDS } from './celebrate.ts'

/**
 * 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): true from this racer's finish for as long
 * as the finish's show lasts, so that the results wait for it even when the race ends at that very
 * moment (the last kart home)
 */
export function useFinishHold(finished: boolean): boolean {
  const [released, setReleased] = useState(false)
  useEffect(() => {
    if (!finished) return
    const timer = window.setTimeout(() => setReleased(true), CELEBRATE_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [finished])
  return finished && !released
}
