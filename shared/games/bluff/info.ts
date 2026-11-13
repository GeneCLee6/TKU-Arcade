// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { BluffOptions } from './types.ts'

export const BLUFF_READ_SECONDS = 60

export const bluffInfo: GameInfo<BluffOptions> = {
  id: 'bluff',
  // Listed with its screen (I2). 3 to 9: a judge, the honest reader and at least one bluffer; the
  // mole needs four
  meta: {
    minPlayers: 3,
    maxPlayers: 9,
    minutes: 30,
    i18nKey: 'games.bluff',
  },

  options: {
    twoRounds: { kind: 'boolean', labelKey: 'games.bluff.option.twoRounds', default: false },
    readSeconds: {
      kind: 'int',
      labelKey: 'games.bluff.option.readSeconds',
      min: 20,
      max: 180,
      default: BLUFF_READ_SECONDS,
    },
    mole: { kind: 'boolean', labelKey: 'games.bluff.option.mole', default: true },
    hints: { kind: 'boolean', labelKey: 'games.bluff.option.hints', default: true },
    clock: { kind: 'boolean', labelKey: 'games.bluff.option.clock', default: true },
  },
}
