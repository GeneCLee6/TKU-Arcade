// The race room's options: no rules and no tracks, only their ids, and not in the first load either.
// The room loads this file when it opens a race room (src/i18n/gameDetails.ts); the lobby card's
// players and minutes are in shared/games/lobby.ts. `rules.ts` spreads this into the module.
import { RACE_TRACK_IDS } from '../../kart/tracks/list.ts'
import type { GameInfo } from '../types.ts'
import type { KartOptions } from './types.ts'

export const MAX_LAPS = 9

export const kartInfo: GameInfo<KartOptions> = {
  id: 'kart',
  options: {
    track: {
      kind: 'select',
      labelKey: 'games.kart.option.track',
      choices: RACE_TRACK_IDS.map((id) => ({ value: id, labelKey: `games.kart.track.${id}` })),
      default: RACE_TRACK_IDS[0],
    },
    laps: { kind: 'int', labelKey: 'games.kart.option.laps', min: 1, max: MAX_LAPS, default: 3 },
  },
}
