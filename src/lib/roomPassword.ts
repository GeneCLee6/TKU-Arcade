// A room's password (e1-t16), kept for this tab so that a reconnect joins with it. Only someone new
// needs it: once in, the seat token brings this browser back. Storage may be missing or refuse
// (private windows): then it lives as long as the page.
const memory = new Map<string, string>()
const key = (roomId: string) => `tku-arcade.roomPassword.${roomId}`

export function readRoomPassword(roomId: string): string | null {
  try {
    const stored = sessionStorage.getItem(key(roomId))
    if (stored !== null) return stored
  } catch {
    // Fall through to what this page remembers
  }
  return memory.get(roomId) ?? null
}

export function keepRoomPassword(roomId: string, password: string): void {
  memory.set(roomId, password)
  try {
    sessionStorage.setItem(key(roomId), password)
  } catch {
    // Kept in memory only
  }
}

export function forgetRoomPassword(roomId: string): void {
  memory.delete(roomId)
  try {
    sessionStorage.removeItem(key(roomId))
  } catch {
    // Nothing kept
  }
}
