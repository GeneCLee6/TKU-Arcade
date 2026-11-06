import { describe, expect, it } from 'vitest'
import { GAME_IDS, GAME_MESSAGES, getGame } from '../../shared/games/index.ts'
import { applyAction, makeSeats, replayMatch, startMatch } from '../../shared/games/match.ts'
import { defaultOptions, parseOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import {
  gameError,
  isGameError,
  type GameModule,
  type OptionsSchema,
} from '../../shared/games/types.ts'

describe('createRng', () => {
  it('pins the stream: a changed algorithm would change every stored replay', () => {
    const rng = createRng(42)
    expect([rng.int(1000), rng.int(1000), rng.int(1000), rng.int(1000)]).toEqual([
      956, 290, 704, 805,
    ])
    expect(rng.state()).toBe(3031295998)
  })

  it('the same seed gives the same numbers; another seed others', () => {
    const numbers = (seed: number) => {
      const rng = createRng(seed)
      return Array.from({ length: 20 }, () => rng.float())
    }
    expect(numbers(7)).toEqual(numbers(7))
    expect(numbers(7)).not.toEqual(numbers(8))
  })

  it('continues from a saved position exactly, through JSON', () => {
    const rng = createRng(123)
    rng.shuffle([1, 2, 3, 4, 5])
    const saved: number = JSON.parse(JSON.stringify(rng.state()))
    const resumed = createRng(saved)
    expect(Array.from({ length: 20 }, () => resumed.int(100))).toEqual(
      Array.from({ length: 20 }, () => rng.int(100)),
    )
  })

  it('stays in range and reaches every value', () => {
    const rng = createRng(1)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(6)
      expect(Number.isInteger(value) && value >= 0 && value < 6).toBe(true)
      seen.add(value)
      const float = rng.float()
      expect(float >= 0 && float < 1).toBe(true)
    }
    expect(seen.size).toBe(6)
  })

  it('is roughly fair', () => {
    const rng = createRng(99)
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < 40_000; i++) counts[rng.int(4)]++
    for (const count of counts) expect(Math.abs(count - 10_000)).toBeLessThan(400)
  })

  it('handles the largest bound and refuses bad ones', () => {
    const rng = createRng(5)
    const value = rng.int(2 ** 32)
    expect(value >= 0 && value < 2 ** 32).toBe(true)
    expect(rng.int(1)).toBe(0)
    for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 32 + 1]) {
      expect(() => rng.int(bad)).toThrow(RangeError)
    }
    expect(() => rng.pick([])).toThrow(RangeError)
  })

  it('shuffles a copy, keeping every item', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = createRng(3).shuffle(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(shuffled).not.toEqual(items)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
  })
})

describe('options', () => {
  type Options = { dice: 'four' | 'six'; rounds: number; steal: boolean; size: 3 | 5 }
  const schema: OptionsSchema<Options> = {
    dice: {
      kind: 'select',
      labelKey: 'dice',
      choices: [
        { value: 'four', labelKey: 'four' },
        { value: 'six', labelKey: 'six' },
      ],
      default: 'four',
    },
    rounds: { kind: 'int', labelKey: 'rounds', min: 1, max: 10, default: 5 },
    steal: { kind: 'boolean', labelKey: 'steal', default: true },
    size: {
      kind: 'select',
      labelKey: 'size',
      choices: [
        { value: 3, labelKey: 'small' },
        { value: 5, labelKey: 'big' },
      ],
      default: 3,
    },
  }
  const defaults: Options = { dice: 'four', rounds: 5, steal: true, size: 3 }

  it('has defaults', () => {
    expect(defaultOptions(schema)).toEqual(defaults)
  })

  it('keeps valid choices', () => {
    const choices: Options = { dice: 'six', rounds: 10, steal: false, size: 5 }
    expect(parseOptions(schema, choices)).toEqual(choices)
  })

  it('replaces invalid or missing values with the default and drops unknown keys', () => {
    const raw = { dice: 'nine', rounds: 11, steal: 'yes', extra: 1 }
    expect(parseOptions(schema, raw)).toEqual(defaults)
    expect(parseOptions(schema, { rounds: 2.5 })).toEqual(defaults)
    for (const junk of [null, 42, 'x', []]) expect(parseOptions(schema, junk)).toEqual(defaults)
  })

  it('does not read a field from the prototype chain', () => {
    const raw = Object.create({ rounds: 2 })
    expect(parseOptions(schema, raw).rounds).toBe(5)
  })
})

