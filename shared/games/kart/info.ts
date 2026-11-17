// The race room's options: no rules and no tracks, only their ids, and not in the first load either.
// The room loads this file when it opens a race room (src/i18n/gameDetails.ts); the lobby card's
// players and minutes are in shared/games/lobby.ts. `rules.ts` spreads this into the module.
import { CODE_PATTERN, MAX_CODE_CHARS } from '../../kart/editor/codeShape.ts'
import { RACE_TRACK_IDS } from '../../kart/tracks/list.ts'
import type { GameInfo } from '../types.ts'
import type { KartOptions } from './types.ts'

export const MAX_LAPS = 9
/** The `track` option's value for a track made in the editor */
export const CUSTOM_TRACK = 'custom'

export const kartInfo: GameInfo<KartOptions> = {
  id: 'kart',
  options: {
    track: {
      kind: 'select',
      labelKey: 'games.kart.option.track',
      choices: [
        ...RACE_TRACK_IDS.map((id) => ({ value: id, labelKey: `games.kart.track.${id}` })),
        // e10-t08: a track made in the editor, given in `custom`
        { value: CUSTOM_TRACK, labelKey: 'games.kart.track.custom' },
      ],
      default: RACE_TRACK_IDS[0],
    },
    // Its code; the room checks the track itself (rules.ts sets `check`), the browser only the form
    custom: {
      kind: 'text',
      labelKey: 'games.kart.option.custom',
      default: '',
      maxLength: MAX_CODE_CHARS,
      pattern: CODE_PATTERN,
      control: 'kart-track',
      showIf: { field: 'track', value: CUSTOM_TRACK },
    },
    laps: { kind: 'int', labelKey: 'games.kart.option.laps', min: 1, max: MAX_LAPS, default: 3 },
    // e9-t05: item boxes on the road, or a plain race
    mode: {
      kind: 'select',
      labelKey: 'games.kart.option.mode',
      choices: [
        { value: 'items', labelKey: 'games.kart.mode.items' },
        { value: 'race', labelKey: 'games.kart.mode.race' },
      ],
      default: 'items',
    },
  },
}
