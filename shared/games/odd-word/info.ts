// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { OddWordOptions } from './types.ts'

export const ODD_DEFAULT_ROUNDS = 8

export const oddWordInfo: GameInfo<OddWordOptions> = {
  id: 'odd-word',

  options: {
    undercovers: {
      kind: 'select',
      labelKey: 'games.odd-word.option.undercovers',
      choices: [
        { value: 0, labelKey: 'games.odd-word.option.auto' },
        { value: 1, labelKey: 'games.odd-word.option.n1' },
        { value: 2, labelKey: 'games.odd-word.option.n2' },
        { value: 3, labelKey: 'games.odd-word.option.n3' },
      ],
      default: 0,
    },
    blank: { kind: 'boolean', labelKey: 'games.odd-word.option.blank', default: false },
    rounds: {
      kind: 'int',
      labelKey: 'games.odd-word.option.rounds',
      min: 1,
      max: 30,
      default: ODD_DEFAULT_ROUNDS,
    },
  },
}
