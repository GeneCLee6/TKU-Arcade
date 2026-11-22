// How long a roll plays out (useRollPlayback.ts): here on their own, so that the board's drawing
// (PromotionBoard.tsx, a chunk after the screen's first paint) takes the flight's length without the
// playback and its sounds
/** How long the top spins or the dice tumble */
export const ROLL_MS = 1100
/** How long the piece is in the air */
export const MOVE_MS = 650
