// A room's name (2026-11-23, the kart's "New room" and quick join; docs/ARCHITECTURE.md §4.83): shown
// to strangers in the room list, so it keeps to what a nickname may say (shared/nickname.ts), only
// longer. Its own module, so that the first load of the lobby does not carry it.
import { nameProblem, type NameIssue } from './nickname.ts'
import { normalizeText } from './protocol.ts'

export const MAX_ROOM_NAME_CHARS = 24

/** A room's name as the room stores it: as a nickname (`normalizeName`), up to MAX_ROOM_NAME_CHARS */
export const normalizeRoomName = (raw: unknown): string | null => normalizeText(raw, MAX_ROOM_NAME_CHARS)

/** What is wrong with a room's name as typed, or null when it may be used */
export function roomNameIssue(raw: string): NameIssue | null {
  const name = normalizeRoomName(raw)
  if (name === null) {
    const typed = raw.replace(/\s+/g, ' ').trim()
    return [...typed].length > MAX_ROOM_NAME_CHARS ? 'tooLong' : 'empty'
  }
  return nameProblem(name)
}

/** A room's name as POST /api/rooms takes it: normalized and allowed, else null */
export function acceptableRoomName(raw: unknown): string | null {
  const name = normalizeRoomName(raw)
  return name !== null && nameProblem(name) === null ? name : null
}
