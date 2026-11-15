// 德州撲克 (Texas Hold'em, no-limit; owner's request 2026-11-14), for play chips only. The traditional
// game: a dealer button, a small and a big blind, two hole cards each, then betting before the flop,
// on the flop, the turn and the river. Any bet is allowed up to all you have; a raise is at least the
// last bet or raise, and an all-in short of that does not reopen the betting to whoever has acted.
// Side pots, uncalled bets back, the best five of seven at the showdown, odd chips to the first seat
// left of the button. Busted players watch; the game ends when one player has every chip, or when
// everyone still playing agrees to stop after a hand (standings by chips).
//
// docs/PRD/e24-holdem.md has the rules and every detail decided here.
import { bestHand, fullDeck, type Hand } from '../../poker/hand.ts'
import { holdemInfo } from './info.ts'
import { GAME_META } from '../lobby.ts'
import { gameError, type GameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  HoldemAction,
  HoldemCategory,
  HoldemHandEnd,
  HoldemHistory,
  HoldemLog,
  HoldemOptions,
  HoldemPlayer,
  HoldemPotResult,
  HoldemShown,
  HoldemState,
  HoldemStreet,
  HoldemView,
} from './types.ts'

/** The pause after a hand before the next is dealt: longer when there are cards to look at */
export const SHOWDOWN_PAUSE_MS = 8000
export const FOLD_PAUSE_MS = 4000
/** Lines of the hand log kept: a hand is far fewer */
const LOG_LIMIT = 200
/** Hands kept in the history */
const HISTORY_LIMIT = 20

const NEXT_STREET: Readonly<Record<HoldemStreet, HoldemStreet | null>> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: null,
}
const STREET_CARDS: Readonly<Record<HoldemStreet, number>> = { preflop: 0, flop: 3, turn: 1, river: 1 }

const ERROR = {
  badAction: 'games.holdem.error.badAction',
  over: 'games.holdem.error.over',
  notAPlayer: 'games.holdem.error.notAPlayer',
  systemOnly: 'games.holdem.error.systemOnly',
  notYourTurn: 'games.holdem.error.notYourTurn',
  notNow: 'games.holdem.error.notNow',
  checkInstead: 'games.holdem.error.checkInstead',
  mustCall: 'games.holdem.error.mustCall',
  nothingToCall: 'games.holdem.error.nothingToCall',
  cannotRaise: 'games.holdem.error.cannotRaise',
  tooSmall: 'games.holdem.error.tooSmall',
  tooBig: 'games.holdem.error.tooBig',
  busted: 'games.holdem.error.busted',
  nothingToSkip: 'games.holdem.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): HoldemAction | null {
  if (typeof action !== 'object' || action === null) return null
  const raw = action as Record<string, unknown>
  switch (raw.type) {
    case 'fold':
    case 'check':
    case 'call':
      return { type: raw.type }
    case 'raise':
      return Number.isSafeInteger(raw.to) ? { type: 'raise', to: raw.to as number } : null
    case 'away':
      return typeof raw.away === 'boolean' ? { type: 'away', away: raw.away } : null
    case 'endVote':
      return typeof raw.on === 'boolean' ? { type: 'endVote', on: raw.on } : null
    case 'timeout':
      return Number.isInteger(raw.step) ? { type: 'timeout', step: raw.step as number } : null
    case 'skip':
      return isSeat(raw.seat) ? { type: 'skip', seat: raw.seat } : null
    case 'next':
      return Number.isInteger(raw.hand) ? { type: 'next', hand: raw.hand as number } : null
    default:
      return null
  }
}

// ── Small readers ────────────────────────────────────────────────────────────────────────────

const playerOf = (state: HoldemState, seat: SeatId): HoldemPlayer | undefined =>
  state.players.find((player) => player.seat === seat)

/** Still in this hand: dealt in and not folded */
export const inHand = (player: HoldemPlayer): boolean => !player.out && !player.folded && player.hole.length > 0

