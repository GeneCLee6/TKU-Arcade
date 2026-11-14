// 奪祕笈 (working title Secret Scroll; owner's brief 2026-11-14). Sixteen jianghu characters, values 1
// to 8. Each player holds one card; on your turn you draw one and play one of the two, and its effect
// happens. A round ends when one player is left, or when the deck is dry and the highest card wins.
// Each round won is a renown token; enough tokens win the game.
//
// docs/PRD/e18-secret-scroll.md has the rules and every detail decided here.
import { BEGGARS, DECK_COUNTS } from './deck.ts'
import { secretScrollInfo } from './info.ts'

export { BEGGARS, DECK_COUNTS }
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  ScrollAction,
  ScrollCard,
  ScrollEvent,
  ScrollLength,
  ScrollOptions,
  ScrollPlayer,
  ScrollRoundEnd,
  ScrollSeen,
  ScrollState,
  ScrollView,
} from './types.ts'

/** Tokens that win, by players: [2, 3, 4, 5+] */
export const GOALS: Readonly<Record<ScrollLength, readonly [number, number, number, number]>> = {
  standard: [7, 5, 4, 3],
  short: [4, 3, 3, 2],
}

/** Cards set aside face up with only two players */
export const FACE_UP_FOR_TWO = 3

/** How long a finished round stays up before the next one deals itself */
export const ROUND_END_MS = 30_000

export const goalFor = (length: ScrollLength, players: number): number =>
  GOALS[length][Math.min(Math.max(players, 2), 5) - 2]

const ERROR = {
  badAction: 'games.secret-scroll.error.badAction',
  over: 'games.secret-scroll.error.over',
  notAPlayer: 'games.secret-scroll.error.notAPlayer',
  systemOnly: 'games.secret-scroll.error.systemOnly',
  notYourTurn: 'games.secret-scroll.error.notYourTurn',
  notInHand: 'games.secret-scroll.error.notInHand',
  mustStrategist: 'games.secret-scroll.error.mustStrategist',
  badTarget: 'games.secret-scroll.error.badTarget',
  badGuess: 'games.secret-scroll.error.badGuess',
  notRoundEnd: 'games.secret-scroll.error.notRoundEnd',
  nothingToSkip: 'games.secret-scroll.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)
const isCard = (value: unknown): value is ScrollCard =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 8

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): ScrollAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, card, target, guess, seat } = action as Record<string, unknown>
  if (type === 'next') return { type }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  if (type === 'play' && isCard(card)) {
    if (target !== null && !isSeat(target)) return null
    if (guess !== null && !isCard(guess)) return null
    return { type, card, target: target as SeatId | null, guess: guess as ScrollCard | null }
  }
  return null
}

/** The whole deck for a round, before shuffling */
export function fullDeck(beggars: boolean): ScrollCard[] {
  const cards: ScrollCard[] = []
  for (const [value, count] of Object.entries(DECK_COUNTS)) {
    for (let i = 0; i < count; i++) cards.push(Number(value) as ScrollCard)
  }
  for (let i = 0; beggars && i < BEGGARS; i++) cards.push(0)
  return cards
}

/** What a Constable may name: any value in this deck but the Constable's own */
export const guessValues = (beggars: boolean): ScrollCard[] =>
  (beggars ? [0, 2, 3, 4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7, 8]) as ScrollCard[]

const playerOf = (state: Pick<ScrollState, 'players'>, seat: SeatId): ScrollPlayer | undefined =>
  state.players.find((player) => player.seat === seat)

const alive = (state: Pick<ScrollState, 'players'>): ScrollPlayer[] => state.players.filter((player) => !player.out)

/** Who a card aimed at someone else may pick: still in, not shielded, not you */
export const targetsFor = (state: Pick<ScrollState, 'players'>, seat: SeatId): SeatId[] =>
  state.players.filter((player) => !player.out && !player.shielded && player.seat !== seat).map((player) => player.seat)

/** The Strategist must go when held with the Drunkard or the Mask Maker */
const forcedStrategist = (hand: readonly ScrollCard[]): boolean =>
  hand.includes(7) && (hand.includes(5) || hand.includes(6))

/** The next seat still in, after `seat` */
function nextAlive(state: Pick<ScrollState, 'players'>, seat: SeatId): SeatId {
  const order = state.players.map((player) => player.seat)
  const at = order.indexOf(seat)
  for (let step = 1; step <= order.length; step++) {
    const candidate = state.players[(at + step) % order.length]
    if (!candidate.out) return candidate.seat
  }
  return seat
}

