// The deck's make-up: the rules deal from it and the screen's card list shows it. Not in info.ts, so
// that it stays out of everyone's first load.
import type { ScrollCard } from './types.ts'

/** How many of each value the deck has: 16 cards */
export const DECK_COUNTS: Readonly<Record<ScrollCard, number>> = {
  0: 0,
  1: 5,
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 1,
  7: 1,
  8: 1,
}

/** The Beggars the host can add for a big table */
export const BEGGARS = 2

/** Every value in the deck with its copies, low to high */
export const deckList = (beggars: boolean): [ScrollCard, number][] =>
  (Object.entries(DECK_COUNTS) as unknown as [string, number][])
    .map(([card, count]): [ScrollCard, number] => [Number(card) as ScrollCard, card === '0' && beggars ? BEGGARS : count])
    .filter(([, count]) => count > 0)
