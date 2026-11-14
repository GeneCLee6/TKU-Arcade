// 滬尾商行 (working title Tamsui Traders; owner's request 2026-11-14). Each turn a trader does one
// thing: takes three different goods from the wharf, takes two of one good from a pile of four or
// more, reserves a card (and takes a gold token), or buys a card. Every card bought is a lasting
// discount of one good, and some score; a patron comes on their own once a seat's cards cover their
// wants. Reaching the target finishes the round; the most points win, fewer cards break a tie.
//
// docs/PRD/e22-tamsui-traders.md has the rules and every detail decided here.
import { TRADERS_CARDS, TRADERS_PATRONS } from './bank.ts'
import { tradersInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type SeatId } from '../types.ts'
import type {
  TradersAction,
  TradersCard,
  TradersEnd,
  TradersGoods,
  TradersMove,
  TradersOptions,
  TradersPatron,
  TradersPlayer,
  TradersState,
  TradersTier,
  TradersTokens,
  TradersView,
} from './types.ts'

export const GOODS = 5
export const GOLD = 5
export const GOLD_TOKENS = 5
export const TOKEN_LIMIT = 10
export const MAX_RESERVED = 3
export const MARKET_SIZE = 4
export const PATRON_POINTS = 3
/** Two of one good only from a pile at least this big */
export const DOUBLE_FROM = 4
/** A guard, not a rule a real game meets: a game this long has stalled (most end in 25–30) */
export const ROUND_CAP = 60

/** Tokens of each good, by the number of players */
export function supplyFor(players: number): number {
  return players <= 2 ? 4 : players === 3 ? 5 : 7
}

const ERROR = {
  badAction: 'games.traders.error.badAction',
  over: 'games.traders.error.over',
  notYourTurn: 'games.traders.error.notYourTurn',
  systemOnly: 'games.traders.error.systemOnly',
  mustReturn: 'games.traders.error.mustReturn',
  noReturn: 'games.traders.error.noReturn',
  badTake: 'games.traders.error.badTake',
  noDouble: 'games.traders.error.noDouble',
  reserveFull: 'games.traders.error.reserveFull',
  noCard: 'games.traders.error.noCard',
  emptyDeck: 'games.traders.error.emptyDeck',
  cannotAfford: 'games.traders.error.cannotAfford',
  noToken: 'games.traders.error.noToken',
  cannotPass: 'games.traders.error.cannotPass',
  nothingToSkip: 'games.traders.error.nothingToSkip',
} as const

// ── The card set ─────────────────────────────────────────────────────────────────────────────

export const CARDS: readonly TradersCard[] = TRADERS_CARDS.map((row) => ({
  id: row.id,
  tier: row.tier as TradersTier,
  bonus: row.bonus as TradersCard['bonus'],
  points: row.points,
  cost: [...row.cost],
}))

export const PATRONS: readonly TradersPatron[] = TRADERS_PATRONS.map((row) => ({
  ...row,
  need: [...row.need],
  points: PATRON_POINTS,
}))

const CARD_BY_ID: ReadonlyMap<string, TradersCard> = new Map(CARDS.map((card) => [card.id, card]))
const PATRON_BY_ID: ReadonlyMap<string, TradersPatron> = new Map(PATRONS.map((patron) => [patron.id, patron]))

export const cardOf = (id: string): TradersCard => CARD_BY_ID.get(id) as TradersCard
export const patronOf = (id: string): TradersPatron => PATRON_BY_ID.get(id) as TradersPatron

// ── Counting ─────────────────────────────────────────────────────────────────────────────────

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/** A seat's discounts: one per card bought, by the good it gives */
export function bonusesOf(player: Pick<TradersPlayer, 'cards'>): TradersGoods {
  const bonuses = [0, 0, 0, 0, 0]
  for (const id of player.cards) bonuses[cardOf(id).bonus] += 1
  return bonuses
}

export function pointsOf(player: Pick<TradersPlayer, 'cards' | 'patrons'>): number {
  return sum(player.cards.map((id) => cardOf(id).points)) + player.patrons.length * PATRON_POINTS
}

/**
 * What buying `cost` takes from `tokens` once `bonuses` are counted: each good first, gold for what
 * is short. Gold is only ever spent on a shortfall. Null when it cannot be paid.
 */