/** Still in this hand with chips to bet */
const canBet = (player: HoldemPlayer): boolean => inHand(player) && !player.allIn

/** Every player after `seat` in seat order, wrapping round, `seat` itself last */
function orderAfter(state: HoldemState, seat: SeatId): HoldemPlayer[] {
  const index = state.players.findIndex((player) => player.seat === seat)
  return state.players.map((_, step) => state.players[(index + 1 + step) % state.players.length])
}

/** The next player with chips after `seat` */
function nextLive(state: HoldemState, seat: SeatId): SeatId {
  return (orderAfter(state, seat).find((player) => !player.out) ?? (playerOf(state, seat) as HoldemPlayer)).seat
}

const withPlayer = (
  state: HoldemState,
  seat: SeatId,
  change: (player: HoldemPlayer) => HoldemPlayer,
): HoldemState => ({
  ...state,
  players: state.players.map((player) => (player.seat === seat ? change(player) : player)),
})

const logged = (state: HoldemState, ...lines: HoldemLog[]): HoldemState => ({
  ...state,
  log: [...state.log, ...lines].slice(-LOG_LIMIT),
})

/** Every chip in the middle, this street's bets included */
export const potOf = (state: HoldemState): number =>
  state.players.reduce((sum, player) => sum + player.committed, 0)

/** The big blind of the first hand, whatever the stacks: the small blind is half of it */
export const START_BB = 20
/** Starting chips: the option is in big blinds (before 2026-11-15 it was the chips themselves) */
export const startingChips = (options: HoldemOptions): number =>
  options.stack >= 1000 ? options.stack : options.stack * START_BB

/** One decade of the blind ladder: 10/20, 15/30, 25/50, 40/80, 60/120, then the same ×10 and on */
const LADDER = [20, 30, 50, 80, 120] as const

/** The big blind of level `level` (0 at the start): about ×1.5 a level, in round numbers */
export const bigBlindAt = (level: number): number => LADDER[level % LADDER.length] * 10 ** Math.floor(level / LADDER.length)

/** A game begun before 2026-11-15 kept `blinds` in its options and doubled them: it still does */
const legacyBlinds = (options: HoldemOptions): number | null => {
  const blinds = (options as { blinds?: unknown }).blinds
  return typeof blinds === 'number' && blinds > 0 ? blinds : null
}

/** The blind level of hand `hand`, 0 for the first: one up every `blindUp` hands */
export function blindLevel(options: HoldemOptions, hand: number): number {
  return options.blindUp > 0 ? Math.floor((Math.max(1, hand) - 1) / options.blindUp) : 0
}

/** The big blind of level `level` in this game */
function bigBlindOfLevel(options: HoldemOptions, level: number): number {
  const legacy = legacyBlinds(options)
  return legacy === null ? bigBlindAt(level) : legacy * 2 ** level
}

/** The big blind on hand `hand` */
export function bigBlindFor(options: HoldemOptions, hand: number): number {
  return bigBlindOfLevel(options, blindLevel(options, hand))
}

/** When the blinds next go up after hand `hand`, and to what; null when they never do */
export function nextBlindsAfter(options: HoldemOptions, hand: number): { hand: number; sb: number; bb: number } | null {
  if (options.blindUp <= 0) return null
  const level = blindLevel(options, hand) + 1
  const bb = bigBlindOfLevel(options, level)
  return { hand: level * options.blindUp + 1, sb: bb / 2, bb }
}

/** A straight flush to the ace is named apart; it is still the same category to the evaluator */
export function categoryOf(hand: Hand): HoldemCategory {
  return hand.category === 'straightFlush' && hand.best[0][0] === 'A' ? 'royalFlush' : hand.category
}

// ── Whose turn and what they may do ──────────────────────────────────────────────────────────