/** A new round: shuffle, set aside, deal one each, and the starter draws */
function dealRound(
  base: Omit<ScrollState, 'phase' | 'current' | 'deck' | 'hidden' | 'faceUp' | 'events'>,
  starter: SeatId,
  rng: Rng,
): ScrollState {
  const deck = rng.shuffle(fullDeck(base.beggars))
  const hidden = deck.shift() as ScrollCard
  const faceUp = base.players.length === 2 ? deck.splice(0, FACE_UP_FOR_TWO) : []
  const players = base.players.map((player) => ({
    ...player,
    hand: [deck.shift() as ScrollCard],
    discards: [],
    out: false,
    shielded: false,
  }))
  const state: ScrollState = { ...base, phase: 'turn', players, current: starter, deck, hidden, faceUp, events: [] }
  return beginTurn(state, starter)
}

/** `seat`'s turn starts: their shield drops and they draw */
function beginTurn(state: ScrollState, seat: SeatId): ScrollState {
  const [top, ...deck] = state.deck
  return {
    ...state,
    current: seat,
    deck,
    players: state.players.map((player) =>
      player.seat === seat ? { ...player, shielded: false, hand: [...player.hand, top] } : player,
    ),
  }
}

/** Out of the round: their hand goes face up on their discards */
const knockOut = (player: ScrollPlayer): ScrollPlayer => ({
  ...player,
  out: true,
  shielded: false,
  discards: [...player.discards, ...player.hand],
  hand: [],
})

/** The card a player still in holds between turns (-1 if the Drunkard left them none, which cannot happen) */
const held = (player: ScrollPlayer): number => player.hand[0] ?? -1

/** After a play: the round ends, or the next seat still in takes a turn */
function afterPlay(state: ScrollState): ScrollState {
  const left = alive(state)
  if (left.length <= 1) return endRound(state, 'last', left.map((player) => player.seat))
  if (state.deck.length === 0) {
    const top = Math.max(...left.map(held))
    const best = left.filter((player) => held(player) === top)
    // A tie on the card goes to the most played; a tie on that too is shared
    const sum = (player: ScrollPlayer) => player.discards.reduce<number>((total, card) => total + card, 0)
    const most = Math.max(...best.map(sum))
    return endRound(
      state,
      'deck',
      best.filter((player) => sum(player) === most).map((player) => player.seat),
    )
  }
  return beginTurn(state, nextAlive(state, state.current))
}

function endRound(state: ScrollState, reason: ScrollRoundEnd['reason'], winners: SeatId[]): ScrollState {
  const players = state.players.map((player) =>
    winners.includes(player.seat) ? { ...player, tokens: player.tokens + 1 } : player,
  )
  const lastRound: ScrollRoundEnd = {
    round: state.round,
    reason,
    winners,
    hands: alive(state).flatMap((player) => player.hand.map((card) => ({ seat: player.seat, card }))),
  }
  const done = players.some((player) => player.tokens >= state.goal)
  return { ...state, players, lastRound, phase: done ? 'over' : 'roundEnd' }
}

/** Replace one player */
const withPlayer = (state: ScrollState, seat: SeatId, change: (player: ScrollPlayer) => ScrollPlayer): ScrollState => ({
  ...state,
  players: state.players.map((player) => (player.seat === seat ? change(player) : player)),
})

