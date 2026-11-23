// What the kart's room list shows (2026-11-23, docs/ARCHITECTURE.md §4.82), without React: a listed
// room's state, its people, and the filters. The order is the server's (worker/lobby-list.ts).
import type { RoomListing } from '../../../shared/protocol.ts'

/** What can be done with a listed room: join it, join it with its password, or watch its race */
export type RoomState = 'open' | 'locked' | 'full' | 'racing'

export function roomState(room: RoomListing): RoomState {
  if (room.status === 'playing') return 'racing'
  if (room.locked) return 'locked'
  return room.seated >= room.maxSeats ? 'full' : 'open'
}

/** People, not computer karts */
export const humansIn = (room: RoomListing): number => Math.max(0, room.seated - (room.bots ?? 0))

export type ShowFilter = 'all' | 'open' | 'live'

export type RoomFilters = {
  show: ShowFilter
  /** A mode's id (`items`, `race`), or null for any */
  mode: string | null
  /** Rooms with a password too */
  locked: boolean
}

export const ALL_ROOMS: RoomFilters = { show: 'all', mode: null, locked: true }

export function filterRooms(rooms: readonly RoomListing[], filters: RoomFilters): RoomListing[] {
  return rooms.filter((room) => {
    const state = roomState(room)
    if (filters.show === 'open' && state !== 'open') return false
    if (filters.show === 'live' && state !== 'racing') return false
    if (!filters.locked && room.locked) return false
    if (filters.mode !== null && (room.options?.mode ?? 'items') !== filters.mode) return false
    return true
  })
}

/** Everyone in the listed rooms, computer karts left out */
export const driversIn = (rooms: readonly RoomListing[]): number =>
  rooms.reduce((total, room) => total + humansIn(room), 0)
