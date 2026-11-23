// The kart's room list and quick join (2026-11-23, docs/ARCHITECTURE.md §4.83): what GET /api/lobby
// answers with and without `game`, its limit per address, and POST /api/rooms/quick finding an open
// room or opening a new public one. The Durable Objects are stand-ins, as in rooms.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { weeklyTrack } from '../../shared/kart/board.ts'
import type { RoomListing } from '../../shared/protocol.ts'
import { MAX_ROOM_NAME_CHARS, acceptableRoomName, roomNameIssue } from '../../shared/roomName.ts'
import { handleLobby, type Env } from '../../worker/app.ts'
import {
  LOBBY_CACHE_MS,
  isOpenRoom,
  lobbyRooms,
  quickRooms,
  readLobby,
  type LobbyLister,
  QuickHolds,
  QUICK_HOLD_MS,
} from '../../worker/lobby-list.ts'
import { FixedWindowLimit } from '../../worker/rate-limit.ts'
import { handleRooms } from '../../worker/rooms.ts'

const NOW = Date.UTC(2026, 10, 23, 12)

const room = (id: string, over: Partial<RoomListing> = {}): RoomListing => ({
  id,
  gameId: 'kart',
  host: `host-${id}`,
  seated: 1,
  maxSeats: 8,
  createdAt: 1_000,
  ...over,
})

const ROOMS: RoomListing[] = [
  room('playing', { status: 'playing', seated: 4, createdAt: 9_000 }),
  room('locked', { locked: true, createdAt: 8_000 }),
  room('full', { seated: 8, createdAt: 7_000 }),
  room('lonely', { seated: 1, createdAt: 6_000 }),
  room('busy', { seated: 4, bots: 1, createdAt: 5_000 }),
  room('botty', { seated: 6, bots: 5, createdAt: 4_000 }),
  room('table', { gameId: 'promotion', seated: 2, maxSeats: 6, createdAt: 3_000 }),
]

describe('lobbyRooms and quickRooms', () => {
  it('shows the home page only the open rooms of every game, newest first, as before', () => {
    expect(lobbyRooms(ROOMS, null).map((one) => one.id)).toEqual(['lonely', 'busy', 'botty', 'table'])
    expect(ROOMS.filter(isOpenRoom)).toHaveLength(4)
  })

  it("shows a game's list every room of it: open first (more people first), then full or locked, then playing", () => {
    expect(lobbyRooms(ROOMS, 'kart').map((one) => one.id)).toEqual([
      'busy', // 3 people
      'lonely', // 1 person, newer than botty
      'botty', // 1 person and 5 computer karts
      'full', // 8 people
      'locked', // 1
      'playing',
    ])
    expect(lobbyRooms(ROOMS, 'promotion').map((one) => one.id)).toEqual(['table'])
  })

  it('sends quick join to the open room with the most people, then the one waiting longest', () => {
    const rooms = [...ROOMS, room('older', { seated: 4, bots: 1, createdAt: 500 })]
    expect(quickRooms(rooms, 'kart').map((one) => one.id)).toEqual(['older', 'busy', 'botty', 'lonely'])
    expect(quickRooms(rooms, 'kart').every(isOpenRoom)).toBe(true)
  })

  it('counts a listing from before 2026-11-23 (no status) as waiting', () => {
    expect(isOpenRoom({ id: 'a', gameId: 'kart', host: 'A', seated: 1, maxSeats: 8, createdAt: 0 })).toBe(true)
  })
})

/** The LOBBY binding, answering `rooms`, counting its calls */
function fakeLobby(rooms: RoomListing[] = ROOMS) {
  const list = vi.fn(async () => rooms)
  const binding = { idFromName: (name: string) => name, get: () => ({ list }) }
  return { binding, list }
}

