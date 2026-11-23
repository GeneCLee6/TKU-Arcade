// The computer opponents' names and karts (docs/ARCHITECTURE.md §4.20). Names are working titles of
// our own (shared/kart/i18n.bots.ts, `kart.bots.name.<id>`), like every name in the kart's world
// until KART-WORLD.md settles them (e10-t01). Each race draws its bots afresh: a name, a kart and a
// driver each, from the same vehicles (bikes too) and four drivers a player picks from (shared/kart/karts.ts).
import { createRng } from '../../../shared/games/rng.ts'
import { DRIVER_IDS, KART_IDS, type DriverId, type KartId } from '../../../shared/kart/karts.ts'
import { OUTFIT_IDS, type OutfitId } from '../../../shared/kart/outfits.ts'
import { MAX_RACERS } from '../../../shared/kart/race.ts'
import { BOT_NAMES, type BotName } from '../../../shared/games/kart/bots.ts'

export { BOT_NAMES, type BotName } from '../../../shared/games/kart/bots.ts'

/** At most this many bots: the race's grid less the player */
export const MAX_BOTS = MAX_RACERS - 1

export interface BotEntry {
  readonly name: BotName
  readonly kart: KartId
  readonly driver: DriverId
  /**
   * 2026-11-23 (shared/kart/outfits.ts): what the driver wears, drawn like the rest. A cup saved
   * before then has none: the race suit
   */
  readonly outfit?: OutfitId
}

/** Mixed into the seed for the outfits, so that the names, karts and drivers drawn stay as they were */
const OUTFIT_SALT = 0x0f17_c0de

/**
 * `count` bots (1 to MAX_BOTS), each with its own name, and a kart, driver and outfit drawn by
 * `seed` (the outfits from a stream of their own: the rest is what the same seed always drew)
 */
export function drawBots(count: number, seed: number): BotEntry[] {
  const rng = createRng(seed)
  const names = rng.shuffle(BOT_NAMES)
  const dress = createRng((seed ^ OUTFIT_SALT) >>> 0)
  const n = Math.max(1, Math.min(MAX_BOTS, Math.round(count)))
  return names.slice(0, n).map((name) => ({
    name,
    kart: rng.pick(KART_IDS),
    driver: rng.pick(DRIVER_IDS),
    outfit: dress.pick(OUTFIT_IDS),
  }))
}
