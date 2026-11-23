// 2026-11-23 (#131): a reversed track's id (reverse.ts), apart from the reversal itself, so that the
// art, the sounds and the menus can tell an id's original without carrying the tracks. Pure.

/** A reversed track's id: the original's with this after it */
export const REVERSE_SUFFIX = '-rev'

/** Whether a track id names a reversed track */
export const isReverseId = (id: string): boolean => id.endsWith(REVERSE_SUFFIX)

/**
 * The original's id of a reversed track's (any other id is its own): what a reversed track is
 * drawn, lit and scored by, for it stands on the same ground
 */
export const forwardId = (id: string): string =>
  isReverseId(id) ? id.slice(0, -REVERSE_SUFFIX.length) : id

/** The reversed track's id of a track's */
export const reverseId = (id: string): string => `${id}${REVERSE_SUFFIX}`