/** Whether `player` still has to act on this street */
export function needsToAct(state: HoldemState, player: HoldemPlayer): boolean {
  if (!canBet(player)) return false
  const others = state.players.some((other) => other.seat !== player.seat && canBet(other))
  // Alone with chips: only to match a bet, never to bet into players who are all in
  if (!others) return player.bet < state.currentBet
  return !player.acted || player.bet < state.currentBet
}

/**
 * Whether `player` may bet or raise: they must have more than a call, somebody else must still have
 * chips, and the betting must be open to them. It is open to whoever has not acted since the last
 * full raise; to someone who has, only if the bet has gone up by at least a full raise since (short
 * all-ins that add up to a full raise count together).
 */
export function canRaise(state: HoldemState, player: HoldemPlayer): boolean {
  if (!canBet(player)) return false
  if (player.stack <= state.currentBet - player.bet) return false
  if (!state.players.some((other) => other.seat !== player.seat && canBet(other))) return false
  return !player.acted || state.currentBet - player.actedAt >= state.minRaise
}

/** The smallest and largest `to` of a bet or raise: an all-in below the smallest is allowed */
export function raiseBounds(state: HoldemState, player: HoldemPlayer): { min: number; max: number } {
  const max = player.bet + player.stack
  return { min: Math.min(state.currentBet + state.minRaise, max), max }
}

/** The quick sizes: the smallest, half, two thirds and the whole pot, all in; within the bounds, no repeats */
export function raiseChoices(state: HoldemState, player: HoldemPlayer): number[] {
  const { min, max } = raiseBounds(state, player)
  const toCall = state.currentBet - player.bet
  const pot = potOf(state) + toCall
  const sizes = [
    min,
    state.currentBet + Math.floor(pot / 2),
    state.currentBet + Math.floor((pot * 2) / 3),
    state.currentBet + pot,
    max,
  ]
  return [...new Set(sizes.map((to) => Math.min(max, Math.max(min, to))))].sort((a, b) => a - b)
}

// ── Betting ──────────────────────────────────────────────────────────────────────────────────

/** Why this bet is not allowed now; null if it is. `action` is a fold, check, call or raise */
function betRefusal(state: HoldemState, player: HoldemPlayer, action: HoldemAction): string | null {
  const toCall = state.currentBet - player.bet
  switch (action.type) {
    case 'fold':
      return toCall > 0 ? null : ERROR.checkInstead
    case 'check':
      return toCall > 0 ? ERROR.mustCall : null
    case 'call':
      return toCall > 0 ? null : ERROR.nothingToCall
    case 'raise': {
      if (!canRaise(state, player)) return ERROR.cannotRaise
      const { min, max } = raiseBounds(state, player)
      if (action.to > max) return ERROR.tooBig
      if (action.to < min) return ERROR.tooSmall
      return null
    }
    default:
      return ERROR.badAction
  }
}

/** Puts a checked bet on the table, without moving the turn on */
function placeBet(state: HoldemState, seat: SeatId, action: HoldemAction): HoldemState {
  const player = playerOf(state, seat) as HoldemPlayer
  switch (action.type) {
    case 'fold':
      return logged(
        withPlayer(state, seat, (one) => ({ ...one, folded: true, acted: true })),
        { k: 'fold', seat },
      )
    case 'check':
      return logged(
        withPlayer(state, seat, (one) => ({ ...one, acted: true, actedAt: state.currentBet })),
        { k: 'check', seat },
      )
    case 'call': {
      const amount = Math.min(state.currentBet - player.bet, player.stack)
      const allIn = amount === player.stack
      return logged(
        withPlayer(state, seat, (one) => ({
          ...one,
          stack: one.stack - amount,
          bet: one.bet + amount,
          committed: one.committed + amount,
          allIn,
          acted: true,
          actedAt: state.currentBet,
        })),
        { k: 'call', seat, amount, allIn },
      )
    }
    case 'raise': {
      const to = action.to
      const added = to - player.bet
      const allIn = added === player.stack
      const increase = to - state.currentBet
      // A full raise sets the next smallest raise; a short all-in leaves it as it was
      const full = increase >= state.minRaise
      const next: HoldemState = {
        ...state,
        currentBet: to,
        minRaise: full ? increase : state.minRaise,
        aggressor: seat,
      }
      return logged(
        withPlayer(next, seat, (one) => ({
          ...one,
          stack: one.stack - added,
          bet: to,
          committed: one.committed + added,
          allIn,
          acted: true,
          actedAt: to,
        })),
        { k: state.currentBet === 0 ? 'bet' : 'raise', seat, to, allIn },
      )
    }
    default:
      return state
  }
}

