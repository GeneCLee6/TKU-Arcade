// The game's fixed numbers, for the rules and the screen alike. Their own file: the screen imports
// them without info.ts, which the room loads on its own (src/i18n/gameDetails.ts)

/** How many shared cards are showing in round 1, 2 and 3 */
export const COMMUNITY_BY_ROUND: readonly number[] = [3, 4, 5]
export const ROUNDS = COMMUNITY_BY_ROUND.length
