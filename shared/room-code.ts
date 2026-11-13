// Short room numbers (owner, 2026-11-13): four digits, 1000 to 9999, that friends can say aloud or
// type on a phone's number pad instead of the ten-character room id. A number belongs to one room
// for as long as that room exists; once the room is cleaned up the number goes to the next one. The
// numbers live in the one LobbyDO (worker/lobby.ts); the room keeps its own so the waiting room can
// show it. A number is easy to guess, which is fine: the room id behind it was never a secret
// either, only a way in that is hard to mistype.
import type { RandomBytes } from './room-id.ts'

export const ROOM_CODE_LOW = 1000
export const ROOM_CODE_HIGH = 9999
/** Four digits, never starting with 0, so that one read aloud is never taken for three */
export const ROOM_CODE_PATTERN = /^[1-9]\d{3}$/

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value)
}

const cryptoBytes: RandomBytes = (bytes) => {
  crypto.getRandomValues(bytes)
}

/** A random room number; 16 random bits per draw, redrawn above the last whole range (no bias) */
export function newRoomCode(random: RandomBytes = cryptoBytes): string {
  const span = ROOM_CODE_HIGH - ROOM_CODE_LOW + 1
  const limit = 65536 - (65536 % span)
  const bytes = new Uint8Array(2)
  for (;;) {
    random(bytes)
    const value = bytes[0] * 256 + bytes[1]
    if (value < limit) return String(ROOM_CODE_LOW + (value % span))
  }
}

/** The room number in what someone typed, spaces and dashes aside ("48 27", "48-27"); else null */
export function parseRoomCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '')
  return isRoomCode(digits) ? digits : null
}
