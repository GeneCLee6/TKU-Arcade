// 2026-11-22 (§4.73), shared 2026-11-23 (#152): after the first finish, the whole seconds left to
// everyone still out, with a tock for each (shared/kart/opening.ts; the room closes the race at
// that moment). The racer's screen (race/RaceView.tsx) and the watcher's (watch/SpectateView.tsx,
// the broadcast too) count the same seconds by the room's clock.
import { useEffect, useRef, useState } from 'react'
import { closeAt } from '../../../shared/kart/opening.ts'
import { closeBeep, playBeep } from '../audio/countBeeps.ts'

/** How often the seconds are looked at, ms */
const LOOK_MS = 100

/**
 * The seconds left before the room closes `race` (0 once it is time), or null before anyone has
 * finished and once the race is no longer on. `now` is the room's clock, null while unknown
 */
export function useCloseCountdown(
  race: {
    readonly phase: string
    readonly goAt: number | null
    readonly racers: readonly { readonly finishMs: number | null }[]
  },
  now: () => number | null,
): number | null {
  const closing = closeAt(race)
  const racing = race.phase === 'racing'
  const [shown, setShown] = useState<number | null>(null)
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })
  useEffect(() => {
    if (closing === null || !racing) return
    let before: number | null = null
    const look = () => {
      const at = clock.current()
      if (at === null) return
      const left = (closing - at) / 1000
      const beep = closeBeep(before, left)
      if (beep) playBeep(beep)
      before = left
      const seconds = Math.max(0, Math.ceil(left))
      setShown((was) => (was === seconds ? was : seconds))
    }
    look()
    const timer = window.setInterval(look, LOOK_MS)
    return () => window.clearInterval(timer)
  }, [closing, racing])
  return closing !== null && racing ? shown : null
}
