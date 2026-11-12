import type { KartState } from '../../shared/kart/physics.ts'

// e8-t08: the big words over the race (DRIFT, BOOST, CHAIN ×n), told from two states in a row

export type CalloutKind = 'drift' | 'boost' | 'chain'

export interface Callout {
  readonly kind: CalloutKind
  /** The chain count, for a chain */
  readonly count: number
}

/** What happened in one step worth calling out, the most important first; undefined for nothing */
export function calloutBetween(before: KartState, after: KartState): Callout | undefined {
  if (after.chain > before.chain) return { kind: 'chain', count: after.chain }
  if (after.storedBoosts < before.storedBoosts && after.boostSeconds > 0) {
    return { kind: 'boost', count: 0 }
  }
  if (before.driftDirection === 0 && after.driftDirection !== 0) return { kind: 'drift', count: 0 }
  return undefined
}

const RANK: Record<CalloutKind, number> = { drift: 0, boost: 1, chain: 2 }

/** Of two callouts in the same frame, the one to show */
export const louder = (a: Callout | undefined, b: Callout | undefined): Callout | undefined =>
  !a ? b : !b ? a : RANK[b.kind] >= RANK[a.kind] ? b : a
