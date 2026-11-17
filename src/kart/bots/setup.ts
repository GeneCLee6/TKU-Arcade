// A race against the computer's settings (docs/ARCHITECTURE.md §4.20), kept in this browser so that
// the menu opens with the last ones (storage.ts never throws).
import type { KartMode } from '../../../shared/games/kart/types.ts'
import { MAX_LAPS } from '../../../shared/games/kart/info.ts'
import { CUSTOM_PREFIX } from '../../../shared/kart/editor/custom.ts'
import { RACE_TRACK_IDS, type RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import { readStored, writeStored } from '../../lib/storage.ts'
import { MAX_BOTS } from './roster.ts'
import { isDifficulty, type Difficulty } from './skill.ts'

export interface BotSetup {
  /** `custom`: the track made in the editor that /kart was opened with (e10-t07), in `custom` */
  readonly track: RaceTrackId | 'custom'
  /** Its code; not kept: the next visit has no such track unless its link is opened again */
  readonly custom?: string
  readonly bots: number
  readonly difficulty: Difficulty
  readonly mode: KartMode
  readonly laps: number
}

export const DEFAULT_BOT_SETUP: BotSetup = {
  track: 'riverside',
  bots: 5,
  difficulty: 'normal',
  mode: 'items',
  laps: 3,
}

const KEY = 'tku-arcade.kart.bots'

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback

/** Settings from anything (storage, a hand-edited value): whatever is not right is the default */
export function parseBotSetup(value: unknown): BotSetup {
  const given =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const d = DEFAULT_BOT_SETUP
  return {
    track: RACE_TRACK_IDS.find((id) => id === given.track) ?? d.track,
    bots: clampInt(given.bots, 1, MAX_BOTS, d.bots),
    difficulty: isDifficulty(given.difficulty) ? given.difficulty : d.difficulty,
    mode: given.mode === 'race' || given.mode === 'items' ? given.mode : d.mode,
    laps: clampInt(given.laps, 1, MAX_LAPS, d.laps),
  }
}

export function loadBotSetup(): BotSetup {
  try {
    return parseBotSetup(JSON.parse(readStored(KEY) ?? 'null'))
  } catch {
    return DEFAULT_BOT_SETUP
  }
}

export const saveBotSetup = (setup: BotSetup): void => {
  const { custom: _custom, ...kept } = setup
  writeStored(KEY, JSON.stringify(kept))
}

/** The race room's id for the setup's track: a custom one is `custom:<code>` */
export const botTrackId = (setup: BotSetup): string =>
  setup.track === 'custom' ? `${CUSTOM_PREFIX}${setup.custom ?? ''}` : setup.track
