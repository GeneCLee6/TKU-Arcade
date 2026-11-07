// The template module (docs/ARCHITECTURE.md §3): copy this folder to start a game. It is small on
// purpose and also the framework's test subject. It has no secrets and no clock: see `view` for
// where a game with secrets cuts them, and TimerSpec (shared/games/types.ts) for a game with a
// clock.
import { ticTacToeInfo } from './info.ts'
import { gameError, type GameModule, type SeatId } from '../types.ts'
import type { TicTacToeAction, TicTacToeOptions, TicTacToeState, TicTacToeView } from './types.ts'

const CELLS = 9

const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const other = (seat: SeatId): SeatId => 1 - seat

/** `action` comes off the network: its static type promises nothing at run time */
function isPlace(action: unknown): action is TicTacToeAction {
  if (typeof action !== 'object' || action === null) return false
  const { type, cell } = action as Record<string, unknown>
  return type === 'place' && Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) < CELLS
}

function winningLine(board: TicTacToeState['board'], seat: SeatId): number[] | null {
  const line = LINES.find((cells) => cells.every((cell) => board[cell] === seat))
  return line ? [...line] : null
}

export const ticTacToe: GameModule<
  TicTacToeState,
  TicTacToeAction,
  TicTacToeView,
  TicTacToeOptions
> = {
  ...ticTacToeInfo,

  init(seats, options, rng) {
    return {
      board: Array.from({ length: CELLS }, () => null),
      turn: options.firstMove === 'random' ? rng.pick(seats).id : seats[0].id,
      winner: null,
      line: null,
    }
  },

  // Dice or a shuffle would use the fourth argument, `rng`; this game only needs chance in `init`
  reduce(state, action, actor) {
    if (!isPlace(action)) return gameError('games.tictactoe.error.badAction')
    if (state.turn === null) return gameError('games.tictactoe.error.over')
    if (actor !== state.turn) return gameError('games.tictactoe.error.notYourTurn')
    if (state.board[action.cell] !== null) return gameError('games.tictactoe.error.occupied')

    const board = state.board.map((seat, cell) => (cell === action.cell ? actor : seat))
    const line = winningLine(board, actor)
    if (line) return { board, turn: null, winner: actor, line }
    const full = board.every((seat) => seat !== null)
    return { board, turn: full ? null : other(actor), winner: null, line: null }
  },

  // Everything here is public, so this only adds `you`. A game with secrets names each field it
  // sends, so that a field added to the state later stays hidden until someone decides otherwise:
  //   hand: viewer === 'spectator' ? null : state.hands[viewer]
  view(state, viewer) {
    return {
      board: state.board,
      turn: state.turn,
      winner: state.winner,
      line: state.line,
      you: viewer === 'spectator' ? null : viewer,
    }
  },

  legalActions(state, seat) {
    if (state.turn !== seat) return []
    return state.board.flatMap((taken, cell) =>
      taken === null ? [{ type: 'place' as const, cell }] : [],
    )
  },

  isOver(state) {
    return state.turn === null
  },

  result(state) {
    if (state.winner === null) {
      return {
        summary: { key: 'games.tictactoe.result.draw' },
        standings: [0, 1].map((seat) => ({
          seat,
          rank: 1,
          score: null,
          note: { key: 'games.tictactoe.note.drew' },
        })),
      }
    }
    return {
      summary: { key: 'games.tictactoe.result.won' },
      standings: [
        { seat: state.winner, rank: 1, score: null, note: { key: 'games.tictactoe.note.won' } },
        {
          seat: other(state.winner),
          rank: 2,
          score: null,
          note: { key: 'games.tictactoe.note.lost' },
        },
      ],
    }
  },
}
