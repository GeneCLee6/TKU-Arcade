import { describe, expect, it } from 'vitest'
import type { RoomListing } from '../../shared/protocol.ts'
import { ANY_ROOM, filterRooms, randomRoom } from '../../src/lib/publicRoomFilter.ts'

const room = (id: string, gameId: string, seated: number, maxSeats: number): RoomListing => ({
  id,
  gameId,
  host: 'Ann',
  seated,
  maxSeats,
  createdAt: 0,
})

const ROOMS = [room('a', 'promotion', 2, 6), room('b', 'bluff', 7, 9), room('c', 'promotion', 5, 6)]

// e1-t15
describe('the public room filter', () => {
  it('keeps every room by default', () => {
    expect(filterRooms(ROOMS, ANY_ROOM)).toEqual(ROOMS)
  })

  it('narrows by game and by free seats', () => {
    expect(filterRooms(ROOMS, { gameId: 'promotion', freeSeats: 1 }).map((r) => r.id)).toEqual([
      'a',
      'c',
    ])
    expect(filterRooms(ROOMS, { gameId: null, freeSeats: 2 }).map((r) => r.id)).toEqual(['a', 'b'])
    expect(filterRooms(ROOMS, { gameId: 'bluff', freeSeats: 3 })).toEqual([])
  })

  it('picks one at random, or none from nothing', () => {
    expect(randomRoom(ROOMS, 0)?.id).toBe('a')
    expect(randomRoom(ROOMS, 0.99)?.id).toBe('c')
    expect(randomRoom([], 0.5)).toBeNull()
  })
})
