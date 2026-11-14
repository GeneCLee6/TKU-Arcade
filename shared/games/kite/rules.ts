// 放風箏 (working title Kite Day; owner's request 2026-11-14). A co-operative card game for 2 to
// 5: five colours of kites (a sixth, rainbow, as an option), each colour's kite train to be flown in
// order from 1 to 5. Everyone holds their hand facing out: they see every hand but their own. On a
// turn a player passes a note (a hint: all of one player's cards of one colour, or of one number),
// sets a card aside to get a note back, or flies one. A kite out of order snaps its line (a burn, in
// the code); the third ends the day. Once the deck is gone everyone has one more turn. The score is
// the kites flying.
//
// docs/PRD/e16-kite-day.md has the rules and every detail decided here.
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import { handSize, kiteInfo, MAX_BURNS, MAX_NOTES } from './info.ts'
import type {
  KiteAction,
  KiteCard,
  KiteEnding,
  KiteFace,
  KiteHint,
  KiteKnowledge,
  KiteLogEntry,
  KiteOptions,
  KiteRank,
  KiteStacks,
  KiteState,
  KiteSuit,
  KiteView,
  KiteViewCard,
} from './types.ts'

export const BASE_SUITS: readonly KiteSuit[] = ['red', 'gold', 'jade', 'blue', 'white']
export const RANKS: readonly KiteRank[] = [1, 2, 3, 4, 5]
/** How many of each number a colour has: three 1s, two each of 2–4, one 5 */
export const COPIES: Readonly<Record<KiteRank, number>> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 }

const ERROR = {
  badAction: 'games.kite.error.badAction',
  over: 'games.kite.error.over',
  notAPlayer: 'games.kite.error.notAPlayer',
  systemOnly: 'games.kite.error.systemOnly',
  notYourTurn: 'games.kite.error.notYourTurn',
  noNotes: 'games.kite.error.noNotes',
  notesFull: 'games.kite.error.notesFull',
  hintSelf: 'games.kite.error.hintSelf',
  hintNothing: 'games.kite.error.hintNothing',
  badSuit: 'games.kite.error.badSuit',
  notYourCard: 'games.kite.error.notYourCard',
  stale: 'games.kite.error.stale',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)
const isRank = (value: unknown): value is KiteRank => RANKS.includes(value as KiteRank)
const isSuit = (value: unknown): value is KiteSuit =>
  value === 'rainbow' || BASE_SUITS.includes(value as KiteSuit)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): KiteAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, to, suit, rank, card, turn, seat } = action as Record<string, unknown>
  if (type === 'hintSuit' && isSeat(to) && isSuit(suit)) return { type, to, suit }
  if (type === 'hintRank' && isSeat(to) && isRank(rank)) return { type, to, rank }
  if ((type === 'play' || type === 'discard') && Number.isInteger(card)) return { type, card: card as number }
  if (type === 'timeUp' && Number.isInteger(turn)) return { type, turn: turn as number }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

/** Every card of the game, in order: each colour's 1, 1, 1, 2, 2, 3, 3, 4, 4, 5 */
export function fullDeck(suits: readonly KiteSuit[]): KiteFace[] {
  return suits.flatMap((suit) => RANKS.flatMap((rank) => Array.from({ length: COPIES[rank] }, () => ({ suit, rank }))))
}

/** The colours a note can name: with the rainbow on, rainbow cards answer every colour note instead */
export const hintSuits = (suits: readonly KiteSuit[]): KiteSuit[] => suits.filter((suit) => suit !== 'rainbow')

/** Whether a note points at this card */
export function touches(hint: KiteHint, card: KiteFace): boolean {
  if (hint.kind === 'rank') return card.rank === hint.rank
  return card.suit === hint.suit || card.suit === 'rainbow'
}

/** What a seat can still rule in for a card after a note pointed at it, or passed it by */
export function learn(knows: KiteKnowledge, hint: KiteHint, touched: boolean): KiteKnowledge {
  if (hint.kind === 'rank') {
    return { ...knows, ranks: knows.ranks.filter((rank) => (rank === hint.rank) === touched) }
  }
  const named = (suit: KiteSuit) => suit === hint.suit || suit === 'rainbow'
  return { ...knows, suits: knows.suits.filter((suit) => named(suit) === touched) }
}

export const scoreOf = (stacks: KiteStacks): number =>
  Object.values(stacks).reduce((sum: number, height) => sum + (height ?? 0), 0)

export const maxScoreOf = (suits: readonly KiteSuit[]): number => suits.length * RANKS.length

const indexOfSeat = (state: KiteState, seat: SeatId): number => state.players.indexOf(seat)
const currentSeat = (state: KiteState): SeatId => state.players[state.turn]

