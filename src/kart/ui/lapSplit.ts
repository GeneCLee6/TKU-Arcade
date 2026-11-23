// 2026-11-23 (owner: "every lap, when you cross the line, show the time"): the lap just finished, shown
// over the race at the top middle for LAP_SPLIT_MS: "Lap 2 0:31.420", marked when it is the race's
// fastest lap so far, and how far it is from the best (the record on this track in this browser, or
// without one the fastest lap before it in this race), faster in green, slower in red. The time trial,
// the race against the computer, the Grand Prix and a room all show it; a room's laps are the room's
// own (`lap` actions, shared/games/kart/rules.ts), the others' this browser's.
import { useEffect, useRef, useState } from 'react'

/** How long the lap's time stays up, ms */
export const LAP_SPLIT_MS = 2_600

export interface LapSplit {
  /** The lap just finished, from 1 */
  readonly lap: number
  /** Its time, seconds */
  readonly time: number
  /** The fastest lap of this race so far (never the first: there is nothing to beat yet) */
  readonly fastest: boolean
  /** Seconds from the best it is set against (below 0: faster); null with nothing to set it against */
  readonly delta: number | null
  /** What `delta` is against: the record, or this race's fastest lap before it */
  readonly against: 'record' | 'race' | null
}

/** The split for the last of `lapTimes` (seconds); null before the first lap is done */
export function lapSplit(lapTimes: readonly number[], record: number | null): LapSplit | null {
  const time = lapTimes.at(-1)
  if (time === undefined) return null
  const before = lapTimes.slice(0, -1)
  const raceBest = before.length > 0 ? Math.min(...before) : null
  const against = record !== null ? 'record' : raceBest !== null ? 'race' : null
  const reference = record ?? raceBest
  return {
    lap: lapTimes.length,
    time,
    fastest: raceBest !== null && time < raceBest,
    delta: reference === null ? null : time - reference,
    against,
  }
}

/** "+0.42" or "−1.03" (a true minus), seconds to the hundredth */
export function formatDelta(seconds: number): string {
  const hundredths = Math.round(Math.abs(seconds) * 100)
  const sign = seconds < 0 && hundredths > 0 ? '−' : '+'
  return `${sign}${(hundredths / 100).toFixed(2)}`
}

/**
 * The split to show now: a new one each time a lap is added to `lapTimes`, for LAP_SPLIT_MS; null
 * otherwise. Laps already done when the page comes (a race joined again) are not shown. The record
 * is the one there was before the first lap (a finish that sets a new one is set against the old)
 */
export function useLapSplit(
  lapTimes: readonly number[],
  record: number | null,
): (LapSplit & { readonly id: number }) | null {
  const seen = useRef(lapTimes.length)
  const before = useRef(record)
  if (lapTimes.length === 0) before.current = record
  const [shown, setShown] = useState<(LapSplit & { readonly id: number }) | null>(null)
  const count = lapTimes.length
  const last = lapTimes.at(-1)
  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count
      return
    }
    seen.current = count
    const split = lapSplit(lapTimes, before.current)
    if (!split) return
    setShown({ ...split, id: count })
    const timer = window.setTimeout(() => setShown(null), LAP_SPLIT_MS)
    return () => window.clearTimeout(timer)
    // A new lap is what counts: the times are read when it comes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, last])
  return shown
}
