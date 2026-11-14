import type { KartState } from '../../shared/kart/physics.ts'
import type { TrialStart } from '../../shared/kart/timeTrial.ts'

// e8-t08: the big words over the race (DRIFT, BOOST, CHAIN ×n), told from two states in a row.
// 2026-11-14: and the techniques: a start boost or a jump start, a release boost, a boost slide

export type CalloutKind = 'drift' | 'slide' | 'release' | 'boost' | 'chain' | 'start' | 'stall'

export interface Callout {
  readonly kind: CalloutKind
  /** The chain count, for a chain */
  readonly count: number
}

/** What happened in one step worth calling out, the most important first; undefined for nothing */
export function calloutBetween(before: KartState, after: KartState): Callout | undefined {
  // A release boost fired: from the second in a row it is a chain
  if (after.miniSeconds > before.miniSeconds) {
    return after.chain >= 2 ? { kind: 'chain', count: after.chain } : { kind: 'release', count: 0 }
  }
  if (after.storedBoosts < before.storedBoosts && after.boostSeconds > 0) {
    return { kind: 'boost', count: 0 }
  }
  if (!before.sliding && after.sliding) return { kind: 'slide', count: 0 }
  if (before.driftDirection === 0 && after.driftDirection !== 0) return { kind: 'drift', count: 0 }
  return undefined
}

/** How the car left the grid, worth a callout at GO; undefined for a plain start */
export const calloutAtStart = (start: TrialStart): Callout | undefined =>
  start === 'none' ? undefined : { kind: start === 'boost' ? 'start' : 'stall', count: 0 }

const RANK: Record<CalloutKind, number> = {
  drift: 0,
  slide: 1,
  release: 2,
  boost: 3,
  chain: 4,
  start: 5,
  stall: 5,
}

/** Of two callouts in the same frame, the one to show */
export const louder = (a: Callout | undefined, b: Callout | undefined): Callout | undefined =>
  !a ? b : !b ? a : RANK[b.kind] >= RANK[a.kind] ? b : a
