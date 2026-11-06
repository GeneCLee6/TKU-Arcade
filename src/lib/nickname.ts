import { normalizeName } from '../../shared/protocol.ts'
import { readStored, writeStored } from './storage.ts'

const STORAGE_KEY = 'tku-arcade.nickname'

// Where a name lives when storage refuses it, so the room page does not ask right after the lobby did
let unsaved: string | null = null

/** The stored nickname, or null when there is none or it no longer passes (hand-edited, old rules) */
export function readNickname(): string | null {
  return normalizeName(readStored(STORAGE_KEY)) ?? unsaved
}

/** What the person typed, normalized. Never the name the server answers: `Al (2)` would stick */
export function writeNickname(name: string): void {
  writeStored(STORAGE_KEY, name)
  unsaved = readStored(STORAGE_KEY) === name ? null : name
}
