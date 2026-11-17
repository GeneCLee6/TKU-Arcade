// e10-t08: what a track code looks like from outside, apart from the rest of codec.ts, so that the
// race room's options (shared/games/kart/info.ts, in the waiting room's load) carry two constants
// and not the editor.

/**
 * The longest code taken, characters: 60 pieces with every option and a long name take about 2,100.
 * Well inside a link, the room's 16 kB message cap and its 4 kB room-creation cap
 */
export const MAX_CODE_CHARS = 3_000
/** What a code may be made of: base64url */
export const CODE_PATTERN = /^[A-Za-z0-9_-]+$/
