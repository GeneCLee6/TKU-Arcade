// The kart's room list and quick join (2026-11-23, docs/ARCHITECTURE.md §4.82): what GET /api/lobby
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

/** Rooms by id for quick join: a summary each, and `create` for a new one */
function quickSetup(rooms: RoomListing[], summaries: Record<string, unknown> = {}) {
  const created: unknown[][] = []
  const summary = vi.fn(async (id: string) => summaries[id] ?? null)
  const lobby = {
    list: vi.fn(async () => rooms),
    claimCode: vi.fn(async () => null),
  }
  const env = {
    DB: NO_FLAGS,
    LOBBY: { idFromName: (name: string) => name, get: () => lobby },
    ROOM: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        summary: () => summary(id),
        create: vi.fn(async (...args: unknown[]) => {
          created.push(args)
          return true
        }),
      }),
    },
  } as unknown as Env
  return { env, created, summary }
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
    expect((await handleRooms(quick({ gameId: 'kart' }), env, url, creates, NOW, reads)).status).toBe(429)
    const get = await handleRooms(fromAddress('/api/rooms/quick'), env, url, creates, NOW, reads)
    expect(get.status).toBe(405)
  })

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
