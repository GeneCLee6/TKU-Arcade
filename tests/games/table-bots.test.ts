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
import { palaceBot, holdChance } from '../../shared/games/palace/bot.ts'
import { palace } from '../../shared/games/palace/rules.ts'
import type { PalaceState } from '../../shared/games/palace/types.ts'
import { createRng } from '../../shared/games/rng.ts'
import { knownCard, secretScrollBot } from '../../shared/games/secret-scroll/bot.ts'
import { secretScroll } from '../../shared/games/secret-scroll/rules.ts'
import type { ScrollState } from '../../shared/games/secret-scroll/types.ts'
import { TABLE_BOT_LEVELS, TABLE_BOT_NAMES } from '../../shared/games/tableBots.ts'
import { layOff, rackMelds, tilesBot } from '../../shared/games/tiles/bot.ts'
import { tiles } from '../../shared/games/tiles/rules.ts'
import { checkTurn } from '../../shared/games/tiles/tiles.ts'
import type { TilesState } from '../../shared/games/tiles/types.ts'
import { shortfall, tradersBot } from '../../shared/games/traders/bot.ts'
import { traders } from '../../shared/games/traders/rules.ts'
import { bidChance, wasabiBot } from '../../shared/games/wasabi/bot.ts'
import { wasabi } from '../../shared/games/wasabi/rules.ts'
import type { WasabiState } from '../../shared/games/wasabi/types.ts'
import {
  botLegal,
  isGameError,
  type AnyGameModule,
  type OptionValues,
  type SeatId,
} from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'

vi.setConfig({ testTimeout: 240_000 })

const BOT_GAMES = ['holdem', 'promotion', 'traders', 'palace', 'secret-scroll', 'wasabi', 'tiles'] as const

/** An action the module's own view of `seat` allows: one of `legal`, or what reduce takes anyway */
const sameAction = (a: JsonValue, b: JsonValue) => JSON.stringify(a) === JSON.stringify(b)

