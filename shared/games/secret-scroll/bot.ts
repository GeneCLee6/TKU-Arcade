// A computer player for 奪祕笈 (2026-11-21, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own hand, every card played or knocked face up this round, the cards set aside
// face up with two players, and what its own Spy and Duelist showed it. From those it counts the
// cards it cannot see and, for each opponent, what they may hold: a card it was shown, as long as
// that opponent has not since played it, been made to redraw or swapped; otherwise any unseen card.
//
// Normal scores every play it may make by what it expects to come of it (a Constable's hit, a duel
// won or lost, a Drunkard that finds the Scroll) plus the worth of the card it keeps, more so as the
// deck runs dry, and picks the best. Easy plays any card but the Scroll, at anyone, and guesses at
// random.
import { best } from '../tableBots.ts'
import type { Rng, SeatId } from '../types.ts'
import { DECK_COUNTS, BEGGARS } from './deck.ts'
import type { ScrollAction, ScrollCard, ScrollPlayerView, ScrollView } from './types.ts'

const VALUES: readonly ScrollCard[] = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** How many of each value this seat cannot see: the deck, the face-down card, others' hands */
export function unseenCounts(view: ScrollView): number[] {
  const counts = VALUES.map((value) => (value === 0 ? (view.beggars ? BEGGARS : 0) : DECK_COUNTS[value]))
  const me = view.players.find((player) => player.seat === view.you)
  const seen = [...(me?.hand ?? []), ...view.faceUp, ...view.players.flatMap((player) => player.discards)]
  for (const card of seen) counts[card] = Math.max(0, counts[card] - 1)
  return counts
}

/**
 * What this seat knows `seat` holds: the last card shown to it, if the holder has not played that
 * value since, nor been made to throw it away or swap. Null when it does not know
 */
export function knownCard(view: ScrollView, seat: SeatId): ScrollCard | null {
  let known: ScrollCard | null = null
  for (const event of view.events) {
    for (const seen of event.seen) if (seen.of === seat) known = seen.card
    if (event.card === 6 && (event.seat === seat || event.target === seat)) known = null
    else if (event.card === 5 && event.target === seat) known = null
    else if (event.seat === seat && event.card !== null && event.card === known) known = null
  }
  return known
}

/** The chance of each value in `seat`'s hand, out of 1 */
function handOdds(view: ScrollView, seat: SeatId, counts: readonly number[]): number[] {
  const known = knownCard(view, seat)
  if (known !== null) return VALUES.map((value) => (value === known ? 1 : 0))
  const total = counts.reduce((sum, count) => sum + count, 0)
  return counts.map((count) => (total === 0 ? 0 : count / total))
}

const expected = (odds: readonly number[]) => odds.reduce((sum, chance, value) => sum + chance * value, 0)

/** How good a play is for this seat, by what it expects to come of it */
function score(
  view: ScrollView,
  action: Extract<ScrollAction, { type: 'play' }>,
  me: ScrollPlayerView,
  counts: readonly number[],
): number {
  const hand = me.hand ?? []
  const at = hand.indexOf(action.card)
  const kept = hand.find((_, index) => index !== at) ?? action.card
  // Late in the round the card kept is what the round may be won on
  const late = view.deckCount <= 3 ? 1 : view.deckCount <= 7 ? 0.5 : 0.2
  const keep = (kept / 8) * late
  const odds = action.target === null ? null : handOdds(view, action.target, counts)
  switch (action.card) {
    case 8:
      return -100
    case 1:
      return keep + (odds && action.guess !== null ? odds[action.guess] : 0)
    case 2:
      // Worth more the less it knows already
      return keep + (action.target !== null && knownCard(view, action.target) === null ? 0.25 : 0.05)
    case 3: {
      if (!odds) return keep
      const win = odds.reduce((sum, chance, value) => sum + (value < kept ? chance : 0), 0)
      const lose = odds.reduce((sum, chance, value) => sum + (value > kept ? chance : 0), 0)
      // Losing ends the round for this seat: it weighs more than winning
      return win - 1.3 * lose
    }
    case 4:
      return keep + 0.3
    case 5: {
      if (action.target === view.you) return kept === 8 ? -100 : (kept <= 2 ? 0.15 : -0.1) + 0.05
      if (!odds) return keep
      return keep + odds[8] + 0.1 * (expected(odds) / 8)
    }
    case 6: {
      if (!odds) return keep
      // Their card for the one kept: worth it when theirs is better, more so late
      return ((expected(odds) - kept) / 8) * (0.4 + late) + 0.02
    }
    case 7:
      return keep + 0.05
    case 0:
      return keep + 0.1
  }
}

export function secretScrollBot(view: ScrollView, legal: readonly ScrollAction[], level: string, rng: Rng): ScrollAction | null {
  const me = view.players.find((player) => player.seat === view.you)
  const plays = legal.filter((one): one is Extract<ScrollAction, { type: 'play' }> => one.type === 'play')
  if (!me || plays.length === 0) return null
  if (level === 'easy') {
    const safe = plays.filter((one) => one.card !== 8)
    return rng.pick(safe.length > 0 ? safe : plays)
  }
  const counts = unseenCounts(view)
  return best(plays, (one) => score(view, one, me, counts))
}
