import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { MAX_NOTES } from '../../shared/games/kite/info.ts'
import { fullDeck, kite, learn, scoreOf, touches } from '../../shared/games/kite/rules.ts'
import type {
  KiteAction,
  KiteCard,
  KiteOptions,
  KiteRank,
  KiteState,
  KiteSuit,
} from '../../shared/games/kite/types.ts'
import { isGameError, type Actor, type GameError, type Viewer } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import { playRandom } from './harness.ts'

// 放風箏 (working title Kite Day), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: KiteOptions = { rainbow: false, turnSeconds: 0 }

const start = (seats: number, overrides: Partial<KiteOptions> = {}, seed = 1) =>
  kite.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: KiteState, action: KiteAction, actor: Actor): KiteState {
  const next = kite.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: KiteState, action: unknown, actor: Actor): string => {
  const answer = kite.reduce(state, action as KiteAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.kite.error.${name}`

let nextId = 1000
const card = (suit: KiteSuit, rank: KiteRank, suits: KiteSuit[] = ['red', 'gold', 'jade', 'blue', 'white']): KiteCard => ({
  id: nextId++,
  suit,
  rank,
  knows: { suits, ranks: [1, 2, 3, 4, 5] },
})

/** A state with chosen hands and deck, for the rules one at a time */
function rigged(hands: KiteCard[][], deck: KiteCard[], overrides: Partial<KiteState> = {}): KiteState {
  return { ...start(hands.length), hands, deck, ...overrides }
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('kite')).toBe(kite)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('kite')
    expect(defaultOptions(kite.options)).toEqual(OPTIONS)
    expect(kite.meta.minPlayers).toBe(2)
    expect(kite.meta.maxPlayers).toBe(5)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.kite.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.kite.ui.hang']).toBeTruthy()
    }
  })
})

describe('the deck and the deal', () => {
  it('has three 1s, two each of 2 to 4 and one 5 of each colour', () => {
    const deck = fullDeck(['red', 'gold', 'jade', 'blue', 'white'])
    expect(deck).toHaveLength(50)
    const reds = deck.filter((face) => face.suit === 'red').map((face) => face.rank)
    expect(reds).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5])
    expect(fullDeck(['red', 'gold', 'jade', 'blue', 'white', 'rainbow'])).toHaveLength(60)
  })

  it('deals 5 cards to 2–3 players and 4 to 4–5', () => {
    expect([2, 3, 4, 5].map((players) => start(players).hands[0].length)).toEqual([5, 5, 4, 4])
    const state = start(4)
    expect(state.deck.length + state.hands.flat().length).toBe(50)
    expect(state.notes).toBe(8)
    expect(state.burns).toBe(0)
    expect(Object.values(state.stacks)).toEqual([0, 0, 0, 0, 0])
  })

  it('numbers the cards in dealt order, so that an id says nothing of its card', () => {
    const state = start(3)
    expect(state.hands[0].map((c) => c.id)).toEqual([0, 1, 2, 3, 4])
    expect(state.deck[0].id).toBe(15)
    const faces = new Set<string>()
    for (let seed = 1; seed <= 10; seed++) {
      const first = start(3, {}, seed).hands[0][0]
      faces.add(`${first.suit}${first.rank}`)
    }
    expect(faces.size).toBeGreaterThan(3)
  })

  it('adds a sixth, rainbow colour as an option', () => {
    const state = start(2, { rainbow: true })
    expect(state.suits).toContain('rainbow')
    expect(state.deck.length + state.hands.flat().length).toBe(60)
    expect(kite.view(state, 0).maxScore).toBe(30)
  })
})

describe('the view', () => {
  it('hides each seat its own hand, and only its own', () => {
    const state = start(3)
    for (const seat of [0, 1, 2]) {
      const view = kite.view(state, seat)
      for (const hand of view.hands) {
        const hidden = hand.cards.every((c) => c.suit === null && c.rank === null)
        const shown = hand.cards.every((c, index) => {
          const real = state.hands[hand.seat][index]
          return c.suit === real.suit && c.rank === real.rank
        })
        expect(hand.seat === seat ? hidden : shown).toBe(true)
      }
      expect(JSON.stringify(view)).not.toContain('"deck"')
      expect(view.deckCount).toBe(state.deck.length)
    }
  })

  it('shows a spectator no hand, so that nobody reads their own from a second window', () => {
    const closed = kite.view(start(3), 'spectator')
    expect(closed.you).toBeNull()
    expect(closed.hands.flatMap((hand) => hand.cards).every((c) => c.suit === null && c.rank === null)).toBe(true)
  })

  it('shows everyone what each hand has been told, its own too', () => {
    const state = rigged([[card('red', 1), card('blue', 2)], [card('red', 3), card('gold', 3)]], [card('jade', 1)])
    const after = act(state, { type: 'hintSuit', to: 1, suit: 'red' }, 0)
    const own = kite.view(after, 1).hands[1].cards
    expect(own[0].knows.suits).toEqual(['red'])
    expect(own[1].knows.suits).not.toContain('red')
    expect(own[0].suit).toBeNull()
  })
})

describe('notes (hints)', () => {
  const hands = () => [
    [card('red', 1), card('blue', 2), card('gold', 4)],
    [card('red', 3), card('gold', 3), card('red', 5), card('white', 1)],
  ]

  it('points at every card of the colour, costs a note and ends the turn', () => {
    const state = rigged(hands(), [card('jade', 1)])
    const after = act(state, { type: 'hintSuit', to: 1, suit: 'red' }, 0)
    expect(after.notes).toBe(7)
    expect(after.turn).toBe(1)
    expect(after.turnNumber).toBe(2)
    expect(after.hands[1].map((c) => c.knows.suits.length === 1)).toEqual([true, false, true, false])
    expect(after.log.at(-1)).toMatchObject({ kind: 'hint', seat: 0, to: 1, slots: [0, 2], hint: { kind: 'suit', suit: 'red' } })
    expect(after.deck).toHaveLength(1)
  })

  it('narrows the number of the cards it points at and rules it out for the rest', () => {
    const state = rigged(hands(), [card('jade', 1)])
    const after = act(state, { type: 'hintRank', to: 1, rank: 3 }, 0)
    expect(after.hands[1].map((c) => c.knows.ranks)).toEqual([[3], [3], [1, 2, 4, 5], [1, 2, 4, 5]])
  })

  it('is refused with no notes left, to yourself, or when it points at nothing', () => {
    const state = rigged(hands(), [card('jade', 1)])
    expect(refusal({ ...state, notes: 0 }, { type: 'hintRank', to: 1, rank: 3 }, 0)).toBe(error('noNotes'))
    expect(refusal(state, { type: 'hintRank', to: 0, rank: 1 }, 0)).toBe(error('hintSelf'))
    expect(refusal(state, { type: 'hintSuit', to: 1, suit: 'jade' }, 0)).toBe(error('hintNothing'))
    expect(refusal(state, { type: 'hintRank', to: 1, rank: 2 }, 0)).toBe(error('hintNothing'))
    expect(refusal(state, { type: 'hintRank', to: 9, rank: 2 }, 0)).toBe(error('notAPlayer'))
    expect(refusal(state, { type: 'hintRank', to: 1, rank: 3 }, 1)).toBe(error('notYourTurn'))
  })

  it('with the rainbow on: every colour note points at a rainbow card, and none can name the rainbow', () => {
    const six: KiteSuit[] = ['red', 'gold', 'jade', 'blue', 'white', 'rainbow']
    const state = {
      ...rigged(
        [[card('red', 1, six)], [card('rainbow', 2, six), card('blue', 3, six), card('gold', 1, six)]],
        [card('jade', 1, six)],
      ),
      suits: six,
    }
    expect(refusal(state, { type: 'hintSuit', to: 1, suit: 'rainbow' }, 0)).toBe(error('badSuit'))
    const after = act(state, { type: 'hintSuit', to: 1, suit: 'blue' }, 0)
    expect(after.log.at(-1)).toMatchObject({ slots: [0, 1] })
    expect(after.hands[1][0].knows.suits).toEqual(['blue', 'rainbow'])
    expect(after.hands[1][2].knows.suits).toEqual(['red', 'gold', 'jade', 'white'])
    // A second colour pins the rainbow card down
    const pinned = act({ ...after, turn: 0 }, { type: 'hintSuit', to: 1, suit: 'gold' }, 0)
    expect(pinned.hands[1][0].knows.suits).toEqual(['rainbow'])
    expect(kite.legalActions(state, 0)).not.toContainEqual({ type: 'hintSuit', to: 1, suit: 'rainbow' })
  })

  it('learns only from what a note said', () => {
    const knows = { suits: ['red', 'gold'] as KiteSuit[], ranks: [1, 2, 3, 4, 5] as KiteRank[] }
    expect(learn(knows, { kind: 'rank', rank: 2 }, false).ranks).toEqual([1, 3, 4, 5])
    expect(touches({ kind: 'suit', suit: 'red' }, { suit: 'rainbow', rank: 1 })).toBe(true)
    expect(touches({ kind: 'rank', rank: 1 }, { suit: 'rainbow', rank: 2 })).toBe(false)
  })
})

describe('throwing away', () => {
  it('gets a note back and draws a new card to the front', () => {
    const drawn = card('jade', 1)
    const state = rigged([[card('red', 1), card('blue', 2)], [card('red', 3)]], [drawn], { notes: 5 })
    const thrown = state.hands[0][1]
    const after = act(state, { type: 'discard', card: thrown.id }, 0)
    expect(after.notes).toBe(6)
    expect(after.discards).toEqual([{ suit: 'blue', rank: 2 }])
    expect(after.hands[0].map((c) => c.id)).toEqual([drawn.id, state.hands[0][0].id])
    expect(after.log.at(-1)).toMatchObject({ kind: 'discard', seat: 0, slot: 1 })
  })

  it('is refused with all 8 notes in hand, or for a card not in your hand', () => {
    const state = rigged([[card('red', 1)], [card('red', 3)]], [card('jade', 1)])
    expect(refusal(state, { type: 'discard', card: state.hands[0][0].id }, 0)).toBe(error('notesFull'))
    expect(kite.legalActions(state, 0).some((a) => a.type === 'discard')).toBe(false)
    expect(refusal({ ...state, notes: 3 }, { type: 'discard', card: state.hands[1][0].id }, 0)).toBe(error('notYourCard'))
  })
})

describe('hanging a kite', () => {
  it('goes on its string when it is the next number', () => {
    const state = rigged([[card('red', 1)], [card('red', 2)]], [card('jade', 1), card('jade', 2)])
    const after = act(state, { type: 'play', card: state.hands[0][0].id }, 0)
    expect(after.stacks.red).toBe(1)
    expect(after.hung).toEqual([1, 0])
    const second = act(after, { type: 'play', card: after.hands[1][0].id }, 1)
    expect(second.stacks.red).toBe(2)
    expect(scoreOf(second.stacks)).toBe(2)
  })

  it('burns out of order: onto the discards, and a burn', () => {
    const state = rigged([[card('red', 2)], [card('red', 2)]], [card('jade', 1)])
    const after = act(state, { type: 'play', card: state.hands[0][0].id }, 0)
    expect(after.burns).toBe(1)
    expect(after.stacks.red).toBe(0)
    expect(after.discards).toEqual([{ suit: 'red', rank: 2 }])
    expect(after.log.at(-1)).toMatchObject({ kind: 'play', ok: false })
  })

  it('a 5 finishes the string and gives a note back, up to 8', () => {
    const base = rigged([[card('red', 5)], [card('red', 2)]], [card('jade', 1)], {
      stacks: { red: 4, gold: 0, jade: 0, blue: 0, white: 0 },
    })
    expect(act({ ...base, notes: 3 }, { type: 'play', card: base.hands[0][0].id }, 0).notes).toBe(4)
    expect(act(base, { type: 'play', card: base.hands[0][0].id }, 0).notes).toBe(MAX_NOTES)
  })

  it('the third burn ends the night, keeping the kites hung', () => {
    const state = rigged([[card('red', 3)], [card('red', 2)]], [card('jade', 1)], {
      burns: 2,
      stacks: { red: 1, gold: 2, jade: 0, blue: 0, white: 0 },
    })
    const after = act(state, { type: 'play', card: state.hands[0][0].id }, 0)
    expect(after.ending).toBe('burned')
    expect(kite.isOver(after)).toBe(true)
    expect(kite.legalActions(after, 1)).toEqual([])
    const result = kite.result(after)
    expect(result.summary).toEqual({ key: 'games.kite.result.burned', params: { score: 3, max: 25 } })
    expect(result.standings.map((s) => [s.rank, s.score])).toEqual([[1, 3], [1, 3]])
    expect(refusal(after, { type: 'play', card: 1 }, 1)).toBe(error('over'))
  })

  it('every string full ends the night at the top score', () => {
    const state = rigged([[card('white', 5)], [card('red', 2)]], [card('jade', 1)], {
      stacks: { red: 5, gold: 5, jade: 5, blue: 5, white: 4 },
    })
    const after = act(state, { type: 'play', card: state.hands[0][0].id }, 0)
    expect(after.ending).toBe('perfect')
    expect(kite.result(after).summary.key).toBe('games.kite.result.perfect')
  })
})

describe('the last round', () => {
  it('gives everyone, the one who drew the last card too, one more turn', () => {
    let state = rigged([[card('red', 4), card('red', 4)], [card('gold', 4), card('gold', 4)], [card('blue', 4)]], [card('jade', 4)], {
      notes: 4,
    })
    // Seat 0 draws the last card
    state = act(state, { type: 'discard', card: state.hands[0][0].id }, 0)
    expect(state.deck).toHaveLength(0)
    expect(state.finalTurns).toBe(3)
    state = act(state, { type: 'discard', card: state.hands[1][0].id }, 1)
    expect(state.finalTurns).toBe(2)
    expect(state.hands[1]).toHaveLength(1)
    state = act(state, { type: 'hintRank', to: 0, rank: 4 }, 2)
    expect(state.finalTurns).toBe(1)
    expect(state.ending).toBeNull()
    state = act(state, { type: 'discard', card: state.hands[0][0].id }, 0)
    expect(state.ending).toBe('deck')
    expect(kite.result(state).summary.key).toBe('games.kite.result.deck')
  })
})

describe('the clock and players who are away', () => {
  it('asks for a fresh countdown each turn when the host set one', () => {
    expect(kite.timers?.(start(2))).toEqual([])
    const state = start(2, { turnSeconds: 60 })
    expect(kite.timers?.(state)).toEqual([{ id: 'turn-1', ms: 60_000, action: { type: 'timeUp', turn: 1 } }])
    const after = act(state, { type: 'timeUp', turn: 1 }, 'system')
    expect(after.turn).toBe(1)
    expect(after.log.at(-1)).toEqual({ kind: 'pass', turn: 1, seat: 0, reason: 'timeUp' })
    expect(kite.timers?.(after)[0].id).toBe('turn-2')
  })

  it('refuses a stale clock, and the clock from a player', () => {
    const state = start(2, { turnSeconds: 30 })
    expect(refusal(state, { type: 'timeUp', turn: 4 }, 'system')).toBe(error('stale'))
    expect(refusal(state, { type: 'timeUp', turn: 1 }, 0)).toBe(error('systemOnly'))
  })

  it('lets the room skip only the player whose turn it is', () => {
    const state = start(3)
    expect(kite.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    expect(kite.skipAction?.(state, 1)).toBeNull()
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('notYourTurn'))
    expect(refusal(state, { type: 'skip', seat: 0 }, 0)).toBe(error('systemOnly'))
    const after = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(after.turn).toBe(1)
    expect(after.notes).toBe(8)
  })

  it('closes the chat until the night ends', () => {
    expect(kite.chatLocked?.(start(2))).toBe(true)
  })
})

describe('junk', () => {
  it('refuses actions that are not moves', () => {
    const state = start(2)
    for (const junk of [null, 1, 'play', {}, { type: 'play' }, { type: 'hintSuit', to: 1, suit: 'purple' }, { type: 'hintRank', to: 1, rank: 6 }]) {
      expect(refusal(state, junk, 0)).toBe(error('badAction'))
    }
    expect(refusal(state, { type: 'play', card: 0 }, 'system')).toBe(error('badAction'))
  })
})

/** Every card a viewer may not see, whole (its id makes each unmistakable) */
function secrets(state: KiteState, viewer: Viewer): JsonValue[] {
  const hidden: KiteCard[] = [...state.deck]
  state.players.forEach((seat, index) => {
    if (viewer === seat || viewer === 'spectator') hidden.push(...state.hands[index])
  })
  return hidden as unknown as JsonValue[]
}

describe('random games (harness)', () => {
  it.each([2, 3, 4, 5])('plays to the end with %i players and leaks no card', (seats) => {
    for (let seed = 1; seed <= 8; seed++) {
      const { result, final } = playRandom(kite, { seed: seed * 31 + seats, seats, secrets })
      expect(result.standings).toHaveLength(seats)
      expect(final.state.ending).not.toBeNull()
    }
  })

  it('plays with the rainbow and the clock', () => {
    for (let seed = 1; seed <= 6; seed++) {
      playRandom(kite, {
        seed,
        seats: 2 + (seed % 4),
        options: { rainbow: true, turnSeconds: 30 },
        secrets,
      })
    }
  })
})
