// A module's types are `type` aliases, not interfaces, so they stay assignable to JsonValue.
import type { SeatId } from '../types.ts'

export type TicTacToeOptions = {
  /** Who moves first */
  firstMove: 'random' | 'lowestSeat'
}

/** The full state: server only. In a game with secrets, this is where they live */
export type TicTacToeState = {
  /** Nine cells, row by row: the seat that took each, or null */
  board: (SeatId | null)[]
  /** Whose move it is; null once the game is over */
  turn: SeatId | null
  /** Null while playing, and in a draw */
  winner: SeatId | null
  /** The three winning cells, once there are */
  line: number[] | null
}

export type TicTacToeAction = { type: 'place'; cell: number }

/** What one viewer sees: the whole board, and which seat is theirs */
export type TicTacToeView = TicTacToeState & {
  /** The viewer's own seat; null for a spectator */
  you: SeatId | null
}
