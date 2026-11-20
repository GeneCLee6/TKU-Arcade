// Computer players for the table games (2026-11-20, docs/ARCHITECTURE.md "電腦玩家"): every game with
// a `bot` played to its end by computer seats alone, on many seeds and both levels; a bot only ever
// answers what its seat may do; and it decides from its seat's view alone.
import { describe, expect, it, vi } from 'vitest'
import { holdemBot, chenScore, equity } from '../../shared/games/holdem/bot.ts'
import { holdem } from '../../shared/games/holdem/rules.ts'
import type { HoldemAction, HoldemState } from '../../shared/games/holdem/types.ts'
import { getGame, GAME_IDS } from '../../shared/games/index.ts'
import { GAME_META } from '../../shared/games/lobby.ts'
import { makeSeats, projectGame } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { promotionBot } from '../../shared/games/promotion/bot.ts'
import { promotion } from '../../shared/games/promotion/rules.ts'
import type { PromotionFullView } from '../../shared/games/promotion/types.ts'
import { createRng } from '../../shared/games/rng.ts'
import { TABLE_BOT_LEVELS, TABLE_BOT_NAMES } from '../../shared/games/tableBots.ts'
import { shortfall, tradersBot } from '../../shared/games/traders/bot.ts'
import { traders } from '../../shared/games/traders/rules.ts'
import {
  isGameError,
  type AnyGameModule,
  type OptionValues,
  type SeatId,
} from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'

vi.setConfig({ testTimeout: 240_000 })

const BOT_GAMES = ['holdem', 'promotion', 'traders'] as const

/** An action the module's own view of `seat` allows: one of `legal`, or what reduce takes anyway */
const sameAction = (a: JsonValue, b: JsonValue) => JSON.stringify(a) === JSON.stringify(b)

type Played = { over: boolean; moves: number; offList: string[] }

/**
 * Plays a whole game with a computer in every seat, as the room does: on each change the first seat
 * whose policy has something to do moves; when none does, the earliest timer fires as `system`
 */
function playBots(
  module: AnyGameModule,
  seats: number,
  options: OptionValues,
  seed: number,
  levels: readonly string[],
  maxMoves = 40_000,
): Played {
  const game = createRng(seed)
  const choose = createRng(seed ^ 0x5bd1e995)
  let state = module.init(makeSeats(seats), options as never, game)
  const offList: string[] = []
  let moves = 0
  while (!module.isOver(state) && moves < maxMoves) {
    let acted = false
    for (let seat = 0; seat < seats && !acted; seat++) {
      const { view, legal } = projectGame(module, state, seat)
      const level = levels[seat % levels.length]
      const wanted = module.bot!(view, legal, level, choose)
      if (legal.length === 0 && wanted === null) continue
      const action = wanted ?? choose.pick(legal)
      if (!legal.some((one) => sameAction(one, action))) {
        offList.push(JSON.stringify((action as { type?: string }).type))
      }
      const next = module.reduce(state, action, seat as SeatId, game)
      if (isGameError(next)) throw new Error(`seat ${seat} ${JSON.stringify(action)}: ${next.gameError}`)
      state = next
      acted = true
      moves++
    }
    if (acted) continue
    const timer = module.timers?.(state)[0]
    if (!timer) throw new Error(`${module.id}: nobody can move and no timer (move ${moves})`)
    const next = module.reduce(state, timer.action, 'system', game)
    if (isGameError(next)) throw new Error(`timer ${timer.id}: ${next.gameError}`)
    state = next
  }
  return { over: module.isOver(state), moves, offList }
}

describe('which games have computer players', () => {
  it('the lobby says so for exactly the modules with a bot, with the shared levels and names', () => {
    for (const id of GAME_IDS) {
      const module = getGame(id)!
      const meta = GAME_META[id as keyof typeof GAME_META] as { computer?: true }
      expect(meta.computer === true, id).toBe(module.bot !== undefined)
      if (module.bot) {
        expect(module.bots).toEqual({ levels: TABLE_BOT_LEVELS, names: TABLE_BOT_NAMES })
        // As many names as the most seats: a full table of computers gets each its own
        expect(TABLE_BOT_NAMES.length).toBeGreaterThanOrEqual(module.meta.maxPlayers)
      }
    }
    expect(BOT_GAMES.filter((id) => getGame(id)?.bot)).toEqual([...BOT_GAMES])
  })
})

