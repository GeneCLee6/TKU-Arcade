// 2026-11-22 (owner: "each driver's face at the start, then 3-2-1; after the first kart finishes, a
// ten-second countdown"; docs/KART-NETCODE.md §23): the race's opening and its close, as times both
// the room (shared/games/kart/rules.ts) and every browser read. Kept apart from rules.ts so that the
// race screen can read them without the room's judging.
//
// The opening, from everyone on the grid to GO: each driver presented in turn (PRESENT_MS each), a
// glide to the grid shot (SETTLE_MS), then 3, 2, 1 (COUNT_MS). It grows with the field, so that two
// karts do not wait as long as eight: 8 karts take 9.6 s, 2 take 5.4 s. The room sets GO by it once
// (`goAt`), and every browser works out where in the opening it is from the seconds left to GO and
// the number of racers, so that everyone sees the same driver at the same moment.

/** Each driver's turn in front of the camera, ms */
export const PRESENT_MS = 700
/** From the last driver to the grid shot, ms */
export const SETTLE_MS = 1_000
/** 3, 2, 1, ms */
export const COUNT_MS = 3_000
/** The field is never presented as more than this many (a room has at most eight seats) */
export const MAX_PRESENTED = 8

/** Before the 3: every driver presented and the glide to the grid, ms */
export const introMs = (racers: number): number =>
  Math.max(0, Math.min(MAX_PRESENTED, racers)) * PRESENT_MS + SETTLE_MS

/** From everyone on the grid to GO, ms */
export const countdownMs = (racers: number): number => introMs(racers) + COUNT_MS

/** After the first kart finishes, the others have this long; then whoever is still out does not finish */
export const CLOSE_AFTER_FINISH_MS = 10_000

/** Where the opening stands with `left` seconds to GO */
export type OpeningStage =
  /** Driver `index` (in grid order, the pole first) in front of the camera, `share` of the way through their turn */
  | { readonly kind: 'present'; readonly index: number; readonly share: number }
  /** From the last driver to the grid shot */
  | { readonly kind: 'settle'; readonly share: number }
  /** 3, 2, 1 (or GO already) */
  | { readonly kind: 'count' }

/** The opening's stage with `left` seconds to GO and `racers` on the grid; null: GO not set yet */
export function openingStage(left: number | null, racers: number): OpeningStage | null {
  if (left === null) return null
  const count = COUNT_MS / 1000
  if (left <= count) return { kind: 'count' }
  const settle = SETTLE_MS / 1000
  if (left <= count + settle) return { kind: 'settle', share: 1 - (left - count) / settle }
  const shown = Math.max(0, Math.min(MAX_PRESENTED, racers))
  const per = PRESENT_MS / 1000
  const into = shown * per - (left - count - settle)
  if (shown === 0 || into < 0) return { kind: 'settle', share: 0 }
  const index = Math.min(shown - 1, Math.floor(into / per))
  return { kind: 'present', index, share: Math.min(1, (into - index * per) / per) }
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