export function payment(cost: TradersGoods, bonuses: TradersGoods, tokens: TradersTokens): TradersTokens | null {
  const paid = [0, 0, 0, 0, 0, 0]
  for (let good = 0; good < GOODS; good++) {
    const owed = Math.max(0, cost[good] - bonuses[good])
    paid[good] = Math.min(owed, tokens[good])
    paid[GOLD] += owed - paid[good]
  }
  return paid[GOLD] <= tokens[GOLD] ? paid : null
}

const isInt = (value: unknown): value is number => Number.isInteger(value)
const isGood = (value: unknown): value is number => isInt(value) && value >= 0 && value < GOODS

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): TradersAction | null {
  if (typeof action !== 'object' || action === null || Array.isArray(action)) return null
  const raw = action as Record<string, unknown>
  switch (raw.type) {
    case 'take':
      if (!Array.isArray(raw.goods) || !raw.goods.every(isGood)) return null
      return { type: 'take', goods: [...(raw.goods as number[])] }
    case 'double':
      return isGood(raw.good) ? { type: 'double', good: raw.good } : null
    case 'reserve':
    case 'buy':
      return typeof raw.card === 'string' ? { type: raw.type, card: raw.card } : null
    case 'reserveTop':
      return isInt(raw.tier) && raw.tier >= 1 && raw.tier <= 3 ? { type: 'reserveTop', tier: raw.tier } : null
    case 'return':
      return isInt(raw.good) && raw.good >= 0 && raw.good <= GOLD ? { type: 'return', good: raw.good } : null
    case 'pass':
      return { type: 'pass' }
    case 'skip':
      return isInt(raw.seat) ? { type: 'skip', seat: raw.seat } : null
    default:
      return null
  }
}

/** Goods with at least one token on the wharf */
const goodsLeft = (bank: TradersTokens): number[] =>
  [0, 1, 2, 3, 4].filter((good) => bank[good] > 0)

/** How many different goods a `take` must have: three, or all there are when fewer are left */
const takeSize = (bank: TradersTokens): number => Math.min(3, goodsLeft(bank).length)

function combinations(items: readonly number[], size: number): number[][] {
  if (size === 0) return [[]]
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest]),
  )
}

const current = (state: TradersState): TradersPlayer => state.players[state.turn]

const move = (seat: SeatId, kind: TradersMove['kind']): TradersMove => ({
  seat,
  kind,
  taken: [],
  card: null,
  tier: null,
  returned: null,
  patron: null,
  gold: false,
})

/** `state` with the player in turn replaced */
const withPlayer = (state: TradersState, player: TradersPlayer): TradersState => ({
  ...state,
  players: state.players.map((other, index) => (index === state.turn ? player : other)),
})

/** Where a face-up card lies: its tier and slot, or null */
function marketSlot(state: TradersState, id: string): { tier: number; slot: number } | null {
  for (let tier = 0; tier < 3; tier++) {
    const slot = state.market[tier].indexOf(id)
    if (slot >= 0) return { tier, slot }
  }
  return null
}

/** The market with a slot refilled from the top of its deck (or left empty) */
function takeFromMarket(state: TradersState, tier: number, slot: number): Pick<TradersState, 'market' | 'decks'> {
  const [top = null, ...rest] = state.decks[tier]
  return {
    market: state.market.map((row, index) =>
      index === tier ? row.map((id, at) => (at === slot ? top : id)) : row,
    ),
    decks: state.decks.map((deck, index) => (index === tier ? rest : deck)),
  }
}

// ── The turn ─────────────────────────────────────────────────────────────────────────────────

const over = (state: TradersState, end: TradersEnd): TradersState => ({ ...state, phase: 'over', end })

/**
 * The end of a turn, once the seat holds ten tokens or fewer: a patron may come, the target is
 * checked, and the next seat plays. A round that started with someone at the target ends the game.
 */
function finishTurn(state: TradersState, last: TradersMove): TradersState {
  let player = current(state)
  const bonuses = bonusesOf(player)
  // The first patron on display whose wants this seat's cards cover; at most one a turn
  const patron = state.patrons.find((id) => patronOf(id).need.every((need, good) => bonuses[good] >= need)) ?? null
  if (patron !== null) player = { ...player, patrons: [...player.patrons, patron] }
  let next = withPlayer(
    {
      ...state,
      phase: 'play',
      patrons: patron === null ? state.patrons : state.patrons.filter((id) => id !== patron),
      last: { ...last, patron },
      passes: last.kind === 'pass' || last.kind === 'skip' ? state.passes + 1 : 0,
    },
    player,
  )
  if (pointsOf(player) >= state.target) next = { ...next, finalRound: true }

  const turn = (state.turn + 1) % state.order.length
  const round = turn === 0 ? state.round + 1 : state.round
  next = { ...next, turn, round }
  if (turn === 0 && next.finalRound) return over(next, 'target')
  if (next.passes >= state.order.length) return over(next, 'stalled')
  if (round > ROUND_CAP) return over(next, 'cap')
  return next
}

