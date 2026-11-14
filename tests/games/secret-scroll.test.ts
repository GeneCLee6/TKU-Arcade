import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import {
  DECK_COUNTS,
  FACE_UP_FOR_TWO,
  fullDeck,
  goalFor,
  guessValues,
  secretScroll,
} from '../../shared/games/secret-scroll/rules.ts'
import type {
  ScrollAction,
  ScrollCard,
  ScrollOptions,
  ScrollPlayer,
  ScrollState,
} from '../../shared/games/secret-scroll/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 奪祕笈 (working title Secret Scroll), the owner's brief of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: ScrollOptions = { length: 'standard', beggars: false }

const start = (seats: number, overrides: Partial<ScrollOptions> = {}, seed = 1) =>
  secretScroll.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: ScrollState, action: ScrollAction, actor: Actor, seed = 7): ScrollState {
  const next = secretScroll.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: ScrollState, action: unknown, actor: Actor): string => {
  const answer = secretScroll.reduce(state, action as ScrollAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.secret-scroll.error.${name}`
const play = (card: ScrollCard, target: number | null = null, guess: ScrollCard | null = null): ScrollAction => ({
  type: 'play',
  card,
  target,
  guess,
})

/** A hand-made position: seat 0 to play, holding `hands[0]` (two cards); the rest hold one each */
function position(hands: ScrollCard[][], deck: ScrollCard[] = [1, 2, 3, 4], extra: Partial<ScrollState> = {}): ScrollState {
  const players: ScrollPlayer[] = hands.map((hand, seat) => ({
    seat,
    hand,
    discards: [],
    out: false,
    shielded: false,
    tokens: 0,
  }))
  return {
    phase: 'turn',
    players,
    current: 0,
    round: 1,
    goal: goalFor('standard', hands.length),
    length: 'standard',
    beggars: false,
    deck,
    hidden: 5,
    faceUp: [],
    events: [],
    lastRound: null,
    ...extra,
  }
}

const p = (state: ScrollState, seat: number) => state.players[seat]

/** Every state of one random game, picking among the legal moves */
function walk(seats: number, options: ScrollOptions, seed: number): ScrollState[] {
  const rng = createRng(seed)
  let state = secretScroll.init(makeSeats(seats), options, rng)
  const states = [state]
  for (let step = 0; step < 500 && !secretScroll.isOver(state); step++) {
    const moves = state.players.flatMap((player) =>
      secretScroll.legalActions(state, player.seat).map((action) => ({ action, seat: player.seat })),
    )
    const { action, seat } = rng.pick(moves)
    state = act(state, action, seat, seed * 1000 + step)
    states.push(state)
  }
  return states
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('secret-scroll')).toBe(secretScroll)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('secret-scroll')
    expect(defaultOptions(secretScroll.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.secret-scroll.name']).toBeTruthy()
      for (let card = 0; card <= 8; card++) {
        expect(SCREEN_MESSAGES[language][`games.secret-scroll.card.${card}`]).toBeTruthy()
        expect(SCREEN_MESSAGES[language][`games.secret-scroll.text.${card}`]).toBeTruthy()
      }
    }
  })
})

describe('the deck and the deal', () => {
  it('has 16 cards: 5, 2, 2, 2, 2, 1, 1, 1 of values 1 to 8, and two Beggars when chosen', () => {
    expect(fullDeck(false)).toHaveLength(16)
    expect(Object.values(DECK_COUNTS)).toEqual([0, 5, 2, 2, 2, 2, 1, 1, 1])
    expect(fullDeck(true).filter((card) => card === 0)).toHaveLength(2)
  })

  it.each([2, 3, 4, 5, 6])('sets one aside face down, deals one each and the starter draws (%i players)', (seats) => {
    const state = start(seats)
    const faceUp = seats === 2 ? FACE_UP_FOR_TWO : 0
    expect(state.faceUp).toHaveLength(faceUp)
    expect(state.hidden).not.toBeNull()
    const held = state.players.reduce((sum, player) => sum + player.hand.length, 0)
    expect(held).toBe(seats + 1)
    expect(p(state, state.current).hand).toHaveLength(2)
    expect(state.deck.length + held + 1 + faceUp).toBe(16)
  })

  it('needs 7, 5, 4 and 3 renown for 2, 3, 4 and 5–6 players; fewer in a short game', () => {
    expect([2, 3, 4, 5, 6].map((n) => goalFor('standard', n))).toEqual([7, 5, 4, 3, 3])
    expect([2, 3, 4, 5, 6].map((n) => goalFor('short', n))).toEqual([4, 3, 3, 2, 2])
    expect(start(3, { length: 'short' }).goal).toBe(3)
  })
})

describe('the cards', () => {
  it('Constable: a right guess puts the target out, face up; a wrong one does nothing', () => {
    const state = position([[1, 4], [6], [2]])
    const hit = act(state, play(1, 1, 6), 0)
    expect(p(hit, 1).out).toBe(true)
    expect(p(hit, 1).discards).toEqual([6])
    expect(hit.events[0]).toMatchObject({ outcome: 'hit', out: [1], shown: [{ seat: 1, card: 6 }] })
    const miss = act(state, play(1, 1, 5), 0)
    expect(p(miss, 1).out).toBe(false)
    expect(miss.events[0].outcome).toBe('miss')
  })

  it('Constable: cannot name the Constable, and must name something', () => {
    const state = position([[1, 4], [1], [2]])
    expect(refusal(state, play(1, 1, 1), 0)).toBe(error('badGuess'))
    expect(refusal(state, play(1, 1, null), 0)).toBe(error('badGuess'))
    expect(guessValues(false)).not.toContain(1)
    expect(guessValues(true)).toContain(0)
  })

  it('Spy: only the spy learns the card', () => {
    const state = act(position([[2, 4], [6], [3]]), play(2, 2), 0)
    expect(state.events[0]).toMatchObject({ outcome: 'peek', seen: [{ seat: 0, of: 2, card: 3 }] })
    expect(secretScroll.view(state, 0).events[0].seen).toEqual([{ seat: 0, of: 2, card: 3 }])
    expect(secretScroll.view(state, 1).events[0].seen).toEqual([])
    expect(secretScroll.view(state, 2).events[0].seen).toEqual([])
    expect(secretScroll.view(state, 'spectator').events[0].seen).toEqual([])
  })

  it('Duelist: the lower card is out, both learn the other card, a tie does nothing', () => {
    const won = act(position([[3, 7], [5], [2]]), play(3, 1), 0)
    expect(p(won, 1).out).toBe(true)
    expect(won.events[0].outcome).toBe('won')
    expect(secretScroll.view(won, 1).events[0].seen).toEqual([{ seat: 1, of: 0, card: 7 }])
    expect(secretScroll.view(won, 2).events[0].seen).toEqual([])
    const lost = act(position([[3, 2], [5], [2]]), play(3, 1), 0)
    expect(p(lost, 0).out).toBe(true)
    expect(lost.events[0].outcome).toBe('lost')
    const tie = act(position([[3, 5], [5], [2]]), play(3, 1), 0)
    expect(tie.players.every((player) => !player.out)).toBe(true)
    expect(tie.events[0].outcome).toBe('tie')
  })

  it('Monk: no card can pick the shielded until their next turn', () => {
    let state = act(position([[4, 2], [1, 3], [2]]), play(4), 0)
    expect(p(state, 0).shielded).toBe(true)
    expect(state.current).toBe(1)
    expect(refusal(state, play(1, 0, 2), 1)).toBe(error('badTarget'))
    state = act(state, play(1, 2, 8), 1)
    // Seat 2 cannot pick seat 0 either; at seat 0's turn the shield drops
    state = act(state, { type: 'play', card: p(state, 2).hand.includes(2) ? 2 : p(state, 2).hand[0], target: 1, guess: null } as ScrollAction, 2)
    expect(p(state, 0).shielded).toBe(false)
  })

  it('a card aimed at someone has no effect when everyone else is out or shielded', () => {
    const state = position([[2, 4], [6]], [1, 2], {
      players: [
        { seat: 0, hand: [2, 4], discards: [], out: false, shielded: false, tokens: 0 },
        { seat: 1, hand: [6], discards: [4], out: false, shielded: true, tokens: 0 },
      ],
    })
    expect(secretScroll.legalActions(state, 0)).toContainEqual(play(2, null))
    expect(refusal(state, play(2, 1), 0)).toBe(error('badTarget'))
    const next = act(state, play(2, null), 0)
    expect(next.events[0].outcome).toBe('none')
  })

  it('Drunkard: the target throws away and draws; on yourself too; the Scroll thrown puts them out', () => {
    const state = position([[5, 4], [6], [8]], [3, 2])
    // Seat 1 then draws for their own turn: their first card is the one the Drunkard gave them
    const other = act(state, play(5, 1), 0)
    expect(p(other, 1).hand).toEqual([3, 2])
    expect(p(other, 1).discards).toEqual([6])
    const self = act(state, play(5, 0), 0)
    expect(p(self, 0).hand).toEqual([3])
    expect(p(self, 0).discards).toEqual([5, 4])
    const scroll = act(state, play(5, 2), 0)
    expect(p(scroll, 2).out).toBe(true)
    expect(scroll.events[0].outcome).toBe('scroll')
  })

  it('Drunkard: with the deck dry the target draws the card set aside face down', () => {
    const state = position([[5, 4], [6], [2]], [7], { hidden: 3 })
    // Seat 0 draws nothing more: the deck has one card, which the Drunkard's target takes
    const next = act(state, play(5, 1), 0)
    expect(p(next, 1).hand).toEqual([7])
    expect(next.hidden).toBe(3)
    const dry = act(position([[5, 4], [6], [2]], [], { hidden: 3 }), play(5, 1), 0)
    expect(p(dry, 1).hand).toEqual([3])
    expect(dry.hidden).toBeNull()
  })

  it('Mask Maker: hands are traded', () => {
    const state = act(position([[6, 2], [8], [3]]), play(6, 1), 0)
    expect(p(state, 0).hand).toEqual([8])
    expect(p(state, 1).hand[0]).toBe(2)
  })

  it('Strategist: must be played with the Drunkard or the Mask Maker', () => {
    for (const other of [5, 6] as const) {
      const state = position([[7, other], [2], [3]])
      expect(refusal(state, play(other, 1), 0)).toBe(error('mustStrategist'))
      expect(secretScroll.legalActions(state, 0)).toEqual([play(7)])
    }
    expect(secretScroll.legalActions(position([[7, 8], [2], [3]]), 0)).toHaveLength(2)
  })

  it('Secret Scroll: throwing it away puts you out, the other card face up', () => {
    const state = act(position([[8, 3], [2], [3]]), play(8), 0)
    expect(p(state, 0).out).toBe(true)
    expect(p(state, 0).discards).toEqual([8, 3])
  })

  it('Beggar: peeks at the top of the deck, for the beggar only', () => {
    const state = act(position([[0, 2], [6], [3]], [7, 1], { beggars: true }), play(0), 0)
    expect(secretScroll.view(state, 0).events[0].seen).toEqual([{ seat: 0, of: 'deck', card: 7 }])
    expect(secretScroll.view(state, 1).events[0].seen).toEqual([])
  })
})

describe('the round', () => {
  it('ends when one player is left; they win a token and start the next', () => {
    let state = act(position([[1, 4], [6]], [2, 3]), play(1, 1, 6), 0)
    expect(state.phase).toBe('roundEnd')
    expect(state.lastRound).toMatchObject({ reason: 'last', winners: [0] })
    expect(p(state, 0).tokens).toBe(1)
    expect(secretScroll.timers?.(state)).toEqual([{ id: 'next-1', ms: 30_000, action: { type: 'next' } }])
    state = act(state, { type: 'next' }, 1)
    expect(state.round).toBe(2)
    expect(state.current).toBe(0)
    expect(state.phase).toBe('turn')
  })

  it('ends when the deck is dry: the highest card wins, ties go to the most played', () => {
    const state = act(position([[4, 2], [6], [3]], [], {}), play(4), 0)
    expect(state.lastRound).toMatchObject({ reason: 'deck', winners: [1] })
    expect(state.lastRound?.hands).toEqual([
      { seat: 0, card: 2 },
      { seat: 1, card: 6 },
      { seat: 2, card: 3 },
    ])
    const tied = position([[4, 6], [6], [3]], [])
    tied.players[1].discards = [1]
    expect(act(tied, play(4), 0).lastRound?.winners).toEqual([0])
    const shared = position([[4, 6], [6], [3]], [])
    shared.players[1].discards = [4]
    expect(act(shared, play(4), 0).lastRound?.winners).toEqual([0, 1])
  })

  it('ends the game at the goal, ranked by renown', () => {
    const state = position([[1, 4], [6]], [2, 3])
    state.players[0].tokens = 6
    const over = act(state, play(1, 1, 6), 0)
    expect(over.phase).toBe('over')
    expect(secretScroll.isOver(over)).toBe(true)
    const result = secretScroll.result(over)
    expect(result.standings.map((s) => [s.seat, s.rank, s.score])).toEqual([
      [0, 1, 7],
      [1, 2, 0],
    ])
  })
})

describe('the referee', () => {
  it('refuses out of turn, junk, the room acting as a player, and a card not held', () => {
    const state = position([[1, 4], [6], [2]])
    expect(refusal(state, play(4), 1)).toBe(error('notYourTurn'))
    expect(refusal(state, { type: 'play', card: 9 }, 0)).toBe(error('badAction'))
    expect(refusal(state, play(4), 'system')).toBe(error('badAction'))
    expect(refusal(state, play(2, 1), 0)).toBe(error('notInHand'))
    expect(refusal(state, { type: 'next' }, 0)).toBe(error('notRoundEnd'))
    expect(refusal(state, { type: 'skip', seat: 0 }, 0)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('nothingToSkip'))
  })

  it('folds a gone player on their turn, hand face up', () => {
    const state = position([[1, 4], [6], [2]])
    expect(secretScroll.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    expect(secretScroll.skipAction?.(state, 1)).toBeNull()
    const next = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(p(next, 0).out).toBe(true)
    expect(p(next, 0).discards).toEqual([1, 4])
    expect(next.current).toBe(1)
  })
})

describe('what each viewer sees', () => {
  it('only your own hand and what you learned; never the deck or the face-down card', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const seats = 2 + (seed % 5)
      for (const state of walk(seats, { ...OPTIONS, beggars: seed % 2 === 0 }, seed)) {
        for (const viewer of [...state.players.map((player) => player.seat), 'spectator' as const]) {
          const view = secretScroll.view(state, viewer)
          expect(view).not.toHaveProperty('deck')
          expect(view).not.toHaveProperty('hidden')
          expect(view.deckCount).toBe(state.deck.length)
          for (const player of view.players) {
            expect(player.hand).toEqual(player.seat === viewer ? p(state, player.seat).hand : null)
            expect(player.handCount).toBe(p(state, player.seat).hand.length)
          }
          for (const event of view.events) expect(event.seen.every((seen) => seen.seat === viewer)).toBe(true)
        }
      }
    }
  })

  it('a random game passes every harness check, at every player count, with and without Beggars', () => {
    for (let seats = 2; seats <= 6; seats++) {
      for (const beggars of [false, true]) {
        for (const length of ['standard', 'short'] as const) {
          const { result } = playRandom(secretScroll, { seed: seats * 10 + (beggars ? 1 : 0), seats, options: { length, beggars } })
          expect(result.standings).toHaveLength(seats)
        }
      }
    }
  })
})