/** What an absent or sitting-out player does: check if they can, else fold */
const quietBet = (state: HoldemState, player: HoldemPlayer): HoldemAction =>
  state.currentBet > player.bet ? { type: 'fold' } : { type: 'check' }

/** After a bet: the next player to act, or the end of the street or of the hand */
function advance(state: HoldemState, from: SeatId): HoldemState {
  let next = state
  let after = from
  for (;;) {
    if (next.players.filter(inHand).length === 1) return winByFold(next)
    const current = next
    const player = orderAfter(current, after).find((one) => needsToAct(current, one))
    if (player === undefined) return endStreet(next)
    if (!player.away) return { ...next, phase: { kind: 'bet', toAct: player.seat }, step: next.step + 1 }
    next = placeBet(next, player.seat, quietBet(next, player))
    after = player.seat
  }
}

/** A bet nobody matched comes back to whoever made it */
function returnUncalled(state: HoldemState): HoldemState {
  const [top, second] = [...state.players].sort((a, b) => b.bet - a.bet)
  const excess = top.bet - (second?.bet ?? 0)
  if (excess <= 0) return state
  return logged(
    withPlayer(state, top.seat, (one) => ({
      ...one,
      stack: one.stack + excess,
      bet: one.bet - excess,
      committed: one.committed - excess,
      allIn: false,
    })),
    { k: 'return', seat: top.seat, amount: excess },
  )
}

/** Nobody has to act: the bets go in, and the next street is dealt, or it is the showdown */
function endStreet(state: HoldemState): HoldemState {
  let next = returnUncalled(state)
  next = {
    ...next,
    currentBet: 0,
    minRaise: next.bb,
    aggressor: null,
    players: next.players.map((player) => ({ ...player, bet: 0, acted: false, actedAt: 0 })),
  }
  const street = NEXT_STREET[state.street]
  if (street === null) return showdown({ ...next, aggressor: state.aggressor })
  const count = STREET_CARDS[street]
  const cards = next.deck.slice(0, count)
  next = logged(
    { ...next, street, board: [...next.board, ...cards], deck: next.deck.slice(count) },
    { k: 'street', street, cards },
  )
  // Everyone but one is all in: no more betting, the board is dealt out
  if (next.players.filter(canBet).length < 2) return endStreet(next)
  return advance(next, next.button)
}

// ── The end of a hand ────────────────────────────────────────────────────────────────────────

/** A main pot and side pots from what everyone put in, each with who may win it */
export function sidePots(
  players: readonly { seat: SeatId; committed: number; folded: boolean }[],
): { amount: number; eligible: SeatId[] }[] {
  const live = players.filter((player) => !player.folded && player.committed > 0)
  const levels = [...new Set(live.map((player) => player.committed))].sort((a, b) => a - b)
  const pots: { amount: number; eligible: SeatId[] }[] = []
  let floor = 0
  levels.forEach((level, index) => {
    // The last pot also takes whatever folded players put in above every live player
    const ceiling = index === levels.length - 1 ? Infinity : level
    const amount = players.reduce(
      (sum, player) => sum + Math.max(0, Math.min(player.committed, ceiling) - floor),
      0,
    )
    const eligible = live.filter((player) => player.committed >= level).map((player) => player.seat)
    if (amount > 0) pots.push({ amount, eligible })
    floor = level
  })
  return pots
}

