// A computer player for 慘度排排站 (2026-11-23, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: every line, the card on the table face down (its category and title, never its
// index), the tries at it so far, and the last card shown. It does not read the title: a computer
// cannot weigh how miserable an event sounds. It counts instead.
//
// Normal: the misery indexes the card can still have are those of the bank's cards (the deck list is
// public, docs/content/misery-cards.zh-TW.csv) that nobody can see yet, in the card's category, less
// every range a wrong try has ruled out. It puts the card in the gap of its own line that holds most
// of them. Easy guesses by the numbers alone: any index from 1 to 100 as likely as another, so a wider
// gap is likelier, picked at random by its width; it ignores the category and the tries before it.
import { weighted } from '../tableBots.ts'
import type { Rng } from '../types.ts'
import { MISERY_CARDS } from './bank.ts'
import type { MiseryAction, MiseryAttempt, MiseryView } from './types.ts'

/** A look at a card that was shown, before the next player draws */
const REVEAL_MS = 3200
/** Thinking about where a card goes */
const GUESS_MS = { min: 1200, spread: 1300 }

const MAX_INDEX = 100

/** The bank's cards nobody can see in `view` yet: neither in a line nor the last one shown */
function unseen(view: MiseryView): { category: string; index: number }[] {
  const seen = new Set<number>()
  for (const line of view.lines) for (const card of line.cards) seen.add(card.id)
  if (view.last) seen.add(view.last.card.id)
  return MISERY_CARDS.flatMap(([category, , index], at) => (seen.has(at + 1) ? [] : [{ category, index }]))
}

/** Whether a wrong try rules `index` out: it was not between that line's neighbours */
const ruledOut = (attempt: MiseryAttempt, index: number): boolean =>
  attempt.gap !== null &&
  !attempt.right &&
  (attempt.low === null || attempt.low <= index) &&
  (attempt.high === null || index <= attempt.high)

/** The indexes the card on the table can still have, as Normal reckons them (with repeats) */
export function candidates(view: MiseryView): number[] {
  const current = view.current
  if (!current) return []
  const open = unseen(view)
  const sameKind = open.filter((card) => card.category === current.category)
  const pool = (sameKind.length > 0 ? sameKind : open).map((card) => card.index)
  const left = pool.filter((index) => !view.attempts.some((attempt) => ruledOut(attempt, index)))
  return left.length > 0 ? left : pool
}

/** How many of `indexes` belong in each gap of `line` (an equal index fits either side) */
export function gapShares(line: readonly number[], indexes: readonly number[]): number[] {
  return Array.from({ length: line.length + 1 }, (_, gap) => {
    const low = gap > 0 ? line[gap - 1] : -Infinity
    const high = gap < line.length ? line[gap] : Infinity
    return indexes.filter((index) => low <= index && index <= high).length
  })
}

/** The room's clock for this seat (`GameModule.botTime`) */
export function miseryBotTime(legal: readonly MiseryAction[], rng: Rng): number | null {
  if (legal.some((action) => action.type === 'next')) return REVEAL_MS
  if (legal.some((action) => action.type === 'place')) return GUESS_MS.min + rng.int(GUESS_MS.spread)
  return null
}

export function miseryBot(
  view: MiseryView,
  legal: readonly MiseryAction[],
  level: string,
  rng: Rng,
): MiseryAction | null {
  const next = legal.find((action) => action.type === 'next')
  if (next) return next
  const places = legal.filter((action) => action.type === 'place')
  if (places.length === 0 || view.you === null) return null
  const line = (view.lines.find((one) => one.seat === view.you)?.cards ?? []).map((card) => card.index)

  if (level === 'easy') {
    // Every index from 1 to 100 alike: a gap is as likely as it is wide
    const widths = gapShares(line, Array.from({ length: MAX_INDEX }, (_, at) => at + 1))
    return weighted(places, (action) => widths[action.gap] ?? 0, rng) ?? rng.pick(places)
  }

  const shares = gapShares(line, candidates(view))
  let found = places[0]
  for (const action of places) {
    if ((shares[action.gap] ?? 0) > (shares[found.gap] ?? 0)) found = action
  }
  return found
}
