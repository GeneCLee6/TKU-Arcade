// 2026-11-22 (owner: "each driver's face at the start, then 3-2-1; after the first kart finishes, a
// ten-second countdown"; docs/KART-NETCODE.md §23): the race's opening and its close, as times both
// the room (shared/games/kart/rules.ts) and every browser read. Kept apart from rules.ts so that the
// race screen can read them without the room's judging.
//
// 2026-11-23 (owner: "don't present everyone at the start, just one shot with everyone in it"): the
// opening, from everyone on the grid to GO, is one group shot of the whole grid (GROUP_MS), then 3,
// 2, 1 (COUNT_MS), the same length whatever the field (from #152 it grew with the field, 5.4 to
// 9.6 s). The room sets GO by it once (`goAt`), and every browser works out where in the opening it
// is from the seconds left to GO, so that every screen in a room shows the same moment.

/** The group shot before the 3, ms */
export const GROUP_MS = 1_800
/** 3, 2, 1, ms */
export const COUNT_MS = 3_000

/** Before the 3: the group shot, ms (the field no longer changes it) */
export const introMs = (_racers?: number): number => GROUP_MS

/** From everyone on the grid to GO, ms: the same for any field */
export const countdownMs = (_racers?: number): number => GROUP_MS + COUNT_MS

/** After the first kart finishes, the others have this long; then whoever is still out does not finish */
export const CLOSE_AFTER_FINISH_MS = 10_000

/** Where the opening stands with `left` seconds to GO */
export type OpeningStage =
  /** The group shot, `share` (0 to 1) of the way through */
  | { readonly kind: 'group'; readonly share: number }
  /** 3, 2, 1 (or GO already) */
  | { readonly kind: 'count' }

/** The opening's stage with `left` seconds to GO; null: GO not set yet */
export function openingStage(left: number | null): OpeningStage | null {
  if (left === null) return null
  const count = COUNT_MS / 1000
  if (left <= count) return { kind: 'count' }
  const into = GROUP_MS + COUNT_MS - left * 1000
  return { kind: 'group', share: Math.max(0, Math.min(1, into / GROUP_MS)) }
}

/**
 * When the race closes, by the room's clock: CLOSE_AFTER_FINISH_MS after the first kart home (its
 * race time after GO); null before anyone has finished or before GO is set
 */
export function closeAt(race: {
  readonly goAt: number | null
  readonly racers: readonly { readonly finishMs: number | null }[]
}): number | null {
  if (race.goAt === null) return null
  let first: number | null = null
  for (const racer of race.racers) {
    if (racer.finishMs !== null && (first === null || racer.finishMs < first)) first = racer.finishMs
  }
  return first === null ? null : race.goAt + first + CLOSE_AFTER_FINISH_MS
}