describe('match', () => {
  // Rolls a die on every action; refuses a roll of the wrong kind after already rolling it
  type State = { rolls: number[] }
  type Action = { type: 'roll' | 'bad' }
  const dice: GameModule<State, Action, State, Record<string, never>> = {
    id: 'dice',
    meta: { minPlayers: 2, maxPlayers: 3, minutes: 1, i18nKey: 'games.dice' },
    options: {},
    init: (_seats, _options, rng) => ({ rolls: [rng.int(6)] }),
    reduce(state, action, _actor, rng) {
      const roll = rng.int(6)
      if (action.type !== 'roll') return gameError('refused')
      return { rolls: [...state.rolls, roll] }
    },
    view: (state) => state,
    legalActions: () => [],
    isOver: () => false,
    result: () => ({ summary: { key: 'done' }, standings: [] }),
  }
  const seats = makeSeats(2)

  it('numbers seats from 0', () => {
    expect(makeSeats(3)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }])
  })

  it('refuses a seat count the game does not allow', () => {
    expect(() => startMatch(dice, makeSeats(1), {}, 1)).toThrow(RangeError)
    expect(() => startMatch(dice, makeSeats(4), {}, 1)).toThrow(RangeError)
  })

  it('stores the Rng beside the state and moves it with each action', () => {
    const first = startMatch(dice, seats, {}, 1)
    const second = applyAction(dice, first, { type: 'roll' }, 0)
    if (isGameError(second)) throw new Error('refused')
    expect(second.rngState).not.toBe(first.rngState)
    expect(second.state.rolls).toHaveLength(2)
    expect(first.state.rolls).toHaveLength(1)
  })

  it('a refused action moves nothing, even when reduce drew from the Rng first', () => {
    const match = startMatch(dice, seats, {}, 1)
    const answer = applyAction(dice, match, { type: 'bad' }, 0)
    expect(answer).toEqual({ gameError: 'refused' })
    const roll = (from: typeof match) => {
      const next = applyAction(dice, from, { type: 'roll' }, 0)
      if (isGameError(next)) throw new Error('refused')
      return next
    }
    // Refusing in between did not change what comes next
    expect(roll(match)).toEqual(roll(startMatch(dice, seats, {}, 1)))
  })

  it('replays seed + actions to the same match, through a storage round trip', () => {
    const steps = [0, 1, 0, 1].map((actor) => ({ actor, action: { type: 'roll' as const } }))
    let live = startMatch(dice, seats, {}, 9)
    for (const step of steps) {
      // As after a hibernation: the DO reads the match back from storage between actions
      live = JSON.parse(JSON.stringify(live))
      const next = applyAction(dice, live, step.action, step.actor)
      if (isGameError(next)) throw new Error('refused')
      live = next
    }
    expect(replayMatch(dice, seats, {}, 9, steps)).toEqual(live)
  })

  it('a replay throws on a step the game refuses', () => {
    const steps = [{ actor: 0, action: { type: 'bad' as const } }]
    expect(() => replayMatch(dice, seats, {}, 9, steps)).toThrow(/step 0 refused: refused/)
  })
})

describe('gameError', () => {
  it('builds and recognises one', () => {
    expect(gameError('k')).toEqual({ gameError: 'k' })
    expect(gameError('k', { n: 1 })).toEqual({ gameError: 'k', params: { n: 1 } })
    expect(isGameError(gameError('k'))).toBe(true)
    for (const other of [null, 1, 'k', [], {}, { board: [] }, { gameError: 1 }]) {
      expect(isGameError(other)).toBe(false)
    }
  })
})

describe('the registry', () => {
  it('finds a game, and nothing for an unknown or inherited id', () => {
    expect(getGame('tictactoe')?.id).toBe('tictactoe')
    expect(getGame('nope')).toBeNull()
    expect(getGame('__proto__')).toBeNull()
    expect(getGame('constructor')).toBeNull()
  })

  it('every game has a name and the same strings in both languages', () => {
    expect(Object.keys(GAME_MESSAGES['zh-TW']).sort()).toEqual(Object.keys(GAME_MESSAGES.en).sort())
    for (const id of GAME_IDS) {
      const game = getGame(id)
      expect(game?.meta.i18nKey).toBe(`games.${id}`)
      expect(GAME_MESSAGES.en[`games.${id}.name`]).toBeTruthy()
    }
  })
})
