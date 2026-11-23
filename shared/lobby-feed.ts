// The lobby's room list, pushed (2026-11-23, docs/NETWORK.md §6): a page opens one WebSocket to the
// LobbyDO (`/ws/lobby?game=<id>`) and is sent the game's listed rooms once, then each change as it
// happens, instead of asking GET /api/lobby every few seconds. Also what both ends make of a list:
// the order and the cut (`lobbyRooms`), so that a pushed list reads exactly as a polled one.
import { LOBBY_LIST_LIMIT, type RoomListing } from './protocol.ts'

/** The feed's own version, in its path: a page and a Worker that disagree close with versionMismatch */
export const LOBBY_FEED_VERSION = 1

/** The feed's WebSocket path for `gameId` (relative to the site's origin) */
export function lobbyFeedPath(gameId: string): string {
  return `/ws/lobby?game=${encodeURIComponent(gameId)}&v=${LOBBY_FEED_VERSION}`
}

/**
 * What the LobbyDO sends on the feed; the page sends nothing but the heartbeat `ping` (answered by
 * the runtime without waking the object), and anything else closes the socket.
 * - `rooms`: every listed room of the game, now (on opening, and again after the page comes back)
 * - `room`: one room is listed, or what it shows changed (people, status, password, name, options)
 * - `gone`: a room is no longer listed (closed, ended, made private, or its host left)
 */
export type LobbyFeedMessage =
  | { t: 'rooms'; rooms: RoomListing[] }
  | { t: 'room'; room: RoomListing }
  | { t: 'gone'; id: string }

const isListing = (value: unknown): value is RoomListing => {
  if (typeof value !== 'object' || value === null) return false
  const room = value as Record<string, unknown>
  return (
    typeof room.id === 'string' &&
    typeof room.gameId === 'string' &&
    typeof room.host === 'string' &&
    typeof room.seated === 'number' &&
    typeof room.maxSeats === 'number' &&
    typeof room.createdAt === 'number'
  )
}

/** A feed frame as the page reads it; null for anything else (the heartbeat's `pong` included) */
export function parseLobbyFeed(raw: string): LobbyFeedMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const message = value as Record<string, unknown>
  if (message.t === 'rooms' && Array.isArray(message.rooms)) {
    return { t: 'rooms', rooms: message.rooms.filter(isListing) }
  }
  if (message.t === 'room' && isListing(message.room)) return { t: 'room', room: message.room }
  if (message.t === 'gone' && typeof message.id === 'string') return { t: 'gone', id: message.id }
  return null
}

/** The rooms a page knows of after `message`, by id (a new map; `known` is left alone) */
export function applyLobbyFeed(
  known: ReadonlyMap<string, RoomListing>,
  message: LobbyFeedMessage,
): Map<string, RoomListing> {
  if (message.t === 'rooms') return new Map(message.rooms.map((room) => [room.id, room]))
  const next = new Map(known)
  if (message.t === 'room') next.set(message.room.id, message.room)
  else next.delete(message.id)
  return next
}

// ── What a list shows (moved from worker/lobby-list.ts, 2026-11-23) ───────────────────────────────

/** Some may walk in: waiting, a free seat, no password */
export const isOpenRoom = (room: RoomListing): boolean =>
  (room.status ?? 'waiting') === 'waiting' && room.locked !== true && room.seated < room.maxSeats

/** People, not computer players, seated */
export const humansOf = (room: RoomListing): number => room.seated - (room.bots ?? 0)

/** 0: open; 1: waiting, but full or locked; 2: playing (to watch) */
const standing = (room: RoomListing): number =>
  isOpenRoom(room) ? 0 : (room.status ?? 'waiting') === 'waiting' ? 1 : 2

/**
 * What a list is shown of `rooms`. No `gameId`: the home page's, the open rooms of every game,
 * newest first, as before 2026-11-23. A `gameId`: every room of that game, open first, then waiting
 * but full or locked, then playing; among each, more people first, then newer. LOBBY_LIST_LIMIT of
 * them either way
 */
export function lobbyRooms(rooms: readonly RoomListing[], gameId: string | null): RoomListing[] {
  if (gameId === null) {
    return rooms
      .filter(isOpenRoom)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LOBBY_LIST_LIMIT)
  }
  return rooms
    .filter((room) => room.gameId === gameId)
    .sort(
      (a, b) =>
        standing(a) - standing(b) || humansOf(b) - humansOf(a) || b.createdAt - a.createdAt,
    )
    .slice(0, LOBBY_LIST_LIMIT)
}
