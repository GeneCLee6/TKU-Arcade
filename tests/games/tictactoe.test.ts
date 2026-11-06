import { describe, expect, it } from 'vitest'
import { applyAction, makeSeats, projectGame, replayMatch } from '../../shared/games/match.ts'
import { ticTacToeMessages } from '../../shared/games/tictactoe/i18n.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import type { TicTacToeOptions } from '../../shared/games/tictactoe/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

const seats = makeSeats(2)
const options: TicTacToeOptions = { firstMove: 'lowestSeat' }

/** Alternating moves from seat 0 */
const moves = (...cells: number[]) =>
  cells.map((cell, index) => ({
    actor: (index % 2) as Actor,
    action: { type: 'place' as const, cell },
  }))

const playTo = (...cells: number[]) => replayMatch(ticTacToe, seats, options, 1, moves(...cells))

describe('tic-tac-toe, a chosen game', () => {
  it('a win ends it, with the line and the standings', () => {
    const { state } = playTo(0, 3, 1, 4, 2)
    expect(ticTacToe.isOver(state)).toBe(true)
    expect(state).toMatchObject({ winner: 0, line: [0, 1, 2], turn: null })
    const { summary, standings } = ticTacToe.result(state)
    expect(summary.key).toBe('games.tictactoe.result.won')
    expect(standings.map((line) => [line.seat, line.rank])).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  it('a full board with no line is a draw: both rank first', () => {
    const { state } = playTo(0, 1, 2, 4, 3, 5, 7, 6, 8)
    expect(ticTacToe.isOver(state)).toBe(true)
    expect(state.winner).toBeNull()
    expect(ticTacToe.result(state).standings.map((line) => line.rank)).toEqual([1, 1])
  })

  it('a win on the very last cell is a win, not a draw', () => {
    const { state } = playTo(0, 1, 2, 3, 4, 5, 7, 6, 8)
    expect(state.winner).toBe(0)
  })

  const refused = (error: unknown): GameError => {
    expect(isGameError(error)).toBe(true)
    return error as GameError
  }

  it.each([
    ['out of turn', [], { type: 'place', cell: 0 }, 1, 'notYourTurn'],
    ['a taken cell', [4], { type: 'place', cell: 4 }, 1, 'occupied'],
    ['off the board', [], { type: 'place', cell: 9 }, 0, 'badAction'],
    ['not a whole number', [], { type: 'place', cell: 0.5 }, 0, 'badAction'],
    ['the wrong shape', [], { cell: 0 }, 0, 'badAction'],
    ['after the end', [0, 3, 1, 4, 2], { type: 'place', cell: 8 }, 1, 'over'],
    ['from the system', [], { type: 'place', cell: 0 }, 'system', 'notYourTurn'],
  ] as const)('refuses %s and moves nothing', (_, cells, action, actor, key) => {
    const match = playTo(...cells)
    const answer = applyAction(ticTacToe, match, action as never, actor)
    expect(refused(answer).gameError).toBe(`games.tictactoe.error.${key}`)
  })

  it('every viewer sees the board; only seats get buttons, and only on their turn', () => {
    const { state } = playTo(4)
    const viewOf = (viewer: 0 | 1 | 'spectator') => projectGame(ticTacToe, state, viewer)
    expect(viewOf(0).view.you).toBe(0)
    expect(viewOf('spectator').view.you).toBeNull()
    expect(viewOf(0).view.board).toEqual(viewOf('spectator').view.board)
    expect(viewOf(0).legal).toEqual([])
    expect(viewOf(1).legal).toHaveLength(8)
    expect(viewOf('spectator').legal).toEqual([])
  })

  it('`firstMove` is honoured', () => {
    expect(playTo().state.turn).toBe(0)
    const firsts = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (seed) => replayMatch(ticTacToe, seats, { firstMove: 'random' }, seed, []).state.turn,
      ),
    )
    expect(firsts).toEqual(new Set([0, 1]))
  })
})

describe('tic-tac-toe, random games through the harness', () => {
  it('plays 200 seeds without breaking a rule, reaching all three endings', () => {
    const endings = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      const { final } = playRandom(ticTacToe, { seed })
      endings.add(final.state.winner === null ? 'draw' : `seat ${final.state.winner}`)
    }
    expect(endings).toEqual(new Set(['draw', 'seat 0', 'seat 1']))
  })

  it('the same seed plays the same game, and another seed another', () => {
    const steps = (seed: number) => playRandom(ticTacToe, { seed }).steps
    expect(steps(5)).toEqual(steps(5))
    expect(steps(5)).not.toEqual(steps(6))
  })
})

describe('tic-tac-toe strings', () => {
  it('has the same keys in both languages', () => {
    const { en, 'zh-TW': zhTW } = ticTacToeMessages
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort())
  })

  it('has every key the module refers to', () => {
    const keys = new Set(Object.keys(ticTacToeMessages.en))
    const { firstMove } = ticTacToe.options
    const referred = [
      `${ticTacToe.meta.i18nKey}.name`,
      firstMove.labelKey,
      ...firstMove.choices.map((choice) => choice.labelKey),
    ]
    const { state: won } = playTo(0, 3, 1, 4, 2)
    const { state: drawn } = playTo(0, 1, 2, 4, 3, 5, 7, 6, 8)
    for (const state of [won, drawn]) {
      const result = ticTacToe.result(state)
      referred.push(result.summary.key, ...result.standings.map((line) => line.note.key))
    }
    for (const key of referred) expect(keys, key).toContain(key)
  })
})
