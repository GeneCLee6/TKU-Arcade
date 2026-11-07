// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { TicTacToeOptions } from './types.ts'

export const ticTacToeInfo: GameInfo<TicTacToeOptions> = {
  id: 'tictactoe',
  meta: { minPlayers: 2, maxPlayers: 2, minutes: 2, i18nKey: 'games.tictactoe', unlisted: true },

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
