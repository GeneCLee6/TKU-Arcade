// What GET /api/lobby and POST /api/rooms/quick make of the lobby's rooms (2026-11-23, the kart's
// room list and quick join; docs/ARCHITECTURE.md §4.83). The LobbyDO keeps every listed room, open,
// full, locked or playing (worker/lobby-board.ts); the home page is still shown only the open ones,
// a game's own list all of its rooms, the open ones first.
import { LOBBY_LIST_LIMIT, type RoomListing } from '../shared/protocol.ts'
import { LOBBY_NAME } from './lobby-board.ts'
import { FixedWindowLimit } from './rate-limit.ts'

/** Some may walk in: waiting, a free seat, no password */
export const isOpenRoom = (room: RoomListing): boolean =>
  (room.status ?? 'waiting') === 'waiting' && room.locked !== true && room.seated < room.maxSeats

/** People, not computer players, seated */
export const humansOf = (room: RoomListing): number => room.seated - (room.bots ?? 0)

/** 0: open; 1: waiting, but full or locked; 2: playing (to watch) */
const standing = (room: RoomListing): number =>
  isOpenRoom(room) ? 0 : (room.status ?? 'waiting') === 'waiting' ? 1 : 2

/**
 * What a list is shown of `rooms` (newest first, as the lobby keeps them). No `gameId`: the home
 * page's, the open rooms of every game, newest first, as before 2026-11-23. A `gameId`: every room
 * of that game, open first, then waiting but full or locked, then playing; among each, more people
 * first, then newer. LOBBY_LIST_LIMIT of them either way
 */
export function lobbyRooms(rooms: readonly RoomListing[], gameId: string | null): RoomListing[] {
  if (gameId === null) return rooms.filter(isOpenRoom).slice(0, LOBBY_LIST_LIMIT)
  return rooms
    .filter((room) => room.gameId === gameId)
    .sort(
      (a, b) =>
        standing(a) - standing(b) || humansOf(b) - humansOf(a) || b.createdAt - a.createdAt,
    )
    .slice(0, LOBBY_LIST_LIMIT)
}

/**
 * The rooms of `gameId` quick join tries, best first: open ones, the most people first (a race
 * fills up rather than many waiting alone), then the one waiting longest
 */
export function quickRooms(rooms: readonly RoomListing[], gameId: string): RoomListing[] {
  return rooms
    .filter((room) => room.gameId === gameId && isOpenRoom(room))
    .sort((a, b) => humansOf(b) - humansOf(a) || a.createdAt - b.createdAt)
}

/** How long one Worker instance reuses what the lobby answered: a burst of lists is one RPC */
export const LOBBY_CACHE_MS = 2_000

/** Lists one address may ask a minute, per Worker instance: a room list polls every 10 s */
export const LOBBY_READS_PER_ADDRESS = 240
/** Lists one Worker instance answers a minute, whoever asks */
export const LOBBY_READS_PER_INSTANCE = 20_000

export const lobbyReadLimit = new FixedWindowLimit(LOBBY_READS_PER_ADDRESS, LOBBY_READS_PER_INSTANCE)

/** The LOBBY binding, as far as reading the list needs it */
export interface LobbyLister {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): { list(): Promise<RoomListing[]> | RoomListing[] }
}

// Per binding, so that a test's fresh one starts empty
const cached = new WeakMap<object, { at: number; rooms: RoomListing[] }>()

/** Every listed room, from the LobbyDO or from what it said in the last LOBBY_CACHE_MS */
export async function readLobby(lobby: LobbyLister, now: number = Date.now()): Promise<RoomListing[]> {
  const known = cached.get(lobby)
  if (known && now - known.at < LOBBY_CACHE_MS && now >= known.at) return known.rooms
  const rooms = await lobby.get(lobby.idFromName(LOBBY_NAME)).list()
  cached.set(lobby, { at: now, rooms })
  return rooms
}

// ── Quick join's new rooms (2026-11-23, #163) ─────────────────────────────────────────────────────
// Two people asking for a quick join at the same moment, with no open room listed, each used to open
// a room of their own. Now the lobby (one object, one call at a time) holds the first one's new room
// for its game a few seconds: whoever asks in that time is sent to it, once the room is there.

/** How long a new quick-join room is held for the next ones asking for its game, ms */
export const QUICK_HOLD_MS = 15_000

/** The quick-join rooms being opened, one a game: pure, kept by the LobbyDO (worker/lobby.ts) */
export class QuickHolds {
  private readonly held = new Map<string, { id: string; at: number }>()

  /**
   * Null when `id` is the room to open for `gameId` (it is held from now on); otherwise the room
   * another quick join opened for it in the last QUICK_HOLD_MS, to be sent to instead
   */
  claim(gameId: string, id: string, now: number): string | null {
    const held = this.held.get(gameId)
    if (held && held.id !== id && now >= held.at && now - held.at < QUICK_HOLD_MS) return held.id
    this.held.set(gameId, { id, at: now })
    return null
  }

  /** `id` was not opened after all, or turned out full or gone: the next one asking opens one */
  release(gameId: string, id: string): void {
    if (this.held.get(gameId)?.id === id) this.held.delete(gameId)
  }
}
