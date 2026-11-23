// Computer players, third batch (2026-11-23, docs/ARCHITECTURE.md §4.49): kite, lantern, silent-table
// and misery. Every game played to its end by computers alone, on several seeds, both levels and
// mixed; they answer only what their seat may do (lantern's agreeing to moonlight aside, which reduce
// takes from any seat in play); normal does better than easy; and the same view gives the same move
// however the hidden cards lie. Lantern, silent-table and misery time their own computers
// (`GameModule.botTime`): played here as the room does, the seat whose clock runs out first moves.
import { describe, expect, it, vi } from 'vitest'
import { getGame } from '../../shared/games/index.ts'
import { kiteBot, readNotes } from '../../shared/games/kite/bot.ts'
import { kite } from '../../shared/games/kite/rules.ts'
import type { KiteState } from '../../shared/games/kite/types.ts'
import { LANTERN_BASE_MS, LANTERN_STEP_MS, lanternBot, lanternBotTime, lanternWait } from '../../shared/games/lantern/bot.ts'
import { lantern } from '../../shared/games/lantern/rules.ts'
import type { LanternState } from '../../shared/games/lantern/types.ts'
import { makeSeats, projectGame } from '../../shared/games/match.ts'
import { candidates, gapShares, miseryBot } from '../../shared/games/misery/bot.ts'
import { misery } from '../../shared/games/misery/rules.ts'
import type { MiseryState } from '../../shared/games/misery/types.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { handStrength, madeStrength, silentTableBot } from '../../shared/games/silent-table/bot.ts'
import { silentTable } from '../../shared/games/silent-table/rules.ts'
import type { SilentTableState } from '../../shared/games/silent-table/types.ts'
import { botLegal, isGameError, type AnyGameModule, type OptionValues, type SeatId } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'

vi.setConfig({ testTimeout: 240_000 })

const sameAction = (a: JsonValue, b: JsonValue) => JSON.stringify(a) === JSON.stringify(b)

type Played = { state: JsonValue; over: boolean; offList: string[]; firsts: number[]; ms: number }

/**
 * A whole game with a computer in every seat, as the room plays it: with `botTime` the seat whose
 * wait is shortest moves (ties to the lower seat), else the first seat with something to do; when
 * nobody will move, the earliest timer fires
 */
function playBots(
  module: AnyGameModule,
  seats: number,
  options: OptionValues,
  seed: number,
  levels: readonly string[],
  maxMoves = 20_000,
): Played {
  const game = createRng(seed)
  const choose = createRng(seed ^ 0x5bd1e995)
  let state = module.init(makeSeats(seats), options as never, game)
  const offList: string[] = []
  let moves = 0
  let ms = 0
  while (!module.isOver(state) && moves < maxMoves) {
    let mover: { seat: number; wait: number } | null = null
    for (let seat = 0; seat < seats; seat++) {
      const { view, legal: all } = projectGame(module, state, seat)
      const legal = botLegal(module, all)
      const level = levels[seat % levels.length]
      const wait = module.botTime
        ? module.botTime(view, legal, level, createRng(seed + moves * 131 + seat))
        : legal.length > 0 || module.bot!(view, [], level, createRng(0)) !== null
          ? 1000
          : null
      if (wait !== null && (mover === null || wait < mover.wait)) mover = { seat, wait }
      if (!module.botTime && mover) break
    }
    if (mover === null) {
      const timer = module.timers?.(state)[0]
      if (!timer) throw new Error(`${module.id}: nobody moves and no timer (move ${moves})`)
      const next = module.reduce(state, timer.action, 'system', game)
      if (isGameError(next)) throw new Error(`timer ${timer.id}: ${next.gameError}`)
      state = next
      continue
    }
    const { view, legal: all } = projectGame(module, state, mover.seat)
    const legal = botLegal(module, all)
    const wanted = module.bot!(view, legal, levels[mover.seat % levels.length], choose)
    const action = wanted ?? choose.pick(legal)
    if (!all.some((one) => sameAction(one, action))) offList.push(JSON.stringify(action))
    const next = module.reduce(state, action, mover.seat as SeatId, game)
    if (isGameError(next)) throw new Error(`seat ${mover.seat} ${JSON.stringify(action)}: ${next.gameError}`)
    state = next
    ms += mover.wait
    moves++
  }
  const firsts = module.isOver(state)
    ? module.result(state).standings.filter((one) => one.rank === 1).map((one) => one.seat as number)
    : []
  return { state, over: module.isOver(state), offList, firsts, ms }
}

const NEW_GAMES = ['kite', 'lantern', 'silent-table', 'misery'] as const
const mod = (id: string) => getGame(id) as AnyGameModule

