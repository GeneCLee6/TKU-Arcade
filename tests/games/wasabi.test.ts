import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { eatable, inHand, totalPlaced, wasabi } from '../../shared/games/wasabi/rules.ts'
import type { WasabiAction, WasabiDisc, WasabiOptions, WasabiState } from '../../shared/games/wasabi/types.ts'
import { playRandom } from './harness.ts'

// 芥末餃子 (working title Wasabi Dumplings), the owner's brief of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: WasabiOptions = { goal: 2 }

const start = (seats: number, seed = 1, options: WasabiOptions = OPTIONS) =>
  wasabi.init(makeSeats(seats), options, createRng(seed))

function act(state: WasabiState, action: WasabiAction, actor: Actor, seed = 7): WasabiState {
  const next = wasabi.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: WasabiState, action: unknown, actor: Actor): string => {
  const answer = wasabi.reduce(state, action as WasabiAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.wasabi.error.${name}`
const p = (state: WasabiState, seat: number) => state.players[seat]
const place = (disc: WasabiDisc): WasabiAction => ({ type: 'place', disc })

/** Three players, starter seat 0; each hides `opening[seat]` */
function opened(opening: WasabiDisc[], seed = 1): WasabiState {
  let state = { ...start(opening.length, seed) }
  state = { ...state, starter: 0, current: 0 }
  opening.forEach((disc, seat) => {
    state = act(state, place(disc), seat)
  })
  return state
}

/** Every state of one random game, picking among the legal moves */
function walk(seats: number, seed: number): WasabiState[] {
  const rng = createRng(seed)
  let state = wasabi.init(makeSeats(seats), OPTIONS, rng)
  const states = [state]
  for (let step = 0; step < 800 && !wasabi.isOver(state); step++) {
    const moves = state.players.flatMap((player) =>
      wasabi.legalActions(state, player.seat).map((action) => ({ action, seat: player.seat })),
    )
    const { action, seat } = rng.pick(moves)
    state = act(state, action, seat, seed * 1000 + step)
    states.push(state)
  }
  return states
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('wasabi')).toBe(wasabi)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('wasabi')
    expect(defaultOptions(wasabi.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.wasabi.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.wasabi.ui.pass']).toBeTruthy()
    }
  })
})

describe('the opening', () => {
  it('gives everyone three plain and one wasabi, and has everyone hide one at once', () => {
    const state = start(4)
    expect(state.phase).toBe('opening')
    expect(state.players.every((player) => player.plain === 3 && player.wasabi === 1)).toBe(true)
    for (const player of state.players) expect(wasabi.legalActions(state, player.seat)).toEqual([place('plain'), place('wasabi')])
    const one = act(state, place('wasabi'), 2)
    expect(one.phase).toBe('opening')
    expect(wasabi.legalActions(one, 2)).toEqual([])
    expect(refusal(one, place('plain'), 2)).toBe(error('alreadyPlaced'))
  })

  it('moves to adding in turn once everyone has one in, from the starter', () => {
    const state = opened(['plain', 'wasabi', 'plain'])
    expect(state.phase).toBe('adding')
    expect(state.current).toBe(0)
    expect(totalPlaced(state)).toBe(3)
  })
})

describe('adding and bidding', () => {
  it('adds a dumpling or bids up to what is on the table', () => {
    let state = opened(['plain', 'wasabi', 'plain'])
    expect(wasabi.legalActions(state, 0)).toEqual([
      place('plain'),
      place('wasabi'),
      { type: 'bid', count: 1 },
      { type: 'bid', count: 2 },
      { type: 'bid', count: 3 },
    ])
    expect(refusal(state, { type: 'bid', count: 4 }, 0)).toBe(error('badBid'))
    expect(refusal(state, place('plain'), 1)).toBe(error('notYourTurn'))
    state = act(state, place('plain'), 0)
    expect(state.current).toBe(1)
    state = act(state, { type: 'bid', count: 2 }, 1)
    expect(state).toMatchObject({ phase: 'bidding', bid: 2, bidder: 1, current: 2 })
    expect(refusal(state, { type: 'bid', count: 2 }, 2)).toBe(error('badBid'))
    state = act(state, { type: 'bid', count: 3 }, 2)
    state = act(state, { type: 'pass' }, 0)
    expect(state.current).toBe(1)
    state = act(state, { type: 'pass' }, 1)
    expect(state).toMatchObject({ phase: 'eating', bidder: 2, current: 2, bid: 3 })
  })

  it('must bid with nothing left in hand', () => {
    let state = opened(['plain', 'plain', 'plain'])
    const me = { ...p(state, 0), stack: ['plain', 'plain', 'plain', 'wasabi'] as WasabiDisc[] }
    state = { ...state, players: [me, p(state, 1), p(state, 2)] }
    expect(inHand(me)).toEqual({ plain: 0, wasabi: 0 })
    expect(wasabi.legalActions(state, 0).every((action) => action.type === 'bid')).toBe(true)
  })

  it('goes straight to eating at the highest possible bid', () => {
    const state = act(opened(['plain', 'wasabi', 'plain']), { type: 'bid', count: 3 }, 0)
    expect(state).toMatchObject({ phase: 'eating', bidder: 0 })
  })

  it('the highest bidder cannot pass', () => {
    let state = act(opened(['plain', 'plain', 'plain']), { type: 'bid', count: 1 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'bid', count: 2 }, 2)
    expect(state.current).toBe(0)
    expect(refusal({ ...state, current: 2 }, { type: 'pass' }, 2)).toBe(error('cannotPass'))
  })
})

describe('eating', () => {
  it('own steamer first, then any steamer top down; a full bid wins a gold chopstick', () => {
    let state = opened(['plain', 'plain', 'plain'])
    state = act(state, place('plain'), 0)
    state = act(state, { type: 'bid', count: 3 }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'pass' }, 0)
    expect(state.phase).toBe('eating')
    expect(eatable(state)).toEqual([1])
    expect(refusal(state, { type: 'eat', seat: 0 }, 1)).toBe(error('ownFirst'))
    state = act(state, { type: 'eat', seat: 1 }, 1)
    expect(eatable(state)).toEqual([0, 2])
    state = act(state, { type: 'eat', seat: 0 }, 1)
    state = act(state, { type: 'eat', seat: 0 }, 1)
    expect(state.phase).toBe('roundEnd')
    expect(p(state, 1).points).toBe(1)
    expect(state.lastRound).toMatchObject({ success: true, bidder: 1, bid: 3 })
    expect(wasabi.timers?.(state)).toEqual([{ id: 'next-1', ms: 12_000, action: { type: 'next' } }])
    state = act(state, { type: 'next' }, 0)
    expect(state).toMatchObject({ phase: 'opening', round: 2, starter: 1 })
    expect(state.players.every((player) => player.stack.length === 0)).toBe(true)
  })

  it('biting someone else’s wasabi: its owner takes one of the bidder’s dumplings blind', () => {
    let state = act(opened(['plain', 'wasabi', 'plain']), { type: 'bid', count: 2 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'eat', seat: 0 }, 0)
    state = act(state, { type: 'eat', seat: 1 }, 0)
    expect(state).toMatchObject({ phase: 'losing', wasabiOf: 1, current: 1 })
    expect(wasabi.legalActions(state, 1)).toHaveLength(4)
    expect(wasabi.legalActions(state, 0)).toEqual([])
    expect(refusal(state, { type: 'take', index: 4 }, 1)).toBe(error('badIndex'))
    state = act(state, { type: 'take', index: 0 }, 1)
    expect(p(state, 0).plain + p(state, 0).wasabi).toBe(3)
    expect(state.lastRound).toMatchObject({ success: false, wasabiOf: 1, eliminated: false })
    // Only the bidder learns what went
    expect(wasabi.view(state, 0).lastRound?.lost).not.toBeNull()
    expect(wasabi.view(state, 1).lastRound?.lost).toBeNull()
    expect(wasabi.view(state, 'spectator').lastRound?.lost).toBeNull()
    expect(wasabi.view(state, 1).players[0].plain).toBeNull()
  })

  it('biting your own wasabi: you choose what to lose', () => {
    let state = act(opened(['wasabi', 'plain', 'plain']), { type: 'bid', count: 1 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'eat', seat: 0 }, 0)
    expect(state).toMatchObject({ phase: 'losing', wasabiOf: 0, current: 0 })
    expect(wasabi.legalActions(state, 0)).toEqual([
      { type: 'discard', disc: 'plain' },
      { type: 'discard', disc: 'wasabi' },
    ])
    state = act(state, { type: 'discard', disc: 'wasabi' }, 0)
    expect(p(state, 0)).toMatchObject({ plain: 3, wasabi: 0 })
    expect(refusal(state, { type: 'discard', disc: 'plain' }, 0)).toBe(error('notNow'))
  })

  it('losing the last dumpling puts you out; the wasabi owner then opens', () => {
    let state = opened(['plain', 'wasabi', 'plain'])
    state = { ...state, players: state.players.map((player) => (player.seat === 0 ? { ...player, plain: 1, wasabi: 0 } : player)) }
    state = act(state, { type: 'bid', count: 2 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'eat', seat: 0 }, 0)
    state = act(state, { type: 'eat', seat: 1 }, 0)
    state = act(state, { type: 'take', index: 0 }, 1)
    expect(p(state, 0).out).toBe(true)
    expect(state.lastRound?.eliminated).toBe(true)
    expect(wasabi.legalActions(state, 0)).toEqual([])
    state = act(state, { type: 'next' }, 1)
    expect(state.starter).toBe(1)
    expect(wasabi.legalActions(state, 0)).toEqual([])
  })

  it('two gold chopsticks win the game; so does being the last with dumplings', () => {
    let state = opened(['plain', 'plain', 'plain'])
    state = { ...state, players: state.players.map((player) => (player.seat === 0 ? { ...player, points: 1 } : player)) }
    state = act(state, { type: 'bid', count: 3 }, 0)
    for (const seat of [0, 1, 2]) state = act(state, { type: 'eat', seat }, 0)
    expect(state).toMatchObject({ phase: 'over', winner: 0 })
    expect(wasabi.result(state).standings[0]).toMatchObject({ seat: 0, rank: 1, score: 2 })
    expect(wasabi.result(state).summary.key).toBe('games.wasabi.result.won')
  })
})

describe('a gone player', () => {
  it('opens with a plain one, passes a bid, eats where they must, takes the first', () => {
    let state = start(3)
    expect(wasabi.skipAction?.(state, 1)).toEqual({ type: 'skip', seat: 1 })
    state = act(state, { type: 'skip', seat: 1 }, 'system')
    expect(p(state, 1).stack).toEqual(['plain'])
    state = opened(['plain', 'plain', 'plain'])
    expect(wasabi.skipAction?.(state, 1)).toBeNull()
    state = act(state, { type: 'bid', count: 1 }, 0)
    state = act(state, { type: 'skip', seat: 1 }, 'system')
    expect(p(state, 1).passed).toBe(true)
    expect(refusal(state, { type: 'skip', seat: 1 }, 1)).toBe(error('systemOnly'))
  })
})

describe('what each viewer sees', () => {
  it('your own steamer and hand; others only as counts until eaten', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const seats = 3 + (seed % 4)
      for (const state of walk(seats, seed)) {
        for (const viewer of [...state.players.map((player) => player.seat), 'spectator' as const]) {
          const view = wasabi.view(state, viewer)
          for (const player of view.players) {
            const real = p(state, player.seat)
            expect(player.owned).toBe(real.plain + real.wasabi)
            expect(player.stack).toHaveLength(real.stack.length)
            if (player.seat === viewer) {
              expect(player.stack).toEqual(real.stack)
              expect([player.plain, player.wasabi]).toEqual([real.plain, real.wasabi])
            } else {
              expect(player.plain).toBeNull()
              expect(player.wasabi).toBeNull()
              player.stack.forEach((disc, index) => {
                const eaten = index >= real.stack.length - real.eaten
                expect(disc).toBe(eaten ? real.stack[index] : null)
              })
            }
          }
          if (state.lastRound !== null && state.lastRound.bidder !== viewer) expect(view.lastRound?.lost).toBeNull()
        }
      }
    }
  })

  it('a random game passes every harness check, from 3 to 6 players', () => {
    for (let seats = 3; seats <= 6; seats++) {
      for (const goal of [1, 2, 3]) {
        const { result } = playRandom(wasabi, { seed: seats * 7 + goal, seats, options: { goal } })
        expect(result.standings).toHaveLength(seats)
      }
    }
  })
})