describe('readLobby', () => {
  it('reuses one answer for LOBBY_CACHE_MS, per binding', async () => {
    const { binding, list } = fakeLobby()
    const lister = binding as unknown as LobbyLister
    await readLobby(lister, NOW)
    await readLobby(lister, NOW + LOBBY_CACHE_MS - 1)
    expect(list).toHaveBeenCalledTimes(1)
    await readLobby(lister, NOW + LOBBY_CACHE_MS)
    expect(list).toHaveBeenCalledTimes(2)
    // Another binding (another deployment, another test) has its own
    await readLobby(fakeLobby().binding as unknown as LobbyLister, NOW)
    expect(list).toHaveBeenCalledTimes(2)
  })
})

const fromAddress = (path: string, address = '203.0.113.9', init: RequestInit = {}) =>
  new Request(`https://x${path}`, { ...init, headers: { 'cf-connecting-ip': address, ...init.headers } })

function lobbyEnv(rooms: RoomListing[] = ROOMS): Env {
  return { LOBBY: fakeLobby(rooms).binding, DB: NO_FLAGS } as unknown as Env
}

describe('GET /api/lobby', () => {
  it("answers a game's list with `game`, and the home page's without", async () => {
    const env = lobbyEnv()
    const home = await handleLobby(fromAddress('/api/lobby'), env, undefined, new FixedWindowLimit(10, 100), NOW)
    expect(((await home.json()) as { rooms: RoomListing[] }).rooms.map((one) => one.id)).toEqual([
      'lonely',
      'busy',
      'botty',
      'table',
    ])
    const kart = await handleLobby(fromAddress('/api/lobby?game=kart'), env, undefined, new FixedWindowLimit(10, 100), NOW)
    expect(kart.status).toBe(200)
    expect(kart.headers.get('cache-control')).toBe('no-store')
    const rooms = ((await kart.json()) as { rooms: RoomListing[] }).rooms
    expect(rooms.map((one) => one.id)).toEqual(['busy', 'lonely', 'botty', 'full', 'locked', 'playing'])
  })

  it('refuses a game there is not', async () => {
    const res = await handleLobby(fromAddress('/api/lobby?game=nope'), lobbyEnv(), undefined, new FixedWindowLimit(10, 100), NOW)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unknown_game' })
  })

  it('limits each address, not the next one, and never local development', async () => {
    const env = lobbyEnv()
    const limit = new FixedWindowLimit(3, 100)
    const ask = (address: string) => handleLobby(fromAddress('/api/lobby?game=kart', address), env, undefined, limit, NOW)
    for (let i = 0; i < 3; i++) expect((await ask('203.0.113.9')).status).toBe(200)
    const refused = await ask('203.0.113.9')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
    expect((await ask('198.51.100.7')).status).toBe(200)
    for (let i = 0; i < 5; i++) expect((await ask('127.0.0.1')).status).toBe(200)
  })
})

/** A database with no paused game (worker/flags.ts) */
const NO_FLAGS = { prepare: () => ({ all: async () => ({ results: [] }) }) }

/**
 * Rooms by id for quick join: a summary each, and `create` for a new one (open from then on, unless
 * `gone`); the lobby holds quick join's new rooms as the LobbyDO does (QuickHolds)
 */
function quickSetup(rooms: RoomListing[], summaries: Record<string, unknown> = {}, gone = false) {
  const created: unknown[][] = []
  const made = new Set<string>()
  const summary = vi.fn(async (id: string) => summaries[id] ?? (made.has(id) && !gone ? open(id) : null))
  const holds = new QuickHolds()
  const lobby = {
    list: vi.fn(async () => rooms),
    claimCode: vi.fn(async () => null),
    claimQuick: vi.fn(async (gameId: string, id: string) => holds.claim(gameId, id, Date.now())),
    releaseQuick: vi.fn(async (gameId: string, id: string) => holds.release(gameId, id)),
  }
  const env = {
    DB: NO_FLAGS,
    LOBBY: { idFromName: (name: string) => name, get: () => lobby },
    ROOM: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        summary: () => summary(id),
        create: vi.fn(async (...args: unknown[]) => {
          // A room takes a moment to be made
          await new Promise((resolve) => setTimeout(resolve, 20))
          created.push(args)
          made.add(args[0] as string)
          return true
        }),
      }),
    },
  } as unknown as Env
  return { env, created, summary, lobby }
}

