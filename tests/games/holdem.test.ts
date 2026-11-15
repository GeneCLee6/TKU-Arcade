import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import {
  bigBlindFor,
  categoryOf,
  FOLD_PAUSE_MS,
  holdem,
  SHOWDOWN_PAUSE_MS,
  sidePots,
  splitPot,
  startHand,
} from '../../shared/games/holdem/rules.ts'
import type { HoldemAction, HoldemOptions, HoldemState } from '../../shared/games/holdem/types.ts'
import { isGameError, type Actor, type GameError, type Rng, type Viewer } from '../../shared/games/types.ts'
import { bestHand, fullDeck, HAND_CATEGORIES, type Card } from '../../shared/poker/hand.ts'
import type { JsonValue } from '../../shared/patch.ts'
import { playRandom } from './harness.ts'

// 德州撲克 (Texas Hold'em, no-limit), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: HoldemOptions = { stack: 1000, blinds: 20, blindUp: 10, timer: 30 }

const cards = (text: string) => (text === '' ? [] : (text.split(' ') as Card[]))

/** An Rng whose shuffle deals exactly `deck` */
function stacked(deck: Card[]): Rng {
  return {
    float: () => 0,
    int: () => 0,
    pick: (items) => items[0],
    shuffle: <T,>() => [...deck] as unknown as T[],
  }
}

type Table = {
  stacks: number[]
  /** Hole cards of each player with chips, in seat order: "As Kd" */
  holes: string[]
  board?: string
  button?: number
  options?: Partial<HoldemOptions>
  hand?: number
}

/** A hand dealt with these stacks and these cards; a stack of 0 is a player already out */
function table({ stacks, holes, board = '', button = 0, options = {}, hand = 0 }: Table): HoldemState {
  const opts = { ...OPTIONS, ...options }
  const base = holdem.init(makeSeats(stacks.length), opts, createRng(1))
  const fresh: HoldemState = {
    ...base,
    hand,
    bb: bigBlindFor(opts, Math.max(1, hand)),
    players: base.players.map((player, seat) => ({
      ...player,
      stack: stacks[seat],
      out: stacks[seat] === 0,
      hole: [],
      bet: 0,
      committed: 0,
    })),
    log: [],
    history: [],
  }
  const chosen = [...holes.flatMap(cards), ...cards(board)]
  const deck = [...chosen, ...fullDeck().filter((card) => !chosen.includes(card))]
  return startHand(fresh, button, stacked(deck))
}