/** `amount` split between `winners`, already in order from the first seat left of the button */
export function splitPot(amount: number, winners: readonly SeatId[]): { seat: SeatId; amount: number }[] {
  const share = Math.floor(amount / winners.length)
  const odd = amount - share * winners.length
  return winners.map((seat, index) => ({ seat, amount: share + (index < odd ? 1 : 0) }))
}

const paid = (state: HoldemState, wins: readonly { seat: SeatId; amount: number }[]): HoldemState =>
  wins.reduce((next, win) => withPlayer(next, win.seat, (one) => ({ ...one, stack: one.stack + win.amount })), state)

/** Everyone else folded: the last one takes the pot and shows nothing */
function winByFold(state: HoldemState): HoldemState {
  const next = returnUncalled(state)
  const winner = next.players.find(inHand) as HoldemPlayer
  const amount = potOf(next)
  const pots: HoldemPotResult[] = [{ amount, winners: [{ seat: winner.seat, amount }], category: null }]
  const ended = logged(paid(next, pots[0].winners), { k: 'win', seat: winner.seat, amount, category: null, pot: 0 })
  return finishHand(ended, { hand: state.hand, showdown: false, pots, shown: [], mucked: [] })
}

/** The best five of seven for everyone left, the pots shared out, and only the hands that must show */
function showdown(state: HoldemState): HoldemState {
  const contenders = state.players.filter(inHand)
  const hands = new Map(contenders.map((player) => [player.seat, bestHand([...player.hole, ...state.board])]))
  const leftOfButton = orderAfter(state, state.button).map((player) => player.seat)

  const pots: HoldemPotResult[] = sidePots(state.players).map(({ amount, eligible }) => {
    const top = Math.max(...eligible.map((seat) => (hands.get(seat) as Hand).score))
    const winners = leftOfButton.filter((seat) => eligible.includes(seat) && hands.get(seat)?.score === top)
    return { amount, winners: splitPot(amount, winners), category: categoryOf(hands.get(winners[0]) as Hand) }
  })
  const winning = new Set(pots.flatMap((pot) => pot.winners.map((win) => win.seat)))

  // Who shows: everyone when the board was dealt out to players all in; otherwise the last to bet or
  // raise first (or the first left of the button), then each in turn who can beat or tie what is
  // shown, and anyone who wins a pot. The rest muck, unseen
  const tabled = contenders.filter((player) => !player.allIn).length <= 1
  const first = state.aggressor !== null && hands.has(state.aggressor) ? state.aggressor : null
  // orderAfter ends with the seat itself: put it first instead
  const order = first === null ? leftOfButton : [first, ...orderAfter(state, first).slice(0, -1).map((player) => player.seat)]
  const shown: HoldemShown[] = []
  const mucked: SeatId[] = []
  let best = -1
  for (const seat of order) {
    const hand = hands.get(seat)
    if (hand === undefined) continue
    if (tabled || shown.length === 0 || hand.score >= best || winning.has(seat)) {
      const player = playerOf(state, seat) as HoldemPlayer
      shown.push({ seat, hole: player.hole, category: categoryOf(hand), best: hand.best })
      best = Math.max(best, hand.score)
    } else mucked.push(seat)
  }

  let next = logged(
    state,
    ...shown.map((one): HoldemLog => ({ k: 'show', seat: one.seat, cards: one.hole, category: one.category })),
    ...mucked.map((seat): HoldemLog => ({ k: 'muck', seat })),
  )
  pots.forEach((pot, index) => {
    next = logged(
      paid(next, pot.winners),
      ...pot.winners.map((win): HoldemLog => ({ k: 'win', seat: win.seat, amount: win.amount, category: pot.category, pot: index })),
    )
  })
  return finishHand(next, { hand: state.hand, showdown: true, pots, shown, mucked })
}

