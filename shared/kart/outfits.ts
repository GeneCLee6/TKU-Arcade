// 2026-11-23 (docs/KART-WORLD.md §3.2; owner: "each one's background, victory, clothes, looks, every
// one different ... think of it as an online game"): what each driver wears. Three outfits of our own
// for every driver, each driver's cut and colours their own (src/kart/art/driverOutfits.ts draws them,
// src/styles/kartTokens.ts's kartOutfits colours them): the race suit, street wear and the club's
// jacket. Looks only, like the driver: nothing drives differently. Kept in this browser per driver
// (src/kart/bodies.ts) and told to a room as the third word of a member's `look` (karts.ts's lookOf).
//
// Everything is open for now. Unlocking waits for accounts (F1); `OUTFIT_UNLOCK` names the achievement
// (src/achievements/rules.ts) that would open each one then, and `outfitOpen` is where that would be
// asked, so that the garage already calls it.

/** The race suit (the default: what every driver wore before), street wear, the club's jacket */
export const OUTFIT_IDS = ['race', 'street', 'campus'] as const
export type OutfitId = (typeof OUTFIT_IDS)[number]

export const DEFAULT_OUTFIT: OutfitId = 'race'

export const isOutfitId = (value: unknown): value is OutfitId =>
  OUTFIT_IDS.some((id) => id === value)

/**
 * The achievement that would open each outfit once there are accounts (none: open from the start).
 * Not asked yet: `outfitOpen` says every outfit is open
 */
export const OUTFIT_UNLOCK: { readonly [O in OutfitId]: string | null } = {
  race: null,
  street: 'kart-first-win',
  campus: 'kart-finish-25',
}

/** Whether `outfit` may be worn. `unlocked`: the achievements this player has (for later) */
export function outfitOpen(outfit: OutfitId, unlocked?: ReadonlySet<string>): boolean {
  // F1 (accounts) decides when this starts to count; until then everything is open
  const gate = OUTFITS_GATED ? OUTFIT_UNLOCK[outfit] : null
  return gate === null || (unlocked?.has(gate) ?? false)
}

/** Whether `OUTFIT_UNLOCK` counts yet: not before accounts (F1) */
export const OUTFITS_GATED = false
