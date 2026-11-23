// The lobby's pushed room list, the server's side (2026-11-23, worker/lobby-feed.ts, worker/lobby.ts):
// who may watch, what each change of the board sends, and the Worker's checks on /ws/lobby
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyLobbyFeed,
  lobbyFeedPath,
  lobbyRooms,
  parseLobbyFeed,
  type LobbyFeedMessage,
} from '../../shared/lobby-feed.ts'
import { CloseCode, LOBBY_TTL_MS, type RoomListing } from '../../shared/protocol.ts'
import { ADDRESS_HEADER, addressKey } from '../../worker/address.ts'
import { handleLobbySocket, type Env } from '../../worker/app.ts'
import { LobbyBoard } from '../../worker/lobby-board.ts'
import {
  MAX_LOBBY_WATCHERS,
  MAX_LOBBY_WATCHERS_PER_ADDRESS,
  admitWatcher,
  feedChange,
  watcherTag,
  type LobbyWatcher,
} from '../../worker/lobby-feed.ts'
import { FixedWindowLimit } from '../../worker/rate-limit.ts'

const room = (id: string, over: Partial<RoomListing> = {}): RoomListing => ({
  id,
  gameId: 'kart',
  host: `host-${id}`,
  seated: 1,
  maxSeats: 8,
  createdAt: 1_000,
  ...over,
})

const watcher = (address: string | null): LobbyWatcher => ({ game: 'kart', address, openedAt: 0 })

describe('watchers', () => {
  it('are capped for the site and per address, and tagged by game', () => {
    expect(admitWatcher([], 'a')).toEqual({ ok: true })
    const fromA = Array.from({ length: MAX_LOBBY_WATCHERS_PER_ADDRESS }, () => watcher('a'))
    expect(admitWatcher(fromA, 'a')).toMatchObject({ ok: false, code: CloseCode.tooManyConnections })
    expect(admitWatcher(fromA, 'b')).toEqual({ ok: true })
    // Without an address only the site's cap counts
    expect(admitWatcher(fromA, null)).toEqual({ ok: true })
    const site = Array.from({ length: MAX_LOBBY_WATCHERS }, (_, i) => watcher(`x${i}`))
    expect(admitWatcher(site, 'b')).toMatchObject({ ok: false, code: CloseCode.tooManyConnections })
    expect(watcherTag('kart')).toBe('game:kart')
    expect(lobbyFeedPath('kart')).toBe('/ws/lobby?game=kart&v=1')
  })
})

describe('what a change sends', () => {
  it('a new room, a changed one, nothing for a heartbeat, gone, and nothing of a paused game', () => {
    expect(feedChange(null, room('a'), false)).toEqual({ t: 'room', room: room('a') })
    expect(feedChange(room('a'), room('a', { seated: 2 }), false)).toEqual({
      t: 'room',
      room: room('a', { seated: 2 }),
    })
    expect(feedChange(room('a'), room('a'), false)).toBeNull()
    expect(feedChange(room('a'), null, false)).toEqual({ t: 'gone', id: 'a' })
    expect(feedChange(null, null, false)).toBeNull()
    expect(feedChange(null, room('a'), true)).toBeNull()
    expect(feedChange(room('a'), room('a', { seated: 2 }), true)).toEqual({ t: 'gone', id: 'a' })
  })

  it('follows the board: a report, a heartbeat, a removal, a room that timed out', () => {
    let now = 10_000
    const sent: LobbyFeedMessage[] = []
    const board = new LobbyBoard({
      storage: { save: () => {}, drop: () => {} },
      now: () => now,
      changed: (before, after) => {
        const message = feedChange(before, after, false)
        if (message) sent.push(message)
      },
    })
    board.report('a', room('a'))
    board.report('a', room('a'))
    board.report('a', room('a', { status: 'playing' }))
    board.report('b', room('b'))
    board.report('a', null)
    board.report('zzz', null)
    now += LOBBY_TTL_MS
    board.sweep()
    expect(sent).toEqual([
      { t: 'room', room: room('a') },
      { t: 'room', room: room('a', { status: 'playing' }) },
      { t: 'room', room: room('b') },
      { t: 'gone', id: 'a' },
      { t: 'gone', id: 'b' },
    ])
  })

  it('adds up, on the page, to the list GET /api/lobby answers', () => {
    const rooms = [room('a'), room('b', { seated: 3 }), room('c', { status: 'playing' })]
    let known = applyLobbyFeed(new Map(), { t: 'rooms', rooms: rooms.slice(0, 2) })
    for (const raw of [
      JSON.stringify({ t: 'room', room: rooms[2] }),
      JSON.stringify({ t: 'room', room: room('d', { locked: true }) }),
      JSON.stringify({ t: 'gone', id: 'd' }),
    ]) {
      known = applyLobbyFeed(known, parseLobbyFeed(raw)!)
    }
    expect(lobbyRooms([...known.values()], 'kart')).toEqual(lobbyRooms(rooms, 'kart'))
    expect(parseLobbyFeed('pong')).toBeNull()
    expect(parseLobbyFeed('{"t":"room","room":{"id":1}}')).toBeNull()
    expect(parseLobbyFeed('{"t":"rooms","rooms":[{"id":"x"}]}')).toEqual({ t: 'rooms', rooms: [] })
  })
})

