import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { ARREST_COST, COPIES, MUST_STORM, palace, ROLES, START_SILVER, STORM_COST } from '../../shared/games/palace/rules.ts'
import type {
  PalaceAction,
  PalaceOptions,
  PalaceRole,
  PalaceState,
} from '../../shared/games/palace/types.ts'
import { isGameError, type Actor, type GameError, type Viewer } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import { playRandom } from './harness.ts'

// 朝堂暗鬥 (working title Palace Bluff), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: PalaceOptions = { window: 15 }

/** A game of `seats` where seat 0 moves first and every seat holds the roles given */
function rigged(hands: PalaceRole[][], silver: number[] = hands.map(() => START_SILVER)): PalaceState {
  const base = palace.init(makeSeats(hands.length), OPTIONS, createRng(1))
  return {
    ...base,
    turn: 0,
    players: base.players.map((player, seat) => ({
      ...player,
      silver: silver[seat],
      hidden: hands[seat].map((role, index) => ({ id: `card-s${seat}-${index}`, role })),
    })),
    log: [{ k: 'start', seat: 0 }],
  }
}

function act(state: PalaceState, action: PalaceAction, actor: Actor, seed = 7): PalaceState {
  const next = palace.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: PalaceState, action: unknown, actor: Actor): string => {
  const answer = palace.reduce(state, action as PalaceAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.palace.error.${name}`
const silverOf = (state: PalaceState, seat: number) => state.players[seat].silver
const hiddenOf = (state: PalaceState, seat: number) => state.players[seat].hidden.map((card) => card.role)
const lostOf = (state: PalaceState, seat: number) => state.players[seat].lost

/** Everyone still asked in this window passes, in seat order */
function allPass(state: PalaceState): PalaceState {
  let next = state
  while (next.phase.kind === 'respond' && next.step === state.step) {
    const phase = next.phase
    const seat = phase.eligible.find((one) => !phase.passed.includes(one)) as number
    next = act(next, { type: 'pass' }, seat)
  }
  return next
}

/** What `viewer` must never see: everyone else's face-down cards, the deck, and others' scheme draws */
function secrets(state: PalaceState, viewer: Viewer): JsonValue[] {
  const ids: string[] = state.deck.map((card) => card.id)
  for (const player of state.players) {
    if (player.seat !== viewer) ids.push(...player.hidden.map((card) => card.id))
  }
  if (state.phase.kind === 'exchange' && state.current?.actor !== viewer) {
    ids.push(...state.phase.drawn.map((card) => card.id))
  }
  return ids
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('palace')).toBe(palace)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('palace')
    expect(defaultOptions(palace.options)).toEqual(OPTIONS)
    expect(palace.meta.minPlayers).toBe(2)
    expect(palace.meta.maxPlayers).toBe(6)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.palace.name']).toBeTruthy()
      for (const role of ROLES) expect(SCREEN_MESSAGES[language][`games.palace.role.${role}`]).toBeTruthy()
    }
  })
})

describe('the deal', () => {
  it('gives everyone two cards and two silver from a deck of five roles × 3', () => {
    for (let seats = 3; seats <= 6; seats++) {
      const state = palace.init(makeSeats(seats), OPTIONS, createRng(seats))
      const all = [...state.deck, ...state.players.flatMap((player) => player.hidden)]
      expect(all).toHaveLength(ROLES.length * COPIES)
      expect(new Set(all.map((card) => card.id)).size).toBe(15)
      for (const role of ROLES) expect(all.filter((card) => card.role === role)).toHaveLength(COPIES)
      for (const player of state.players) {
        expect(player.hidden).toHaveLength(2)
        expect(player.silver).toBe(START_SILVER)
      }
      expect(state.phase).toEqual({ kind: 'choose' })
      expect(state.log).toEqual([{ k: 'start', seat: state.turn }])
    }
  })

  it('gives the first player one silver fewer with two players', () => {
    const firsts = new Set<number>()
    for (let seed = 1; seed <= 12; seed++) {
      const state = palace.init(makeSeats(2), OPTIONS, createRng(seed))
      firsts.add(state.turn)
      expect(silverOf(state, state.turn)).toBe(1)
      expect(silverOf(state, 1 - state.turn)).toBe(2)
    }
    expect(firsts).toEqual(new Set([0, 1]))
  })
})

describe('random games', () => {
  it.each([2, 3, 4, 5, 6])('play to the end with %i players, leaking no card', (seats) => {
    for (let seed = 1; seed <= 6; seed++) {
      const played = playRandom(palace, { seed, seats, options: OPTIONS, secrets })
      const final = played.final.state
      expect(final.winner).not.toBeNull()
      expect(final.players.filter((player) => player.hidden.length > 0)).toHaveLength(1)
      expect(final.outOrder).toHaveLength(seats - 1)
      expect(played.result.standings[0]).toMatchObject({ seat: final.winner, rank: 1 })
    }
  })
})

describe('actions nobody can stop', () => {
  it('a stipend pays one and passes the turn', () => {
    const state = act(rigged([['guard', 'guard'], ['dowager', 'dowager'], ['eunuch', 'eunuch']]), { type: 'act', act: 'stipend', target: null }, 0)
    expect(silverOf(state, 0)).toBe(3)
    expect(state.turn).toBe(1)
    expect(state.phase).toEqual({ kind: 'choose' })
  })

  it('storming costs 7 and takes a backer of the target’s choice', () => {
    let state = rigged([['guard', 'guard'], ['dowager', 'eunuch']], [7, 2])
    state = act(state, { type: 'act', act: 'storm', target: 1 }, 0)
    expect(silverOf(state, 0)).toBe(7 - STORM_COST)
    expect(state.phase).toMatchObject({ kind: 'lose', seat: 1 })
    expect(palace.legalActions(state, 1)).toEqual([
      { type: 'lose', card: 'card-s1-0' },
      { type: 'lose', card: 'card-s1-1' },
    ])
    expect(refusal(state, { type: 'lose', card: 'card-s0-0' }, 1)).toBe(error('badCard'))
    state = act(state, { type: 'lose', card: 'card-s1-1' }, 1)
    expect(hiddenOf(state, 1)).toEqual(['dowager'])
    expect(lostOf(state, 1)).toEqual(['eunuch'])
    expect(state.turn).toBe(1)
  })

  it('is the only action from 10 silver', () => {
    const state = rigged([['guard', 'guard'], ['dowager', 'eunuch'], ['eunuch', 'eunuch']], [MUST_STORM, 2, 2])
    const legal = palace.legalActions(state, 0)
    expect(legal).toEqual([
      { type: 'act', act: 'storm', target: 1 },
      { type: 'act', act: 'storm', target: 2 },
    ])
    expect(refusal(state, { type: 'act', act: 'stipend', target: null }, 0)).toBe(error('mustStorm'))
  })

  it('refuses what costs more than you have, a target that is out, and a target for an untargeted action', () => {
    const state = rigged([['guard', 'guard'], ['dowager', 'eunuch']], [2, 2])
    expect(refusal(state, { type: 'act', act: 'arrest', target: 1 }, 0)).toBe(error('silver'))
    expect(refusal(state, { type: 'act', act: 'storm', target: 1 }, 0)).toBe(error('silver'))
    expect(refusal(state, { type: 'act', act: 'extort', target: 0 }, 0)).toBe(error('badTarget'))
    expect(refusal(state, { type: 'act', act: 'levy', target: 1 }, 0)).toBe(error('badTarget'))
    expect(refusal(state, { type: 'act', act: 'stipend', target: null }, 1)).toBe(error('notYourTurn'))
  })
})

describe('a claim and its challenge window', () => {
  const start = () => rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']])

  it('asks everyone else at once, and the action happens once all have passed', () => {
    let state = act(start(), { type: 'act', act: 'levy', target: null }, 0)
    expect(state.phase).toEqual({ kind: 'respond', window: 'challenge', eligible: [1, 2], passed: [] })
    expect(palace.legalActions(state, 1)).toEqual([{ type: 'pass' }, { type: 'challenge' }])
    expect(palace.legalActions(state, 0)).toEqual([])
    state = act(state, { type: 'pass' }, 1)
    expect(palace.legalActions(state, 1)).toEqual([])
    expect(refusal(state, { type: 'pass' }, 1)).toBe(error('notAsked'))
    state = act(state, { type: 'pass' }, 2)
    expect(silverOf(state, 0)).toBe(5)
    expect(state.turn).toBe(1)
  })

  it('a true claim: the card is shown and replaced, the challenger loses a backer, the action goes ahead', () => {
    let state = act(start(), { type: 'act', act: 'levy', target: null }, 0)
    state = act(state, { type: 'challenge' }, 2)
    // The challenger has two, so chooses
    expect(state.phase).toMatchObject({ kind: 'lose', seat: 2 })
    expect(state.players[0].hidden.map((card) => card.id)).not.toContain('card-s0-0')
    expect(state.deck.map((card) => card.id)).toContain('card-s0-0')
    expect(state.players[0].hidden).toHaveLength(2)
    state = act(state, { type: 'lose', card: 'card-s2-0' }, 2)
    expect(lostOf(state, 2)).toEqual(['strategist'])
    expect(silverOf(state, 0)).toBe(5)
    expect(state.turn).toBe(1)
    expect(state.log.map((line) => line.k)).toEqual(['start', 'declare', 'challenge', 'proved', 'lose', 'gain'])
  })

  it('a bluff: the claimant loses a backer and the action does not happen', () => {
    let state = act(start(), { type: 'act', act: 'extort', target: 1 }, 0)
    state = act(state, { type: 'challenge' }, 1)
    expect(state.phase).toMatchObject({ kind: 'lose', seat: 0 })
    state = act(state, { type: 'lose', card: 'card-s0-1' }, 0)
    expect(silverOf(state, 0)).toBe(2)
    expect(silverOf(state, 1)).toBe(2)
    expect(state.turn).toBe(1)
    expect(state.log.map((line) => line.k)).toContain('caught')
  })

  it('gives back the silver of an arrest caught bluffing', () => {
    let state = rigged([['treasurer', 'eunuch'], ['dowager', 'eunuch']], [5, 2])
    state = act(state, { type: 'act', act: 'arrest', target: 1 }, 0)
    expect(silverOf(state, 0)).toBe(5 - ARREST_COST)
    state = act(state, { type: 'challenge' }, 1)
    expect(silverOf(state, 0)).toBe(5)
  })
})

describe('blocks', () => {
  it('anyone may block a royal grant as the Treasurer; a block that stands stops it', () => {
    let state = rigged([['guard', 'guard'], ['treasurer', 'eunuch'], ['strategist', 'eunuch']])
    state = act(state, { type: 'act', act: 'grant', target: null }, 0)
    expect(state.phase).toEqual({ kind: 'respond', window: 'block', eligible: [1, 2], passed: [] })
    expect(palace.legalActions(state, 2)).toEqual([{ type: 'pass' }, { type: 'block', role: 'treasurer' }])
    expect(refusal(state, { type: 'block', role: 'dowager' }, 2)).toBe(error('cannotBlock'))
    expect(refusal(state, { type: 'challenge' }, 2)).toBe(error('notAsked'))
    state = act(state, { type: 'block', role: 'treasurer' }, 1)
    // Everyone but the blocker may challenge it, the actor too
    expect(state.phase).toEqual({ kind: 'respond', window: 'challengeBlock', eligible: [0, 2], passed: [] })
    state = allPass(state)
    expect(silverOf(state, 0)).toBe(2)
    expect(state.turn).toBe(1)
    expect(state.log.at(-1)).toEqual({ k: 'blocked', seat: 0 })
  })

  it('a block caught bluffing costs the blocker a backer and lets the action through', () => {
    let state = rigged([['guard', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']])
    state = act(state, { type: 'act', act: 'grant', target: null }, 0)
    state = act(state, { type: 'block', role: 'treasurer' }, 2)
    state = act(state, { type: 'challenge' }, 0)
    state = act(state, { type: 'lose', card: 'card-s2-1' }, 2)
    expect(lostOf(state, 2)).toEqual(['eunuch'])
    expect(silverOf(state, 0)).toBe(4)
  })

  it('a true block costs its challenger a backer and stands', () => {
    let state = rigged([['guard', 'guard'], ['treasurer', 'eunuch'], ['strategist', 'eunuch']])
    state = act(state, { type: 'act', act: 'grant', target: null }, 0)
    state = act(state, { type: 'block', role: 'treasurer' }, 1)
    state = act(state, { type: 'challenge' }, 2)
    state = act(state, { type: 'lose', card: 'card-s2-0' }, 2)
    expect(silverOf(state, 0)).toBe(2)
    expect(state.turn).toBe(1)
  })

  it('only the target may block an arrest, as the Empress Dowager; the price stays paid', () => {
    let state = rigged([['guard', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']], [3, 2, 2])
    state = act(state, { type: 'act', act: 'arrest', target: 1 }, 0)
    state = allPass(state)
    expect(state.phase).toEqual({ kind: 'respond', window: 'block', eligible: [1], passed: [] })
    expect(palace.legalActions(state, 1)).toEqual([{ type: 'pass' }, { type: 'block', role: 'dowager' }])
    expect(palace.legalActions(state, 2)).toEqual([])
    state = act(state, { type: 'block', role: 'dowager' }, 1)
    state = allPass(state)
    expect(silverOf(state, 0)).toBe(0)
    expect(hiddenOf(state, 1)).toHaveLength(2)
  })

  it('an arrest let through takes a backer', () => {
    let state = rigged([['guard', 'guard'], ['dowager', 'eunuch']], [3, 2])
    state = allPass(act(state, { type: 'act', act: 'arrest', target: 1 }, 0))
    state = act(state, { type: 'pass' }, 1)
    expect(state.phase).toMatchObject({ kind: 'lose', seat: 1 })
  })

  it('a target who bluffs the Empress Dowager and is caught loses both backers', () => {
    let state = rigged([['guard', 'guard'], ['eunuch', 'eunuch'], ['strategist', 'eunuch']], [3, 2, 2])
    state = allPass(act(state, { type: 'act', act: 'arrest', target: 1 }, 0))
    state = act(state, { type: 'block', role: 'dowager' }, 1)
    state = act(state, { type: 'challenge' }, 0)
    state = act(state, { type: 'lose', card: 'card-s1-0' }, 1)
    // The block fell, so the arrest takes the last one: out
    expect(hiddenOf(state, 1)).toEqual([])
    expect(state.outOrder).toEqual([1])
    expect(state.turn).toBe(2)
    expect(palace.legalActions(state, 1)).toEqual([])
  })

  it('extortion takes up to 2, and is blocked by the Chief Eunuch or the Strategist', () => {
    let state = rigged([['eunuch', 'guard'], ['dowager', 'eunuch']], [2, 1])
    state = allPass(act(state, { type: 'act', act: 'extort', target: 1 }, 0))
    expect(palace.legalActions(state, 1)).toEqual([
      { type: 'pass' },
      { type: 'block', role: 'eunuch' },
      { type: 'block', role: 'strategist' },
    ])
    state = act(state, { type: 'pass' }, 1)
    expect(silverOf(state, 0)).toBe(3)
    expect(silverOf(state, 1)).toBe(0)
    expect(state.log.at(-1)).toEqual({ k: 'take', seat: 0, from: 1, silver: 1 })
  })
})

describe('a scheme', () => {
  it('shows only the schemer the two drawn cards and keeps as many as they had', () => {
    let state = rigged([['strategist', 'guard'], ['dowager', 'eunuch'], ['treasurer', 'eunuch']])
    const deckBefore = state.deck.length
    state = allPass(act(state, { type: 'act', act: 'scheme', target: null }, 0))
    expect(state.phase.kind).toBe('exchange')
    const drawn = state.phase.kind === 'exchange' ? state.phase.drawn : []
    expect(drawn).toHaveLength(2)
    expect(state.deck).toHaveLength(deckBefore - 2)
    expect(palace.view(state, 0).drawn).toEqual(drawn)
    expect(palace.view(state, 1).drawn).toEqual([])
    expect(palace.view(state, 'spectator').phase).toEqual({ kind: 'exchange', keep: 2 })
    expect(palace.legalActions(state, 0)).toHaveLength(6)
    expect(refusal(state, { type: 'keep', cards: [drawn[0].id] }, 0)).toBe(error('badKeep'))
    expect(refusal(state, { type: 'keep', cards: [drawn[0].id, drawn[0].id] }, 0)).toBe(error('badKeep'))
    expect(refusal(state, { type: 'keep', cards: [drawn[0].id, 'card-s1-0'] }, 0)).toBe(error('badKeep'))
    state = act(state, { type: 'keep', cards: [drawn[0].id, drawn[1].id] }, 0)
    expect(state.players[0].hidden.map((card) => card.id)).toEqual([drawn[0].id, drawn[1].id])
    expect(state.deck).toHaveLength(deckBefore)
    expect(state.turn).toBe(1)
  })

  it('keeps one for a schemer with one backer left', () => {
    let state = rigged([['strategist'], ['dowager', 'eunuch']])
    state = allPass(act(state, { type: 'act', act: 'scheme', target: null }, 0))
    expect(palace.legalActions(state, 0)).toHaveLength(3)
  })
})

describe('the clock and absent players', () => {
  it('runs a fresh timer for every window, twice as long for a choice of cards', () => {
    let state = rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']])
    expect(palace.timers?.(state)).toEqual([])
    state = act(state, { type: 'act', act: 'levy', target: null }, 0)
    const [timer] = palace.timers?.(state) ?? []
    expect(timer).toEqual({ id: `palace-${state.step}`, ms: 15_000, action: { type: 'timeout', step: state.step } })
    // A pass keeps the same clock running
    const passed = act(state, { type: 'pass' }, 1)
    expect(palace.timers?.(passed)).toEqual([timer])
    const losing = act(state, { type: 'challenge' }, 1)
    expect(palace.timers?.(losing)[0].ms).toBe(30_000)
  })

  it('passes everyone left when a window runs out, and refuses an old clock or a player', () => {
    let state = rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']])
    state = act(state, { type: 'act', act: 'levy', target: null }, 0)
    state = act(state, { type: 'pass' }, 1)
    expect(refusal(state, { type: 'timeout', step: state.step }, 1)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'timeout', step: state.step - 1 }, 'system')).toBe(error('notNow'))
    state = act(state, { type: 'timeout', step: state.step }, 'system')
    expect(silverOf(state, 0)).toBe(5)
    expect(state.log).toContainEqual({ k: 'timeout', seats: [2] })
  })

  it('turns up the first card, or keeps the old ones, when a choice runs out', () => {
    let state = rigged([['treasurer', 'guard'], ['dowager', 'eunuch']])
    state = act(act(state, { type: 'act', act: 'levy', target: null }, 0), { type: 'challenge' }, 1)
    state = act(state, { type: 'timeout', step: state.step }, 'system')
    expect(lostOf(state, 1)).toEqual(['dowager'])

    let scheme = rigged([['strategist', 'guard'], ['dowager', 'eunuch']])
    scheme = allPass(act(scheme, { type: 'act', act: 'scheme', target: null }, 0))
    scheme = act(scheme, { type: 'timeout', step: scheme.step }, 'system')
    expect(scheme.players[0].hidden.map((card) => card.id)).toEqual(['card-s0-0', 'card-s0-1'])
  })

  it('skips an absent seat with the quietest choice, only when the game waits on it', () => {
    let state = rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']], [2, 2, 2])
    expect(palace.skipAction?.(state, 1)).toBeNull()
    expect(palace.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('nothingToSkip'))
    expect(refusal(state, { type: 'skip', seat: 0 }, 0)).toBe(error('systemOnly'))
    state = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(silverOf(state, 0)).toBe(3)

    state = act(state, { type: 'act', act: 'levy', target: null }, 1)
    state = act(state, { type: 'skip', seat: 2 }, 'system')
    expect(state.phase).toMatchObject({ kind: 'respond', passed: [2] })

    const rich = rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']], [10, 2, 2])
    const stormed = act(rich, { type: 'skip', seat: 0 }, 'system')
    expect(stormed.phase).toMatchObject({ kind: 'lose', seat: 1 })
  })
})

describe('what each viewer sees', () => {
  it('your own face-down cards, nobody else’s, and every lost card', () => {
    let state = rigged([['treasurer', 'guard'], ['dowager', 'eunuch'], ['strategist', 'eunuch']])
    state = act(act(state, { type: 'act', act: 'levy', target: null }, 0), { type: 'challenge' }, 1)
    state = act(state, { type: 'lose', card: 'card-s1-0' }, 1)
    for (const viewer of [0, 1, 2, 'spectator'] as const) {
      const view = palace.view(state, viewer)
      const text = JSON.stringify(view)
      for (const player of state.players) {
        for (const card of player.hidden) {
          expect(text.includes(card.id)).toBe(player.seat === viewer)
        }
      }
      expect(view.players[1].lost).toEqual(['dowager'])
      expect(view.players.map((player) => player.hiddenCount)).toEqual([2, 1, 2])
      expect(JSON.stringify(view.players)).not.toContain('hidden"')
    }
    expect(palace.view(state, 1).hand.map((card) => card.role)).toEqual(['eunuch'])
    expect(palace.view(state, 'spectator').hand).toEqual([])
    expect(palace.view(state, 'spectator').you).toBeNull()
  })
})

describe('the end', () => {
  it('ranks the last one standing first, then by who went out last', () => {
    let state = rigged([['guard'], ['dowager'], ['eunuch']], [7, 7, 2])
    state = act(state, { type: 'act', act: 'storm', target: 2 }, 0)
    expect(state.outOrder).toEqual([2])
    state = act(state, { type: 'act', act: 'storm', target: 0 }, 1)
    expect(palace.isOver(state)).toBe(true)
    expect(state.winner).toBe(1)
    expect(palace.legalActions(state, 1)).toEqual([])
    expect(refusal(state, { type: 'act', act: 'stipend', target: null }, 1)).toBe(error('over'))
    const result = palace.result(state)
    expect(result.standings.map((line) => [line.seat, line.rank])).toEqual([
      [1, 1],
      [0, 2],
      [2, 3],
    ])
    expect(state.log.at(-1)).toEqual({ k: 'win', seat: 1 })
  })

  it('refuses junk', () => {
    const state = rigged([['guard', 'guard'], ['dowager', 'eunuch']])
    for (const junk of [null, 1, {}, { type: 'act', act: 'fly', target: null }, { type: 'block', role: 'king' }, { type: 'keep', cards: [1] }]) {
      expect(refusal(state, junk, 0)).toBe(error('badAction'))
    }
    expect(refusal(state, { type: 'pass' }, 9)).toBe(error('notAPlayer'))
  })
})