const quick = (body: unknown, address = '203.0.113.9') =>
  fromAddress('/api/rooms/quick', address, { method: 'POST', body: JSON.stringify(body) })

const open = (id: string) => ({ id, gameId: 'kart', status: 'waiting', members: 1, seated: 1, maxSeats: 8 })

describe('POST /api/rooms/quick', () => {
  const limits = () => [new FixedWindowLimit(10, 100), NOW, new FixedWindowLimit(10, 100)] as const

  it('sends you to the best open room, once the room itself says it is still open', async () => {
    const { env, created, summary } = quickSetup(ROOMS, { busy: open('busy') })
    const res = await handleRooms(quick({ gameId: 'kart' }), env, new URL('https://x/api/rooms/quick'), ...limits())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'busy', created: false })
    expect(summary).toHaveBeenCalledWith('busy')
    expect(created).toEqual([])
  })

  it('passes over a room that filled up, started or locked since the list', async () => {
    const { env } = quickSetup(ROOMS, {
      busy: { ...open('busy'), seated: 8 },
      lonely: { ...open('lonely'), status: 'playing' },
      botty: open('botty'),
    })
    const res = await handleRooms(quick({ gameId: 'kart' }), env, new URL('https://x/api/rooms/quick'), ...limits())
    expect(await res.json()).toEqual({ id: 'botty', created: false })
  })

  it("opens a public room on the week's track with items when there is none, named and with computer karts", async () => {
    const { env, created } = quickSetup([room('locked', { locked: true }), room('playing', { status: 'playing' })])
    const res = await handleRooms(
      quick({ gameId: 'kart', name: '  河口  快車 ', seatBots: { count: 3, level: 'normal' } }),
      env,
      new URL('https://x/api/rooms/quick'),
      ...limits(),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; created: boolean; code: string | null }
    expect(body.created).toBe(true)
    expect(created).toHaveLength(1)
    const [id, gameId, options, isPublic, , password, bots, name, seatBots] = created[0]!
    expect([id, gameId, isPublic, password, bots]).toEqual([body.id, 'kart', true, null, null])
    expect(options).toEqual({ track: weeklyTrack(NOW), mode: 'items' })
    expect(name).toBe('河口 快車')
    expect(seatBots).toEqual({ count: 3, level: 'normal' })
  })

  it("refuses a room name a nickname could not have, and computer players that do not fit", async () => {
    const { env, created } = quickSetup([])
    for (const [body, error] of [
      [{ gameId: 'kart', name: 'admin' }, 'bad_name'],
      [{ gameId: 'kart', name: 'x'.repeat(MAX_ROOM_NAME_CHARS + 1) }, 'bad_name'],
      [{ gameId: 'kart', seatBots: { count: 8, level: 'normal' } }, 'bad_bots'],
      [{ gameId: 'kart', seatBots: { count: 2, level: 'godlike' } }, 'bad_bots'],
      // The room plays a table game's computer players itself: not the host's to seat
      [{ gameId: 'holdem', seatBots: { count: 2, level: 'normal' } }, 'bad_bots'],
      [{ gameId: 'nope' }, 'unknown_game'],
    ] as const) {
      const res = await handleRooms(quick(body), env, new URL('https://x/api/rooms/quick'), ...limits())
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
    expect(created).toEqual([])
  })

  it('counts a new room against the limit on new rooms, and only takes POST', async () => {
    const { env } = quickSetup([])
    const creates = new FixedWindowLimit(1, 100)
    const reads = new FixedWindowLimit(10, 100)
    const url = new URL('https://x/api/rooms/quick')
    expect((await handleRooms(quick({ gameId: 'kart' }), env, url, creates, NOW, reads)).status).toBe(201)
    // (another game: the kart's new room is held for the next kart quick join, below)
    expect((await handleRooms(quick({ gameId: 'promotion' }), env, url, creates, NOW, reads)).status).toBe(429)
    const get = await handleRooms(fromAddress('/api/rooms/quick'), env, url, creates, NOW, reads)
    expect(get.status).toBe(405)
  })

  // 2026-11-23 (#163): two at once, no room listed: one new room, both sent to it
  it('opens one room for two quick joins at the same moment, and sends both to it', async () => {
    const { env, created } = quickSetup([])
    const url = new URL('https://x/api/rooms/quick')
    const [first, second] = await Promise.all(
      ['203.0.113.9', '198.51.100.7'].map((address) =>
        handleRooms(quick({ gameId: 'kart' }, address), env, url, ...limits()),
      ),
    )
    expect(created).toHaveLength(1)
    const bodies = [(await first!.json()) as { id: string; created: boolean }, (await second!.json()) as { id: string; created: boolean }]
    expect(bodies[0]!.id).toBe(bodies[1]!.id)
    expect(bodies.map((body) => body.created).sort()).toEqual([false, true])
    expect([first!.status, second!.status].sort()).toEqual([200, 201])
    // A while later, still unlisted (the list is a few seconds old): the same room, nothing new
    const third = await handleRooms(quick({ gameId: 'kart' }, '192.0.2.1'), env, url, ...limits())
    expect(await third.json()).toEqual({ id: bodies[0]!.id, created: false })
    expect(created).toHaveLength(1)
  })

  it('opens its own when the held room is full or never came', async () => {
    const { env, created, lobby } = quickSetup([], {}, true)
    const url = new URL('https://x/api/rooms/quick')
    expect((await handleRooms(quick({ gameId: 'kart' }), env, url, ...limits())).status).toBe(201)
    // The first one's room is not there: after a wait, a room of its own
    const late = await handleRooms(quick({ gameId: 'kart' }, '198.51.100.7'), env, url, ...limits())
    expect(late.status).toBe(201)
    expect(created).toHaveLength(2)
    expect(lobby.releaseQuick).toHaveBeenCalled()
  }, 10_000)

  it('limits the asking too, when it finds a room every time', async () => {
    const { env } = quickSetup(ROOMS, { busy: open('busy') })
    const reads = new FixedWindowLimit(2, 100)
    const url = new URL('https://x/api/rooms/quick')
    const ask = () => handleRooms(quick({ gameId: 'kart' }), env, url, new FixedWindowLimit(10, 100), NOW, reads)
    expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(429)
  })
})