/** The chips are paid: whoever has none left is out, and the result shows until the next hand */
function finishHand(state: HoldemState, end: HoldemHandEnd): HoldemState {
  // Two out in one hand: whoever started it with fewer chips goes out first, and places lower
  const busted = state.players
    .filter((player) => !player.out && player.stack === 0)
    .sort((a, b) => a.start - b.start || a.seat - b.seat)
    .map((player) => player.seat)
  const winners = new Map<SeatId, number>()
  for (const pot of end.pots) for (const win of pot.winners) winners.set(win.seat, (winners.get(win.seat) ?? 0) + win.amount)
  const topPot = end.pots[0]
  const history: HoldemHistory = {
    hand: end.hand,
    winners: [...winners].map(([seat, amount]) => ({ seat, amount })),
    category: topPot?.category ?? null,
  }
  const next: HoldemState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      bet: 0,
      committed: 0,
      out: player.out || player.stack === 0,
    })),
    outOrder: [...state.outOrder, ...busted],
    phase: { kind: 'handEnd' },
    step: state.step + 1,
    last: end,
    history: [...state.history, history].slice(-HISTORY_LIMIT),
  }
  return logged(next, ...busted.map((seat): HoldemLog => ({ k: 'bust', seat })))
}

/** Everyone still playing has agreed to stop (a player sitting out does not hold it up) */
function agreedToEnd(state: HoldemState): boolean {
  const live = state.players.filter((player) => !player.out)
  const votes = live.filter((player) => state.endVotes.includes(player.seat))
  return votes.length > 0 && live.every((player) => player.away || state.endVotes.includes(player.seat))
}

const gameOver = (state: HoldemState): HoldemState =>
  logged({ ...state, phase: { kind: 'over' }, step: state.step + 1 }, { k: 'end' })

/** Deals a hand with `button` on the button: blinds, two cards each, and the first turn */
export function startHand(state: HoldemState, button: SeatId, rng: Rng): HoldemState {
  const hand = state.hand + 1
  const bb = bigBlindFor(state.options, hand)
  const sb = bb / 2
  const live = state.players.filter((player) => !player.out)
  let deck = rng.shuffle(fullDeck())
  const players = state.players.map((player): HoldemPlayer => {
    const base = { ...player, bet: 0, committed: 0, folded: false, allIn: false, acted: false, actedAt: 0, start: player.stack }
    if (player.out) return { ...base, hole: [] }
    const hole = deck.slice(0, 2)
    deck = deck.slice(2)
    return { ...base, hole }
  })
  let next: HoldemState = {
    ...state,
    players,
    deck,
    board: [],
    hand,
    button,
    sb,
    bb,
    street: 'preflop',
    currentBet: 0,
    minRaise: bb,
    aggressor: null,
    last: null,
    log: [],
  }
  // Two players: the button posts the small blind and acts first before the flop
  const sbSeat = live.length === 2 ? button : nextLive(next, button)
  const bbSeat = nextLive(next, sbSeat)
  next = { ...next, sbSeat, bbSeat }
  next = logged(next, { k: 'hand', hand, button, sb, bb })
  if (hand > 1 && bb > state.bb) next = logged(next, { k: 'blindsUp', sb, bb })
  for (const [seat, blind, big] of [[sbSeat, sb, false], [bbSeat, bb, true]] as const) {
    const amount = Math.min(blind, (playerOf(next, seat) as HoldemPlayer).stack)
    next = logged(
      withPlayer(next, seat, (one) => ({
        ...one,
        stack: one.stack - amount,
        bet: amount,
        committed: amount,
        allIn: one.stack === amount,
      })),
      { k: 'blind', seat, amount, big },
    )
  }
  // A big blind short of chips only has to be matched as far as it went
  next = { ...next, currentBet: Math.max(...next.players.map((player) => player.bet)) }
  return advance(next, bbSeat)
}

/** A player's bet or fold, from the player, the clock or the host */
function act(state: HoldemState, seat: SeatId, action: HoldemAction): HoldemState | GameError {
  const phase = state.phase
  if (phase.kind !== 'bet') return gameError(ERROR.notNow)
  if (phase.toAct !== seat) return gameError(ERROR.notYourTurn)
  const player = playerOf(state, seat) as HoldemPlayer
  const refusal = betRefusal(state, player, action)
  if (refusal !== null) return gameError(refusal)
  return advance(placeBet(state, seat, action), seat)
}