/** The turn is over: check how the day ends, count down the last round, pass it on */
function endTurn(state: KiteState, entry: KiteLogEntry): KiteState {
  const log = [...state.log, entry]
  let ending: KiteEnding | null = null
  let finalTurns = state.finalTurns
  if (state.burns >= MAX_BURNS) ending = 'burned'
  else if (scoreOf(state.stacks) >= maxScoreOf(state.suits)) ending = 'perfect'
  else if (finalTurns !== null) {
    finalTurns -= 1
    if (finalTurns <= 0) ending = 'deck'
  } else if (state.deck.length === 0) {
    // This turn drew the last card: everyone, its player too, has one more turn
    finalTurns = state.players.length
  }
  if (ending !== null) return { ...state, log, finalTurns, ending }
  return {
    ...state,
    log,
    finalTurns,
    turn: (state.turn + 1) % state.players.length,
    turnNumber: state.turnNumber + 1,
  }
}

/** The card leaves the current player's hand, and they draw the next one onto the front, if any */
function takeCard(state: KiteState, cardId: number): { state: KiteState; card: KiteCard; slot: number } | null {
  const hand = state.hands[state.turn]
  const slot = hand.findIndex((card) => card.id === cardId)
  if (slot < 0) return null
  const [drawn, ...deck] = state.deck
  const rest = hand.filter((card) => card.id !== cardId)
  const newHand = drawn === undefined ? rest : [drawn, ...rest]
  const hands = state.hands.map((cards, index) => (index === state.turn ? newHand : cards))
  return { state: { ...state, hands, deck }, card: hand[slot], slot }
}

const face = (card: KiteCard): KiteFace => ({ suit: card.suit, rank: card.rank })

function hint(state: KiteState, seat: SeatId, to: SeatId, given: KiteHint): KiteState | ReturnType<typeof gameError> {
  if (state.notes <= 0) return gameError(ERROR.noNotes)
  if (to === seat) return gameError(ERROR.hintSelf)
  const target = indexOfSeat(state, to)
  if (target < 0) return gameError(ERROR.notAPlayer)
  if (given.kind === 'suit' && !hintSuits(state.suits).includes(given.suit)) return gameError(ERROR.badSuit)
  const hand = state.hands[target]
  const slots = hand.flatMap((card, slot) => (touches(given, card) ? [slot] : []))
  if (slots.length === 0) return gameError(ERROR.hintNothing)
  const newHand = hand.map((card) => ({ ...card, knows: learn(card.knows, given, touches(given, card)) }))
  const next = {
    ...state,
    notes: state.notes - 1,
    hands: state.hands.map((cards, index) => (index === target ? newHand : cards)),
  }
  return endTurn(next, {
    kind: 'hint',
    turn: state.turnNumber,
    seat,
    to,
    hint: given,
    cards: slots.map((slot) => hand[slot].id),
    slots,
  })
}

function play(state: KiteState, seat: SeatId, cardId: number): KiteState | ReturnType<typeof gameError> {
  const taken = takeCard(state, cardId)
  if (taken === null) return gameError(ERROR.notYourCard)
  const { card, slot } = taken
  const height = state.stacks[card.suit] ?? 0
  const ok = card.rank === height + 1
  const next: KiteState = ok
    ? {
        ...taken.state,
        stacks: { ...state.stacks, [card.suit]: card.rank },
        // A finished string gives a note back
        notes: card.rank === 5 ? Math.min(MAX_NOTES, state.notes + 1) : state.notes,
        hung: state.hung.map((count, index) => (index === state.turn ? count + 1 : count)),
      }
    : { ...taken.state, burns: state.burns + 1, discards: [...state.discards, face(card)] }
  return endTurn(next, { kind: 'play', turn: state.turnNumber, seat, card: face(card), slot, ok })
}

function discard(state: KiteState, seat: SeatId, cardId: number): KiteState | ReturnType<typeof gameError> {
  if (state.notes >= MAX_NOTES) return gameError(ERROR.notesFull)
  const taken = takeCard(state, cardId)
  if (taken === null) return gameError(ERROR.notYourCard)
  const next = { ...taken.state, notes: state.notes + 1, discards: [...state.discards, face(taken.card)] }
  return endTurn(next, { kind: 'discard', turn: state.turnNumber, seat, card: face(taken.card), slot: taken.slot })
}

/** The notes `seat` could pass now: each other player, each colour and number that points at something */
function hintActions(state: KiteState, seat: SeatId): KiteAction[] {
  if (state.notes <= 0) return []
  return state.players.flatMap((to, index): KiteAction[] => {
    if (to === seat) return []
    const hand = state.hands[index]
    const suits = hintSuits(state.suits).filter((suit) => hand.some((card) => touches({ kind: 'suit', suit }, card)))
    const ranks = RANKS.filter((rank) => hand.some((card) => card.rank === rank))
    return [
      ...suits.map((suit): KiteAction => ({ type: 'hintSuit', to, suit })),
      ...ranks.map((rank): KiteAction => ({ type: 'hintRank', to, rank })),
    ]
  })
}

