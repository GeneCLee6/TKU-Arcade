// 2026-11-20 (docs/ARCHITECTURE.md §4.50): the tips during a race (coach.ts), for the time trial
// and the race screens: `useCoach` gives the game loop its `onStep` and the page the tip to show
// (CoachTip.tsx). A tip shows for a few seconds, once ever, and not at all with the tips turned off.
import { useCallback, useEffect, useRef, useState } from 'react'
import { isClassic, type KartTuning } from '../../../shared/kart/physics.ts'
import type { SpikeStep } from '../spikeLoop.ts'
import { coachStep, startCoach, type Tip } from './coach.ts'
import { sampleOf } from './judge.ts'
import { loadCoachOn, loadTipsSeen, saveTipSeen } from './store.ts'

/** How long a tip stays up, ms */
const TIP_MS = 7000

export interface CoachHandle {
  readonly tip: Tip | null
  /** For the game loop: each step, with the tuning it ran with */
  readonly onStep: (step: SpikeStep, tuning: KartTuning) => void
  readonly close: () => void
}

export function useCoach(): CoachHandle {
  const [tip, setTip] = useState<Tip | null>(null)
  const state = useRef({ coach: startCoach(), seen: loadTipsSeen(), on: loadCoachOn() })
  const onStep = useCallback((step: SpikeStep, tuning: KartTuning) => {
    const now = state.current
    if (!now.on || !isClassic(tuning)) return
    // A new race (a restart, the countdown): the coach starts over, what was tipped stays tipped
    if (step.trial?.phase === 'countdown') {
      now.coach = startCoach()
      return
    }
    const sample = sampleOf(step)
    if (!sample) return
    const result = coachStep(now.coach, sample, tuning)
    now.coach = result.coach
    if (result.known.length > 0 || result.tip) {
      const seen = new Set(now.seen)
      for (const one of result.known) {
        if (!seen.has(one)) saveTipSeen(one)
        seen.add(one)
      }
      if (result.tip && !seen.has(result.tip)) {
        seen.add(result.tip)
        saveTipSeen(result.tip)
        setTip(result.tip)
      }
      now.seen = seen
    }
  }, [])
  useEffect(() => {
    if (!tip) return
    const timer = window.setTimeout(() => setTip(null), TIP_MS)
    return () => window.clearTimeout(timer)
  }, [tip])
  const close = useCallback(() => setTip(null), [])
  return { tip, onStep, close }
}

