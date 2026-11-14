import type { KartState } from '../../shared/kart/physics.ts'
import type { TrialStart } from '../../shared/kart/timeTrial.ts'

// e8-t08: the big words over the race (DRIFT, BOOST, CHAIN ×n), told from two states in a row.
// 2026-11-14: and the techniques: a start boost or a jump start, a release boost, a boost slide;
// then a stacked boost, a flick, a counter catch, a boost pad and a chain broken on a wall

export type CalloutKind =
  | 'drift'
  | 'flick'
  | 'catch'
  | 'slide'
  | 'release'
  | 'pad'
  | 'boost'
  | 'chain'
  | 'stack'
  | 'broken'
  | 'start'
  | 'stall'

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
    return { kind: after.stackSeconds > before.stackSeconds ? 'stack' : 'boost', count: 0 }
  }
  // The chain lost with its window still well open: a wall broke it
  if (before.chain >= 2 && after.chain === 0 && before.chainWindow > 0.05) {
    return { kind: 'broken', count: 0 }
  }
  // A boost from nowhere: the road's boost pad
  if (after.boostSeconds > before.boostSeconds + 1e-9) return { kind: 'pad', count: 0 }
  if (after.flicks > before.flicks) return { kind: 'flick', count: 0 }
  if (after.catchSeconds > before.catchSeconds) return { kind: 'catch', count: 0 }
  if (!before.sliding && after.sliding) return { kind: 'slide', count: 0 }
  if (before.driftDirection === 0 && after.driftDirection !== 0) return { kind: 'drift', count: 0 }
  return undefined
}

/** How the car left the grid, worth a callout at GO; undefined for a plain start */
export const calloutAtStart = (start: TrialStart): Callout | undefined =>
  start === 'none' ? undefined : { kind: start === 'boost' ? 'start' : 'stall', count: 0 }

const RANK: Record<CalloutKind, number> = {
  drift: 0,
  flick: 1,
  catch: 1,
  slide: 2,
  release: 3,
  pad: 3,
  boost: 4,
  chain: 5,
  stack: 6,
  broken: 6,
  start: 7,
  stall: 7,
}

/** Of two callouts in the same frame, the one to show */
export const louder = (a: Callout | undefined, b: Callout | undefined): Callout | undefined =>
  !a ? b : !b ? a : RANK[b.kind] >= RANK[a.kind] ? b : a