/** After taking or reserving: back down to ten first, if over */
function endAction(state: TradersState, last: TradersMove): TradersState {
  return sum(current(state).tokens) > TOKEN_LIMIT ? { ...state, phase: 'return', last } : finishTurn(state, last)
}

/** One token from the seat in turn back to the wharf */
function giveBack(state: TradersState, good: number): TradersState {
  const player = current(state)
  const tokens = player.tokens.map((count, index) => (index === good ? count - 1 : count))
  const bank = state.bank.map((count, index) => (index === good ? count + 1 : count))
  const last = state.last as TradersMove
  const returned = (last.returned ?? [0, 0, 0, 0, 0, 0]).map((count, index) => (index === good ? count + 1 : count))
  return withPlayer({ ...state, bank, last: { ...last, returned } }, { ...player, tokens })
}

/** What the room puts back for a gone seat: from the biggest pile of a good, gold last */
function autoReturnGood(player: TradersPlayer): number {
  let best = -1
  for (let good = 0; good < GOODS; good++) {
    if (player.tokens[good] > 0 && (best < 0 || player.tokens[good] > player.tokens[best])) best = good
  }
  return best < 0 ? GOLD : best
}

function take(state: TradersState, goods: number[]): TradersState {
  const player = current(state)
  const tokens = player.tokens.map((count, good) => (goods.includes(good) ? count + goods.filter((g) => g === good).length : count))
  const bank = state.bank.map((count, good) => count - goods.filter((g) => g === good).length)
  return withPlayer({ ...state, bank }, { ...player, tokens })
}

function reserve(state: TradersState, id: string, blind: boolean, from: Pick<TradersState, 'market' | 'decks'>): TradersState {
  const player = current(state)
  const gold = state.bank[GOLD] > 0
  const tokens = player.tokens.map((count, index) => (index === GOLD && gold ? count + 1 : count))
  const bank = state.bank.map((count, index) => (index === GOLD && gold ? count - 1 : count))
  return withPlayer(
    { ...state, ...from, bank },
    { ...player, tokens, reserved: [...player.reserved, { id, blind }] },
  )
}

/** Whether `id` is a card this seat may buy now: face up, or in its own hand */
function canBuy(state: TradersState, player: TradersPlayer, id: string): boolean {
  if (marketSlot(state, id) === null && !player.reserved.some((card) => card.id === id)) return false
  return payment(cardOf(id).cost, bonusesOf(player), player.tokens) !== null
}

function buy(state: TradersState, id: string): TradersState {
  const player = current(state)
  const paid = payment(cardOf(id).cost, bonusesOf(player), player.tokens) as TradersTokens
  const slot = marketSlot(state, id)
  const from = slot === null ? {} : takeFromMarket(state, slot.tier, slot.slot)
  return withPlayer(
    { ...state, ...from, bank: state.bank.map((count, index) => count + paid[index]) },
    {
      ...player,
      tokens: player.tokens.map((count, index) => count - paid[index]),
      cards: [...player.cards, id],
      reserved: player.reserved.filter((card) => card.id !== id),
    },
  )
}

/** Every move the seat in turn can make in the play phase, pass aside */
function playMoves(state: TradersState): TradersAction[] {
  const player = current(state)
  const out: TradersAction[] = combinations(goodsLeft(state.bank), takeSize(state.bank))
    .filter((goods) => goods.length > 0)
    .map((goods): TradersAction => ({ type: 'take', goods }))
  for (let good = 0; good < GOODS; good++) {
    if (state.bank[good] >= DOUBLE_FROM) out.push({ type: 'double', good })
  }
  const faceUp = state.market.flat().filter((id): id is string => id !== null)
  if (player.reserved.length < MAX_RESERVED) {
    for (const card of faceUp) out.push({ type: 'reserve', card })
    for (let tier = 1; tier <= 3; tier++) {
      if (state.decks[tier - 1].length > 0) out.push({ type: 'reserveTop', tier })
    }
  }
  for (const card of [...faceUp, ...player.reserved.map((held) => held.id)]) {
    if (canBuy(state, player, card)) out.push({ type: 'buy', card })
  }
  return out
}