/** The view's card: the face only where this viewer may see it */
const shownCard = (card: KiteCard, visible: boolean): KiteViewCard =>
  visible
    ? { id: card.id, suit: card.suit, rank: card.rank, knows: card.knows }
    : { id: card.id, suit: null, rank: null, knows: card.knows }

export const kite: GameModule<KiteState, KiteAction, KiteView, KiteOptions> = {
  ...kiteInfo,

  init(seats, options, rng: Rng) {
    const suits: KiteSuit[] = options.rainbow ? [...BASE_SUITS, 'rainbow'] : [...BASE_SUITS]
    const knows: KiteKnowledge = { suits, ranks: [...RANKS] }
    // Ids follow the shuffled order, so an id says nothing about its card
    const deck: KiteCard[] = rng.shuffle(fullDeck(suits)).map((card, id) => ({ id, ...card, knows }))
    const players = seats.map((seat) => seat.id)
    const size = handSize(players.length)
    const hands = players.map((_, index) => deck.slice(index * size, (index + 1) * size))
    return {
      players,
      suits,
      hands,
      deck: deck.slice(players.length * size),
      stacks: Object.fromEntries(suits.map((suit) => [suit, 0])),
      discards: [],
      notes: MAX_NOTES,
      burns: 0,
      turn: 0,
      turnNumber: 1,
      finalTurns: null,
      hung: players.map(() => 0),
      log: [],
      turnSeconds: options.turnSeconds,
      ending: null,
    }
  },

  reduce(state, rawAction, actor) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.ending !== null) return gameError(ERROR.over)
    const seat = currentSeat(state)

    if (action.type === 'timeUp' || action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'timeUp' && action.turn !== state.turnNumber) return gameError(ERROR.stale)
      if (action.type === 'skip' && action.seat !== seat) return gameError(ERROR.notYourTurn)
      const reason = action.type === 'timeUp' ? 'timeUp' : 'skip'
      return endTurn(state, { kind: 'pass', turn: state.turnNumber, seat, reason })
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)
    if (actor !== seat) return gameError(ERROR.notYourTurn)

    switch (action.type) {
      case 'hintSuit':
        return hint(state, actor, action.to, { kind: 'suit', suit: action.suit })
      case 'hintRank':
        return hint(state, actor, action.to, { kind: 'rank', rank: action.rank })
      case 'play':
        return play(state, actor, action.card)
      case 'discard':
        return discard(state, actor, action.card)
    }
  },

  // The only place hands are cut (rule 4 of types.ts): a seat sees every hand but its own; a
  // spectator sees none, so that nobody can read their own hand from a second window. The deck is
  // only a count
  view(state, viewer) {
    const you = viewer !== 'spectator' && state.players.includes(viewer) ? viewer : null
    const { hands, deck, turn: _turn, ...open } = state
    return {
      ...open,
      you,
      current: currentSeat(state),
      hands: state.players.map((seat, index) => ({
        seat,
        cards: hands[index].map((card) => shownCard(card, you !== null && seat !== you)),
      })),
      deckCount: deck.length,
      score: scoreOf(state.stacks),
      maxScore: maxScoreOf(state.suits),
    }
  },

  legalActions(state, seat) {
    if (state.ending !== null || seat !== currentSeat(state)) return []
    const hand = state.hands[state.turn]
    return [
      ...hintActions(state, seat),
      ...hand.map((card): KiteAction => ({ type: 'play', card: card.id })),
      ...(state.notes < MAX_NOTES ? hand.map((card): KiteAction => ({ type: 'discard', card: card.id })) : []),
    ]
  },

  // A player who is away passes their turn; nothing else waits on anyone
  skipAction(state, seat) {
    return state.ending === null && seat === currentSeat(state) ? { type: 'skip', seat } : null
  },

  // The turn number in the id: every turn gets a fresh clock
  timers(state) {
    if (state.ending !== null || !state.turnSeconds) return []
    return [
      {
        id: `turn-${state.turnNumber}`,
        ms: state.turnSeconds * 1000,
        action: { type: 'timeUp', turn: state.turnNumber },
      },
    ]
  },

  // Notes are the only way to tell anyone about their cards: chat stays closed until the day ends
  chatLocked(state) {
    return state.ending === null
  },

  isOver(state) {
    return state.ending !== null
  },

  // Co-operative: everyone shares the table's score and one place
  result(state): GameResult {
    const score = scoreOf(state.stacks)
    return {
      summary: {
        key: `games.kite.result.${state.ending ?? 'deck'}`,
        params: { score, max: maxScoreOf(state.suits) },
      },
      standings: state.players.map((seat, index) => ({
        seat,
        rank: 1,
        score,
        note: { key: 'games.kite.note.hung', params: { count: state.hung[index] } },
      })),
    }
  },
}
