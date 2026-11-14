import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import {
  bonusesOf,
  CARDS,
  cardOf,
  payment,
  pointsOf,
  ROUND_CAP,
  supplyFor,
  traders,
} from '../../shared/games/traders/rules.ts'
import type {
  TradersAction,
  TradersPlayer,
  TradersState,
} from '../../shared/games/traders/types.ts'
import { isGameError, type Actor, type GameError, type SeatId } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import { playRandom } from './harness.ts'

// 滬尾商行 (working title Tamsui Traders), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 120_000 })

const start = (seats: number, seed = 1, target = 15) =>
  traders.init(makeSeats(seats), { target }, createRng(seed))

function act(state: TradersState, action: TradersAction, actor: Actor = seatInTurn(state)): TradersState {
  const next = traders.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: TradersState, action: unknown, actor: Actor = seatInTurn(state)): string => {
  const answer = traders.reduce(state, action as TradersAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.traders.error.${name}`
const seatInTurn = (state: TradersState): SeatId => state.order[state.turn]
const me = (state: TradersState): TradersPlayer => state.players[state.turn]

/** The player in turn changed by `change` */
function withMe(state: TradersState, change: Partial<TradersPlayer>): TradersState {
  return { ...state, players: state.players.map((player, index) => (index === state.turn ? { ...player, ...change } : player)) }
}

/** Card ids of a tier and bonus good, in set order */
const idsOf = (tier: number, bonus: number) => CARDS.filter((card) => card.tier === tier && card.bonus === bonus).map((card) => card.id)

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('traders')).toBe(traders)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('traders')
    expect(defaultOptions(traders.options)).toEqual({ target: 15 })
    expect(traders.meta.minPlayers).toBe(2)
    expect(traders.meta.maxPlayers).toBe(4)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.traders.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.traders.ui.take']).toBeTruthy()
    }
  })
})

describe('the setup', () => {
  it.each([
    [2, 4],
    [3, 5],
    [4, 7],
  ])('%i players: %i of each good, 5 gold, players + 1 patrons', (players, supply) => {
    const state = start(players)
    expect(supplyFor(players)).toBe(supply)
    expect(state.bank).toEqual([supply, supply, supply, supply, supply, 5])
    expect(state.patrons).toHaveLength(players + 1)
    expect(state.market.map((row) => row.length)).toEqual([4, 4, 4])
    expect(state.decks.map((deck) => deck.length)).toEqual([36, 26, 16])
    state.market.forEach((row, tier) => row.forEach((id) => expect(cardOf(id as string).tier).toBe(tier + 1)))
    expect(state.players.map((player) => player.seat)).toEqual(state.order)
  })

  it('starts from a random seat and keeps seat order from there', () => {
    const firsts = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const state = start(4, seed)
      firsts.add(state.order[0])
      expect(state.order.map((seat, index) => (seat - state.order[0] + 4) % 4 === index).every(Boolean)).toBe(true)
    }
    expect(firsts.size).toBe(4)
  })
})

describe('taking goods', () => {
  it('takes three different goods and passes the turn', () => {
    const state = start(2)
    const next = act(state, { type: 'take', goods: [4, 0, 2] })
    expect(next.players[0].tokens).toEqual([1, 0, 1, 0, 1, 0])
    expect(next.bank).toEqual([3, 4, 3, 4, 3, 5])
    expect(next.turn).toBe(1)
    expect(next.last).toMatchObject({ kind: 'take', taken: [0, 2, 4], seat: state.order[0] })
  })

  it('refuses two or a repeated good while three goods are left', () => {
    const state = start(2)
    expect(refusal(state, { type: 'take', goods: [0, 1] })).toBe(error('badTake'))
    expect(refusal(state, { type: 'take', goods: [0, 0, 1] })).toBe(error('badTake'))
    expect(refusal(state, { type: 'take', goods: [0, 1, 2, 3] })).toBe(error('badTake'))
    expect(refusal(state, { type: 'take', goods: [0, 1, 7] })).toBe(error('badAction'))
  })

  it('takes fewer only when fewer goods are left, and never an empty pile', () => {
    const state = { ...start(2), bank: [0, 2, 0, 1, 0, 5] }
    expect(refusal(state, { type: 'take', goods: [0, 1, 3] })).toBe(error('badTake'))
    expect(act(state, { type: 'take', goods: [1, 3] }).players[0].tokens).toEqual([0, 1, 0, 1, 0, 0])
    expect(traders.legalActions(state, seatInTurn(state))).toContainEqual({ type: 'take', goods: [1, 3] })
  })

  it('takes two of one good only from a pile of four or more', () => {
    const state = start(2)
    expect(act(state, { type: 'double', good: 3 }).players[0].tokens).toEqual([0, 0, 0, 2, 0, 0])
    const low = { ...state, bank: [3, 4, 4, 4, 4, 5] }
    expect(refusal(low, { type: 'double', good: 0 })).toBe(error('noDouble'))
    expect(traders.legalActions(low, seatInTurn(low))).not.toContainEqual({ type: 'double', good: 0 })
  })
})

describe('the ten-token limit', () => {
  it('asks for tokens back, one at a time, before the turn ends', () => {
    const state = withMe(start(2), { tokens: [2, 2, 2, 2, 1, 0] })
    const over = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(over.phase).toBe('return')
    expect(over.turn).toBe(0)
    expect(traders.legalActions(over, seatInTurn(over))).toEqual([
      { type: 'return', good: 0 },
      { type: 'return', good: 1 },
      { type: 'return', good: 2 },
      { type: 'return', good: 3 },
      { type: 'return', good: 4 },
    ])
    expect(refusal(over, { type: 'take', goods: [0, 1, 2] })).toBe(error('mustReturn'))
    const one = act(over, { type: 'return', good: 0 })
    expect(one.phase).toBe('return')
    const done = act(one, { type: 'return', good: 0 })
    expect(done.phase).toBe('play')
    expect(done.turn).toBe(1)
    expect(done.players[0].tokens).toEqual([1, 3, 3, 2, 1, 0])
    expect(done.last?.returned).toEqual([2, 0, 0, 0, 0, 0])
  })

  it('refuses a return when not over the limit', () => {
    expect(refusal(start(2), { type: 'return', good: 0 })).toBe(error('noReturn'))
  })
})

describe('reserving', () => {
  it('takes a face-up card and a gold token, and refills the market', () => {
    const state = start(2)
    const card = state.market[1][2] as string
    const next = act(state, { type: 'reserve', card })
    expect(next.players[0].reserved).toEqual([{ id: card, blind: false }])
    expect(next.players[0].tokens[5]).toBe(1)
    expect(next.bank[5]).toBe(4)
    expect(next.market[1][2]).toBe(state.decks[1][0])
    expect(next.decks[1]).toHaveLength(25)
    expect(next.last).toMatchObject({ kind: 'reserve', card, gold: true })
  })

  it('still reserves when the gold is gone', () => {
    const state = { ...start(2), bank: [4, 4, 4, 4, 4, 0] }
    const next = act(state, { type: 'reserve', card: state.market[0][0] as string })
    expect(next.players[0].tokens[5]).toBe(0)
    expect(next.last?.gold).toBe(false)
  })

  it('takes the top of a deck face down', () => {
    const state = start(2)
    const next = act(state, { type: 'reserveTop', tier: 3 })
    expect(next.players[0].reserved).toEqual([{ id: state.decks[2][0], blind: true }])
    expect(next.market).toEqual(state.market)
    expect(next.last).toMatchObject({ kind: 'reserveTop', tier: 3, card: null })
  })

  it('holds at most three', () => {
    const ids = idsOf(1, 0).slice(0, 3)
    const state = withMe(start(2), { reserved: ids.map((id) => ({ id, blind: false })) })
    expect(refusal(state, { type: 'reserve', card: state.market[0][0] })).toBe(error('reserveFull'))
    expect(refusal(state, { type: 'reserveTop', tier: 1 })).toBe(error('reserveFull'))
    expect(traders.legalActions(state, seatInTurn(state)).some((action) => action.type.startsWith('reserve'))).toBe(false)
  })

  it('refuses a card not on offer and an empty deck', () => {
    const state = start(2)
    expect(refusal(state, { type: 'reserve', card: state.decks[0][0] })).toBe(error('noCard'))
    const empty = { ...state, decks: [[], state.decks[1], state.decks[2]] }
    expect(refusal(empty, { type: 'reserveTop', tier: 1 })).toBe(error('emptyDeck'))
  })
})

describe('buying', () => {
  it('pays each good first, gold for the shortfall, less the bonuses', () => {
    expect(payment([0, 3, 0, 0, 2], [0, 1, 0, 0, 0], [0, 1, 0, 0, 2, 1])).toEqual([0, 1, 0, 0, 2, 1])
    expect(payment([0, 3, 0, 0, 2], [0, 0, 0, 0, 0], [0, 1, 0, 0, 2, 1])).toBeNull()
    expect(payment([0, 2, 0, 0, 0], [0, 4, 0, 0, 0], [0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('buys a face-up card: the tokens go back, the slot refills, the bonus counts', () => {
    const base = start(2)
    const card = base.market[0][1] as string
    const cost = cardOf(card).cost
    const state = withMe(base, { tokens: [...cost, 0] })
    const next = act(state, { type: 'buy', card })
    expect(next.players[0].cards).toEqual([card])
    expect(next.players[0].tokens).toEqual([0, 0, 0, 0, 0, 0])
    expect(next.bank).toEqual(base.bank.map((count, good) => count + (good < 5 ? cost[good] : 0)))
    expect(next.market[0][1]).toBe(base.decks[0][0])
    expect(bonusesOf(next.players[0])[cardOf(card).bonus]).toBe(1)
  })

  it('buys a reserved card and a free one with bonuses alone', () => {
    const [cheap] = idsOf(1, 1)
    const owned = [...idsOf(1, 0), ...idsOf(1, 2), ...idsOf(1, 3), ...idsOf(1, 4)].slice(0, 32)
    const state = withMe(start(2), { cards: owned, reserved: [{ id: cheap, blind: true }] })
    const next = act(state, { type: 'buy', card: cheap })
    expect(next.players[0].reserved).toEqual([])
    expect(next.players[0].cards).toContain(cheap)
  })

  it('refuses what it cannot pay for, and a card in someone else’s hand', () => {
    const state = start(2)
    expect(refusal(state, { type: 'buy', card: state.market[2][0] })).toBe(error('cannotAfford'))
    const theirs = state.decks[0][0]
    const other = { ...state, players: state.players.map((player, index) => (index === 1 ? { ...player, reserved: [{ id: theirs, blind: false }] } : player)) }
    expect(refusal(withMe(other, { tokens: [5, 5, 5, 5, 5, 5] }), { type: 'buy', card: theirs })).toBe(error('noCard'))
    expect(refusal(state, { type: 'buy', card: 'nope' })).toBe(error('noCard'))
  })
})

describe('patrons', () => {
  it('come on their own once the cards cover their wants, one a turn, first on display first', () => {
    const base = start(2)
    // Bonuses of 4 in every good: every patron qualifies
    const cards = [0, 1, 2, 3, 4].flatMap((good) => idsOf(1, good).slice(0, 4))
    const state = withMe(base, { cards })
    const next = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(next.players[0].patrons).toEqual([base.patrons[0]])
    expect(next.patrons).toEqual(base.patrons.slice(1))
    expect(next.last?.patron).toBe(base.patrons[0])
    expect(pointsOf(next.players[0])).toBe(pointsOf(state.players[0]) + 3)
  })
})

describe('the end', () => {
  /** Four tier-3 cards: at least 15 points */
  const rich = (): string[] =>
    CARDS.filter((card) => card.tier === 3 && card.points >= 4)
      .map((card) => card.id)
      .slice(0, 4)

  it('finishes the round once someone reaches the target, then the most points win', () => {
    let state = start(3)
    state = withMe(state, { cards: rich() })
    expect(pointsOf(me(state))).toBeGreaterThanOrEqual(15)
    state = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(state.finalRound).toBe(true)
    expect(traders.isOver(state)).toBe(false)
    state = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(traders.isOver(state)).toBe(false)
    state = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(traders.isOver(state)).toBe(true)
    expect(state.end).toBe('target')
    expect(traders.legalActions(state, state.order[0])).toEqual([])
    const result = traders.result(state)
    expect(result.standings[0]).toMatchObject({ seat: state.order[0], rank: 1 })
    expect(result.summary.key).toBe('games.traders.result.target')
  })

  it('breaks a tie on points by fewer cards, and shares the place when still tied', () => {
    const state = start(3)
    const a = idsOf(3, 0).slice(0, 2)
    const b = idsOf(3, 1).slice(0, 2)
    const players = state.players.map((player, index) => ({
      ...player,
      cards: index === 0 ? a : index === 1 ? [...b, idsOf(1, 2)[0]] : idsOf(3, 2).slice(0, 2),
    }))
    const ended: TradersState = { ...state, players, phase: 'over', end: 'target' }
    expect(pointsOf(players[0])).toBe(pointsOf(players[1]))
    const ranks = Object.fromEntries(traders.result(ended).standings.map((line) => [line.seat, line.rank]))
    expect(ranks[players[0].seat]).toBe(1)
    expect(ranks[players[1].seat]).toBeGreaterThan(1)
    expect(pointsOf(players[2])).toBe(pointsOf(players[0]))
    expect(ranks[players[2].seat]).toBe(1)
  })

  it('ends a game nobody can move in', () => {
    let state: TradersState = {
      ...start(2),
      bank: [0, 0, 0, 0, 0, 0],
      market: [[null, null, null, null], [null, null, null, null], [null, null, null, null]],
      decks: [[], [], []],
    }
    state = { ...state, players: state.players.map((player) => ({ ...player, reserved: [] })) }
    expect(traders.legalActions(state, seatInTurn(state))).toEqual([{ type: 'pass' }])
    state = act(state, { type: 'pass' })
    expect(traders.isOver(state)).toBe(false)
    state = act(state, { type: 'pass' })
    expect(state.end).toBe('stalled')
  })

  it('refuses a pass while there is something to do', () => {
    expect(refusal(start(2), { type: 'pass' })).toBe(error('cannotPass'))
  })

  it('stops after the round cap', () => {
    const state = { ...start(2), round: ROUND_CAP, turn: 1 }
    const next = act(state, { type: 'take', goods: [0, 1, 2] })
    expect(next.end).toBe('cap')
  })
})

describe('whose turn and the room', () => {
  it('refuses another seat, junk and the system acting as a player', () => {
    const state = start(3)
    const other = state.order[1]
    expect(refusal(state, { type: 'take', goods: [0, 1, 2] }, other)).toBe(error('notYourTurn'))
    expect(refusal(state, { type: 'take', goods: [0, 1, 2] }, 'system')).toBe(error('badAction'))
    expect(refusal(state, { type: 'skip', seat: seatInTurn(state) }, seatInTurn(state))).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'skip', seat: other }, 'system')).toBe(error('nothingToSkip'))
    expect(traders.legalActions(state, other)).toEqual([])
  })

  it('skips a gone seat: passes its turn, or puts its tokens back for it', () => {
    const state = start(2)
    const seat = seatInTurn(state)
    expect(traders.skipAction?.(state, seat)).toEqual({ type: 'skip', seat })
    expect(traders.skipAction?.(state, state.order[1])).toBeNull()
    const skipped = act(state, { type: 'skip', seat }, 'system')
    expect(skipped.turn).toBe(1)
    expect(skipped.last?.kind).toBe('skip')

    const over = act(withMe(state, { tokens: [3, 3, 2, 2, 1, 0] }), { type: 'take', goods: [0, 1, 2] })
    expect(over.phase).toBe('return')
    const back = act(over, { type: 'skip', seat }, 'system')
    expect(back.phase).toBe('play')
    expect(back.turn).toBe(1)
    expect(back.players[0].tokens.reduce((a, b) => a + b)).toBe(10)
  })
})

describe('the view', () => {
  it('sends the decks as counts and a face-down card to its owner alone', () => {
    let state = start(3)
    const owner = seatInTurn(state)
    const hidden = state.decks[2][0]
    state = act(state, { type: 'reserveTop', tier: 3 })
    for (const viewer of [...state.order, 'spectator' as const]) {
      const view = traders.view(state, viewer)
      expect(view.decks).toEqual([36, 26, 15])
      const text = JSON.stringify(view)
      for (const deck of state.decks) for (const id of deck) expect(text).not.toContain(`"${id}"`)
      if (viewer === owner) expect(text).toContain(`"${hidden}"`)
      else expect(text).not.toContain(`"${hidden}"`)
      const reserved = view.players.find((player) => player.seat === owner)?.reserved
      expect(reserved).toEqual([{ tier: 3, card: viewer === owner ? cardOf(hidden) : null }])
    }
    expect(traders.view(state, 'spectator').you).toBeNull()
    expect(traders.view(state, owner).last?.card).toBeNull()
  })

  it('shows bonuses and points worked out', () => {
    const cards = idsOf(2, 4).slice(0, 2)
    const state = withMe(start(2), { cards })
    const view = traders.view(state, 'spectator')
    expect(view.players[0].bonuses).toEqual([0, 0, 0, 0, 2])
    expect(view.players[0].points).toBe(cards.reduce((total, id) => total + cardOf(id).points, 0))
    expect(view.turn).toBe(seatInTurn(state))
  })
})

/** Every card a viewer must not see: the decks, and others' face-down reservations */
function secrets(state: TradersState, viewer: number | 'spectator'): JsonValue[] {
  const decks = state.decks.flat()
  const blind = state.players
    .filter((player) => player.seat !== viewer)
    .flatMap((player) => player.reserved.filter((held) => held.blind).map((held) => held.id))
  return [...decks, ...blind]
}

describe('whole games (harness)', () => {
  it.each([2, 3, 4])('%i players play to the end without leaking a hidden card', (seats) => {
    for (let seed = 1; seed <= 3; seed++) {
      const { result } = playRandom(traders, { seed, seats, secrets })
      expect(result.standings).toHaveLength(seats)
    }
  })

  it('plays a short game to 10 points', () => {
    const { result } = playRandom(traders, { seed: 9, seats: 2, options: { target: 10 }, secrets })
    expect(result.standings[0].score).toBeGreaterThanOrEqual(10)
  })

  it('keeps every token: the wharf and the hands always add up to the supply', () => {
    let state = start(4, 3)
    const rng = createRng(11)
    for (let step = 0; step < 400 && !traders.isOver(state); step++) {
      const seat = seatInTurn(state)
      const legal = traders.legalActions(state, seat)
      state = act(state, rng.pick(legal), seat)
      for (let good = 0; good < 6; good++) {
        const held = state.players.reduce((total, player) => total + player.tokens[good], 0)
        expect(held + state.bank[good]).toBe(good === 5 ? 5 : 7)
      }
      const cards = state.decks.flat().length + state.market.flat().filter(Boolean).length +
        state.players.reduce((total, player) => total + player.cards.length + player.reserved.length, 0)
      expect(cards).toBe(90)
    }
  })
})
