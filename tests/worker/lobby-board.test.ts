// The public room list on a fake clock, and when a room should tell it anything. LobbyDO and
// RoomDO.syncLobby are only the glue; a real pair is run on the preview.
import { describe, expect, it } from 'vitest'
import {
  LOBBY_HEARTBEAT_MS,
  LOBBY_LIST_LIMIT,
  LOBBY_MAX_ROOMS,
  LOBBY_TTL_MS,
  type RoomListing,
} from '../../shared/protocol.ts'
import {
  LobbyBoard,
  lobbyReportDue,
  type LobbyEntry,
  type LobbyReport,
} from '../../worker/lobby-board.ts'

const listing = (id: string, over: Partial<RoomListing> = {}): RoomListing => ({
  id,
  gameId: 'promotion',
  host: 'Ann',
  seated: 1,
  maxSeats: 6,
  createdAt: 1,
  ...over,
})

function setup() {
  const stored = new Map<string, LobbyEntry>()
  const world = {
    clock: 1_000_000,
    stored,
    board: null as unknown as LobbyBoard,
    wake() {
      world.board = new LobbyBoard({
        storage: {
          save: (entry) => stored.set(entry.listing.id, entry),
          drop: (id) => stored.delete(id),
        },
        now: () => world.clock,
      })
      world.board.restore(stored.values())
    },
  }
  world.wake()
  return world
}

describe('LobbyBoard', () => {
  it('lists what rooms report, newest first, and forgets what they take back', () => {
    const { board, stored } = setup()
    board.report('a', listing('a', { createdAt: 1 }))
    board.report('b', listing('b', { createdAt: 2 }))
    expect(board.list().map((room) => room.id)).toEqual(['b', 'a'])
    board.report('a', listing('a', { createdAt: 1, seated: 3 }))
    expect(board.list()[1].seated).toBe(3)
    board.report('b', null)
    expect(board.list().map((room) => room.id)).toEqual(['a'])
    expect([...stored.keys()]).toEqual(['a'])
    // Taking back something it never had writes nothing
    board.report('zzz', null)
    expect([...stored.keys()]).toEqual(['a'])
  })

  it('drops a room that stops reporting, and a heartbeat keeps it', () => {
    const world = setup()
    world.board.report('quiet', listing('quiet'))
    world.board.report('alive', listing('alive'))
    expect(world.board.nextAlarm()).toBe(world.clock + LOBBY_TTL_MS)

    world.clock += LOBBY_HEARTBEAT_MS
    world.board.report('alive', listing('alive'))
    world.clock += LOBBY_TTL_MS - LOBBY_HEARTBEAT_MS
    // Past its time it is out of the list even before the alarm comes
    expect(world.board.list().map((room) => room.id)).toEqual(['alive'])
    world.board.sweep()
    expect([...world.stored.keys()]).toEqual(['alive'])
    expect(world.board.nextAlarm()).toBe(world.clock + LOBBY_HEARTBEAT_MS)
    world.clock += LOBBY_HEARTBEAT_MS
    world.board.sweep()
    expect(world.board.list()).toEqual([])
    expect(world.board.nextAlarm()).toBeNull()
  })

  it('comes back from storage after hibernation', () => {
    const world = setup()
    world.board.report('a', listing('a'))
    world.wake()
    expect(world.board.list().map((room) => room.id)).toEqual(['a'])
  })

  it('has limits: what it answers with and what it keeps', () => {
    const { board, stored } = setup()
    for (let i = 0; i < LOBBY_MAX_ROOMS + 5; i++) {
      board.report(`room-${i}`, listing(`room-${i}`, { createdAt: i }))
    }
    expect(stored.size).toBe(LOBBY_MAX_ROOMS)
    expect(board.list()).toHaveLength(LOBBY_LIST_LIMIT)
    expect(board.list()[0].createdAt).toBe(LOBBY_MAX_ROOMS - 1)
    // A room already listed can still update and leave
    board.report('room-0', listing('room-0', { seated: 2 }))
    expect(stored.get('room-0')?.listing.seated).toBe(2)
  })
})

describe('lobbyReportDue', () => {
  const now = 1_000_000
  const report = (room: RoomListing, at = now): LobbyReport => ({
    id: room.id,
    key: JSON.stringify(room),
    at,
  })

  it('stays quiet for a private room, and for a listed one with nothing to say', () => {
    expect(lobbyReportDue(null, null, now)).toBe(false)
    const room = listing('a')
    expect(lobbyReportDue(report(room), room, now + LOBBY_HEARTBEAT_MS - 1)).toBe(false)
  })

  it('speaks up for a new listing, a change, a heartbeat and a room leaving the list', () => {
    const room = listing('a')
    expect(lobbyReportDue(null, room, now)).toBe(true)
    expect(lobbyReportDue(report(room), listing('a', { seated: 2 }), now)).toBe(true)
    expect(lobbyReportDue(report(room), room, now + LOBBY_HEARTBEAT_MS)).toBe(true)
    expect(lobbyReportDue(report(room), null, now)).toBe(true)
  })
})