describe('a table of computers plays every new game to its end', () => {
  const cases: { id: string; seats: number; options?: OptionValues; seeds: number }[] = [
    { id: 'kite', seats: 2, seeds: 3 },
    { id: 'kite', seats: 5, options: { rainbow: true, turnSeconds: 0 }, seeds: 3 },
    { id: 'lantern', seats: 2, seeds: 3 },
    { id: 'lantern', seats: 6, seeds: 3 },
    { id: 'silent-table', seats: 3, options: { levelsToWin: 2, failureLimit: 2 }, seeds: 2 },
    { id: 'silent-table', seats: 6, options: { levelsToWin: 1, failureLimit: 1, allowTakeFromPlayers: false }, seeds: 2 },
    { id: 'misery', seats: 2, seeds: 3 },
    { id: 'misery', seats: 10, options: { steals: true, target: 8 }, seeds: 2 },
  ]
  for (const { id, seats, options, seeds } of cases) {
    for (const levels of [['normal'], ['easy'], ['easy', 'normal']]) {
      it(`${id}, ${seats} seats, ${levels.join(' and ')}`, () => {
        const module = mod(id)
        for (let seed = 1; seed <= seeds; seed++) {
          const played = playBots(module, seats, { ...defaultOptions(module.options), ...options }, seed * 7919, levels)
          expect(played.over, `seed ${seed}`).toBe(true)
          // Off the list only lantern's agreeing to moonlight, which reduce takes from anyone in play
          for (const action of played.offList) expect(action).toContain('"moon"')
        }
      })
    }
  }

  it('each has the shared levels and names, and says so in the lobby', () => {
    for (const id of NEW_GAMES) {
      expect(mod(id).bot, id).toBeDefined()
      expect(mod(id).meta.computer, id).toBe(true)
    }
  })
})

describe('normal plays better than easy (the table’s score, co-operatively)', () => {
  const average = (id: string, seats: number, level: string, seeds: number, score: (state: never) => number, options?: OptionValues) => {
    let sum = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const module = mod(id)
      const played = playBots(module, seats, { ...defaultOptions(module.options), ...options }, seed * 104729, [level])
      sum += score(played.state as never)
    }
    return sum / seeds
  }

  it('kite: kites flying at the end', () => {
    const flying = (state: KiteState) => Object.values(state.stacks).reduce((sum: number, one) => sum + (one ?? 0), 0)
    const normal = average('kite', 3, 'normal', 12, flying)
    const easy = average('kite', 3, 'easy', 12, flying)
    expect(normal).toBeGreaterThan(17)
    expect(normal).toBeGreaterThan(easy + 6)
  })

  it('lantern: levels cleared', () => {
    const cleared = (state: LanternState) => state.level - (state.ending === 'won' ? 0 : 1)
    const normal = average('lantern', 3, 'normal', 12, cleared)
    const easy = average('lantern', 3, 'easy', 12, cleared)
    expect(normal).toBeGreaterThan(easy + 2)
  })

  it('silent-table: share of levels passed', () => {
    const passed = (state: SilentTableState) => (state.level - state.failures) / state.level
    const options = { levelsToWin: 3, failureLimit: 3 }
    const normal = average('silent-table', 3, 'normal', 10, passed, options)
    const easy = average('silent-table', 3, 'easy', 10, passed, options)
    expect(normal).toBeGreaterThan(easy + 0.1)
  })

  it('misery: normal in one seat of three comes first far more than its share', () => {
    let normal = 0
    const games = 30
    for (let seed = 1; seed <= games; seed++) {
      const seat = seed % 3
      const levels = [0, 1, 2].map((one) => (one === seat ? 'normal' : 'easy'))
      const played = playBots(mod('misery'), 3, defaultOptions(misery.options), seed * 104729, levels)
      if (played.firsts.includes(seat)) normal += 1 / played.firsts.length
    }
    expect(normal / games).toBeGreaterThan(0.5)
  })
})

