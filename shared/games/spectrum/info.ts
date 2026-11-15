// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { SpectrumOptions } from './types.ts'

export const spectrumInfo: GameInfo<SpectrumOptions> = {
  id: 'spectrum',

  options: {
    mode: {
      kind: 'select',
      labelKey: 'games.spectrum.option.mode',
      choices: [
        { value: 'extremes', labelKey: 'games.spectrum.option.mode.extremes' },
        { value: 'order', labelKey: 'games.spectrum.option.mode.order' },
      ],
      // Every answer in order by default (owner, 2026-11-13); the largest and smallest stay an option
      default: 'order',
    },
    duplicates: {
      kind: 'boolean',
      labelKey: 'games.spectrum.option.duplicates',
      default: false,
    },
    twoRounds: {
      kind: 'boolean',
      labelKey: 'games.spectrum.option.twoRounds',
      default: false,
    },
    clock: {
      kind: 'boolean',
      labelKey: 'games.spectrum.option.clock',
      default: true,
    },
  },
}
