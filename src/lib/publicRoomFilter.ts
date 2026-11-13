// The lobby's filter of public rooms (e1-t15): by game, and by room for a group of friends
import type { RoomListing } from '../../shared/protocol.ts'

export type RoomFilter = {
  /** A game's id; null for every game */
  gameId: string | null
  /** Seats still free, at least: a group of this many fits */
  freeSeats: number
}

export const ANY_ROOM: RoomFilter = { gameId: null, freeSeats: 1 }

export const freeSeatsOf = (room: RoomListing): number => Math.max(0, room.maxSeats - room.seated)

export const filterRooms = (rooms: readonly RoomListing[], filter: RoomFilter): RoomListing[] =>
  rooms.filter(
    (room) =>
      (filter.gameId === null || room.gameId === filter.gameId) &&
      freeSeatsOf(room) >= filter.freeSeats,
  )

/** One of `rooms` at random (`random` in [0, 1)); null when there is none */
export const randomRoom = (
  rooms: readonly RoomListing[],
  random: number = Math.random(),
): RoomListing | null =>
  rooms.length === 0 ? null : rooms[Math.min(rooms.length - 1, Math.floor(random * rooms.length))]