/** The clock ran out, or the host skipped them: check or fold, and sit out until they come back */
function sitOutNow(state: HoldemState, seat: SeatId): HoldemState {
  const player = playerOf(state, seat) as HoldemPlayer
  const away = logged(
    withPlayer(state, seat, (one) => ({ ...one, away: true })),
    { k: 'timeout', seat },
  )
  return advance(placeBet(away, seat, quietBet(away, player)), seat)
}

export const holdem: GameModule<HoldemState, HoldemAction, HoldemView, HoldemOptions> = {
  ...holdemInfo,
  meta: GAME_META.holdem,

  init(seats, options, rng) {
    const players: HoldemPlayer[] = seats.map((seat) => ({
      seat: seat.id,
      stack: startingChips(options),
      start: startingChips(options),
      hole: [],
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      acted: false,
      actedAt: 0,
      out: false,
      away: false,
    }))
    const button = seats[rng.int(seats.length)].id
    const empty: HoldemState = {
      options,
      players,
      deck: [],
      board: [],
      hand: 0,
      button,
      sbSeat: button,
      bbSeat: button,
      sb: bigBlindFor(options, 1) / 2,
      bb: bigBlindFor(options, 1),
      street: 'preflop',
      currentBet: 0,
      minRaise: bigBlindFor(options, 1),
      aggressor: null,
      step: 0,
      phase: { kind: 'handEnd' },
      last: null,
      endVotes: [],
      outOrder: [],
      log: [],
      history: [],
    }
    return startHand(empty, button, rng)
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase.kind === 'over') return gameError(ERROR.over)

    if (action.type === 'timeout' || action.type === 'skip' || action.type === 'next') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      const phase = state.phase
      switch (action.type) {
        case 'timeout':
          if (phase.kind !== 'bet' || action.step !== state.step) return gameError(ERROR.notNow)
          return sitOutNow(state, phase.toAct)
        case 'skip':
          if (playerOf(state, action.seat) === undefined) return gameError(ERROR.notAPlayer)
          if (phase.kind !== 'bet' || phase.toAct !== action.seat) return gameError(ERROR.nothingToSkip)
          return sitOutNow(state, action.seat)
        case 'next': {
          if (phase.kind !== 'handEnd' || action.hand !== state.hand) return gameError(ERROR.notNow)
          if (state.players.filter((player) => !player.out).length <= 1 || agreedToEnd(state)) return gameOver(state)
          return startHand(state, nextLive(state, state.button), rng)
        }
      }
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    const player = playerOf(state, actor)
    if (player === undefined) return gameError(ERROR.notAPlayer)
    if (player.out) return gameError(ERROR.busted)

    switch (action.type) {
      case 'away': {
        if (player.away === action.away) return gameError(ERROR.notNow)
        const next = logged(
          withPlayer(state, actor, (one) => ({ ...one, away: action.away })),
          { k: 'away', seat: actor, away: action.away },
        )
        // Sitting out on your own turn checks or folds at once
        if (action.away && state.phase.kind === 'bet' && state.phase.toAct === actor) {
          return advance(placeBet(next, actor, quietBet(next, player)), actor)
        }
        return next
      }
      case 'endVote': {
        if (state.endVotes.includes(actor) === action.on) return gameError(ERROR.notNow)
        const endVotes = action.on ? [...state.endVotes, actor] : state.endVotes.filter((seat) => seat !== actor)
        const next = logged({ ...state, endVotes }, { k: 'endVote', seat: actor, on: action.on })
        return next.phase.kind === 'handEnd' && agreedToEnd(next) ? gameOver(next) : next
      }
      default:
        return act(state, actor, action)
    }
  },

  // The only place the cards are cut: rule 4 of types.ts. A seat sees its own two cards; everyone
  // sees the board and the hands shown at the showdown; nobody sees another's cards, a mucked hand,
  // a folded hand, or the deck
  view(state, viewer) {
    const you = viewer !== 'spectator' && playerOf(state, viewer) !== undefined ? viewer : null
    const mine = you === null ? undefined : playerOf(state, you)
    const shown = state.last?.hand === state.hand ? state.last.shown : []
    return {
      you,
      options: state.options,
      players: state.players.map((player) => ({
        seat: player.seat,
        stack: player.stack,
        bet: player.bet,
        committed: player.committed,
        folded: player.folded,
        allIn: player.allIn,
        out: player.out,
        away: player.away,
        inHand: inHand(player),
        shown: shown.find((one) => one.seat === player.seat)?.hole ?? [],
      })),
      hole: mine?.hole ?? [],
      board: state.board,
      hand: state.hand,
      button: state.button,
      sbSeat: state.sbSeat,
      bbSeat: state.bbSeat,
      sb: state.sb,
      bb: state.bb,
      level: blindLevel(state.options, state.hand) + 1,
      nextBlinds: nextBlindsAfter(state.options, state.hand),
      street: state.street,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      pot: potOf(state),
      step: state.step,
      phase: state.phase,
      last: state.last,
      endVotes: state.endVotes,
      log: state.log,
      history: state.history,
    }
  },

  // Bets and folds only: sitting out and agreeing to stop are always open to a player with chips,
  // and the screen draws those from `view`
  legalActions(state, seat) {
    const phase = state.phase
    const player = playerOf(state, seat)
    if (player === undefined || phase.kind !== 'bet' || phase.toAct !== seat) return []
    const toCall = state.currentBet - player.bet
    const out: HoldemAction[] = toCall > 0 ? [{ type: 'fold' }, { type: 'call' }] : [{ type: 'check' }]
    if (canRaise(state, player)) out.push(...raiseChoices(state, player).map((to) => ({ type: 'raise' as const, to })))
    return out
  },

  skipAction(state, seat) {
    return state.phase.kind === 'bet' && state.phase.toAct === seat ? { type: 'skip', seat } : null
  },

  // The turn clock (when the host set one), and the pause after a hand before the next is dealt
  timers(state) {
    const phase = state.phase
    if (phase.kind === 'bet') {
      if (state.options.timer === 0) return []
      return [{ id: `holdem-turn-${state.step}`, ms: state.options.timer * 1000, action: { type: 'timeout', step: state.step } }]
    }
    if (phase.kind === 'handEnd') {
      const ms = state.last?.showdown ? SHOWDOWN_PAUSE_MS : FOLD_PAUSE_MS
      return [{ id: `holdem-next-${state.hand}`, ms, action: { type: 'next', hand: state.hand } }]
    }
    return []
  },

  isOver(state) {
    return state.phase.kind === 'over'
  },

  // By chips: everyone still playing by their stack, then the busted from the last out to the first
  result(state): GameResult {
    const live = state.players.filter((player) => !player.out).sort((a, b) => b.stack - a.stack || a.seat - b.seat)
    const busted = [...state.outOrder].reverse()
    const total = state.players.reduce((sum, player) => sum + player.stack, 0)
    const standings = [
      ...live.map((player) => ({
        seat: player.seat,
        rank: 1 + live.filter((other) => other.stack > player.stack).length,
        score: player.stack,
        note: { key: 'games.holdem.note.chips', params: { chips: player.stack } },
      })),
      ...busted.map((seat, index) => ({
        seat,
        rank: live.length + index + 1,
        score: 0,
        note: { key: 'games.holdem.note.out' },
      })),
    ]
    return {
      summary:
        live.length === 1
          ? { key: 'games.holdem.result.won', params: { chips: total, hands: state.hand } }
          : { key: 'games.holdem.result.stopped', params: { hands: state.hand } },
      standings,
    }
  },
}