type Played = { over: boolean; moves: number; offList: string[]; firsts: number[] }

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
      const projection = projectGame(module, state, seat)
      const view = projection.view
      // As the room asks: without what the game leaves to the people (the next round's button)
      const legal = botLegal(module, projection.legal)
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
  const firsts = module.isOver(state)
    ? module.result(state).standings.filter((one) => one.rank === 1).map((one) => one.seat as number)
    : []
  return { over: module.isOver(state), moves, offList, firsts }
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
    { id: 'palace', seats: 2, options: defaultOptions(palace.options) },
    { id: 'palace', seats: 6, options: defaultOptions(palace.options) },
    { id: 'secret-scroll', seats: 2, options: defaultOptions(secretScroll.options) },
    { id: 'secret-scroll', seats: 6, options: { ...defaultOptions(secretScroll.options), beggars: true } },
    { id: 'wasabi', seats: 3, options: defaultOptions(wasabi.options) },
    { id: 'wasabi', seats: 6, options: defaultOptions(wasabi.options) },
    { id: 'tiles', seats: 2, options: defaultOptions(tiles.options) },
    { id: 'tiles', seats: 4, options: { ...defaultOptions(tiles.options), rounds: 2 } },
  ]
  for (const { id, seats, options } of cases) {
    for (const levels of [['normal'], ['easy'], ['easy', 'normal']]) {
      it(`${id}, ${seats} seats, ${levels.join(' and ')}`, () => {
        const module = getGame(id)!
        for (let seed = 1; seed <= 4; seed++) {
          const played = playBots(module, seats, options, seed * 7919, levels)
          expect(played.over, `seed ${seed}`).toBe(true)
          // Off the legal list only what reduce takes from any seat at any time: holdem's vote and
          // coming back from sitting out; and tiles' whole turn in one commit with its sets
          for (const type of played.offList) expect(['"endVote"', '"away"', '"commit"']).toContain(type)
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

// 2026-11-21: palace, secret-scroll, wasabi and tiles. Normal in one seat (a different one each
// game), easy in the rest: normal must come first clearly more often than an easy seat does
describe('normal plays better than easy', () => {
  const cases: { id: string; seats: number; games: number; options: OptionValues }[] = [
    { id: 'palace', seats: 3, games: 120, options: defaultOptions(palace.options) },
    { id: 'secret-scroll', seats: 3, games: 120, options: defaultOptions(secretScroll.options) },
    { id: 'wasabi', seats: 3, games: 120, options: defaultOptions(wasabi.options) },
    { id: 'tiles', seats: 3, games: 40, options: defaultOptions(tiles.options) },
  ]
  for (const { id, seats, games, options } of cases) {
    it(id, () => {
      const module = getGame(id)!
      let normal = 0
      let easy = 0
      for (let game = 0; game < games; game++) {
        const levels = Array.from({ length: seats }, (_, seat) => (seat === game % seats ? 'normal' : 'easy'))
        const played = playBots(module, seats, options, 1000 + game * 7919, levels)
        expect(played.over).toBe(true)
        for (const seat of played.firsts) {
          if (levels[seat] === 'normal') normal += 1 / played.firsts.length
          else easy += 1 / played.firsts.length
        }
      }
      const normalRate = normal / games
      const easyRate = easy / (games * (seats - 1))
      expect(normalRate, `normal ${normalRate.toFixed(2)}, easy ${easyRate.toFixed(2)}`).toBeGreaterThan(1 / seats)
      expect(normalRate).toBeGreaterThan(easyRate * 1.5)
    })
  }
})

type Scrambler<S> = (state: S, seat: number, rng: ReturnType<typeof createRng>) => S

/** Moves things between hidden places, keeping how many each holds: what a seat cannot tell apart */
function redeal<T>(places: T[][], rng: ReturnType<typeof createRng>): T[][] {
  const pool = rng.shuffle(places.flat())
  let at = 0
  return places.map((place) => {
    const out = pool.slice(at, at + place.length)
    at += place.length
    return out
  })
}

/**
 * Plays a game of computers and, before every computer move, swaps everything the moving seat cannot
 * see: its view must be the same, and so must its move
 */
function blindCheck<S>(module: AnyGameModule, seats: number, options: OptionValues, scramble: Scrambler<S>, seed: number) {
  const game = createRng(seed)
  const choose = createRng(seed + 1)
  let state = module.init(makeSeats(seats), options as never, game) as unknown as S
  let checked = 0
  for (let step = 0; step < 400 && !module.isOver(state as never); step++) {
    let moved = false
    for (let seat = 0; seat < seats && !moved; seat++) {
      const a = projectGame(module, state as never, seat)
      const legal = botLegal(module, a.legal)
      if (legal.length === 0) continue
      const b = projectGame(module, scramble(state, seat, createRng(step)) as never, seat)
      expect(b.view).toEqual(a.view)
      const level = seat % 2 ? 'easy' : 'normal'
      const action = module.bot!(a.view, legal, level, createRng(step + 7))
      expect(module.bot!(b.view, botLegal(module, b.legal), level, createRng(step + 7))).toEqual(action)
      checked++
      const next = module.reduce(state as never, action ?? choose.pick(legal), seat as SeatId, game)
      if (isGameError(next)) throw new Error(next.gameError)
      state = next as unknown as S
      moved = true
    }
    if (moved) continue
    const timer = module.timers?.(state as never)[0]
    if (!timer) break
    state = module.reduce(state as never, timer.action, 'system', game) as unknown as S
  }
  expect(checked).toBeGreaterThan(10)
}

describe('only their own view, whatever is hidden', () => {
  it('palace: the others’ backers and the deck', () => {
    const scramble: Scrambler<PalaceState> = (state, seat, rng) => {
      const others = state.players.filter((player) => player.seat !== seat)
      const [deck, ...hidden] = redeal([state.deck, ...others.map((player) => player.hidden)], rng)
      return {
        ...state,
        deck,
        players: state.players.map((player) =>
          player.seat === seat ? player : { ...player, hidden: hidden[others.indexOf(player)] },
        ),
      }
    }
    for (const seed of [1, 2, 3]) blindCheck(palace as unknown as AnyGameModule, 4, defaultOptions(palace.options), scramble, seed)
  })

  it('secret-scroll: the others’ hands, the deck and the card set aside', () => {
    const scramble: Scrambler<ScrollState> = (state, seat, rng) => {
      const others = state.players.filter((player) => player.seat !== seat)
      const aside = state.hidden === null ? [] : [state.hidden]
      const [deck, hidden, ...hands] = redeal([state.deck, aside, ...others.map((player) => player.hand)], rng)
      return {
        ...state,
        deck,
        hidden: hidden[0] ?? null,
        players: state.players.map((player) =>
          player.seat === seat ? player : { ...player, hand: hands[others.indexOf(player)] },
        ),
      }
    }
    for (const seed of [1, 2, 3]) {
      blindCheck(secretScroll as unknown as AnyGameModule, 4, defaultOptions(secretScroll.options), scramble, seed)
    }
  })

  it('wasabi: what is in the others’ steamers and hands', () => {
    const scramble: Scrambler<WasabiState> = (state, seat) => ({
      ...state,
      players: state.players.map((player) => {
        if (player.seat === seat) return player
        // The uneaten part of the steamer the other way up, and the kinds owned the other way round
        const hidden = player.stack.length - player.eaten
        const stack = [...player.stack.slice(0, hidden).reverse(), ...player.stack.slice(hidden)]
        return { ...player, stack, plain: player.wasabi, wasabi: player.plain }
      }),
      lastRound: state.lastRound && state.lastRound.bidder !== seat ? { ...state.lastRound, lost: 'wasabi' } : state.lastRound,
    })
    for (const seed of [1, 2, 3]) blindCheck(wasabi as unknown as AnyGameModule, 4, defaultOptions(wasabi.options), scramble, seed)
  })

  it('tiles: the others’ racks and the pool', () => {
    const scramble: Scrambler<TilesState> = (state, seat, rng) => {
      const me = state.players.indexOf(seat)
      const others = state.racks.filter((_, index) => index !== me)
      const [pool, ...racks] = redeal([state.pool, ...others], rng)
      let next = 0
      return { ...state, pool, racks: state.racks.map((rack, index) => (index === me ? rack : racks[next++])) }
    }
    for (const seed of [1, 2]) blindCheck(tiles as unknown as AnyGameModule, 3, defaultOptions(tiles.options), scramble, seed)
  })
})

describe('the policies of the four', () => {
  type Role = PalaceState['players'][number]['hidden'][number]['role']
  const card = (id: number, role: Role) => ({ id: `card-${id}`, role })

  it('palace challenges a claim to a role it can see every copy of', () => {
    let state = palace.init(makeSeats(3), defaultOptions(palace.options) as never, createRng(1))
    state = {
      ...state,
      turn: 0,
      players: state.players.map((player) =>
        player.seat === 1
          ? { ...player, hidden: [card(0, 'treasurer'), card(1, 'treasurer')] }
          : player.seat === 2
            ? { ...player, hidden: [card(3, 'guard')], lost: ['treasurer'] }
            : { ...player, hidden: [card(4, 'eunuch'), card(5, 'guard')] },
      ),
    }
    state = palace.reduce(state, { type: 'act', act: 'levy', target: null }, 0, createRng(1)) as PalaceState
    const { view, legal } = projectGame(palace, state, 1)
    expect(holdChance(view, 0, 'treasurer')).toBe(0)
    expect(holdChance(view, 0, 'dowager')).toBeGreaterThan(0)
    expect(palaceBot(view, legal, 'normal', createRng(1))).toEqual({ type: 'challenge' })
  })

  it('palace blocks an arrest with the Dowager it holds, and gives up its least useful backer', () => {
    let state = palace.init(makeSeats(3), defaultOptions(palace.options) as never, createRng(2))
    state = {
      ...state,
      turn: 0,
      players: state.players.map((player) =>
        player.seat === 0
          ? { ...player, silver: 5 }
          : player.seat === 1
            ? { ...player, hidden: [card(12, 'dowager'), card(9, 'strategist')] }
            : player,
      ),
    }
    state = palace.reduce(state, { type: 'act', act: 'arrest', target: 1 }, 0, createRng(1)) as PalaceState
    // Everyone passes the challenge
    for (const seat of [1, 2]) state = palace.reduce(state, { type: 'pass' }, seat, createRng(1)) as PalaceState
    const blocking = projectGame(palace, state, 1)
    expect(palaceBot(blocking.view, blocking.legal, 'normal', createRng(1))).toEqual({ type: 'block', role: 'dowager' })
    const losing = projectGame(palace, { ...state, phase: { kind: 'lose', seat: 1, then: 'end' } }, 1)
    expect(palaceBot(losing.view, losing.legal, 'normal', createRng(1))).toEqual({ type: 'lose', card: 'card-9' })
  })

  it('secret-scroll names the card its Spy saw, and never throws the Scroll away by choice', () => {
    const base = secretScroll.init(makeSeats(3), defaultOptions(secretScroll.options) as never, createRng(4))
    const me = base.current
    const target = base.players.find((player) => player.seat !== me)!.seat
    const state: ScrollState = {
      ...base,
      players: base.players.map((player) =>
        player.seat === me ? { ...player, hand: [1, 4] } : player.seat === target ? { ...player, hand: [5] } : player,
      ),
      events: [
        { seat: me, card: 2, target, guess: null, outcome: 'peek', out: [], shown: [], seen: [{ seat: me, of: target, card: 5 }] },
      ],
    }
    const { view, legal } = projectGame(secretScroll, state, me)
    expect(knownCard(view, target)).toBe(5)
    expect(secretScrollBot(view, legal, 'normal', createRng(1))).toEqual({ type: 'play', card: 1, target, guess: 5 })
    const scroll = projectGame(
      secretScroll,
      { ...state, players: state.players.map((p) => (p.seat === me ? { ...p, hand: [8, 4] } : p)) },
      me,
    )
    for (const level of ['easy', 'normal']) {
      expect((secretScrollBot(scroll.view, scroll.legal, level, createRng(2)) as { card: number }).card).toBe(4)
    }
  })

  it('wasabi never bids past the wasabi in its own steamer', () => {
    const base = wasabi.init(makeSeats(3), defaultOptions(wasabi.options) as never, createRng(5))
    const state: WasabiState = {
      ...base,
      phase: 'adding',
      current: 0,
      players: base.players.map((player, index) => ({
        ...player,
        placed: true,
        stack: index === 0 ? ['wasabi', 'plain'] : ['plain', 'plain'],
      })),
    }
    const { view, legal } = projectGame(wasabi, state, 0)
    const me = view.players[0]
    expect(bidChance(view, me, 1)).toBe(1)
    expect(bidChance(view, me, 2)).toBe(0)
    for (let seed = 0; seed < 10; seed++) {
      const action = wasabiBot(view, legal, 'normal', createRng(seed))
      if (action?.type === 'bid') expect(action.count).toBeLessThanOrEqual(1)
    }
  })

  // Tile numbers: suit × 26 + (number − 1) × 2 + copy
  const tile = (suit: number, number: number, copy = 0) => suit * 26 + (number - 1) * 2 + copy

  it('tiles finds sets in the rack, 30 for the first play, and lays off on the table', () => {
    const high = [tile(0, 10), tile(0, 11), tile(0, 12), tile(2, 5)]
    expect(rackMelds(high, true, 10_000)).toEqual([[tile(0, 10), tile(0, 11), tile(0, 12)]])
    const low = [tile(1, 1), tile(1, 2), tile(1, 3)]
    expect(rackMelds(low, true, 10_000)).toEqual([])
    expect(rackMelds(low, false, 10_000)).toHaveLength(1)
    // Four sevens and a wildcard: all five go down (a group of four, or a group and a wildcard elsewhere)
    const sevens = [tile(0, 7), tile(1, 7), tile(2, 7), tile(3, 7), tile(0, 8), 104]
    expect(rackMelds(sevens, false, 10_000).flat().length).toBeGreaterThanOrEqual(5)
    const laid = layOff([[tile(3, 3), tile(3, 4), tile(3, 5)]], [tile(3, 6), tile(3, 2), tile(0, 9)])
    expect(laid.rack).toEqual([tile(0, 9)])
  })

  it('tiles sends a turn the rules accept, or draws; and nothing when it is not its turn', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = tiles.init(makeSeats(2), defaultOptions(tiles.options) as never, createRng(seed))
      const seat = state.players[state.turn]
      const { view, legal } = projectGame(tiles, state, seat)
      for (const level of ['easy', 'normal']) {
        const action = tilesBot(view, legal, level, createRng(1))!
        if (action.type === 'commit') {
          expect(checkTurn(state.table, action.sets!, state.racks[state.turn], false).ok).toBe(true)
        } else expect(action).toEqual({ type: 'draw' })
      }
      expect(tilesBot(projectGame(tiles, state, 1 - seat).view, [], 'normal', createRng(1))).toBeNull()
    }
  })

  it('the next round is left to the people', () => {
    for (const module of [secretScroll, wasabi, tiles] as unknown as AnyGameModule[]) {
      expect(module.botLeaves?.({ type: 'next' })).toBe(true)
      expect(module.botLeaves?.({ type: 'draw' })).toBe(false)
    }
  })
})
