import { useEffect, useState } from 'react'

/** One hand turned over at a time, so that the table reads them in order, weakest first */
export const REVEAL_STEP_MS = 900

/**
 * How many of the `total` hands have been turned over. `id` names one reveal; null while there is none.
 * A reveal already up when the screen loads (somebody came back) is not played again, and a person who
 * asks for less motion sees it all at once.
 */
export function useRevealPlayback(
  id: string | null,
  total: number,
  instant: boolean,
): { shown: number; playing: boolean } {
  const [played, setPlayed] = useState({ id, shown: total })
  let current = played
  if (played.id !== id) {
    current = { id, shown: instant ? total : 0 }
    setPlayed(current)
  }
  const { shown } = current

  useEffect(() => {
    if (id === null || shown >= total) return undefined
    const timer = setTimeout(() => {
      setPlayed((now) => (now.id === id ? { id, shown: now.shown + 1 } : now))
    }, REVEAL_STEP_MS)
    return () => clearTimeout(timer)
  }, [id, shown, total])

  return { shown: instant ? total : shown, playing: !instant && id !== null && shown < total }
}
