// When a computer opponent uses the item it holds (docs/ARCHITECTURE.md §4.19). The room still judges
// every use (shared/games/kart/rules.ts, run in this browser by localRoom.ts): a bot that asks with
// no one to reach is refused like a player, and asks again later. Pure.
import { ITEM_TUNING, type ItemId } from '../../../shared/kart/items.ts'
import { SHOT_TUNING } from '../../../shared/kart/shots.ts'

/** A hailstone is thrown when the kart ahead is this near and this nearly straight ahead */
export const HAIL_AIM = { distance: 120, angle: 0.12 } as const
/** A puddle is dropped when a kart is this close behind, metres */
export const PUDDLE_BEHIND = 40
/** A shield or a puddle with nothing to answer is used anyway after this much longer, ms */
export const IDLE_USE_MS = 8_000

/** What a bot knows when it decides */
export interface ItemSituation {
  readonly item: ItemId
  /** How long it has held the item, and how long it means to hold it at least (its skill's) */
  readonly heldMs: number
  readonly waitMs: number
  /** The kart just ahead, if any: how far, at what angle off the nose (radians), on the same lap */
  readonly ahead: {
    readonly distance: number
    readonly angle: number
    readonly sameLap: boolean
  } | null
  /** How many karts are ahead of it, still racing */
  readonly aheadCount: number
  /** The nearest kart behind, metres; null for none */
  readonly behind: number | null
  /** The road runs straight for a while ahead */
  readonly straight: boolean
  /** A cloud is after it, or a hailstone is coming at it */
  readonly threatened: boolean
}

/**
 * Whether to use the item now. With `sense` (normal and hard), each item waits for its moment: a
 * boost on a straight, a shield when something is coming, a tow, a swap or a cloud when the kart
 * ahead is in reach, a headwind when anyone is ahead, a hailstone when the kart ahead is lined up,
 * a puddle when someone is close behind. Without it (easy), the item goes as soon as the wait is
 * over, wherever that is
 */
export function wantsToUse(sense: boolean, s: ItemSituation): boolean {
  if (sense && s.item === 'shield' && s.threatened) return true
  if (s.heldMs < s.waitMs) return false
  if (!sense) return true
  const { ahead } = s
  switch (s.item) {
    case 'boost':
      return s.straight
    case 'shield':
      return s.heldMs >= s.waitMs + IDLE_USE_MS
    case 'tow':
      return ahead !== null && ahead.distance <= ITEM_TUNING.towReach * 0.9 && ahead.distance > 12
    case 'headwind':
      return s.aheadCount > 0
    case 'swap':
      return ahead !== null && ahead.sameLap && ahead.distance <= ITEM_TUNING.swapReach * 0.9
    case 'cloud':
      return ahead !== null && ahead.distance <= SHOT_TUNING.cloudReach * 0.9
    case 'hail':
      return (
        ahead !== null &&
        ahead.distance <= HAIL_AIM.distance &&
        Math.abs(ahead.angle) <= HAIL_AIM.angle
      )
    case 'puddle':
      return (s.behind !== null && s.behind <= PUDDLE_BEHIND) || s.heldMs >= s.waitMs + IDLE_USE_MS
  }
}
