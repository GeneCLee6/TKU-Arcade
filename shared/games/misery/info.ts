// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { MiseryOptions } from './types.ts'

export const MISERY_DEFAULT_TARGET = 10
export const MISERY_DEFAULT_START = 3
export const MISERY_MAX_START = 5

export const miseryInfo: GameInfo<MiseryOptions> = {
  id: 'misery',
  // 2 to 10 (owner's request 2026-11-14). The talking is on the friends' own voice call; no
  // `proxyTurns`: where a card goes is a decision
  meta: {
    minPlayers: 2,
    maxPlayers: 10,
    minutes: 25,
    i18nKey: 'games.misery',
  },

  options: {
    target: {
      kind: 'select',
      labelKey: 'games.misery.option.target',
      choices: [
        { value: 8, labelKey: 'games.misery.option.target8' },
        { value: 10, labelKey: 'games.misery.option.target10' },
        { value: 12, labelKey: 'games.misery.option.target12' },
      ],
      default: MISERY_DEFAULT_TARGET,
    },
    startCards: {
      kind: 'int',
      labelKey: 'games.misery.option.startCards',
      min: 1,
      max: MISERY_MAX_START,
      default: MISERY_DEFAULT_START,
    },
    steals: { kind: 'boolean', labelKey: 'games.misery.option.steals', default: true },
    clock: {
      kind: 'select',
      labelKey: 'games.misery.option.clock',
      choices: [
        { value: 0, labelKey: 'games.misery.option.clockOff' },
        { value: 30, labelKey: 'games.misery.option.clock30' },
        { value: 60, labelKey: 'games.misery.option.clock60' },
      ],
      default: 60,
    },
  },
}