describe('/ws/lobby', () => {
  let closed: { code: number; reason: string }[]

  beforeEach(() => {
    closed = []
    // Node has no WebSocketPair, nor a 101 Response: stand-ins that record the close
    vi.stubGlobal(
      'WebSocketPair',
      class {
        0 = {}
        1 = {
          accept: () => {},
          close: (code: number, reason: string) => closed.push({ code, reason }),
        }
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  function setup() {
    const fetch = vi.fn(async (request: Request) => {
      void request
      return new Response('upgraded')
    })
    const env = { LOBBY: { idFromName: (name: string) => name, get: () => ({ fetch }) } } as unknown as Env
    return { env, fetch }
  }
  const upgrade = (path = '/ws/lobby?game=kart&v=1', headers: Record<string, string> = {}) =>
    new Request(`https://x${path}`, {
      headers: { Upgrade: 'websocket', 'cf-connecting-ip': '198.51.100.7', ...headers },
    })
  const ask = (env: Env, request: Request, limit = new FixedWindowLimit(10, 100)) =>
    handleLobbySocket(request, env, new URL(request.url), limit, 0).catch(() => null)

  it('hands the lobby the hashed address, never one the browser sent', async () => {
    const { env, fetch } = setup()
    await ask(env, upgrade(undefined, { [ADDRESS_HEADER]: 'forged', Origin: 'https://x' }))
    const forwarded = fetch.mock.calls[0]![0]
    expect(forwarded.headers.get(ADDRESS_HEADER)).toBe(await addressKey('198.51.100.7'))
  })

  it('refuses another site, a game that is not there, and a plain request', async () => {
    const { env, fetch } = setup()
    expect((await ask(env, upgrade(undefined, { Origin: 'https://evil.example' })))?.status).toBe(403)
    expect((await ask(env, upgrade('/ws/lobby?game=nope&v=1')))?.status).toBe(400)
    expect((await ask(env, upgrade('/ws/lobby?v=1')))?.status).toBe(400)
    const plain = new Request('https://x/ws/lobby?game=kart&v=1')
    expect((await ask(env, plain))?.status).toBe(426)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('closes with tooManyConnections past the address allowance, without waking the lobby', async () => {
    const { env, fetch } = setup()
    const limit = new FixedWindowLimit(2, 100)
    for (let i = 0; i < 3; i++) await ask(env, upgrade(), limit)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(closed).toEqual([{ code: CloseCode.tooManyConnections, reason: 'too many connections' }])
  })
})
