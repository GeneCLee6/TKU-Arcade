// The game's fixed numbers, for the rules, the options (info.ts) and the screen alike. Their own file:
// the screen imports them without info.ts, which the room loads on its own (src/i18n/gameDetails.ts)
export const MAX_NOTES = 8
export const MAX_BURNS = 3
export const MAX_TURN_SECONDS = 300
/** Cards in hand: 5 with 2–3 players, 4 with 4–5 */
export const handSize = (players: number): number => (players <= 3 ? 5 : 4)
