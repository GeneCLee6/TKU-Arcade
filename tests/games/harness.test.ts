import { describe, expect, it } from 'vitest'
import { gameError, type GameModule, type Viewer } from '../../shared/games/types.ts'
import { HarnessError, playRandom } from './harness.ts'

// A test-only game with secrets. Each seat is dealt a card; players take turns playing theirs, and
// after both have played the cards are public. Every test below breaks exactly one thing about it.
type State = {
  hands: string[]
  played: boolean[]
  turn: number | null
}
type Action = { type: 'play' }
type View = {
  mine: string | null
  /** Others' cards, public once played */
  table: (string | null)[]
  turn: number | null
}
type Options = Record<string, never>
type Game = GameModule<State, Action, View, Options>

const CARDS = ['card-Ah', 'card-Kd', 'card-Qs', 'card-Jc']

const isPlay = (action: unknown) =>
  typeof action === 'object' && action !== null && (action as Action).type === 'play'

const secretsOf = (state: State, viewer: Viewer) =>
  state.hands.filter((_, seat) => seat !== viewer && !state.played[seat])

const fair: Game = {
  id: 'fake',
  meta: { minPlayers: 2, maxPlayers: 2, minutes: 1, i18nKey: 'games.fake' },
  options: {},
  init(seats, _options, rng) {
    return {
      hands: rng.shuffle(CARDS).slice(0, seats.length),
      played: seats.map(() => false),
      turn: 0,
    }
  },
  reduce(state, action, actor) {
    if (!isPlay(action)) return gameError('bad')
    if (actor !== state.turn) return gameError('turn')
    const played = state.played.map((done, seat) => done || seat === actor)
    return { ...state, played, turn: played.every(Boolean) ? null : 1 - actor }
  },
  view(state, viewer) {
    return {
      mine: viewer === 'spectator' ? null : state.hands[viewer],
      table: state.hands.map((card, seat) => (state.played[seat] ? card : null)),
      turn: state.turn,
    }
  },
  legalActions(state, seat) {
    return state.turn === seat ? [{ type: 'play' }] : []
  },
  isOver(state) {
    return state.turn === null
  },
  result() {
    return {
      summary: { key: 'done' },
      standings: [0, 1].map((seat) => ({ seat, rank: 1, score: null, note: { key: 'note' } })),
    }
  },
}

const play = (game: Game) => playRandom(game, { seed: 7, secrets: secretsOf })

describe('the harness on a fair game with secrets', () => {
  it('plays it to the end', () => {
    const { steps, result } = play(fair)
    expect(steps).toEqual([
      { actor: 0, action: { type: 'play' } },
      { actor: 1, action: { type: 'play' } },
    ])
    expect(result.summary.key).toBe('done')
  })

  it('finds the secrets it was told about: the same game passes only when they stay hidden', () => {
    // The dealt card is really in the player's own view, so naming it as a secret must fail
    expect(() => playRandom(fair, { seed: 7, secrets: (state) => [state.hands[0]] })).toThrow(
      /leaks the secret/,
    )
  })
})

