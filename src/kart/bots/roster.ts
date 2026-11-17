// The computer opponents' names and karts (docs/ARCHITECTURE.md §4.19). Names are working titles of
// our own (shared/kart/i18n.bots.ts, `kart.bots.name.<id>`), like every name in the kart's world
// until KART-WORLD.md settles them (e10-t01). Each race draws its bots afresh: a name, a kart and a
// driver each, from the same six karts and four drivers a player picks from (shared/kart/karts.ts).
import { createRng } from '../../../shared/games/rng.ts'
import { DRIVER_IDS, KART_IDS, type DriverId, type KartId } from '../../../shared/kart/karts.ts'
import { MAX_RACERS } from '../../../shared/kart/race.ts'

export const BOT_NAMES = [
  'pepper',
  'mochi',
  'typhoon',
  'boba',
  'scooter',
  'sunset',
  'ferry',
  'kite',
] as const
export type BotName = (typeof BOT_NAMES)[number]

/** At most this many bots: the race's grid less the player */
export const MAX_BOTS = MAX_RACERS - 1

export interface BotEntry {
  readonly name: BotName
  readonly kart: KartId
  readonly driver: DriverId
}

/** `count` bots (1 to MAX_BOTS), each with its own name, and a kart and driver drawn by `seed` */
export function drawBots(count: number, seed: number): BotEntry[] {
  const rng = createRng(seed)
  const names = rng.shuffle(BOT_NAMES)
  const n = Math.max(1, Math.min(MAX_BOTS, Math.round(count)))
  return names.slice(0, n).map((name) => ({
    name,
    kart: rng.pick(KART_IDS),
    driver: rng.pick(DRIVER_IDS),
  }))
}
