// The lobby's "Play the computer" (2026-11-21, docs/ARCHITECTURE.md §4.55): a room that opens with
// computer players already seated and starts its game as soon as its one person joins. Which games
// can, how many computer players they get, and the check POST /api/rooms makes of `bots`.
import type { QuickBots } from '../protocol.ts'
import type { GameMeta } from './types.ts'

/** What of a game decides whether a room can open with computer players, and how many */
type BotGame = {
  meta: Pick<GameMeta, 'minPlayers' | 'maxPlayers'>
  bots?: { levels: readonly string[]; names: readonly string[] }
  bot?: unknown
}

/** The level a quick game is played at unless the person picks another */
export const QUICK_BOT_LEVEL = 'normal'

/**
 * How many computer players the lobby asks for: enough for the game's fewest players with the one
 * person, and always at least one (a quick game is never a person alone)
 */
export function quickBotCount(meta: Pick<GameMeta, 'minPlayers'>): number {
  return Math.max(1, meta.minPlayers - 1)
}

/**
 * `raw` as a room's computer players, or null when it is no good for this game: a game the room
 * does not play computer seats in (the kart's are the host's browser's), a level the game does not
 * have, or a count that, with the person, is short of the game's fewest players, past its most, or
 * past the names it has
 */
export function parseQuickBots(game: BotGame, raw: unknown): QuickBots | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { count, level } = raw as { count?: unknown; level?: unknown }
  const bots = game.bots
  if (!game.bot || !bots) return null
  if (typeof level !== 'string' || !bots.levels.includes(level)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null
  const players = count + 1
  if (players < game.meta.minPlayers || players > game.meta.maxPlayers) return null
  if (count > bots.names.length) return null
  return { count, level }
}
