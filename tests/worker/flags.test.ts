// e12-t11 (AC-12.7): per-game flags on a real SQLite with the deployed migrations, and what a
// paused game does to the lobby and to POST /api/rooms. What it does to a room already open is in
// room-host.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { GAME_IDS } from '../../shared/games/index.ts'
import type { AdminFlagsResponse, FlagsResponse, LobbyResponse } from '../../shared/protocol.ts'
import { handleRequest, type Env } from '../../worker/app.ts'
import { disabledGames, handleAdminFlags } from '../../worker/flags.ts'
import { migratedD1 } from './sqlite-d1.ts'

const KEY = 'owner-key-123'

function setup(key: string | undefined = KEY) {
  const { db } = migratedD1()
  const room = { create: vi.fn(async () => true) }
  const listed = GAME_IDS.map((gameId, index) => ({
    id: `room${String(index).padStart(6, '0')}`,
    gameId,
    host: 'Ann',
    seated: 1,
    maxSeats: 4,
    createdAt: 1,
  }))
  const lobby = {
    claimCode: vi.fn(async () => null),
    list: vi.fn(async () => listed),
  }
  const env = {
    DB: db,
    STATS_KEY: key,
    LOBBY: { idFromName: (name: string) => name, get: () => lobby },
    ROOM: { idFromName: (name: string) => name, get: () => room },
  } as unknown as Env
  return { env, room }
}

const owner = (init: RequestInit = {}, key = KEY) =>
  new Request('https://x/api/admin/flags', {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  })
const put = (game: string, enabled: unknown) =>
  owner({ method: 'PUT', body: JSON.stringify({ game, enabled }) })
// A new address each time: the per-address limit on new rooms is rooms.test.ts's
const createRoom = (gameId: string) =>
  new Request('https://x/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ gameId }),
    headers: { 'cf-connecting-ip': crypto.randomUUID() },
  })

describe('the owner’s switches', () => {
  it('are not there without STATS_KEY, and refuse a wrong key', async () => {
    expect((await handleAdminFlags(owner(), setup('').env)).status).toBe(404)
    const { env } = setup()
    expect((await handleAdminFlags(owner({}, 'nope'), env)).status).toBe(403)
    expect((await handleAdminFlags(new Request('https://x/api/admin/flags'), env)).status).toBe(403)
    expect((await handleAdminFlags(owner({ method: 'DELETE' }), env)).status).toBe(405)
  })

  it('list every game the server has, all open at first, the kart included', async () => {
    const { env } = setup()
    const res = await handleRequest(owner(), env)
    const body = (await res.json()) as AdminFlagsResponse
    expect(body.games.map((game) => game.id)).toEqual(GAME_IDS)
    expect(GAME_IDS).toContain('kart')
    expect(body.games.every((game) => game.enabled && game.updatedAt === null)).toBe(true)
  })

  it('pause and open a game, without a deploy', async () => {
    const { env } = setup()
    const paused = (await (await handleAdminFlags(put('kart', false), env, 5)).json()) as AdminFlagsResponse
    expect(paused.games.find((game) => game.id === 'kart')).toEqual({
      id: 'kart',
      enabled: false,
      updatedAt: 5,
    })
    const flags = (await (await handleRequest(new Request('https://x/api/flags'), env)).json()) as FlagsResponse
    expect(flags).toEqual({ disabled: ['kart'] })
    await handleAdminFlags(put('kart', true), env, 6)
    expect([...(await disabledGames(env.DB))]).toEqual([])
  })

  it('refuse a game the server does not have, or a value that is not true or false', async () => {
    const { env } = setup()
    expect((await handleAdminFlags(put('nope', false), env)).status).toBe(400)
    expect((await handleAdminFlags(put('kart', 'no'), env)).status).toBe(400)
    expect([...(await disabledGames(env.DB))]).toEqual([])
  })
})

describe('a paused game', () => {
  it.each(GAME_IDS)('%s: opens no room, and its public rooms are not listed', async (gameId) => {
    const { env, room } = setup()
    await handleAdminFlags(put(gameId, false), env)
    const refused = await handleRequest(createRoom(gameId), env)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: 'game_disabled' })
    expect(room.create).not.toHaveBeenCalled()
    const lobby = (await (await handleRequest(new Request('https://x/api/lobby'), env)).json()) as LobbyResponse
    expect(lobby.rooms.map((listing) => listing.gameId)).toEqual(GAME_IDS.filter((id) => id !== gameId))
    // The others are untouched
    const other = GAME_IDS.find((id) => id !== gameId) as string
    expect((await handleRequest(createRoom(other), env)).status).toBe(201)
  })

  it('leaves every game open when the table cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = {
      prepare: () => ({
        all: async () => Promise.reject(new Error('no such table')),
      }),
    } as unknown as D1Database
    expect([...(await disabledGames(broken))]).toEqual([])
  })
})