describe('room names (2026-11-23)', () => {
  it('follow the nickname rules, with room for a longer name', () => {
    expect(acceptableRoomName('  週五  夜跑 ')).toBe('週五 夜跑')
    expect(acceptableRoomName('Friday night races, all in')).toBeNull()
    expect(acceptableRoomName('Friday night races!')).toBe('Friday night races!')
    expect(roomNameIssue('Admin room')).toBeNull()
    expect(roomNameIssue('admin')).toBe('reserved')
    expect(roomNameIssue('   ')).toBe('empty')
    expect(roomNameIssue('x'.repeat(MAX_ROOM_NAME_CHARS + 1))).toBe('tooLong')
    expect(acceptableRoomName(42)).toBeNull()
  })
})

describe('QuickHolds (2026-11-23, #163)', () => {
  it('holds the first new room of a game for QUICK_HOLD_MS, a game at a time', () => {
    const holds = new QuickHolds()
    expect(holds.claim('kart', 'a', NOW)).toBeNull()
    expect(holds.claim('kart', 'b', NOW + 10)).toBe('a')
    // Asking again for its own: still its own
    expect(holds.claim('kart', 'a', NOW + 20)).toBeNull()
    expect(holds.claim('promotion', 'c', NOW + 20)).toBeNull()
    // Past the hold, or let go: the next one opens its own
    expect(holds.claim('kart', 'd', NOW + 20 + QUICK_HOLD_MS)).toBeNull()
    holds.release('kart', 'd')
    expect(holds.claim('kart', 'e', NOW + 21 + QUICK_HOLD_MS)).toBeNull()
    // Only the room held is let go
    holds.release('kart', 'zzz')
    expect(holds.claim('kart', 'f', NOW + 22 + QUICK_HOLD_MS)).toBe('e')
  })
})
