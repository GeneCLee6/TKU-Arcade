// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { WbOptions } from './types.ts'

/** From this many players "auto" plays the team game; fewer play co-op */
export const WB_TEAMS_FROM = 4
export const WB_DEFAULT_TURNS = 10

export const wordBridgeInfo: GameInfo<WbOptions> = {
  id: 'word-bridge',
  // 2 to 10: co-op for two or three, two partnerships from four (owner's numbers, 2026-11-14)
  meta: {
    minPlayers: 2,
    maxPlayers: 10,
    minutes: 20,
    i18nKey: 'games.word-bridge',
  },

  options: {
    mode: {
      kind: 'select',
      labelKey: 'games.word-bridge.option.mode',
      choices: [
        { value: 'auto', labelKey: 'games.word-bridge.option.mode.auto' },
        { value: 'teams', labelKey: 'games.word-bridge.option.mode.teams' },
        { value: 'duo', labelKey: 'games.word-bridge.option.mode.duo' },
      ],
      default: 'auto',
    },
    // Numbers, not choices: every option string is in everyone's first load
    clock: { kind: 'int', labelKey: 'games.word-bridge.option.clock', min: 0, max: 5, default: 0 },
    turns: {
      kind: 'int',
      labelKey: 'games.word-bridge.option.turns',
      min: 6,
      max: 15,
      default: WB_DEFAULT_TURNS,
    },
  },
}
