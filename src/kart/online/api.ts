// The kart's online play (2026-11-23, docs/ARCHITECTURE.md §4.83): the race rooms' list, quick join
// and a new room, over GET /api/lobby?game=kart, POST /api/rooms/quick and POST /api/rooms.
import type { OptionValues } from '../../../shared/games/types.ts'
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  LobbyResponse,
  QuickJoinRequest,
  QuickJoinResponse,
  RoomListing,
  SeatBots,
} from '../../../shared/protocol.ts'
import { isRoomId } from '../../../shared/room-id.ts'

export const KART_GAME = 'kart'

/**
 * How often the room list asks, while it is visible: GET /api/lobby is one Worker request and, past
 * the Worker's 2 s reuse (worker/lobby-list.ts), one LobbyDO call
 */
export const KART_ROOMS_POLL_MS = 10_000

/** Why a room could not be had: paused by the owner, too many new rooms, anything else */
export type RoomFailure = 'paused' | 'rate_limited' | 'bad_name' | 'failed'

/** The kart's listed rooms, open first; null when there was no clear answer */
export async function fetchKartRooms(signal?: AbortSignal): Promise<RoomListing[] | null> {
  try {
    const response = await fetch(`/api/lobby?game=${KART_GAME}`, { signal })
    if (!response.ok) return null
    const { rooms } = (await response.json()) as LobbyResponse
    return Array.isArray(rooms) ? rooms : null
  } catch {
    return null
  }
}

async function failureOf(response: Response): Promise<RoomFailure> {
  if (response.status === 403) return 'paused'
  if (response.status === 429) return 'rate_limited'
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null
    if (body?.error === 'bad_name') return 'bad_name'
  }
  return 'failed'
}

/** Quick join: an open public room's id, or a new public one's */
export async function quickJoin(
  ask: { name?: string; seatBots?: SeatBots },
  signal?: AbortSignal,
): Promise<{ id: string; created: boolean } | RoomFailure> {
  const request: QuickJoinRequest = { gameId: KART_GAME, ...ask }
  try {
    const response = await fetch('/api/rooms/quick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) return await failureOf(response)
    const { id, created } = (await response.json()) as QuickJoinResponse
    return isRoomId(id) ? { id, created: created === true } : 'failed'
  } catch {
    return 'failed'
  }
}

/** A new race room with these options: its id */
export async function createKartRoom(
  ask: { options: OptionValues; public: boolean; name?: string; password?: string },
  signal?: AbortSignal,
): Promise<string | RoomFailure> {
  const request: CreateRoomRequest = {
    gameId: KART_GAME,
    options: ask.options,
    ...(ask.public ? { public: true } : {}),
    ...(ask.name ? { name: ask.name } : {}),
    // 2026-11-23 (#163): set from the start (the room's own rules: shared/protocol.ts normalizePassword)
    ...(ask.password ? { password: ask.password } : {}),
  }
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) return await failureOf(response)
    const { id } = (await response.json()) as CreateRoomResponse
    return isRoomId(id) ? id : 'failed'
  } catch {
    return 'failed'
  }
}