describe('only their own view', () => {
  it('kite: the same view gives the same move, whatever its own kites and the deck really are', () => {
    const state = kite.init(makeSeats(3), defaultOptions(kite.options), createRng(8))
    // Seat 0's kites swapped for the first ones of the deck (the notes it knows of still fit: none yet)
    const swapped: KiteState = {
      ...state,
      hands: state.hands.map((hand, index) => (index === 0 ? state.deck.slice(0, hand.length).map((card, at) => ({ ...card, id: hand[at].id })) : hand)),
      deck: [...state.hands[0], ...state.deck.slice(state.hands[0].length)].reverse(),
    }
    const a = projectGame(kite, state, 0)
    const b = projectGame(kite, swapped, 0)
    expect(a.view).toEqual(b.view)
    for (const level of ['normal', 'easy']) {
      expect(kiteBot(a.view, a.legal, level, createRng(4))).toEqual(kiteBot(b.view, b.legal, level, createRng(4)))
    }
  })

  it('lantern: the same view gives the same move and the same wait, whatever the others hold', () => {
    let state = lantern.init(makeSeats(3), defaultOptions(lantern.options), createRng(3))
    for (const seat of [0, 1, 2]) state = lantern.reduce(state, { type: 'ready' }, seat, createRng(1)) as LanternState
    state = { ...state, players: state.players.map((player) => ({ ...player, hand: [] })) }
    const deal = (others: number[][]): LanternState => ({
      ...state,
      players: state.players.map((player, index) => ({ ...player, hand: index === 0 ? [40] : others[index - 1] })),
    })
    const a = projectGame(lantern, deal([[12], [77]]), 0)
    const b = projectGame(lantern, deal([[90], [55]]), 0)
    expect(a.view).toEqual(b.view)
    expect(lanternBot(a.view, botLegal(lantern, a.legal))).toEqual(lanternBot(b.view, botLegal(lantern, b.legal)))
    expect(lanternBotTime(a.view, 'normal', createRng(5))).toBe(lanternBotTime(b.view, 'normal', createRng(5)))
  })

  it('silent-table: the same view gives the same move, whatever the others hold and the cards to come', () => {
    const state = silentTable.init(makeSeats(4), defaultOptions(silentTable.options), createRng(6))
    const rest = [...state.players.slice(1).flatMap((player) => player.hole), ...state.community.slice(3)].reverse()
    const scrambled: SilentTableState = {
      ...state,
      players: state.players.map((player, index) => (index === 0 ? player : { ...player, hole: rest.slice((index - 1) * 2, index * 2) })),
      community: [...state.community.slice(0, 3), ...rest.slice(6, 8)],
    }
    const a = projectGame(silentTable, state, 0)
    const b = projectGame(silentTable, scrambled, 0)
    expect(a.view).toEqual(b.view)
    for (const level of ['normal', 'easy']) {
      expect(silentTableBot(a.view, a.legal, level)).toEqual(silentTableBot(b.view, b.legal, level))
    }
  })

  it('misery: the same view gives the same move, whatever the card’s index and the deck', () => {
    const state = misery.init(makeSeats(3), defaultOptions(misery.options), createRng(2))
    const guesser = state.guesser
    const scrambled: MiseryState = {
      ...state,
      current: { ...state.current!, id: 1, index: state.current!.index === 100 ? 1 : 100 },
      deck: [...state.deck].reverse(),
    }
    const a = projectGame(misery, state, guesser)
    const b = projectGame(misery, scrambled, guesser)
    expect(a.view).toEqual(b.view)
    for (const level of ['normal', 'easy']) {
      expect(miseryBot(a.view, a.legal, level, createRng(3))).toEqual(miseryBot(b.view, b.legal, level, createRng(3)))
    }
  })
})

describe('the policies', () => {
  it('kite reads a note by its focus: fly it when something fitting can fly, keep it when nothing can', () => {
    let state = kite.init(makeSeats(2), defaultOptions(kite.options), createRng(1))
    const target = state.hands[1]
    // A number note for 5 at the start: nothing fitting can fly, so it is a save
    const five = target.find((card) => card.rank === 5)
    const one = target.find((card) => card.rank === 1)
    const hint = five ? { type: 'hintRank' as const, to: 1, rank: 5 as const } : one ? { type: 'hintRank' as const, to: 1, rank: 1 as const } : null
    if (!hint) return
    state = kite.reduce(state, hint, 0, createRng(1)) as KiteState
    const { view } = projectGame(kite, state, 1)
    const { marks } = readNotes(view)
    const focus = target.find((card) => card.rank === hint.rank)!
    expect(marks.get(focus.id)?.kind).toBe(hint.rank === 5 ? 'save' : 'play')
  })

  it('lantern waits longer the further its lowest lantern is above the avenue, and not at all for a gap of none', () => {
    let state = lantern.init(makeSeats(2), defaultOptions(lantern.options), createRng(3))
    for (const seat of [0, 1]) state = lantern.reduce(state, { type: 'ready' }, seat, createRng(1)) as LanternState
    const withHand = (mine: number): LanternState => ({
      ...state,
      players: state.players.map((player, index) => ({ ...player, hand: index === 0 ? [mine] : [99] })),
    })
    const wait = (mine: number) => lanternWait(projectGame(lantern, withHand(mine), 0).view)!
    expect(wait(1)).toBe(LANTERN_BASE_MS)
    expect(wait(11)).toBe(LANTERN_BASE_MS + 10 * LANTERN_STEP_MS)
    expect(wait(30)).toBeGreaterThan(wait(20))
  })

  it('silent-table: aces are strong, seven-two on a dry board is weak, and easy reads only what is made', () => {
    expect(handStrength(['As', 'Ad'], ['Ac', '7h', '2d'])).toBeGreaterThan(0.95)
    expect(handStrength(['7d', '2c'], ['As', 'Kh', 'Qd'])).toBeLessThan(0.25)
    expect(madeStrength(['As', 'Ad'], ['Kc', '7h', '2d'])).toBeGreaterThan(madeStrength(['As', 'Kd'], ['Qc', '7h', '2d']))
  })

  it('misery counts the indexes still out there into the gaps, and a wrong try rules its range out', () => {
    expect(gapShares([20, 60], [10, 20, 30, 70])).toEqual([2, 2, 1])
    const state = misery.init(makeSeats(2), defaultOptions(misery.options), createRng(2))
    const { view } = projectGame(misery, state, state.guesser)
    const before = candidates(view)
    const tried = { ...view, attempts: [{ seat: 9, gap: 0, low: null, high: 50, right: false }] }
    const after = candidates(tried)
    expect(after.every((index) => index > 50)).toBe(true)
    expect(after.length).toBeLessThan(before.length)
  })
})