/** The card's effect, on a state where it has left the hand and joined the discards */
function resolve(
  state: ScrollState,
  seat: SeatId,
  card: ScrollCard,
  target: SeatId | null,
  guess: ScrollCard | null,
): { state: ScrollState; event: ScrollEvent } {
  const event: ScrollEvent = { seat, card, target, guess, outcome: 'none', out: [], shown: [], seen: [] }
  const me = playerOf(state, seat) as ScrollPlayer
  const them = target === null ? undefined : playerOf(state, target)
  const outWith = (s: ScrollState, who: ScrollPlayer, outcome: ScrollEvent['outcome']) => ({
    state: withPlayer(s, who.seat, knockOut),
    event: {
      ...event,
      outcome,
      out: [who.seat],
      shown: who.hand.map((held) => ({ seat: who.seat, card: held })),
    },
  })

  switch (card) {
    case 0: {
      if (state.deck.length === 0) return { state, event }
      const seen: ScrollSeen = { seat, of: 'deck', card: state.deck[0] }
      return { state, event: { ...event, outcome: 'peekDeck', seen: [seen] } }
    }
    case 1:
      if (them === undefined) return { state, event }
      return them.hand[0] === guess
        ? outWith(state, them, 'hit')
        : { state, event: { ...event, outcome: 'miss' } }
    case 2:
      if (them === undefined) return { state, event }
      return { state, event: { ...event, outcome: 'peek', seen: [{ seat, of: them.seat, card: them.hand[0] }] } }
    case 3: {
      if (them === undefined) return { state, event }
      const mine = me.hand[0]
      const theirs = them.hand[0]
      const seen: ScrollSeen[] = [
        { seat, of: them.seat, card: theirs },
        { seat: them.seat, of: seat, card: mine },
      ]
      if (mine === theirs) return { state, event: { ...event, outcome: 'tie', seen } }
      const loser = mine < theirs ? me : them
      const done = outWith(state, loser, mine > theirs ? 'won' : 'lost')
      return { state: done.state, event: { ...done.event, seen } }
    }
    case 4:
      return { state: withPlayer(state, seat, (player) => ({ ...player, shielded: true })), event: { ...event, outcome: 'shield' } }
    case 5: {
      if (them === undefined) return { state, event }
      const dropped = them.hand[0]
      if (dropped === 8) {
        const out = outWith(state, them, 'scroll')
        return out
      }
      const fromDeck = state.deck.length > 0
      const drawn = fromDeck ? state.deck[0] : state.hidden
      const next: ScrollState = {
        ...withPlayer(state, them.seat, (player) => ({
          ...player,
          discards: [...player.discards, dropped],
          hand: drawn === null ? [] : [drawn],
        })),
        deck: fromDeck ? state.deck.slice(1) : state.deck,
        hidden: fromDeck ? state.hidden : null,
      }
      return {
        state: next,
        event: { ...event, outcome: 'redraw', shown: [{ seat: them.seat, card: dropped }] },
      }
    }
    case 6: {
      if (them === undefined) return { state, event }
      const mine = me.hand
      const theirs = them.hand
      const next = withPlayer(
        withPlayer(state, seat, (player) => ({ ...player, hand: theirs })),
        them.seat,
        (player) => ({ ...player, hand: mine }),
      )
      return { state: next, event: { ...event, outcome: 'swap' } }
    }
    case 7:
      return { state, event }
    case 8: {
      // Throwing the Scroll away puts you out, your other card face up with it
      const out = outWith(state, me, 'scroll')
      return out
    }
  }
}

/** Whether `seat` may play `card` at `target` with `guess` right now; an error key if not */
function checkPlay(state: ScrollState, seat: SeatId, card: ScrollCard, target: SeatId | null, guess: ScrollCard | null): string | null {
  const me = playerOf(state, seat) as ScrollPlayer
  if (!me.hand.includes(card)) return ERROR.notInHand
  if (forcedStrategist(me.hand) && card !== 7) return ERROR.mustStrategist
  const targets = targetsFor(state, seat)
  if (card === 5) {
    if (target !== seat && !targets.includes(target as SeatId)) return ERROR.badTarget
  } else if (card === 1 || card === 2 || card === 3 || card === 6) {
    if (targets.length === 0 ? target !== null : !targets.includes(target as SeatId)) return ERROR.badTarget
  } else if (target !== null) {
    return ERROR.badTarget
  }
  if (card === 1 && target !== null) {
    if (guess === null || !guessValues(state.beggars).includes(guess)) return ERROR.badGuess
  } else if (guess !== null) {
    return ERROR.badGuess
  }
  return null
}

function play(state: ScrollState, seat: SeatId, card: ScrollCard, target: SeatId | null, guess: ScrollCard | null): ScrollState {
  // The card leaves the hand for the discards before its effect: the Duelist compares what is left
  const played = withPlayer(state, seat, (player) => {
    const at = player.hand.indexOf(card)
    return {
      ...player,
      hand: player.hand.filter((_, index) => index !== at),
      discards: [...player.discards, card],
    }
  })
  const { state: next, event } = resolve(played, seat, card, target, guess)
  return afterPlay({ ...next, events: [...next.events, event] })
}

/** A gone player folds: out of the round, hand face up */
function fold(state: ScrollState, seat: SeatId): ScrollState {
  const me = playerOf(state, seat) as ScrollPlayer
  const event: ScrollEvent = {
    seat,
    card: null,
    target: null,
    guess: null,
    outcome: 'fold',
    out: [seat],
    shown: me.hand.map((card) => ({ seat, card })),
    seen: [],
  }
  const next = withPlayer(state, seat, knockOut)
  return afterPlay({ ...next, events: [...next.events, event] })
}

