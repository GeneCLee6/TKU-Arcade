// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { TicTacToeOptions } from './types.ts'

export const ticTacToeInfo: GameInfo<TicTacToeOptions> = {
  id: 'tictactoe',

  options: {
    firstMove: {
      kind: 'select',
      labelKey: 'games.tictactoe.option.firstMove',
      choices: [
        { value: 'random', labelKey: 'games.tictactoe.option.firstMove.random' },
        { value: 'lowestSeat', labelKey: 'games.tictactoe.option.firstMove.lowestSeat' },
      ],
      default: 'random',
    },
  },
}
