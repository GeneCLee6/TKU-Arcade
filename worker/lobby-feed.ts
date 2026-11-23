// The lobby's pushed room list (2026-11-23, shared/lobby-feed.ts, docs/NETWORK.md §6), without
// Cloudflare: who may watch, and what each change sends to whom. worker/lobby.ts is the glue: the
// watchers are hibernatable WebSockets tagged with their game, so the object sleeps between changes
// and only a room's report (which it got anyway) wakes it to send.
import { CloseCode, type RoomListing } from '../shared/protocol.ts'
import type { LobbyFeedMessage } from '../shared/lobby-feed.ts'

/** Lists watched at once, the whole site: past it a page polls instead (4429, the page falls back) */
export const MAX_LOBBY_WATCHERS = 1_000
/** Lists one address watches at once (tabs, a dorm on one Wi-Fi): past it that page polls instead */
export const MAX_LOBBY_WATCHERS_PER_ADDRESS = 12

/** What a watcher's socket keeps through hibernation */
export type LobbyWatcher = { game: string; address: string | null; openedAt: number }

/** The tag a game's watchers are found by (`ctx.getWebSockets(tag)`) */
export const watcherTag = (gameId: string): string => `game:${gameId}`

export type WatchAdmission = { ok: true } | { ok: false; code: number; reason: string }

/** May one more page from `address` watch, with `watchers` open now? */
export function admitWatcher(
  watchers: readonly LobbyWatcher[],
  address: string | null,
): WatchAdmission {
  if (watchers.length >= MAX_LOBBY_WATCHERS) {
    return { ok: false, code: CloseCode.tooManyConnections, reason: 'too many watchers' }
  }
  if (address !== null) {
    let fromThere = 0
    for (const watcher of watchers) if (watcher.address === address) fromThere++
    if (fromThere >= MAX_LOBBY_WATCHERS_PER_ADDRESS) {
      return { ok: false, code: CloseCode.tooManyConnections, reason: 'too many watchers' }
    }
  }
  return { ok: true }
}

/**
 * What the watchers of a room's game are sent when the lobby's entry for it changes (`listing` null:
 * no longer listed). Null when they need nothing: the same listing again (a room's heartbeat
 * report), or a room going that was never listed. A paused game's rooms (e12-t11) are shown to nobody
 */
export function feedChange(
  before: RoomListing | null,
  listing: RoomListing | null,
  paused: boolean,
): LobbyFeedMessage | null {
  const after = paused ? null : listing
  if (after === null) return before === null ? null : { t: 'gone', id: before.id }
  if (before !== null && JSON.stringify(before) === JSON.stringify(after)) return null
  return { t: 'room', room: after }
}