/** The next round, started by the last round's (first) winner */
function nextRound(state: ScrollState, rng: Rng): ScrollState {
  const starter = state.lastRound?.winners[0] ?? state.players[0].seat
  return dealRound({ ...state, round: state.round + 1 }, starter, rng)
}

export const secretScroll: GameModule<ScrollState, ScrollAction, ScrollView, ScrollOptions> = {
  ...secretScrollInfo,

  init(seats, options, rng) {
    const players: ScrollPlayer[] = seats.map((seat) => ({
      seat: seat.id,
      hand: [],
      discards: [],
      out: false,
      shielded: false,
      tokens: 0,
    }))
    const base = {
      players,
      round: 1,
      goal: goalFor(options.length, seats.length),
      length: options.length,
      beggars: options.beggars,
      lastRound: null,
    }
    return dealRound(base, players[rng.int(players.length)].seat, rng)
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (playerOf(state, action.seat) === undefined) return gameError(ERROR.notAPlayer)
      if (state.phase !== 'turn' || action.seat !== state.current) return gameError(ERROR.nothingToSkip)
      return fold(state, action.seat)
    }

    if (action.type === 'next') {
      if (actor !== 'system' && playerOf(state, actor) === undefined) return gameError(ERROR.notAPlayer)
      if (state.phase !== 'roundEnd') return gameError(ERROR.notRoundEnd)
      return nextRound(state, rng)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (playerOf(state, actor) === undefined) return gameError(ERROR.notAPlayer)
    if (state.phase !== 'turn' || actor !== state.current) return gameError(ERROR.notYourTurn)
    const problem = checkPlay(state, actor, action.card, action.target, action.guess)
    if (problem !== null) return gameError(problem)
    return play(state, actor, action.card, action.target, action.guess)
  },

  // The only place hands, the deck and the face-down card are cut: rule 4 of shared/games/types.ts
  view(state, viewer) {
    const you = viewer !== 'spectator' && playerOf(state, viewer) !== undefined ? viewer : null
    const { deck, hidden, players, events, ...open } = state
    return {
      ...open,
      you,
      players: players.map(({ hand, ...player }) => ({
        ...player,
        hand: player.seat === you ? hand : null,
        handCount: hand.length,
      })),
      deckCount: deck.length,
      hiddenCount: hidden === null ? 0 : 1,
      events: events.map((event) => ({ ...event, seen: event.seen.filter((seen) => seen.seat === you) })),
    }
  },

  legalActions(state, seat) {
    const me = playerOf(state, seat)
    if (me === undefined) return []
    if (state.phase === 'roundEnd') return [{ type: 'next' }]
    if (state.phase !== 'turn' || seat !== state.current) return []
    const targets = targetsFor(state, seat)
    const cards = [...new Set(forcedStrategist(me.hand) ? [7 as ScrollCard] : me.hand)]
    const actions: ScrollAction[] = []
    for (const card of cards) {
      const at = (target: SeatId | null, guess: ScrollCard | null = null) =>
        actions.push({ type: 'play', card, target, guess })
      if (card === 1) {
        if (targets.length === 0) at(null)
        for (const target of targets) for (const guess of guessValues(state.beggars)) at(target, guess)
      } else if (card === 2 || card === 3 || card === 6) {
        if (targets.length === 0) at(null)
        for (const target of targets) at(target)
      } else if (card === 5) {
        for (const target of [...targets, seat]) at(target)
      } else {
        at(null)
      }
    }
    return actions
  },

  // A gone player on their turn folds the round
  skipAction(state, seat) {
    return state.phase === 'turn' && seat === state.current ? { type: 'skip', seat } : null
  },

  // A finished round deals the next one itself if nobody presses the button
  timers(state) {
    if (state.phase !== 'roundEnd') return []
    return [{ id: `next-${state.round}`, ms: ROUND_END_MS, action: { type: 'next' } }]
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // Ranked by renown tokens
  result(state): GameResult {
    const ranked = [...state.players].sort((a, b) => b.tokens - a.tokens || a.seat - b.seat)
    const top = ranked[0].tokens
    const winners = ranked.filter((player) => player.tokens === top).map((player) => player.seat)
    return {
      summary: {
        key: winners.length > 1 ? 'games.secret-scroll.result.shared' : 'games.secret-scroll.result.won',
        params: { rounds: state.round, goal: state.goal },
      },
      standings: ranked.map((player) => ({
        seat: player.seat,
        rank: 1 + ranked.filter((other) => other.tokens > player.tokens).length,
        score: player.tokens,
        note: { key: 'games.secret-scroll.note.tokens', params: { tokens: player.tokens } },
      })),
    }
  },
}