describe('a table of computers plays every game to its end', () => {
  const cases: { id: string; seats: number; options: OptionValues }[] = [
    // Blinds that go up, short stacks: a game of computers is over in a few dozen hands
    { id: 'holdem', seats: 2, options: { ...defaultOptions(holdem.options), stack: 100, blindUp: 15 } },
    { id: 'holdem', seats: 5, options: { ...defaultOptions(holdem.options), stack: 100, blindUp: 15 } },
    { id: 'promotion', seats: 3, options: defaultOptions(promotion.options) },
    { id: 'promotion', seats: 4, options: { ...defaultOptions(promotion.options), edition: 'full' } },
    { id: 'traders', seats: 2, options: defaultOptions(traders.options) },
    { id: 'traders', seats: 4, options: defaultOptions(traders.options) },
  ]
  for (const { id, seats, options } of cases) {
    for (const levels of [['normal'], ['easy'], ['easy', 'normal']]) {
      it(`${id}, ${seats} seats, ${levels.join(' and ')}`, () => {
        const module = getGame(id)!
        for (let seed = 1; seed <= 4; seed++) {
          const played = playBots(module, seats, options, seed * 7919, levels)
          expect(played.over, `seed ${seed}`).toBe(true)
          // Off the legal list only what reduce takes from any seat at any time: holdem's vote and
          // coming back from sitting out
          for (const type of played.offList) expect(['"endVote"', '"away"']).toContain(type)
        }
      })
    }
  }

  it('normal traders buy cards and finish by points, not by stalling', () => {
    const played = playBots(traders as unknown as AnyGameModule, 3, { target: 15 }, 11, ['normal'])
    expect(played.over).toBe(true)
  })
})

describe('only their own view', () => {
  it('hold’em: the same view gives the same move, whatever the hidden cards are', () => {
    const rng = createRng(3)
    const state = holdem.init(makeSeats(3), defaultOptions(holdem.options), rng)
    const seat = (state.phase as { toAct: SeatId }).toAct
    // Swap every other seat's cards and the deck: nothing this seat can see
    const others = state.players.filter((player) => player.seat !== seat)
    const scrambled: HoldemState = {
      ...state,
      deck: [...state.deck].reverse(),
      players: state.players.map((player) =>
        player.seat === seat ? player : { ...player, hole: others[(others.indexOf(player) + 1) % others.length].hole },
      ),
    }
    const a = projectGame(holdem, state, seat)
    const b = projectGame(holdem, scrambled, seat)
    expect(a.view).toEqual(b.view)
    expect(holdemBot(a.view, a.legal, 'normal', createRng(9))).toEqual(
      holdemBot(b.view, b.legal, 'normal', createRng(9)),
    )
    // The view itself holds no one else's cards
    const text = JSON.stringify(a.view)
    for (const other of others) for (const card of other.hole) expect(text).not.toContain(`"${card}"`)
  })

  it('traders: a face-down reservation of someone else is never a target', () => {
    let state = traders.init(makeSeats(2), { target: 15 }, createRng(5))
    const first = state.order[0]
    state = traders.reduce(state, { type: 'reserveTop', tier: 3 }, first, createRng(1)) as typeof state
    const second = state.order[1]
    const { view, legal } = projectGame(traders, state, second)
    expect(view.players.find((p) => p.seat === first)!.reserved[0].card).toBeNull()
    const action = tradersBot(view, legal, 'normal', createRng(2))
    expect(legal.some((one) => sameAction(one, action as JsonValue))).toBe(true)
  })
})

