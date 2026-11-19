import type { KartState } from '../../shared/kart/physics.ts'
import type { TrialStart } from '../../shared/kart/timeTrial.ts'

// e8-t08: the big words over the race (DRIFT, BOOST, CHAIN ×n), told from two states in a row.
// 2026-11-14: and the techniques: a start boost or a jump start, a release boost, a boost slide;
// then a stacked boost, a counter catch, a boost pad and a chain broken on a wall; then the double
// (a second release boost from a tapped drift right after the first); then the slide-out's prompts:
// counter-steer now, and, once caught, the throttle now

export type CalloutKind =
  | 'drift'
  | 'double'
  | 'catch'
  | 'counter'
  | 'slide'
  | 'release'
  | 'pad'
  | 'boost'
  | 'chain'
  | 'stack'
  | 'broken'
  | 'start'
  | 'quick'
  | 'stall'
  // 2026-11-18, the timing of the instant boost (docs/KART-FEEL.md §3.2): perfect, or late
  | 'perfect'
  | 'late'
  // 2026-11-19: a drift carried over a jump and landed (shared/kart/terrain.ts)
  | 'driftJump'

export interface Callout {
  readonly kind: CalloutKind
  /** The chain count, for a chain */
  readonly count: number
}

/** What happened in one step worth calling out, the most important first; undefined for nothing */
export function calloutBetween(before: KartState, after: KartState): Callout | undefined {
  // A drift landed off a jump
  if ((after.driftJumps ?? 0) > (before.driftJumps ?? 0)) return { kind: 'driftJump', count: 0 }
  // The double says so itself; any other release boost is a chain from the second in a row
  if (after.doubles > before.doubles) return { kind: 'double', count: 0 }
  // The classic feel grades the press: a perfect one says so (and the combo it has reached), a
  // late one too; a good one is an instant boost like any
  if ((after.dashCount ?? 0) > (before.dashCount ?? 0)) {
    if (after.dashGrade === 3) return { kind: 'perfect', count: after.chain }
    if (after.dashGrade === 1) return { kind: 'late', count: 0 }
  }
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
  // The slide-out caught with a release boost waiting: press the throttle now
  if (after.releaseWindow > before.releaseWindow) return { kind: 'catch', count: 0 }
  // A drift let go that earned an instant boost: the car is sliding out, and a fresh press of the
  // throttle fires it now (the classic feel earns it during the drift, the arcade feel on letting go)
  if (after.burstReady && !after.drifting && (before.drifting || !before.burstReady)) {
    return { kind: 'counter', count: 0 }
  }
  if (!before.sliding && after.sliding) return { kind: 'slide', count: 0 }
  if (before.driftDirection === 0 && after.driftDirection !== 0) return { kind: 'drift', count: 0 }
  return undefined
}

/** How the car left the grid, worth a callout at GO; undefined for a plain start */
export const calloutAtStart = (start: TrialStart): Callout | undefined =>
  start === 'none'
    ? undefined
    : { kind: start === 'boost' ? 'start' : start === 'quick' ? 'quick' : 'stall', count: 0 }

const RANK: Record<CalloutKind, number> = {
  drift: 0,
  catch: 2,
  counter: 1,
  slide: 2,
  release: 3,
  pad: 3,
  boost: 4,
  chain: 5,
  double: 5,
  stack: 6,
  broken: 6,
  start: 7,
  quick: 7,
  stall: 7,
  perfect: 5,
  late: 3,
  driftJump: 6,
}

/** Of two callouts in the same frame, the one to show */
export const louder = (a: Callout | undefined, b: Callout | undefined): Callout | undefined =>
  !a ? b : !b ? a : RANK[b.kind] >= RANK[a.kind] ? b : a
