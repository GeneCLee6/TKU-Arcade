// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { BluffOptions } from './types.ts'

export const BLUFF_READ_SECONDS = 60

export const bluffInfo: GameInfo<BluffOptions> = {
  id: 'bluff',

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