describe('the policies', () => {
  it('hold’em reads starting hands the usual way round', () => {
    expect(chenScore(['As', 'Ad'])).toBe(20)
    expect(chenScore(['Ks', 'Qs'])).toBeGreaterThan(chenScore(['Ks', '7d']))
    expect(chenScore(['7d', '2c'])).toBeLessThan(2)
    const rng = createRng(1)
    expect(equity(['As', 'Ad'], ['Ac', 'Ah', '2d'], 1, rng)).toBeGreaterThan(0.95)
    expect(equity(['7d', '2c'], ['Ac', 'Kh', 'Qd'], 1, rng)).toBeLessThan(0.25)
  })

  it('hold’em agrees to stop once someone else wants to', () => {
    const state = holdem.init(makeSeats(2), defaultOptions(holdem.options), createRng(4))
    const seat = (state.phase as { toAct: SeatId }).toAct
    const other = seat === 0 ? 1 : 0
    const { view, legal } = projectGame(holdem, { ...state, endVotes: [other] }, seat)
    expect(holdemBot(view, legal, 'normal', createRng(1))).toEqual({ type: 'endVote', on: true })
  })

  it('hold’em comes back when the clock sat it out, and otherwise says nothing out of turn', () => {
    const state = holdem.init(makeSeats(2), defaultOptions(holdem.options), createRng(4))
    const seat = (state.phase as { toAct: SeatId }).toAct
    const other = seat === 0 ? 1 : 0
    const quiet = projectGame(holdem, state, other)
    expect(holdemBot(quiet.view, [], 'normal', createRng(1))).toBeNull()
    const away = projectGame(
      holdem,
      { ...state, players: state.players.map((p) => (p.seat === other ? { ...p, away: true } : p)) },
      other,
    )
    expect(holdemBot(away.view, [], 'normal', createRng(1))).toEqual({ type: 'away', away: false })
  })

  it('hold’em, normal, folds seven-two to a big raise and raises two aces', () => {
    const state = holdem.init(makeSeats(2), { stack: 200, blindUp: 0, timer: 30 }, createRng(4))
    const seat = (state.phase as { toAct: SeatId }).toAct
    const withHole = (hole: string[], currentBet = state.currentBet): HoldemState => ({
      ...state,
      currentBet,
      players: state.players.map((p) => (p.seat === seat ? { ...p, hole: hole as never } : p)),
    })
    const bad = projectGame(holdem, withHole(['7d', '2c'], 400), seat)
    expect(holdemBot(bad.view, bad.legal, 'normal', createRng(1))).toEqual({ type: 'fold' })
    const good = projectGame(holdem, withHole(['As', 'Ad']), seat)
    expect((holdemBot(good.view, good.legal, 'normal', createRng(1)) as HoldemAction).type).toBe('raise')
  })

  it('promotion rolls, and in the full edition answers a decision with one of its answers', () => {
    const state = promotion.init(makeSeats(2), { ...defaultOptions(promotion.options), edition: 'full' } as never, createRng(2))
    const seat = state.turn as SeatId
    const { view, legal } = projectGame(promotion, state, seat)
    expect(promotionBot(view, legal, 'normal', createRng(1))).toEqual({ type: 'roll' })
    const full = view as PromotionFullView
    const offer = { ...full, pending: { kind: 'offer' as const, seat, cell: full.players[seat].cell, from: full.players[seat].cell } }
    expect(['accept', 'decline']).toContain(
      promotionBot(offer, [{ type: 'accept' }, { type: 'decline' }], 'normal', createRng(1))?.type,
    )
  })

  it('traders counts what a card still costs after discounts, tokens and gold', () => {
    const card = { id: 't1-01', tier: 1 as const, bonus: 0 as const, points: 0, cost: [2, 1, 0, 0, 0] }
    const me = {
      seat: 0,
      tokens: [1, 0, 0, 0, 0, 1],
      bonuses: [0, 0, 0, 0, 0],
      points: 0,
      cardCount: 0,
      reserved: [],
      patrons: [],
    }
    expect(shortfall(card, me)).toBe(1)
    expect(shortfall(card, { ...me, bonuses: [1, 1, 0, 0, 0] })).toBe(0)
  })
})
