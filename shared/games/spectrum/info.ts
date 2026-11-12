// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { SpectrumOptions } from './types.ts'

export const spectrumInfo: GameInfo<SpectrumOptions> = {
  id: 'spectrum',
  // Unlisted until the owner picks its name (PRD Q3) and signs docs/IP-CHECKLIST.md: merging deploys,
  // and a listed game is live. No `proxyTurns`: an answer has to come from a person.
  // 4 to 11: at least three answerers, so that the largest and the smallest are two different
  // calls; at most ten, so that ten different numbers go round
  meta: {
    minPlayers: 4,
    maxPlayers: 11,
    minutes: 25,
    i18nKey: 'games.spectrum',
    unlisted: true,
  },

  options: {
    mode: {
      kind: 'select',
      labelKey: 'games.spectrum.option.mode',
      choices: [
        { value: 'extremes', labelKey: 'games.spectrum.option.mode.extremes' },
        { value: 'order', labelKey: 'games.spectrum.option.mode.order' },
      ],
      default: 'extremes',
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
