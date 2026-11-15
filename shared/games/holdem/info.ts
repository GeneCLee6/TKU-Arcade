// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { HoldemOptions } from './types.ts'

export const holdemInfo: GameInfo<HoldemOptions> = {
  id: 'holdem',

  options: {
    // In big blinds: the blinds always start at 10 / 20, so 100 / 200 / 300 BB is 2,000 / 4,000 /
    // 6,000 chips (owner, 2026-11-15: 50 BB was far too shallow)
    stack: {
      kind: 'select',
      labelKey: 'games.holdem.option.stack',
      choices: [
        { value: 100, labelKey: 'games.holdem.option.bb.100' },
        { value: 200, labelKey: 'games.holdem.option.bb.200' },
        { value: 300, labelKey: 'games.holdem.option.bb.300' },
      ],
      default: 200,
    },
    blindUp: {
      kind: 'select',
      labelKey: 'games.holdem.option.blindUp',
      choices: [
        { value: 0, labelKey: 'room.options.off' },
        { value: 15, labelKey: 'games.holdem.option.blindUp.15' },
        { value: 20, labelKey: 'games.holdem.option.blindUp.20' },
      ],
      default: 0,
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
