// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { OddWordOptions } from './types.ts'

export const ODD_DEFAULT_ROUNDS = 8

export const oddWordInfo: GameInfo<OddWordOptions> = {
  id: 'odd-word',
  // 3 to 12: the owner's numbers (2026-11-14). The talking is on the friends' own voice call
  meta: {
    minPlayers: 3,
    maxPlayers: 12,
    minutes: 20,
    i18nKey: 'games.odd-word',
  },

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
