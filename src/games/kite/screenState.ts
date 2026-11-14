// What the screen makes of a view: whose hands to draw in what order, what each card is known to
// be, and the log in words. Kept apart from the looks so that it can be tested without a browser.
// It only reads `view`: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type {
  KiteAction,
  KiteFace,
  KiteHint,
  KiteKnowledge,
  KiteLogEntry,
  KiteRank,
  KiteSuit,
  KiteView,
  KiteViewHand,
} from '../../../shared/games/kite/types.ts'
import type { Translate } from '../../i18n/t.ts'
import { promotionBoard as board } from '../../styles/tokens.ts'

/**
 * The kites' paints. The same in both themes, as a deck of cards is, and taken from the palace
 * palette tokens.ts already has for the promotion board (lacquer, rice paper, the hat buttons'
 * stones), so that this game adds no colour to everyone's first load. The rank sits on a paper label
 * in `ink`, which tokens.test.ts checks on `paper`
 */
export const kiteColors = {
  red: board.knob.ruby,
  gold: board.knob.gold,
  jade: board.gain,
  blue: board.knob.sapphire,
  white: board.paperHi,
  paper: board.paperHi,
  ink: board.ink,
  frame: board.drop,
  unknown: board.exile,
  glow: board.endHi,
} as const

/** A colour's paint; the rainbow's single swatch is the glow (its card draws a band of all five) */
export const suitFill = (suit: KiteSuit): string => (suit === 'rainbow' ? kiteColors.glow : kiteColors[suit])

export const ALL_RANKS: readonly KiteRank[] = [1, 2, 3, 4, 5]

/** The other players' hands, from whoever plays after you; everyone's for a spectator */
export function otherHands(view: KiteView): KiteViewHand[] {
  const at = view.you === null ? -1 : view.hands.findIndex((hand) => hand.seat === view.you)
  if (at < 0) return view.hands
  return [...view.hands.slice(at + 1), ...view.hands.slice(0, at)]
}

export const ownHand = (view: KiteView): KiteViewHand | null =>
  view.hands.find((hand) => hand.seat === view.you) ?? null

/** What a seat knows of a card: one colour or number once narrowed to it, else what is ruled out */
export type Known = {
  suit: KiteSuit | null
  rank: KiteRank | null
  notSuits: KiteSuit[]
  notRanks: KiteRank[]
}

export function knownOf(knows: KiteKnowledge, suits: readonly KiteSuit[]): Known {
  return {
    suit: knows.suits.length === 1 ? knows.suits[0] : null,
    rank: knows.ranks.length === 1 ? knows.ranks[0] : null,
    notSuits: knows.suits.length === 1 ? [] : suits.filter((suit) => !knows.suits.includes(suit)),
    notRanks: knows.ranks.length === 1 ? [] : ALL_RANKS.filter((rank) => !knows.ranks.includes(rank)),
  }
}

export const suitName = (t: Translate, suit: KiteSuit): string => t(`games.kite.suit.${suit}`)

export const faceName = (t: Translate, card: KiteFace): string =>
  t('games.kite.card', { suit: suitName(t, card.suit), rank: card.rank })

/** "Known: Red 3. Not 1 or 4" in words, for a card's label */
export function knowsText(t: Translate, knows: KiteKnowledge, suits: readonly KiteSuit[]): string {
  const known = knownOf(knows, suits)
  const or = t('games.kite.ui.or')
  const parts: string[] = []
  const certain = [known.suit === null ? null : suitName(t, known.suit), known.rank === null ? null : String(known.rank)]
    .filter((part): part is string => part !== null)
    .join(' ')
  if (certain) parts.push(t('games.kite.ui.known', { what: certain }))
  const ruledOut = [...known.notSuits.map((suit) => suitName(t, suit)), ...known.notRanks.map(String)]
  if (ruledOut.length > 0) parts.push(t('games.kite.ui.not', { what: ruledOut.join(or) }))
  return parts.length > 0 ? parts.join('. ') : t('games.kite.ui.nothingKnown')
}

export const hintName = (t: Translate, hint: KiteHint): string =>
  hint.kind === 'suit' ? suitName(t, hint.suit) : String(hint.rank)

/** One line of the log, in words */
export function logLine(t: Translate, entry: KiteLogEntry, nameOf: (seat: SeatId) => string): string {
  const seat = nameOf(entry.seat)
  switch (entry.kind) {
    case 'hint':
      return t(entry.slots.length > 1 ? 'games.kite.log.hintMany' : 'games.kite.log.hint', {
        seat,
        to: nameOf(entry.to),
        what: hintName(t, entry.hint),
        slots: entry.slots.map((slot) => slot + 1).join(t('games.kite.ui.listSeparator')),
      })
    case 'play':
      return t(entry.ok ? 'games.kite.log.hung' : 'games.kite.log.burnt', { seat, card: faceName(t, entry.card) })
    case 'discard':
      return t('games.kite.log.discard', { seat, card: faceName(t, entry.card) })
    case 'pass':
      return t(entry.reason === 'timeUp' ? 'games.kite.log.timeUp' : 'games.kite.log.skip', { seat })
  }
}

/** The cards the last note pointed at, if the last thing that happened was a note */
export function lastHinted(view: KiteView): readonly number[] {
  const last = view.log.at(-1)
  return last?.kind === 'hint' ? last.cards : []
}

/** The colours and numbers you could name in a note to `to` right now */
export function hintChoices(legal: readonly KiteAction[], to: SeatId): { suits: KiteSuit[]; ranks: KiteRank[] } {
  const suits: KiteSuit[] = []
  const ranks: KiteRank[] = []
  for (const action of legal) {
    if (action.type === 'hintSuit' && action.to === to) suits.push(action.suit)
    if (action.type === 'hintRank' && action.to === to) ranks.push(action.rank)
  }
  return { suits, ranks }
}

/** The players you could pass a note to now */
export const hintTargets = (legal: readonly KiteAction[]): SeatId[] => [
  ...new Set(legal.flatMap((action) => (action.type === 'hintSuit' || action.type === 'hintRank' ? [action.to] : []))),
]

/** Discards by colour, each sorted by number, in the order of the strings */
export function discardsBySuit(view: KiteView): { suit: KiteSuit; ranks: KiteRank[] }[] {
  return view.suits
    .map((suit) => ({
      suit,
      ranks: view.discards
        .filter((card) => card.suit === suit)
        .map((card) => card.rank)
        .sort((a, b) => a - b),
    }))
    .filter((group) => group.ranks.length > 0)
}