const sameGoods = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((good, index) => good === b[index])

function act(state: TradersState, action: Exclude<TradersAction, { type: 'skip' }>): TradersState | ReturnType<typeof gameError> {
  const player = current(state)
  if (state.phase === 'return') {
    if (action.type !== 'return') return gameError(ERROR.mustReturn)
    if (player.tokens[action.good] <= 0) return gameError(ERROR.noToken)
    const next = giveBack(state, action.good)
    return sum(current(next).tokens) > TOKEN_LIMIT ? next : finishTurn(next, next.last as TradersMove)
  }

  switch (action.type) {
    case 'return':
      return gameError(ERROR.noReturn)
    case 'take': {
      const goods = [...action.goods].sort((a, b) => a - b)
      const distinct = new Set(goods).size === goods.length
      const legal = combinations(goodsLeft(state.bank), takeSize(state.bank))
      if (!distinct || goods.length === 0 || !legal.some((option) => sameGoods(option, goods))) {
        return gameError(ERROR.badTake)
      }
      return endAction(take(state, goods), { ...move(player.seat, 'take'), taken: goods })
    }
    case 'double':
      if (state.bank[action.good] < DOUBLE_FROM) return gameError(ERROR.noDouble)
      return endAction(take(state, [action.good, action.good]), {
        ...move(player.seat, 'double'),
        taken: [action.good, action.good],
      })
    case 'reserve': {
      if (player.reserved.length >= MAX_RESERVED) return gameError(ERROR.reserveFull)
      const slot = marketSlot(state, action.card)
      if (slot === null) return gameError(ERROR.noCard)
      const gold = state.bank[GOLD] > 0
      return endAction(reserve(state, action.card, false, takeFromMarket(state, slot.tier, slot.slot)), {
        ...move(player.seat, 'reserve'),
        card: action.card,
        gold,
      })
    }
    case 'reserveTop': {
      if (player.reserved.length >= MAX_RESERVED) return gameError(ERROR.reserveFull)
      const deck = state.decks[action.tier - 1]
      if (deck.length === 0) return gameError(ERROR.emptyDeck)
      const gold = state.bank[GOLD] > 0
      const decks = state.decks.map((cards, index) => (index === action.tier - 1 ? cards.slice(1) : cards))
      return endAction(reserve(state, deck[0], true, { market: state.market, decks }), {
        ...move(player.seat, 'reserveTop'),
        tier: action.tier,
        gold,
      })
    }
    case 'buy':
      if (!CARD_BY_ID.has(action.card)) return gameError(ERROR.noCard)
      if (marketSlot(state, action.card) === null && !player.reserved.some((card) => card.id === action.card)) {
        return gameError(ERROR.noCard)
      }
      if (!canBuy(state, player, action.card)) return gameError(ERROR.cannotAfford)
      return finishTurn(buy(state, action.card), { ...move(player.seat, 'buy'), card: action.card })
    case 'pass':
      if (playMoves(state).length > 0) return gameError(ERROR.cannotPass)
      return finishTurn(state, move(player.seat, 'pass'))
  }
}

// ── The view ─────────────────────────────────────────────────────────────────────────────────

function playerView(player: TradersPlayer, viewer: SeatId | null) {
  return {
    seat: player.seat,
    tokens: player.tokens,
    bonuses: bonusesOf(player),
    points: pointsOf(player),
    cardCount: player.cards.length,
    // Face-down reservations are their owner's alone: rule 4 of types.ts
    reserved: player.reserved.map((held) => ({
      tier: cardOf(held.id).tier,
      card: held.blind && viewer !== player.seat ? null : cardOf(held.id),
    })),
    patrons: player.patrons.map(patronOf),
  }
}

export const TRADERS_DEFAULT_TARGET = 15

