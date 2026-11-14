import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { applyAction, makeSeats, startMatch, type Match } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { WB_WORDS } from '../../shared/games/word-bridge/bank.ts'
import { clueProblem } from '../../shared/games/word-bridge/clue.ts'
import {
  dealDuoKeys,
  dealKey,
  dealWords,
  DUO_TARGETS,
  duoLeftFor,
  modeFor,
  openWords,
  wordBridge,
} from '../../shared/games/word-bridge/rules.ts'
import type {
  WbAction,
  WbDuoState,
  WbOptions,
  WbState,
  WbTeamsState,
  WbTeamsView,
  WbDuoView,
} from '../../shared/games/word-bridge/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { overlaps } from '../../shared/games/wordFold.ts'
import { playRandom } from './harness.ts'

// 搭橋 (working title Word Bridge), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: WbOptions = { mode: 'auto', clock: 0, turns: 10 }

const start = (seats: number, overrides: Partial<WbOptions> = {}, seed = 1) =>
  wordBridge.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act<S extends WbState>(state: S, action: WbAction, actor: Actor, seed = 7): S {
  const next = wordBridge.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next as S
}

const refusal = (state: WbState, action: unknown, actor: Actor): string => {
  const answer = wordBridge.reduce(state, action as WbAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.word-bridge.error.${name}`

/** A team game, dealt: seats 0, 2 North–South (0 calls), 1, 3 East–West (1 calls) */
const teams = (seed = 1, overrides: Partial<WbOptions> = {}): WbTeamsState =>
  act(start(4, overrides, seed) as WbTeamsState, { type: 'begin' }, 0, seed)

const indexOf = (state: WbTeamsState, card: WbTeamsState['key'][number], skip = 0) =>
  state.key.map((c, i) => (c === card ? i : -1)).filter((i) => i >= 0)[skip]

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('word-bridge')).toBe(wordBridge)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('word-bridge')
    expect(defaultOptions(wordBridge.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.word-bridge.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.word-bridge.ui.begin']).toBeTruthy()
    }
  })
})

describe('the mode', () => {
  it('is co-op for two or three, teams from four unless co-op is chosen', () => {
    expect([2, 3, 4, 10].map((n) => modeFor(n, 'auto'))).toEqual(['duo', 'duo', 'teams', 'teams'])
    expect(modeFor(3, 'teams')).toBe('duo')
    expect(modeFor(6, 'duo')).toBe('duo')
  })

  it('deals at once for two players, and waits in setup otherwise', () => {
    expect(start(2).phase).toBe('clue')
    expect(start(3).phase).toBe('setup')
    expect(start(5).phase).toBe('setup')
  })
})

describe('the deal', () => {
  it('lays 25 different words, none inside another', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const words = dealWords(createRng(seed))
      expect(words).toHaveLength(25)
      expect(new Set(words).size).toBe(25)
      for (const a of words) for (const b of words) if (a !== b) expect(overlaps(a, b), `${a} ${b}`).toBe(false)
    }
  })

  it('keys 9 for the side that starts, 8, 7 bystanders and one trap', () => {
    const key = dealKey('ew', createRng(3))
    const count = (card: string) => key.filter((c) => c === card).length
    expect([count('ew'), count('ns'), count('neutral'), count('mine')]).toEqual([9, 8, 7, 1])
  })

  it('gives each co-op side 9 targets and 3 traps, 15 targets in all', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const [a, b] = dealDuoKeys(createRng(seed))
      expect(a.filter((c) => c === 'target')).toHaveLength(9)
      expect(b.filter((c) => c === 'target')).toHaveLength(9)
      expect(a.filter((c) => c === 'mine')).toHaveLength(3)
      expect(b.filter((c) => c === 'mine')).toHaveLength(3)
      expect(a.filter((c, i) => c === 'target' || b[i] === 'target')).toHaveLength(DUO_TARGETS)
      expect(a.filter((c, i) => c === 'target' && b[i] === 'target')).toHaveLength(3)
      expect(a.filter((c, i) => c === 'mine' && b[i] === 'mine')).toHaveLength(1)
    }
  })

  it('starts the side with 9 words', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = teams(seed)
      expect(state.key.filter((card) => card === state.starting)).toHaveLength(9)
      expect(state.active).toBe(state.starting)
    }
  })
})

describe('setup, team game', () => {
  it('alternates seats between the sides with the first of each calling', () => {
    const state = start(5) as WbTeamsState
    expect(state.teams).toEqual({ ns: [0, 2, 4], ew: [1, 3] })
    expect(state.givers).toEqual({ ns: 0, ew: 1 })
  })

  it('moves a player, hands their calling on, and makes them call a side without one', () => {
    let state = start(4) as WbTeamsState
    state = act(state, { type: 'join', team: 'ew' }, 0)
    expect(state.teams).toEqual({ ns: [2], ew: [0, 1, 3] })
    expect(state.givers).toEqual({ ns: 2, ew: 1 })
    expect(refusal(state, { type: 'begin' }, 1)).toBe(error('teamsShort'))
    expect(refusal(state, { type: 'join', team: 'ew' }, 0)).toBe(error('sameTeam'))
    state = act(state, { type: 'give' }, 3)
    expect(state.givers.ew).toBe(3)
    expect(refusal(state, { type: 'give' }, 3)).toBe(error('alreadyGiver'))
  })

  it('shuffles into two playable sides', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = act(start(7) as WbTeamsState, { type: 'shuffle' }, 3, seed)
      expect(state.teams.ns.length + state.teams.ew.length).toBe(7)
      expect(Math.abs(state.teams.ns.length - state.teams.ew.length)).toBe(1)
      expect(state.teams.ns).toContain(state.givers.ns)
      expect(state.teams.ew).toContain(state.givers.ew)
    }
  })

  it('shows no words or key before the deal', () => {
    const view = wordBridge.view(start(4), 0) as WbTeamsView
    expect(view.words).toEqual([])
    expect(view.key).toEqual([])
  })
})

describe('clues', () => {
  it('come only from the caller whose turn it is', () => {
    const state = teams()
    const giver = state.givers[state.active] as number
    const otherGiver = state.givers[state.active === 'ns' ? 'ew' : 'ns'] as number
    expect(refusal(state, { type: 'clue', text: 'kiwi', count: 2 }, otherGiver)).toBe(error('notGiver'))
    const next = act(state, { type: 'clue', text: '  kiwi ', count: 2 }, giver)
    expect(next.phase).toBe('guess')
    expect(next.clue).toEqual({ text: 'kiwi', count: 2 })
  })

  it('may not hold a word on the grid, nor be part of one', () => {
    const state = teams()
    const giver = state.givers[state.active] as number
    const word = state.words[0]
    expect(refusal(state, { type: 'clue', text: word, count: 1 }, giver)).toBe(error('onGrid'))
    expect(refusal(state, { type: 'clue', text: `超${word}`, count: 1 }, giver)).toBe(error('onGrid'))
    expect(refusal(state, { type: 'clue', text: 'two words', count: 1 }, giver)).toBe(error('oneWord'))
    expect(refusal(state, { type: 'clue', text: 'kiwi3', count: 1 }, giver)).toBe(error('digits'))
    expect(refusal(state, { type: 'clue', text: 'kiwi', count: 10 }, giver)).toBe(error('badCount'))
    expect(refusal(state, { type: 'clue', text: '!!', count: 1 }, giver)).toBe(error('empty'))
  })

  it('fold width and case: "ＫＩＷＩ" is "kiwi"', () => {
    expect(clueProblem('ＫＩＷＩ', 1, ['kiwi'])?.key).toBe(error('onGrid'))
    expect(clueProblem('雞', 1, ['火雞'])?.key).toBe(error('onGrid'))
    expect(clueProblem('火雞', 1, ['雞'])?.key).toBe(error('onGrid'))
    expect(clueProblem('鳥', 1, ['火雞'])).toBeNull()
  })

  it('may use a word once it is turned', () => {
    let state = teams()
    const giver = state.givers[state.active] as number
    const picker = state.teams[state.active].find((seat) => seat !== giver) as number
    const own = indexOf(state, state.active)
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giver)
    state = act(state, { type: 'pick', index: own }, picker)
    expect(openWords(state)).not.toContain(state.words[own])
  })
})

describe('picks, team game', () => {
  const ready = (seed = 1, count = 2) => {
    const state = teams(seed)
    const giver = state.givers[state.active] as number
    const picker = state.teams[state.active].find((seat) => seat !== giver) as number
    return { state: act(state, { type: 'clue', text: 'kiwi', count }, giver), giver, picker }
  }

  it('go on after an own word, up to the number plus one', () => {
    let { state, picker } = ready(1, 2)
    const active = state.active
    for (let n = 0; n < 3; n++) {
      expect(state.active).toBe(active)
      state = act(state, { type: 'pick', index: indexOf(state, active, n) }, picker)
    }
    expect(state.active).not.toBe(active)
    expect(state.phase).toBe('clue')
  })

  it('end the turn on a bystander or the other side’s word, and turn it for all', () => {
    const { state, picker } = ready()
    const bystander = act(state, { type: 'pick', index: indexOf(state, 'neutral') }, picker)
    expect(bystander.active).not.toBe(state.active)
    expect(bystander.revealed[indexOf(state, 'neutral')]).toBe(true)
    const theirs = act(state, { type: 'pick', index: indexOf(state, state.active === 'ns' ? 'ew' : 'ns') }, picker)
    expect(theirs.active).not.toBe(state.active)
  })

  it('lose the game on the trap', () => {
    const { state, picker } = ready()
    const lost = act(state, { type: 'pick', index: indexOf(state, 'mine') }, picker)
    expect(lost.phase).toBe('over')
    expect(lost.winner).toBe(state.active === 'ns' ? 'ew' : 'ns')
    expect(wordBridge.result(lost).summary.key).toContain('.mine')
    const winners = wordBridge.result(lost).standings.filter((line) => line.rank === 1).map((line) => line.seat)
    expect(winners.sort()).toEqual(lost.teams[lost.winner as 'ns' | 'ew'])
  })

  it('win once a side has all its words, even turned by the other side', () => {
    let { state, picker } = ready(2, 0)
    const active = state.active
    for (let n = 0; n < 9; n++) state = act(state, { type: 'pick', index: indexOf(state, active, n) }, picker)
    expect(state.phase).toBe('over')
    expect(state.winner).toBe(active)
    expect(state.ending).toEqual({ reason: 'allFound', seat: picker })
  })

  it('refuse the caller, the other side, a turned word, and a stop before any pick', () => {
    const { state, giver, picker } = ready()
    const enemy = state.teams[state.active === 'ns' ? 'ew' : 'ns'][0]
    expect(refusal(state, { type: 'pick', index: 0 }, giver)).toBe(error('notPicker'))
    expect(refusal(state, { type: 'pick', index: 0 }, enemy)).toBe(error('notPicker'))
    expect(refusal(state, { type: 'stop' }, picker)).toBe(error('noPickYet'))
    const after = act(state, { type: 'pick', index: indexOf(state, state.active) }, picker)
    expect(refusal(after, { type: 'pick', index: indexOf(state, state.active) }, picker)).toBe(error('taken'))
    expect(act(after, { type: 'stop' }, picker).phase).toBe('clue')
  })
})

describe('what each viewer sees, team game', () => {
  it('shows the callers the key, the others only turned words, and everyone everything at the end', () => {
    const { state, picker } = (() => {
      const s = teams()
      const giver = s.givers[s.active] as number
      const p = s.teams[s.active].find((seat) => seat !== giver) as number
      return { state: act(act(s, { type: 'clue', text: 'kiwi', count: 1 }, giver), { type: 'pick', index: indexOf(s, 'neutral') }, p), picker: p }
    })()
    for (const giver of [state.givers.ns, state.givers.ew] as number[]) {
      const view = wordBridge.view(state, giver) as WbTeamsView
      expect(view.key).toEqual(state.key)
      expect(view.role).toBe('giver')
    }
    for (const viewer of [picker, 'spectator'] as const) {
      const view = wordBridge.view(state, viewer) as WbTeamsView
      view.key.forEach((card, index) => expect(card).toBe(state.revealed[index] ? state.key[index] : null))
      expect(JSON.stringify(view)).not.toContain('"mine"')
    }
    const lost = act(
      act(state, { type: 'clue', text: 'kiwi', count: 1 }, state.givers[state.active] as number),
      { type: 'pick', index: indexOf(state, 'mine') },
      state.teams[state.active].find((seat) => seat !== state.givers[state.active]) as number,
    )
    expect((wordBridge.view(lost, 'spectator') as WbTeamsView).key).toEqual(lost.key)
  })
})

describe('co-op', () => {
  const duo = (seed = 1, turns = 10) => start(2, { turns }, seed) as WbDuoState
  const holderOf = (state: WbDuoState, side: 0 | 1) => state.holders[side]
  const giverOf = (state: WbDuoState) => state.holders[state.giverSide]
  const pickerOf = (state: WbDuoState) => state.holders[state.giverSide === 0 ? 1 : 0]
  const cardsOf = (state: WbDuoState, side: 0 | 1, card: string, also?: (index: number) => boolean) =>
    state.keys[side].map((c, i) => (c === card && !state.found[i] && (also?.(i) ?? true) ? i : -1)).filter((i) => i >= 0)

  it('shows each key holder their own side only, until the end', () => {
    const state = duo()
    const a = wordBridge.view(state, holderOf(state, 0)) as WbDuoView
    expect(a.keys[0]).toEqual(state.keys[0])
    expect(a.keys[1].every((card) => card === null)).toBe(true)
    const watcher = wordBridge.view(state, 'spectator') as WbDuoView
    expect(watcher.keys.flat().every((card) => card === null)).toBe(true)
  })

  it('judges a pick by the giver’s side: a target goes on, a bystander ends the turn, a trap loses', () => {
    let state = duo()
    const side = state.giverSide
    state = act(state, { type: 'clue', text: 'kiwi', count: 2 }, giverOf(state))
    const target = cardsOf(state, side, 'target')[0]
    state = act(state, { type: 'pick', index: target }, pickerOf(state))
    expect(state.found[target]).toBe(true)
    expect(state.phase).toBe('guess')
    const bystander = cardsOf(state, side, 'neutral')[0]
    const missed = act(state, { type: 'pick', index: bystander }, pickerOf(state))
    expect(missed.misses[side][bystander]).toBe(true)
    expect(missed.phase).toBe('clue')
    expect(missed.giverSide).not.toBe(side)
    expect(missed.turnsLeft).toBe(9)
    const trap = cardsOf(state, side, 'mine')[0]
    const lost = act(state, { type: 'pick', index: trap }, pickerOf(state))
    expect(lost.phase).toBe('over')
    expect(lost.won).toBe(false)
  })

  it('lets nobody re-pick a word the giver’s side already missed', () => {
    let state = duo()
    const side = state.giverSide
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giverOf(state))
    const bystander = cardsOf(state, side, 'neutral')[0]
    state = act(state, { type: 'pick', index: bystander }, pickerOf(state))
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giverOf(state))
    state = act(state, { type: 'pick', index: cardsOf(state, state.giverSide, 'target')[0] }, pickerOf(state))
    state = act(state, { type: 'stop' }, pickerOf(state))
    expect(state.giverSide).toBe(side)
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giverOf(state))
    expect(wordBridge.legalActions(state, pickerOf(state))).not.toContainEqual({ type: 'pick', index: bystander })
  })

  it('wins with all 15 found', () => {
    let state = duo(3, 12)
    while (state.phase !== 'over') {
      state = act(state, { type: 'clue', text: 'kiwi', count: 0 }, giverOf(state))
      const side = state.giverSide
      for (const index of cardsOf(state, side, 'target')) {
        state = act(state, { type: 'pick', index }, pickerOf(state))
        if (state.phase === 'over') break
      }
      if (state.phase === 'guess') state = act(state, { type: 'stop' }, pickerOf(state))
    }
    expect(state.won).toBe(true)
    expect(state.found.filter(Boolean)).toHaveLength(15)
    expect(wordBridge.result(state).summary.key).toBe('games.word-bridge.result.duo.won')
  })

  it('goes to a last stand when the clues run out, where a miss loses', () => {
    let state = duo(4, 8)
    for (let turn = 0; turn < 8; turn++) {
      state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giverOf(state))
      state = act(state, { type: 'pick', index: cardsOf(state, state.giverSide, 'target')[0] }, pickerOf(state))
      state = act(state, { type: 'stop' }, pickerOf(state))
    }
    expect(state.phase).toBe('final')
    expect(state.log.at(-1)).toEqual({ kind: 'final' })
    // Side 0's holder picks side 1's targets
    const forPartner = cardsOf(state, 1, 'target')[0]
    const after = act(state, { type: 'pick', index: forPartner }, holderOf(state, 0))
    expect(after.found[forPartner]).toBe(true)
    expect(after.phase).toBe('final')
    const wrong = state.keys[1].findIndex((card, index) => card === 'neutral' && !state.misses[1][index] && !state.found[index])
    const lost = act(state, { type: 'pick', index: wrong }, holderOf(state, 0))
    expect(lost.phase).toBe('over')
    expect(lost.ending?.reason).toBe('finalMiss')
  })

  it('hands the turn back when the next side has nothing left to clue', () => {
    let state = duo(5)
    const side = state.giverSide
    const otherSide = side === 0 ? 1 : 0
    // Find everything the other side would clue, through this side's clues where they overlap
    state = { ...state, found: state.keys[otherSide].map((card, index) => card === 'target' && state.keys[side][index] !== 'target') }
    // The other side's own-only targets are found; its shared ones remain, so first find those too
    state = { ...state, found: state.found.map((done, index) => done || (state.keys[otherSide][index] === 'target' && state.keys[side][index] === 'target')) }
    expect(duoLeftFor(state, otherSide)).toBe(0)
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giverOf(state))
    state = act(state, { type: 'pick', index: cardsOf(state, side, 'target')[0] }, pickerOf(state))
    state = act(state, { type: 'stop' }, pickerOf(state))
    expect(state.giverSide).toBe(side)
  })

  it('lets three choose who holds the key; the third picks on every clue', () => {
    let state = start(3) as WbDuoState
    expect(state.holders).toEqual([0, 1])
    state = act(state, { type: 'hold', side: 0 }, 2)
    expect(state.holders).toEqual([2, 1])
    state = act(state, { type: 'hold', side: 1 }, 2)
    expect(state.holders).toEqual([1, 2])
    expect(refusal(state, { type: 'hold', side: 1 }, 2)).toBe(error('sameSide'))
    state = act(state, { type: 'begin' }, 1)
    expect(state.phase).toBe('clue')
    const giver = state.holders[state.giverSide]
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giver)
    expect(wordBridge.legalActions(state, 0).length).toBeGreaterThan(0)
    expect(wordBridge.legalActions(state, giver)).toEqual([])
    expect((wordBridge.view(state, 0) as WbDuoView).keys.flat().every((card) => card === null)).toBe(true)
  })
})

describe('the clock and the room', () => {
  it('asks for a clock only when chosen, and passes the turn when it runs out', () => {
    expect(wordBridge.timers?.(teams())).toEqual([])
    const state = teams(1, { clock: 2 })
    expect(wordBridge.timers?.(state)).toEqual([{ id: 'clue-1', ms: 120_000, action: { type: 'timeUp' } }])
    const passed = act(state, { type: 'timeUp' }, 'system')
    expect(passed.active).not.toBe(state.active)
    expect(refusal(state, { type: 'timeUp' }, 0)).toBe(error('systemOnly'))
  })

  it('skips an absent caller or picker by ending the turn', () => {
    const state = teams()
    const giver = state.givers[state.active] as number
    expect(wordBridge.skipAction?.(state, giver)).toEqual({ type: 'skip', seat: giver })
    const enemy = state.teams[state.active === 'ns' ? 'ew' : 'ns'][0]
    expect(wordBridge.skipAction?.(state, enemy)).toBeNull()
    expect(act(state, { type: 'skip', seat: giver }, 'system').active).not.toBe(state.active)
  })
})

describe('random games', () => {
  const configs: [number, Partial<WbOptions>][] = [
    [2, {}],
    [3, { clock: 1 }],
    [4, {}],
    [5, { clock: 3 }],
    [7, {}],
    [10, {}],
    [6, { mode: 'duo', turns: 8 }],
  ]
  it.each(configs)('play to the end with %i seats %j, and never show a hidden key', (seats, overrides) => {
    for (let seed = 1; seed <= 4; seed++) {
      const options = { ...OPTIONS, ...overrides }
      const { steps, result } = playRandom(wordBridge, { seed, seats, options })
      expect(result.standings).toHaveLength(seats)
      // Replay and check every position's views for what they may not show
      let match: Match<WbState> = startMatch(wordBridge, makeSeats(seats), options, seed)
      const check = (state: WbState) => {
        for (const viewer of [...state.players, 'spectator' as const]) {
          const view = wordBridge.view(state, viewer)
          if (state.phase === 'over' || state.phase === 'setup') continue
          if (state.mode === 'teams') {
            const shown = (view as WbTeamsView).key
            const giver = viewer !== 'spectator' && (state.givers.ns === viewer || state.givers.ew === viewer)
            shown.forEach((card, index) => {
              if (!giver && !state.revealed[index]) expect(card).toBeNull()
            })
          } else {
            const keys = (view as WbDuoView).keys
            ;([0, 1] as const).forEach((side) => {
              if (viewer !== state.holders[side]) expect(keys[side].every((card) => card === null)).toBe(true)
            })
          }
        }
      }
      check(match.state)
      for (const step of steps) {
        const next = applyAction(wordBridge, match, step.action, step.actor)
        if (isGameError(next)) throw new Error(next.gameError)
        match = next
        check(match.state)
      }
    }
  })

  it('draws from a bank of 400 or more', () => {
    expect(WB_WORDS.length).toBeGreaterThanOrEqual(400)
  })
})
