// The lobby's "Play the computer" (2026-11-21, docs/ARCHITECTURE.md §4.55): a room that opens with
// computer players already seated and starts its game as soon as its one person joins. Which games
// can, how many computer players they may get (2026-11-22: the person picks, one up to a full
// table), at which levels (all the same, or one each), and the check POST /api/rooms makes of `bots`.
import type { QuickBots, SeatBots } from '../protocol.ts'
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
 * How many computer players a game is most fun with against one person, where that is not simply
 * "as many as fit" (2026-11-22, the owner: hold'em with only one computer is no game): a lively
 * table that still moves along. Clamped to what the game takes (quickBotRange).
 */
const QUICK_BOT_DEFAULTS: Readonly<Record<string, number>> = {
  holdem: 5,
  promotion: 3,
  traders: 3,
  tiles: 3,
  palace: 3,
  'secret-scroll': 3,
  wasabi: 3,
  // 2026-11-23
  kite: 2,
  lantern: 2,
  'silent-table': 3,
  misery: 3,
}

/**
 * The fewest and most computer players a quick game of this game can have: at least one (a quick
 * game is never a person alone) and enough for its fewest players with the person; at most every
 * other seat, and no more than the names the game has for them
 */
export function quickBotRange(
  meta: Pick<GameMeta, 'minPlayers' | 'maxPlayers'>,
  names = Infinity,
): { min: number; max: number } {
  const min = Math.max(1, meta.minPlayers - 1)
  const max = Math.max(min, Math.min(meta.maxPlayers - 1, names))
  return { min, max }
}

/** How many computer players the lobby offers first for `gameId` */
export function quickBotCount(gameId: string, meta: Pick<GameMeta, 'minPlayers' | 'maxPlayers'>): number {
  const { min, max } = quickBotRange(meta)
  return Math.min(max, Math.max(min, QUICK_BOT_DEFAULTS[gameId] ?? min))
}

/**
 * `raw` as a room's computer players, or null when it is no good for this game: a game the room
 * does not play computer seats in (the kart's are the host's browser's), a level the game does not
 * have, or a count that, with the person, is short of the game's fewest players, past its most, or
 * past the names it has. `levels`, when there, is one level per computer player, in seat order.
 */
export function parseQuickBots(game: BotGame, raw: unknown): QuickBots | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { count, level, levels } = raw as { count?: unknown; level?: unknown; levels?: unknown }
  const bots = game.bots
  if (!game.bot || !bots) return null
  if (typeof level !== 'string' || !bots.levels.includes(level)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null
  const players = count + 1
  if (players < game.meta.minPlayers || players > game.meta.maxPlayers) return null
  if (count > bots.names.length) return null
  if (levels === undefined) return { count, level }
  if (!Array.isArray(levels) || levels.length !== count) return null
  if (!levels.every((one) => typeof one === 'string' && bots.levels.includes(one))) return null
  return { count, level, levels: [...(levels as string[])] }
}

/** The level of the computer player in the `index`th seat it was given (0 first) */
export function quickBotLevel(bots: QuickBots, index: number): string {
  return bots.levels?.[index] ?? bots.level
}

/**
 * 2026-11-23: `raw` as CreateRoomRequest.seatBots, or null when it is no good: only a game whose host's
 * browser runs its computer players (`bots` without `bot`: the kart), one of its levels, and from one
 * up to every seat but the host's, no more than its names
 */
export function parseSeatBots(game: BotGame, raw: unknown): SeatBots | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { count, level } = raw as { count?: unknown; level?: unknown }
  const bots = game.bots
  if (game.bot || !bots) return null
  if (typeof level !== 'string' || !bots.levels.includes(level)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null
  if (count > game.meta.maxPlayers - 1 || count > bots.names.length) return null
  return { count, level }
}