export const traders: GameModule<TradersState, TradersAction, TradersView, TradersOptions> = {
  id: tradersInfo.id,
  meta: tradersInfo.meta,
  // Hidden (types.ts): settable when a room is made and by `npm run play -- traders --option
  // target=10`, not shown in the waiting room
  options: {
    target: {
      kind: 'int',
      labelKey: 'games.traders.option.target',
      min: 10,
      max: 21,
      default: TRADERS_DEFAULT_TARGET,
      hidden: true,
    },
  },

  init(seats, options, rng) {
    const first = rng.int(seats.length)
    const order = seats.map((_, index) => seats[(first + index) % seats.length].id)
    const supply = supplyFor(seats.length)
    const decks = [1, 2, 3].map((tier) => rng.shuffle(CARDS.filter((card) => card.tier === tier).map((card) => card.id)))
    return {
      phase: 'play',
      target: options.target,
      order,
      turn: 0,
      round: 1,
      finalRound: false,
      passes: 0,
      end: null,
      bank: [supply, supply, supply, supply, supply, GOLD_TOKENS],
      market: decks.map((deck) => deck.slice(0, MARKET_SIZE)),
      decks: decks.map((deck) => deck.slice(MARKET_SIZE)),
      patrons: rng.shuffle(PATRONS.map((patron) => patron.id)).slice(0, seats.length + 1),
      players: order.map((seat) => ({ seat, tokens: [0, 0, 0, 0, 0, 0], cards: [], reserved: [], patrons: [] })),
      last: null,
    }
  },

  reduce(state, rawAction, actor) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.seat !== current(state).seat) return gameError(ERROR.nothingToSkip)
      if (state.phase === 'play') return finishTurn(state, move(action.seat, 'skip'))
      // A gone seat over the limit: the room puts tokens back for it, then the turn ends
      let next = state
      while (sum(current(next).tokens) > TOKEN_LIMIT) next = giveBack(next, autoReturnGood(current(next)))
      return finishTurn(next, next.last as TradersMove)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (actor !== current(state).seat) return gameError(ERROR.notYourTurn)
    return act(state, action)
  },

  // The only place the hidden cards are cut: the decks travel as counts, and a card reserved face
  // down only to its owner
  view(state, viewer) {
    const you = viewer !== 'spectator' && state.order.includes(viewer) ? viewer : null
    const last = state.last
    return {
      phase: state.phase,
      target: state.target,
      order: state.order,
      turn: state.phase === 'over' ? null : current(state).seat,
      round: state.round,
      finalRound: state.finalRound,
      end: state.end,
      bank: state.bank,
      decks: state.decks.map((deck) => deck.length),
      market: state.market.map((row) => row.map((id) => (id === null ? null : cardOf(id)))),
      patrons: state.patrons.map(patronOf),
      players: state.players.map((player) => playerView(player, you)),
      you,
      last:
        last === null
          ? null
          : {
              ...last,
              card: last.card === null ? null : cardOf(last.card),
              patron: last.patron === null ? null : patronOf(last.patron),
            },
    }
  },

  legalActions(state, seat) {
    if (state.phase === 'over' || current(state).seat !== seat) return []
    if (state.phase === 'return') {
      return current(state)
        .tokens.map((count, good) => ({ count, good }))
        .filter(({ count }) => count > 0)
        .map(({ good }): TradersAction => ({ type: 'return', good }))
    }
    const moves = playMoves(state)
    return moves.length > 0 ? moves : [{ type: 'pass' }]
  },

  skipAction(state, seat) {
    return state.phase !== 'over' && current(state).seat === seat ? { type: 'skip', seat } : null
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // Most points; a tie goes to whoever bought fewer cards; still tied, they share the place
  result(state): GameResult {
    const lines = state.players.map((player) => ({
      player,
      points: pointsOf(player),
      cards: player.cards.length,
    }))
    const better = (a: (typeof lines)[number], b: (typeof lines)[number]) =>
      a.points > b.points || (a.points === b.points && a.cards < b.cards)
    const ordered = [...lines].sort((a, b) => b.points - a.points || a.cards - b.cards || a.player.seat - b.player.seat)
    return {
      summary: {
        key: `games.traders.result.${state.end ?? 'target'}`,
        params: { rounds: Math.min(state.round - 1, ROUND_CAP), target: state.target },
      },
      standings: ordered.map((line) => ({
        seat: line.player.seat,
        rank: 1 + lines.filter((other) => better(other, line)).length,
        score: line.points,
        note: {
          key: 'games.traders.note',
          params: { cards: line.cards, patrons: line.player.patrons.length },
        },
      })),
    }
  },
}
