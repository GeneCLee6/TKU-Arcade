// Computer players for the turn-based table games (2026-11-20, docs/ARCHITECTURE.md "電腦玩家"): the
// levels a host may add one at and the names the room hands out in turn, shared by every game whose
// module has a `bot` (holdem, promotion, traders). The names are ours, shown through the room's
// strings (`room.bot.name.<id>`); the room plays these seats itself (worker/room-host.ts).
import type { Rng } from './types.ts'

export const TABLE_BOT_LEVELS = ['easy', 'normal'] as const
export type TableBotLevel = (typeof TABLE_BOT_LEVELS)[number]

export const TABLE_BOT_NAMES = [
  'egret',
  'banyan',
  'heron',
  'ferry',
  'teapot',
  'pebble',
  'drizzle',
  'osmanthus',
  'abacus',
] as const

/** What a module with a `bot` puts in `bots` */
export const TABLE_BOTS = { levels: TABLE_BOT_LEVELS, names: TABLE_BOT_NAMES } as const

/** The first of `items` with the highest `score`; ties go to the earlier one. Null when empty */
export function best<T>(items: readonly T[], score: (item: T) => number): T | null {
  let found: T | null = null
  let top = -Infinity
  for (const item of items) {
    const value = score(item)
    if (value > top) {
      top = value
      found = item
    }
  }
  return found
}

/** One of `items`, more likely the higher its weight (weights at or below 0 are never picked) */
export function weighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | null {
  const weights = items.map((item) => Math.max(0, weight(item)))
  const total = weights.reduce((sum, one) => sum + one, 0)
  if (total <= 0) return null
  let at = rng.float() * total
  for (let index = 0; index < items.length; index++) {
    at -= weights[index]
    if (at < 0) return items[index]
  }
  return items[items.length - 1]
}
