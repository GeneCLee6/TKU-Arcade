// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { HoldemOptions } from './types.ts'

export const holdemInfo: GameInfo<HoldemOptions> = {
  id: 'holdem',
  // 2 to 9: the owner's numbers (2026-11-14), one full table
  meta: {
    minPlayers: 2,
    maxPlayers: 9,
    minutes: 45,
    i18nKey: 'games.holdem',
  },

  options: {
    stack: {
      kind: 'select',
      labelKey: 'games.holdem.option.stack',
      choices: [
        { value: 1000, labelKey: 'games.holdem.option.n.1000' },
        { value: 2000, labelKey: 'games.holdem.option.n.2000' },
        { value: 5000, labelKey: 'games.holdem.option.n.5000' },
      ],
      default: 1000,
    },
    blinds: {
      kind: 'select',
      labelKey: 'games.holdem.option.blinds',
      choices: [
        { value: 10, labelKey: 'games.holdem.option.blinds.10' },
        { value: 20, labelKey: 'games.holdem.option.blinds.20' },
        { value: 50, labelKey: 'games.holdem.option.blinds.50' },
      ],
      default: 20,
    },
    blindUp: {
      kind: 'select',
      labelKey: 'games.holdem.option.blindUp',
      choices: [
        { value: 0, labelKey: 'room.options.off' },
        { value: 10, labelKey: 'games.holdem.option.blindUp.10' },
        { value: 20, labelKey: 'games.holdem.option.blindUp.20' },
      ],
      default: 10,
    },
    timer: {
      kind: 'select',
      labelKey: 'games.holdem.option.timer',
      choices: [
        { value: 0, labelKey: 'room.options.off' },
        { value: 20, labelKey: 'games.holdem.option.timer.20' },
        { value: 30, labelKey: 'games.holdem.option.timer.30' },
        { value: 60, labelKey: 'games.holdem.option.timer.60' },
      ],
      default: 30,
    },
  },
}
