// What the browser needs to know of the race room before anyone plays: no rules and no tracks, only
// their ids (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import { RACE_TRACK_IDS } from '../../kart/tracks/list.ts'
import type { GameInfo } from '../types.ts'
import type { KartOptions } from './types.ts'

export const MAX_LAPS = 9

export const kartInfo: GameInfo<KartOptions> = {
  id: 'kart',
  // One player can open a room alone: to try the track, or to wait on the grid for friends. No
  // proxy turns: there are no turns
  meta: {
    minPlayers: 1,
    maxPlayers: 8,
    minutes: 5,
    i18nKey: 'games.kart',
    tryAlone: '/kart',
  },
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
