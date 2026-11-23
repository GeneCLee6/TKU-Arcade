// 2026-11-23 (docs/KART-WORLD.md §3.3): the garage's "play victory": the 3D preview plays the picked
// driver's win once (driverGestures.ts's showpiece), then goes back to turning on its stand. A pick of
// another driver stops it
import { useCallback, useEffect, useRef, useState } from 'react'

/** The showpiece's length and a moment held at its end, ms (driverGestures.ts's SHOWPIECE_SECONDS) */
export const PLAY_WIN_MS = 4_000

export function usePlayWin(driver: string): { playing: boolean; play(): void } {
  const [playing, setPlaying] = useState(false)
  const timer = useRef(0)
  const stop = useCallback(() => {
    window.clearTimeout(timer.current)
    setPlaying(false)
  }, [])
  useEffect(() => stop, [driver, stop])
  const play = useCallback(() => {
    window.clearTimeout(timer.current)
    // Off and on again, so that a second press starts it over
    setPlaying(false)
    window.requestAnimationFrame(() => setPlaying(true))
    timer.current = window.setTimeout(() => setPlaying(false), PLAY_WIN_MS)
  }, [])
  return { playing, play }
}