function act(state: HoldemState, action: HoldemAction, actor: Actor): HoldemState {
  const next = holdem.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

/** Plays `[seat, action]` in order, checking each seat is the one asked */
function play(state: HoldemState, ...moves: [number, HoldemAction][]): HoldemState {
  return moves.reduce((next, [seat, action]) => {
    expect(next.phase).toEqual({ kind: 'bet', toAct: seat })
    return act(next, action, seat)
  }, state)
}

const refusal = (state: HoldemState, action: unknown, actor: Actor): string => {
  const answer = holdem.reduce(state, action as HoldemAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.holdem.error.${name}`
const stacks = (state: HoldemState) => state.players.map((player) => player.stack)
const toAct = (state: HoldemState) => (state.phase.kind === 'bet' ? state.phase.toAct : null)
const FOLD: HoldemAction = { type: 'fold' }
const CHECK: HoldemAction = { type: 'check' }
const CALL: HoldemAction = { type: 'call' }
const raise = (to: number): HoldemAction => ({ type: 'raise', to })

/** What `viewer` must never see: the deck, and everyone else's cards unless shown at the showdown */
function secrets(state: HoldemState, viewer: Viewer): JsonValue[] {
  const shown = new Set(state.last?.hand === state.hand ? state.last.shown.map((one) => one.seat) : [])
  const hidden: string[] = [...state.deck]
  for (const player of state.players) {
    if (player.seat !== viewer && !shown.has(player.seat)) hidden.push(...player.hole)
  }
  return hidden
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('holdem')).toBe(holdem)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('holdem')
    expect(defaultOptions(holdem.options)).toEqual(OPTIONS)
    expect(holdem.meta).toMatchObject({ minPlayers: 2, maxPlayers: 9 })
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.holdem.name']).toBeTruthy()
      for (const category of [...HAND_CATEGORIES, 'royalFlush']) {
        expect(SCREEN_MESSAGES[language][`games.holdem.hand.${category}`]).toBeTruthy()
      }
    }
  })
})

describe('the hand evaluator, on the cases that trip people up', () => {
  const hand = (text: string) => bestHand(cards(text))
  const name = (text: string) => categoryOf(hand(text))

  // [stronger, weaker], seven cards each (two hole cards and the same board, or not)
  const BEATS: [string, string, string][] = [
    ['a six-high straight beats the wheel', '6c 2d 3h 4s 5c Kd Kh', 'Ac 2d 3h 4s 5c Kd Kh'],
    ['the wheel beats three of a kind', 'Ac 2d 3h 4s 5c 5d 5h', 'Kc Kd Kh 4s 9c Td 2h'],
    ['the ace-high straight beats the king-high', 'Ac Kd Qh Js Tc 3d 2h', 'Kc Qd Jh Ts 9c 3d 2h'],
    ['a six-high straight flush beats the five-high one', '6h 2h 3h 4h 5h Kd Kc', 'Ah 2h 3h 4h 5h Kd Kc'],
    ['a royal flush beats four aces', 'Ah Kh Qh Jh Th Ad Ac', 'Ah Ad Ac As Kd Qc 2h'],
    ['four of a kind with the better kicker', '9c 9d 9h 9s Ac 2d 3h', '9c 9d 9h 9s Kc 2d 3h'],
    ['a full house is read triples first', 'Kc Kd Kh 2s 2c 7d 8h', 'Qc Qd Qh As Ac 7d 8h'],
    ['of two triples the higher makes the full house', 'Kc Kd Kh 2s 2c 2d 8h', 'Qc Qd Qh Js Jc 3d 8h'],
    ['a flush beats a straight', '2h 7h 9h Jh Kh Td Qc', 'Ac Kd Qh Js Tc 3d 2h'],
    ['the higher flush card by card, down to the fifth', 'Ah Kh 9h 7h 4h 2c 3d', 'Ah Kh 9h 7h 3h 2c 5d'],
    ['six suited cards: the top five count', 'Ah 2h 3h 4h 6h 9h Kc', 'Ah 2h 3h 4h 6h 8h Kc'],
    ['three of a kind beats two pair', '5c 5d 5h Ks 2c 3d 8h', 'Ac Ad Kh Ks 2c 3d 8h'],
    ['the higher top pair of two', 'Ac Ad 3h 3s 2c 7d 8h', 'Kc Kd Qh Qs 2c 7d 8h'],
    ['two pair: the second pair decides', 'Ac Ad 4h 4s 2c 7d 8h', 'Ac Ad 3h 3s 2c 7d 8h'],
    ['two pair: the kicker decides', 'Ac Ad 4h 4s Kc 7d 8h', 'Ac Ad 4h 4s Qc 7d 8h'],
    ['three pairs: the best two and the best fifth card', 'Ac Ad Kh Ks 3c 3d Qh', 'Ac Ad Kh Ks 3c 3d Jh'],
    ['a pair of aces beats a pair of kings', 'Ac Ad 2h 4s 6c 8d Th', 'Kc Kd 2h 4s 6c 8d Th'],
    ['a pair: the third kicker decides', 'Ac Ad Kh Qs 9c 3d 2h', 'Ac Ad Kh Qs 8c 3d 2h'],
    ['high card to the fifth card', 'Ac Kd 9h 7s 5c 3d 2h', 'Ac Kd 9h 7s 4c 3d 2h'],
  ]
  it.each(BEATS)('%s', (_, strong, weak) => {
    expect(hand(strong).score).toBeGreaterThan(hand(weak).score)
  })

  // The same value: a split pot
  const TIES: [string, string, string][] = [
    ['the board plays for both', 'Ac Kc Qc Jc 9d 2h 3s', 'Ac Kc Qc Jc 9d 4h 5s'],
    ['kickers beyond the fifth card do not count', 'Ac Ad Kh Qs Jc 3d 2h', 'Ac Ad Kh Qs Jc 4d 5h'],
    ['same straight, different suits', '5c 6d 7h 8s 9c Kd 2h', '5d 6h 7s 8c 9d Kc 2s'],
    ['four of a kind on the board, the ace kicker on it too', '7c 7d 7h 7s Ac 2d 3h', '7c 7d 7h 7s Ac Kd Qh'],
  ]
  it.each(TIES)('ties: %s', (_, a, b) => {
    expect(hand(a).score).toBe(hand(b).score)
  })

  it('names every category, the royal flush apart', () => {
    expect(name('Ah Kh Qh Jh Th 2c 3d')).toBe('royalFlush')
    expect(name('Kh Qh Jh Th 9h 2c 3d')).toBe('straightFlush')
    expect(name('Ah 2h 3h 4h 5h 9c 9d')).toBe('straightFlush')
    expect(name('9c 9d 9h 9s 2c 3d 5h')).toBe('fourOfAKind')
    expect(name('9c 9d 9h 2s 2c 3d 5h')).toBe('fullHouse')
    expect(name('2h 7h 9h Jh Kh Td Qc')).toBe('flush')
    expect(name('Ac 2d 3h 4s 5c 9d Kh')).toBe('straight')
    expect(name('9c 9d 9h 2s 4c 6d Kh')).toBe('threeOfAKind')
    expect(name('9c 9d 2h 2s 4c 6d Kh')).toBe('twoPair')
    expect(name('9c 9d 2h 3s 5c 6d Kh')).toBe('pair')
    expect(name('9c Jd 2h 3s 5c 6d Kh')).toBe('highCard')
  })

  it('picks the five cards that make the wheel, the ace last', () => {
    expect(hand('Ac 2d 3h 4s 5c Kd Kh').best).toEqual(cards('5c 4s 3h 2d Ac'))
  })
})

describe('the blinds and who acts first', () => {
  it('three or more: small blind left of the button, then the big blind; the next seat opens', () => {
    const state = table({ stacks: [1000, 1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h', '2s 3s'], button: 1 })
    expect(state).toMatchObject({ button: 1, sbSeat: 2, bbSeat: 3, currentBet: 20, minRaise: 20 })
    expect(stacks(state)).toEqual([1000, 1000, 990, 980])
    expect(toAct(state)).toBe(0)
    // After the flop the first seat left of the button still in opens
    const flop = play(state, [0, CALL], [1, CALL], [2, FOLD], [3, CHECK])
    expect(flop.street).toBe('flop')
    expect(flop.board).toHaveLength(3)
    expect(toAct(flop)).toBe(3)
  })

  it('heads-up: the button posts the small blind and acts first before the flop, last after it', () => {
    const state = table({ stacks: [1000, 1000], holes: ['2c 3c', '2d 3d'], button: 1 })
    expect(state).toMatchObject({ sbSeat: 1, bbSeat: 0 })
    expect(stacks(state)).toEqual([980, 990])
    expect(toAct(state)).toBe(1)
    const flop = play(state, [1, CALL], [0, CHECK])
    expect(toAct(flop)).toBe(0)
  })

  it('the big blind may still raise when everyone just called', () => {
    const state = play(table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] }), [0, CALL], [1, CALL])
    expect(toAct(state)).toBe(2)
    expect(holdem.legalActions(state, 2).map((action) => action.type)).toEqual(['check', 'raise', 'raise', 'raise', 'raise'])
  })

  it('double every N hands when the host asks', () => {
    expect([1, 10, 11, 20, 21, 31].map((hand) => bigBlindFor(OPTIONS, hand))).toEqual([20, 20, 40, 40, 80, 160])
    expect(bigBlindFor({ ...OPTIONS, blindUp: 0 }, 99)).toBe(20)
    const state = table({ stacks: [1000, 1000], holes: ['2c 3c', '2d 3d'], hand: 10 })
    expect(state).toMatchObject({ hand: 11, sb: 20, bb: 40 })
    expect(state.log).toContainEqual({ k: 'blindsUp', sb: 20, bb: 40 })
    expect(holdem.view(state, 0).nextBlindsUp).toBe(21)
  })

  it('a big blind short of chips is all in and only has to be matched that far', () => {
    const state = table({ stacks: [1000, 1000, 15], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    expect(state.players[2]).toMatchObject({ bet: 15, allIn: true })
    expect(state.currentBet).toBe(15)
  })
})

describe('bets and raises', () => {
  const three = () => table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] })

  it('a raise is at least the last raise: 20 → 40, then 40 → 100 lets the next go to 160', () => {
    let state = three()
    expect(refusal(state, raise(39), 0)).toBe(error('tooSmall'))
    expect(refusal(state, raise(1001), 0)).toBe(error('tooBig'))
    state = play(state, [0, raise(40)])
    expect(state).toMatchObject({ currentBet: 40, minRaise: 20 })
    expect(refusal(state, raise(59), 1)).toBe(error('tooSmall'))
    state = play(state, [1, raise(100)])
    expect(state).toMatchObject({ currentBet: 100, minRaise: 60 })
    expect(refusal(state, raise(159), 2)).toBe(error('tooSmall'))
    state = play(state, [2, raise(160)])
    expect(state.log.at(-1)).toEqual({ k: 'raise', seat: 2, to: 160, allIn: false })
  })

  it('the first bet after the flop is at least the big blind', () => {
    const state = play(three(), [0, CALL], [1, CALL], [2, CHECK])
    expect(toAct(state)).toBe(1)
    expect(refusal(state, raise(19), 1)).toBe(error('tooSmall'))
    const bet = play(state, [1, raise(20)])
    expect(bet.log.at(-1)).toEqual({ k: 'bet', seat: 1, to: 20, allIn: false })
  })

  it('refuses checking into a bet, folding when you could check, calling nothing, and acting out of turn', () => {
    const state = three()
    expect(refusal(state, CHECK, 0)).toBe(error('mustCall'))
    expect(refusal(state, CALL, 1)).toBe(error('notYourTurn'))
    const option = play(state, [0, CALL], [1, CALL])
    expect(refusal(option, FOLD, 2)).toBe(error('checkInstead'))
    expect(refusal(option, CALL, 2)).toBe(error('nothingToCall'))
  })

  it('offers the smallest raise, half the pot, the pot and all in', () => {
    const state = play(three(), [0, CALL], [1, CALL], [2, CHECK])
    // Pot 60: min 20, half 30, pot 60, all in 980
    expect(holdem.legalActions(state, 1)).toEqual([CHECK, raise(20), raise(30), raise(60), raise(980)])
    const facing = play(state, [1, raise(60)])
    // Facing 60 into 120: to call 60 makes 180; half is 60 + 90, the pot 60 + 180
    expect(holdem.legalActions(facing, 2)).toEqual([FOLD, CALL, raise(120), raise(150), raise(240), raise(980)])
  })

  it('an all-in short of a full raise does not reopen the betting to whoever has acted', () => {
    // Everyone calls 20; on the flop seat 1 bets 100, seat 2 is all in for 150 (a full raise would be 200)
    let state = table({ stacks: [1000, 1000, 170], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    state = play(state, [0, CALL], [1, CALL], [2, CHECK], [1, raise(100)], [2, raise(150)])
    expect(state).toMatchObject({ currentBet: 150, minRaise: 100 })
    // Seat 0 has not acted: it may raise, from 250
    expect(holdem.legalActions(state, 0)).toContainEqual(raise(250))
    expect(refusal(state, raise(249), 0)).toBe(error('tooSmall'))
    state = play(state, [0, CALL])
    // Seat 1 bet before the short all-in: call or fold only
    expect(holdem.legalActions(state, 1)).toEqual([FOLD, CALL])
    expect(refusal(state, raise(400), 1)).toBe(error('cannotRaise'))
    state = play(state, [1, CALL])
    expect(state.street).toBe('turn')
  })

  it('short all-ins that add up to a full raise do reopen it', () => {
    // On the flop seat 1 bets 100; seat 2 is all in for 130, seat 3 for 200: 100 more than seat 1's bet
    let state = table({ stacks: [1000, 1000, 150, 220], holes: ['2c 3c', '2d 3d', '2h 3h', '2s 3s'] })
    state = play(state, [3, CALL], [0, CALL], [1, CALL], [2, CHECK], [1, raise(100)], [2, raise(130)], [3, raise(200)])
    expect(state).toMatchObject({ currentBet: 200, minRaise: 100 })
    state = play(state, [0, CALL])
    expect(holdem.legalActions(state, 1)).toContainEqual(raise(300))
  })

  it('a full raise all in reopens the betting', () => {
    let state = table({ stacks: [1000, 1000, 320], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    state = play(state, [0, CALL], [1, CALL], [2, CHECK], [1, raise(100)], [2, raise(300)])
    expect(state).toMatchObject({ currentBet: 300, minRaise: 200 })
    state = play(state, [0, CALL])
    expect(holdem.legalActions(state, 1)).toContainEqual(raise(500))
  })

  it('nobody may raise into players who are all in, only call', () => {
    const state = play(table({ stacks: [1000, 1000, 300], holes: ['2c 3c', '2d 3d', '2h 3h'] }), [0, FOLD], [1, raise(1000)])
    expect(holdem.legalActions(state, 2)).toEqual([FOLD, CALL])
  })
})

describe('the end of a hand', () => {
  it('everyone folds: the uncalled raise comes back and the winner shows nothing', () => {
    let state = table({ stacks: [1000, 1000, 1000], holes: ['Ac Ad', '2d 7c', '3h 8s'] })
    state = play(state, [0, raise(100)], [1, FOLD], [2, FOLD])
    expect(state.phase).toEqual({ kind: 'handEnd' })
    expect(stacks(state)).toEqual([1030, 990, 980])
    expect(state.log).toContainEqual({ k: 'return', seat: 0, amount: 80 })
    expect(state.last).toMatchObject({ showdown: false, shown: [], pots: [{ amount: 50, category: null }] })
    for (const viewer of [1, 2, 'spectator'] as const) {
      expect(JSON.stringify(holdem.view(state, viewer))).not.toMatch(/"Ac"|"Ad"/)
    }
    expect(holdem.timers?.(state)).toEqual([{ id: 'holdem-next-1', ms: FOLD_PAUSE_MS, action: { type: 'next', hand: 1 } }])
  })

  it('an all-in bigger than the caller’s stack gets the difference back', () => {
    let state = table({ stacks: [1000, 300], holes: ['Ac Ad', 'Kc Kd'], board: '2c 7d 9h Js 3s', button: 1 })
    state = play(state, [1, CALL], [0, raise(1000)], [1, CALL])
    expect(state.log).toContainEqual({ k: 'return', seat: 0, amount: 700 })
    // Aces hold: seat 0 wins 600
    expect(stacks(state)).toEqual([1300, 0])
  })

  it('splits four all-ins into a main pot and two side pots', () => {
    // 100, 200, 300 and 1000 all in before the flop; the shorter the stack, the better the hand
    let state = table({
      stacks: [100, 200, 300, 1000],
      holes: ['Ac Ad', 'Kc Kd', 'Qc Qd', '4h 5d'],
      board: '2c 7d 9h Js 3s',
      button: 3,
    })
    state = play(state, [2, raise(300)], [3, CALL], [0, CALL], [1, CALL])
    expect(state.board).toEqual(cards('2c 7d 9h Js 3s'))
    expect(state.last?.pots).toEqual([
      { amount: 400, winners: [{ seat: 0, amount: 400 }], category: 'pair' },
      { amount: 300, winners: [{ seat: 1, amount: 300 }], category: 'pair' },
      { amount: 200, winners: [{ seat: 2, amount: 200 }], category: 'pair' },
    ])
    expect(stacks(state)).toEqual([400, 300, 200, 700])
    // Everyone was all in: every hand is turned up
    expect(state.last?.shown.map((one) => one.seat).sort()).toEqual([0, 1, 2, 3])
    expect(state.outOrder).toEqual([])
  })

  it('three all-ins where the biggest stack wins: the others bust, the smaller one first', () => {
    let state = table({
      stacks: [100, 250, 400, 1000],
      holes: ['4h 5d', '6c 8d', 'Kc Kd', 'Ac Ad'],
      board: '2c 7d 9h Js 3s',
      button: 3,
    })
    state = play(state, [2, raise(400)], [3, CALL], [0, CALL], [1, CALL])
    expect(stacks(state)).toEqual([0, 0, 0, 1750])
    expect(state.outOrder).toEqual([0, 1, 2])
    expect(state.log.filter((line) => line.k === 'bust')).toHaveLength(3)
  })

  it('a side pot the short stack cannot win goes to the best of the rest, with a split in the main pot', () => {
    // Seats 0 and 1 tie on the board's straight; seat 2 is all in for less and loses
    let state = table({
      stacks: [1000, 1000, 100],
      holes: ['2c 2d', '3c 3d', '4c 4d'],
      board: 'Th Js Qd Kh Ac',
      button: 2,
    })
    state = play(state, [2, raise(100)], [0, raise(500)], [1, CALL])
    state = play(state, [0, CHECK], [1, CHECK], [0, CHECK], [1, CHECK], [0, CHECK], [1, CHECK])
    // Main pot 300 split three ways (the board's straight for all); side pot 800 split two ways
    expect(state.last?.pots.map((pot) => [pot.amount, pot.winners.map((win) => win.amount)])).toEqual([
      [300, [100, 100, 100]],
      [800, [400, 400]],
    ])
  })

  it('an odd chip goes to the first winner left of the button', () => {
    // Blinds 5/10: the button calls, the small blind folds, the big blind checks; a pot of 25
    let state = table({
      stacks: [1000, 1000, 1000],
      holes: ['2c 3d', '4c 5d', '2d 3c'],
      board: 'Th Js Qd Kh Ac',
      options: { blinds: 10 },
    })
    state = play(state, [0, CALL], [1, FOLD], [2, CHECK], [2, CHECK], [0, CHECK], [2, CHECK], [0, CHECK], [2, CHECK], [0, CHECK])
    // Seat 2 is left of the button (seat 0) before seat 0 comes round again
    expect(state.last?.pots).toEqual([
      { amount: 25, winners: [{ seat: 2, amount: 13 }, { seat: 0, amount: 12 }], category: 'straight' },
    ])
    expect(splitPot(101, [4, 1, 2])).toEqual([
      { seat: 4, amount: 34 },
      { seat: 1, amount: 34 },
      { seat: 2, amount: 33 },
    ])
  })

  it('works out side pots for any number of all-ins, folded chips included', () => {
    expect(
      sidePots([
        { seat: 0, committed: 50, folded: false },
        { seat: 1, committed: 200, folded: false },
        { seat: 2, committed: 120, folded: true },
        { seat: 3, committed: 200, folded: false },
        { seat: 4, committed: 80, folded: false },
      ]),
    ).toEqual([
      { amount: 250, eligible: [0, 1, 3, 4] },
      { amount: 120, eligible: [1, 3, 4] },
      { amount: 280, eligible: [1, 3] },
    ])
    const total = sidePots([
      { seat: 0, committed: 300, folded: true },
      { seat: 1, committed: 100, folded: false },
      { seat: 2, committed: 200, folded: false },
    ])
    expect(total.reduce((sum, pot) => sum + pot.amount, 0)).toBe(600)
    expect(total.at(-1)).toEqual({ amount: 300, eligible: [2] })
  })

  it('at a showdown the loser who did not bet last mucks unseen', () => {
    // River: seat 1 bets, seat 0 calls and loses: seat 1 shows first, seat 0 mucks
    let state = table({ stacks: [1000, 1000], holes: ['2c 3d', 'Ac Ad'], board: '7h 8s Td Jc 4h' })
    state = play(state, [0, CALL], [1, CHECK], [1, CHECK], [0, CHECK], [1, CHECK], [0, CHECK], [1, raise(50)], [0, CALL])
    expect(state.last?.shown.map((one) => one.seat)).toEqual([1])
    expect(state.last?.mucked).toEqual([0])
    expect(state.last?.shown[0]).toMatchObject({ category: 'pair', best: cards('Ad Ac Jc Td 8s') })
    for (const viewer of [1, 'spectator'] as const) {
      const text = JSON.stringify(holdem.view(state, viewer))
      expect(text).not.toContain('"2c"')
      expect(text).not.toContain('"3d"')
    }
    expect(holdem.view(state, 0).hole).toEqual(cards('2c 3d'))
    expect(holdem.view(state, 0).players[1].shown).toEqual(cards('Ac Ad'))
    expect(holdem.timers?.(state)).toEqual([{ id: 'holdem-next-1', ms: SHOWDOWN_PAUSE_MS, action: { type: 'next', hand: 1 } }])
  })

  it('a caller who wins shows, after the bettor', () => {
    let state = table({ stacks: [1000, 1000], holes: ['Ac Ad', '2c 3d'], board: '7h 8s Td Jc 4h' })
    state = play(state, [0, CALL], [1, CHECK], [1, CHECK], [0, CHECK], [1, CHECK], [0, CHECK], [1, raise(50)], [0, CALL])
    expect(state.last?.shown.map((one) => one.seat)).toEqual([1, 0])
    expect(stacks(state)).toEqual([1070, 930])
  })
})

describe('busting and the button', () => {
  it('the button moves to the next player with chips, past busted seats', () => {
    let state = table({ stacks: [1000, 0, 1000, 1000], holes: ['2c 3c', '2h 3h', '2s 3s'], button: 0 })
    expect(state).toMatchObject({ sbSeat: 2, bbSeat: 3 })
    expect(state.players[1].hole).toEqual([])
    state = play(state, [0, FOLD], [2, FOLD])
    state = act(state, { type: 'next', hand: state.hand }, 'system')
    expect(state).toMatchObject({ button: 2, sbSeat: 3, bbSeat: 0 })
    expect(holdem.legalActions(state, 1)).toEqual([])
    expect(refusal(state, { type: 'away', away: true }, 1)).toBe(error('busted'))
    expect(holdem.view(state, 1).hole).toEqual([])
  })

  it('down to two, the button posts the small blind', () => {
    let state = table({ stacks: [1000, 1000, 100], holes: ['Ac Ad', '2c 7d', '3h 8s'], board: 'Kc Qd 9h 5s 4c', button: 1 })
    // Seat 2 (small blind) all in, seat 0 (big blind) calls and busts it
    state = play(state, [1, FOLD], [2, raise(100)], [0, CALL])
    expect(state.outOrder).toEqual([2])
    state = act(state, { type: 'next', hand: state.hand }, 'system')
    expect(state).toMatchObject({ button: 0, sbSeat: 0, bbSeat: 1 })
    expect(toAct(state)).toBe(0)
  })

  it('ends when one player has every chip, ranked by chips and then by who busted last', () => {
    let state = table({ stacks: [500, 1000, 100], holes: ['Ac Ad', '2c 7d', '3h 8s'], board: 'Kc Qd 9h 5s 4c' })
    state = play(state, [0, raise(500)], [1, CALL], [2, CALL])
    expect(stacks(state)).toEqual([1100, 500, 0])
    state = act(state, { type: 'next', hand: state.hand }, 'system')
    expect(holdem.isOver(state)).toBe(false)
    state = play(state, [1, raise(500)], [0, CALL])
    expect(stacks(state)).toEqual([expect.any(Number), expect.any(Number), 0])
    const winner = state.players.find((player) => player.stack > 0)?.seat
    if (state.players.filter((player) => !player.out).length === 1) {
      state = act(state, { type: 'next', hand: state.hand }, 'system')
      expect(holdem.isOver(state)).toBe(true)
      const result = holdem.result(state)
      expect(result.summary.key).toBe('games.holdem.result.won')
      expect(result.standings[0]).toMatchObject({ seat: winner, rank: 1, score: 1600 })
      expect(result.standings.at(-1)).toMatchObject({ seat: 2, rank: 3, score: 0 })
      expect(holdem.legalActions(state, winner as number)).toEqual([])
      expect(refusal(state, CHECK, winner as number)).toBe(error('over'))
    }
  })

  it('stops after a hand everyone still playing agrees to, ranked by chips', () => {
    let state = table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    state = act(state, { type: 'endVote', on: true }, 1)
    state = act(state, { type: 'endVote', on: true }, 2)
    expect(refusal(state, { type: 'endVote', on: true }, 2)).toBe(error('notNow'))
    state = play(state, [0, raise(100)], [1, FOLD], [2, FOLD])
    // Seat 0 has not agreed: the game goes on
    state = act(state, { type: 'next', hand: state.hand }, 'system')
    expect(state.hand).toBe(2)
    state = play(state, [1, FOLD], [2, FOLD])
    state = act(state, { type: 'endVote', on: true }, 0)
    expect(holdem.isOver(state)).toBe(true)
    const result = holdem.result(state)
    expect(result.summary.key).toBe('games.holdem.result.stopped')
    expect(result.standings.map((line) => [line.seat, line.rank, line.score])).toEqual([
      [0, 1, 1040],
      [1, 2, 990],
      [2, 3, 970],
    ])
  })
})

describe('the clock, sitting out and the host', () => {
  it('runs a turn clock when the host set one, and none when off', () => {
    const state = table({ stacks: [1000, 1000], holes: ['2c 3c', '2d 3d'] })
    expect(holdem.timers?.(state)).toEqual([
      { id: `holdem-turn-${state.step}`, ms: 30_000, action: { type: 'timeout', step: state.step } },
    ])
    const off = table({ stacks: [1000, 1000], holes: ['2c 3c', '2d 3d'], options: { timer: 0 } })
    expect(holdem.timers?.(off)).toEqual([])
  })

  it('time up: check if you can, else fold, and sit out until you come back', () => {
    let state = table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    expect(refusal(state, { type: 'timeout', step: state.step }, 0)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'timeout', step: state.step - 1 }, 'system')).toBe(error('notNow'))
    state = act(state, { type: 'timeout', step: state.step }, 'system')
    expect(state.players[0]).toMatchObject({ folded: true, away: true })
    state = play(state, [1, CALL])
    state = act(state, { type: 'timeout', step: state.step }, 'system')
    expect(state.players[2]).toMatchObject({ folded: false, away: true })
    expect(state.street).toBe('flop')
    // Seat 2 sits out: when it is its turn it checks at once
    state = play(state, [1, CHECK])
    expect(state.street).toBe('turn')
    expect(toAct(state)).toBe(1)
    state = act(state, { type: 'away', away: false }, 2)
    state = play(state, [1, CHECK], [2, CHECK])
    expect(state.street).toBe('river')
  })

  it('the host may skip only the seat the table is waiting on', () => {
    const state = table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] })
    expect(holdem.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    expect(holdem.skipAction?.(state, 1)).toBeNull()
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('nothingToSkip'))
    const skipped = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(skipped.players[0]).toMatchObject({ folded: true, away: true })
    expect(toAct(skipped)).toBe(1)
  })

  it('sitting out on your own turn checks or folds at once', () => {
    const state = act(table({ stacks: [1000, 1000, 1000], holes: ['2c 3c', '2d 3d', '2h 3h'] }), { type: 'away', away: true }, 0)
    expect(state.players[0]).toMatchObject({ folded: true, away: true })
    expect(toAct(state)).toBe(1)
  })
})

describe('what each viewer sees', () => {
  it('your own two cards and nobody else’s, at every table size', () => {
    for (let seats = 2; seats <= 9; seats++) {
      const state = holdem.init(makeSeats(seats), OPTIONS, createRng(seats))
      for (const viewer of [...state.players.map((player) => player.seat), 'spectator'] as const) {
        const view = holdem.view(state, viewer)
        const text = JSON.stringify(view)
        for (const player of state.players) {
          for (const card of player.hole) expect(text.includes(`"${card}"`)).toBe(player.seat === viewer)
        }
        for (const card of state.deck) expect(text).not.toContain(`"${card}"`)
        expect(view.hole).toEqual(viewer === 'spectator' ? [] : state.players[viewer].hole)
        expect(JSON.stringify(holdem.legalActions(state, viewer === 'spectator' ? 0 : viewer))).not.toMatch(/"[2-9TJQKA][shdc]"/)
      }
    }
  })

  it.each([2, 3, 4, 5, 6, 7, 8, 9])('random games with %i players play to the end and leak no card', (seats) => {
    for (let seed = 1; seed <= 4; seed++) {
      const played = playRandom(holdem, { seed, seats, options: OPTIONS, secrets, maxSteps: 5000 })
      const final = played.final.state
      const total = final.players.reduce((sum, player) => sum + player.stack, 0)
      expect(total).toBe(seats * OPTIONS.stack)
      expect(final.players.filter((player) => !player.out)).toHaveLength(1)
      expect(final.outOrder).toHaveLength(seats - 1)
    }
  })

  it('play to the end with deep stacks and blinds that never go up', () => {
    for (const options of [OPTIONS, { ...OPTIONS, blinds: 50, stack: 5000, blindUp: 0 } as HoldemOptions]) {
      for (let seed = 1; seed <= 6; seed++) {
        const played = playRandom(holdem, { seed, seats: 2 + (seed % 8), options, maxSteps: 5000 })
        expect(played.result.standings[0].rank).toBe(1)
      }
    }
  })
})

describe('junk', () => {
  it('is refused', () => {
    const state = table({ stacks: [1000, 1000], holes: ['2c 3c', '2d 3d'] })
    for (const junk of [null, 1, {}, { type: 'raise', to: 'lots' }, { type: 'raise', to: 1.5 }, { type: 'away' }, { type: 'fly' }]) {
      expect(refusal(state, junk, 0)).toBe(error('badAction'))
    }
    expect(refusal(state, CHECK, 9)).toBe(error('notAPlayer'))
    expect(refusal(state, { type: 'next', hand: 1 }, 'system')).toBe(error('notNow'))
    expect(refusal(state, { type: 'next', hand: 1 }, 0)).toBe(error('systemOnly'))
  })
})
