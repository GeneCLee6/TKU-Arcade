// What the screen makes of a view: whom to tell what, where each seat sits round the table, the raise
// sizes and each log line as a sentence. Kept apart from the looks so that it can be tested without a
// browser. It only reads `view`: the rules are the server's.
import type { HoldemCategory, HoldemLog, HoldemPublicPlayer, HoldemStreet, HoldemView } from '../../../shared/games/holdem/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import { bestHand, type Card } from '../../../shared/poker/hand.ts'
import type { TextKey } from '../../i18n/t.ts'

export type Line = { key: TextKey; params: Record<string, string | number> }

export const categoryKey = (category: HoldemCategory): TextKey => `games.holdem.hand.${category}`

/** A straight flush to the ace is named apart, as the server does */
export function categoryOfCards(cards: readonly Card[]): { category: HoldemCategory; best: Card[] } | null {
  if (cards.length < 5) return null
  const hand = bestHand(cards)
  const royal = hand.category === 'straightFlush' && hand.best[0][0] === 'A'
  return { category: royal ? 'royalFlush' : hand.category, best: hand.best }
}

/** What you hold with the board so far, from the flop on */
export const madeHand = (view: HoldemView) =>
  view.hole.length === 2 && view.board.length >= 3 ? categoryOfCards([...view.hole, ...view.board]) : null

export const playerOf = (view: HoldemView, seat: SeatId): HoldemPublicPlayer | undefined =>
  view.players.find((player) => player.seat === seat)

/** Chips you need to put in to call */
export function toCallOf(view: HoldemView): number {
  const you = view.you === null ? undefined : playerOf(view, view.you)
  return you === undefined ? 0 : Math.max(0, view.currentBet - you.bet)
}

/**
 * The quick raise sizes as the server works them out: the smallest, half the pot, the pot, all in.
 * `min` and `max` are the bounds of the slider. Null when you cannot raise
 */
export function raiseSizes(view: HoldemView, legalRaises: readonly number[]) {
  if (legalRaises.length === 0) return null
  const you = view.you === null ? undefined : playerOf(view, view.you)
  if (you === undefined) return null
  const min = Math.min(...legalRaises)
  const max = Math.max(...legalRaises)
  const pot = view.pot + toCallOf(view)
  const clamp = (to: number) => Math.min(max, Math.max(min, to))
  return {
    min,
    max,
    halfPot: clamp(view.currentBet + Math.floor(pot / 2)),
    pot: clamp(view.currentBet + pot),
  }
}

/** Where each seat sits round an oval table, in percent: you at the bottom, the rest clockwise */
export function seatSpots(seats: readonly SeatId[], you: SeatId | null) {
  const start = you === null ? 0 : Math.max(0, seats.indexOf(you))
  return seats.map((seat, index) => {
    const turn = ((index - start + seats.length) % seats.length) / seats.length
    // Clockwise from the bottom, as the deal goes round a real table
    const angle = Math.PI / 2 + turn * 2 * Math.PI
    return {
      seat,
      x: 50 + 41 * Math.cos(angle),
      y: 50 + 43 * Math.sin(angle),
      // Bets sit between the seat and the middle
      betX: 50 + 24 * Math.cos(angle),
      betY: 50 + 27 * Math.sin(angle),
      // The dealer button sits beside the bet, a little further round
      buttonX: 50 + 30 * Math.cos(angle + 0.45),
      buttonY: 50 + 33 * Math.sin(angle + 0.45),
    }
  })
}

export type Names = {
  name(seat: SeatId): string
  category(category: HoldemCategory): string
  street(street: HoldemStreet): string
}

/** The dock's main line: what you should be doing now */
export function promptOf(view: HoldemView, myTurn: boolean, names: Names): Line {
  const you = view.you === null ? undefined : playerOf(view, view.you)
  if (view.phase.kind === 'over') return { key: 'games.holdem.ui.prompt.over', params: {} }
  if (you?.out) return { key: 'games.holdem.ui.prompt.busted', params: {} }
  if (you?.away) return { key: 'games.holdem.ui.prompt.away', params: {} }
  if (view.phase.kind === 'handEnd') return { key: 'games.holdem.ui.prompt.handEnd', params: {} }
  if (myTurn) {
    const toCall = toCallOf(view)
    return toCall > 0
      ? { key: 'games.holdem.ui.prompt.yourTurnCall', params: { chips: toCall } }
      : { key: 'games.holdem.ui.prompt.yourTurnCheck', params: {} }
  }
  return { key: 'games.holdem.ui.prompt.waiting', params: { name: names.name(view.phase.toAct) } }
}

/** One log line as a sentence, and the cards that go with it */
export function logLine(entry: HoldemLog, names: Names): Line & { cards: Card[] } {
  const plain = (key: TextKey, params: Line['params'] = {}) => ({ key, params, cards: [] as Card[] })
  switch (entry.k) {
    case 'hand':
      return plain('games.holdem.log.hand', { hand: entry.hand, name: names.name(entry.button), sb: entry.sb, bb: entry.bb })
    case 'blindsUp':
      return plain('games.holdem.log.blindsUp', { sb: entry.sb, bb: entry.bb })
    case 'blind':
      return plain(entry.big ? 'games.holdem.log.bb' : 'games.holdem.log.sb', { name: names.name(entry.seat), chips: entry.amount })
    case 'fold':
    case 'check':
    case 'muck':
    case 'bust':
    case 'timeout':
      return plain(`games.holdem.log.${entry.k}`, { name: names.name(entry.seat) })
    case 'call':
      return plain(entry.allIn ? 'games.holdem.log.callAllIn' : 'games.holdem.log.call', { name: names.name(entry.seat), chips: entry.amount })
    case 'bet':
    case 'raise':
      return plain(`games.holdem.log.${entry.k}${entry.allIn ? 'AllIn' : ''}`, { name: names.name(entry.seat), chips: entry.to })
    case 'street':
      return { key: 'games.holdem.log.street', params: { street: names.street(entry.street) }, cards: entry.cards }
    case 'return':
      return plain('games.holdem.log.return', { name: names.name(entry.seat), chips: entry.amount })
    case 'show':
      return {
        key: 'games.holdem.log.show',
        params: { name: names.name(entry.seat), hand: names.category(entry.category) },
        cards: entry.cards,
      }
    case 'win': {
      const side = entry.pot > 0
      const withHand = entry.category !== null
      const key: TextKey = `games.holdem.log.win${side ? 'Side' : ''}${withHand ? 'Hand' : ''}`
      return plain(key, {
        name: names.name(entry.seat),
        chips: entry.amount,
        n: entry.pot,
        hand: entry.category === null ? '' : names.category(entry.category),
      })
    }
    case 'away':
      return plain(entry.away ? 'games.holdem.log.away' : 'games.holdem.log.back', { name: names.name(entry.seat) })
    case 'endVote':
      return plain(entry.on ? 'games.holdem.log.endVote' : 'games.holdem.log.endUnvote', { name: names.name(entry.seat) })
    case 'end':
      return plain('games.holdem.log.end')
  }
}

/** The cards of the winning hands, to light up on the board and in the shown hands */
export function winningCards(view: HoldemView): Set<Card> {
  const last = view.last
  if (last === null || last.hand !== view.hand || !last.showdown) return new Set()
  const winners = new Set(last.pots.flatMap((pot) => pot.winners.map((win) => win.seat)))
  return new Set(last.shown.filter((one) => winners.has(one.seat)).flatMap((one) => one.best))
}

/** A button's dependable identity: the same key until the view moves on, so a press is sent once */
export const answerKey = (view: HoldemView): string => `${view.hand}-${view.step}`
