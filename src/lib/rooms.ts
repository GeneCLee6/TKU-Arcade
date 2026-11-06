import type { CreateRoomRequest, CreateRoomResponse, RoomSummary } from '../../shared/protocol.ts'
import { isRoomId } from '../../shared/room-id.ts'

/** The new room's id, or null when it could not be created (any reason: the toast is the same) */
export async function createRoom(gameId: string, signal?: AbortSignal): Promise<string | null> {
  const request: CreateRoomRequest = { gameId }
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) return null
    const { id } = (await response.json()) as CreateRoomResponse
    return isRoomId(id) ? id : null
  } catch {
    return null
  }
}

export type RoomLookup =
  | { status: 'found'; summary: RoomSummary }
  | { status: 'notFound' }
  | { status: 'failed' }

/** `failed` covers anything but a clear answer, such as a proxy's error page: retrying may help */
export async function fetchRoomSummary(id: string, signal?: AbortSignal): Promise<RoomLookup> {
  try {
    const response = await fetch(`/api/rooms/${id}`, { signal })
    if (response.status === 404) return { status: 'notFound' }
    if (!response.ok) return { status: 'failed' }
    const summary = (await response.json()) as RoomSummary | null
    return typeof summary?.gameId === 'string' && typeof summary.members === 'number'
      ? { status: 'found', summary }
      : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  }
}