describe('the harness catches a module that', () => {
  const cases: [string, Game, RegExp][] = [
    [
      'leaks another seat’s card in a view',
      { ...fair, view: (state, viewer) => ({ ...fair.view(state, viewer), table: state.hands }) },
      /what 0 is sent leaks the secret/,
    ],
    [
      'leaks only to spectators',
      {
        ...fair,
        view: (state, viewer) =>
          viewer === 'spectator'
            ? { ...fair.view(state, viewer), table: state.hands }
            : fair.view(state, viewer),
      },
      /what spectator is sent leaks the secret/,
    ],
    [
      'leaks a secret as an object key',
      {
        ...fair,
        view: (state, viewer) =>
          ({ ...fair.view(state, viewer), seen: { [state.hands[1]]: true } }) as View,
      },
      /what 0 is sent leaks the secret/,
    ],
    [
      'leaks a secret through legalActions',
      {
        ...fair,
        legalActions: (state, seat) =>
          state.turn === seat ? [{ type: 'play', hint: state.hands[1 - seat] } as Action] : [],
      },
      /leaks the secret/,
    ],
    [
      'throws in a view',
      {
        ...fair,
        view(state, viewer) {
          if (viewer === 'spectator') throw new Error('no seat')
          return fair.view(state, viewer)
        },
      },
      /projection for spectator threw/,
    ],
    [
      'offers an action reduce refuses',
      { ...fair, legalActions: () => [{ type: 'play' }] },
      /legal action .* was refused/,
    ],
    [
      'lets a seat play out of turn',
      {
        ...fair,
        reduce(state, action, actor, rng) {
          if (!isPlay(action)) return gameError('bad')
          return fair.reduce(state, action, state.turn ?? actor, rng)
        },
      },
      /could play seat/,
    ],
    [
      'accepts junk',
      {
        ...fair,
        reduce: (state, action, actor, rng) =>
          isPlay(action) ? fair.reduce(state, action, actor, rng) : state,
      },
      /junk action .* was accepted/,
    ],
    [
      'throws on junk',
      {
        ...fair,
        reduce(state, action, actor, rng) {
          if (!isPlay(action)) throw new Error('what is this')
          return fair.reduce(state, action, actor, rng)
        },
      },
      /threw: Error: what is this/,
    ],
    [
      'mutates the state',
      {
        ...fair,
        reduce(state, action, actor, rng) {
          if (isPlay(action) && actor === state.turn) state.played[actor] = true
          return fair.reduce(state, action, actor, rng)
        },
      },
      /threw: TypeError/,
    ],
    [
      'puts something that is not JSON in the state',
      {
        ...fair,
        init: (seats, options, rng) =>
          ({ ...fair.init(seats, options, rng), startedAt: new Date(0) }) as unknown as State,
      },
      /state is not plain JSON/,
    ],
    [
      'sends undefined in a view',
      {
        ...fair,
        view: (state, viewer) =>
          ({ ...fair.view(state, viewer), oops: undefined }) as unknown as View,
      },
      /is not plain JSON/,
    ],
    [
      'gets stuck: nobody can act and the game is not over',
      { ...fair, legalActions: () => [] },
      /nobody can act/,
    ],
    [
      'still offers actions after the game is over',
      { ...fair, legalActions: () => [{ type: 'play' }], isOver: () => true },
      /legal actions after the end/,
    ],
    [
      'leaves a seat out of the result',
      {
        ...fair,
        result: () => ({
          summary: { key: 'done' },
          standings: [{ seat: 0, rank: 1, score: null, note: { key: 'note' } }],
        }),
      },
      /not every seat once/,
    ],
  ]

  it.each(cases)('%s', (_, game, message) => {
    expect(() => play(game)).toThrow(HarnessError)
    expect(() => play(game)).toThrow(message)
  })

  it('never ends', () => {
    const endless: Game = {
      ...fair,
      reduce: (state, action, actor) =>
        !isPlay(action)
          ? gameError('bad')
          : actor !== state.turn
            ? gameError('turn')
            : { ...state, turn: 1 - actor },
    }
    expect(() => playRandom(endless, { seed: 7, maxSteps: 50 })).toThrow(/has not ended after 50/)
  })

  it('is impure: the same seed plays another game', () => {
    // A hidden counter stands in for Math.random or Date.now, deterministically for the test
    let calls = 0
    const impure: Game = {
      ...fair,
      init(seats) {
        calls += 1
        return {
          hands: CARDS.slice(calls % 2, (calls % 2) + seats.length),
          played: seats.map(() => false),
          turn: 0,
        }
      },
    }
    expect(() => playRandom(impure, { seed: 7 })).toThrow(/same seed played a different game/)
  })

  it('names the seed and the step, so the failure can be played again', () => {
    const lateLeak: Game = {
      ...fair,
      view: (state, viewer) =>
        state.played[0]
          ? { ...fair.view(state, viewer), table: state.hands }
          : fair.view(state, viewer),
    }
    expect(() => play(lateLeak)).toThrow(/fake, seed 7, step 1:/)
  })
})

describe('timers', () => {
  // Nobody can act on the second phase: only the clock moves the game on
  const clocked: Game = {
    ...fair,
    reduce(state, action, actor, rng) {
      if (!isPlay(action)) return gameError('bad')
      if (state.turn === 1) {
        return actor === 'system'
          ? { ...state, played: [true, true], turn: null }
          : gameError('wait')
      }
      return fair.reduce(state, action, actor, rng)
    },
    legalActions: (state, seat) => (state.turn === 0 && seat === 0 ? [{ type: 'play' }] : []),
    timers: (state) =>
      state.turn === 1 ? [{ id: 'second', ms: 1000, action: { type: 'play' } }] : [],
  }

  it('runs out when nobody can act, as the system', () => {
    const { steps } = play(clocked)
    expect(steps.at(-1)).toEqual({ actor: 'system', action: { type: 'play' } })
  })

  it('a system action the game refuses is a failure', () => {
    const stuck: Game = {
      ...clocked,
      reduce: (state, action, actor, rng) =>
        actor === 'system' ? gameError('no') : clocked.reduce(state, action, actor, rng),
    }
    expect(() => play(stuck)).toThrow(/system's action .* refused: no/)
  })
})
