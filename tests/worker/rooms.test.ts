// The HTTP routes in front of RoomDO. The Durable Object is a stand-in here: what it does is
// tests/worker/room-host.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { isRoomCode } from '../../shared/room-code.ts'
import { isRoomId } from '../../shared/room-id.ts'
import { handleRequest, type Env } from '../../worker/app.ts'

/** The LobbyDO's book of room numbers, as worker/lobby.ts keeps it */
function fakeLobby() {
  const codes = new Map<string, string>()
  return {
    codes,
    claimCode: vi.fn(async (code: string, roomId: string, replacing: string | null) => {
      const holder = codes.get(code) ?? null
      if (holder !== null && holder !== roomId && holder !== replacing) return holder
      codes.set(code, roomId)
      return null
    }),
    lookupCode: vi.fn(async (code: string) => codes.get(code) ?? null),
    releaseCode: vi.fn(async (code: string, roomId: string) => {
      if (codes.get(code) === roomId) codes.delete(code)
    }),
  }
}

function setup(
  stub: { create?: unknown; summary?: unknown; fetch?: unknown; replay?: unknown } = {},
) {
  const room = {
    create: vi.fn(async () => true),
    summary: vi.fn(async () => null),
    replay: vi.fn(async (): Promise<string | null> => null),
    fetch: vi.fn(async () => new Response('upgraded')),
    ...stub,
  }
  const lobby = fakeLobby()
  const names: string[] = []
  const env = {
    LOBBY: { idFromName: (name: string) => name, get: () => lobby },
    ASSETS: { fetch: vi.fn(async () => new Response('<html>')) },
    ROOM: {
      idFromName: (name: string) => {
        names.push(name)
        return name
      },
      get: () => room,
    },
  } as unknown as Env
  return { env, room, names, lobby }
}

const post = (body: string) => new Request('https://x/api/rooms', { method: 'POST', body })
const ID = 'abcdefghij'

describe('POST /api/rooms', () => {
  it('creates a room in the object named by its new id', async () => {
    const { env, room, names } = setup()
    const options = { fast: true }
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe', options })), env)
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { id } = (await res.json()) as { id: string }
    expect(isRoomId(id)).toBe(true)
    expect(names).toEqual([id])
    expect(room.create).toHaveBeenCalledWith(
      id,
      'tictactoe',
      options,
      false,
      expect.any(String),
      null,
    )
  })

  it('makes a room public only when asked in so many words', async () => {
    const cases: [unknown, boolean][] = [
      [true, true],
      [false, false],
      ['true', false],
      [1, false],
      [undefined, false],
    ]
    for (const [value, expected] of cases) {
      const { env, room } = setup()
      await handleRequest(post(JSON.stringify({ gameId: 'tictactoe', public: value })), env)
      expect(room.create, String(value)).toHaveBeenCalledWith(
        expect.any(String),
        'tictactoe',
        undefined,
        expected,
        expect.any(String),
        null,
      )
    }
  })

  it('gives the room a four-digit number, answers it, and keeps it in the lobby', async () => {
    const { env, room, lobby } = setup()
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe' })), env)
    const { id, code } = (await res.json()) as { id: string; code: string }
    expect(isRoomCode(code)).toBe(true)
    expect(room.create).toHaveBeenCalledWith(id, 'tictactoe', undefined, false, code, null)
    expect(lobby.codes.get(code)).toBe(id)
  })

  it('never takes the number of a room still open: with all held, the room goes without', async () => {
    const { env, room, lobby } = setup({ summary: vi.fn(async () => ({ id: 'x' })) })
    for (let n = 1000; n <= 9999; n++) lobby.codes.set(String(n), `open${n}`)
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe' })), env)
    expect(res.status).toBe(201)
    expect(((await res.json()) as { code: unknown }).code).toBeNull()
    expect(room.create).toHaveBeenCalledWith(
      expect.any(String),
      'tictactoe',
      undefined,
      false,
      null,
      null,
    )
    expect([...lobby.codes.values()].every((holder) => holder.startsWith('open'))).toBe(true)
  })

  it('takes over the number of a room that has been cleaned up', async () => {
    const { env, lobby } = setup()
    for (let n = 1000; n <= 9999; n++) lobby.codes.set(String(n), 'oldroomxyz')
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe' })), env)
    const { id, code } = (await res.json()) as { id: string; code: string }
    expect(isRoomCode(code)).toBe(true)
    expect(lobby.codes.get(code)).toBe(id)
  })

  it('still creates the room, without a number, when the lobby cannot be reached', async () => {
    const { env, room, lobby } = setup()
    lobby.claimCode.mockRejectedValue(new Error('down'))
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe' })), env)
    expect(res.status).toBe(201)
    expect(((await res.json()) as { code: unknown }).code).toBeNull()
    expect(room.create).toHaveBeenCalledWith(
      expect.any(String),
      'tictactoe',
      undefined,
      false,
      null,
      null,
    )
  })

  it('tries another id on a collision, and gives up in the end', async () => {
    const create = vi.fn(async () => false)
    const { env } = setup({ create })
    const res = await handleRequest(post(JSON.stringify({ gameId: 'tictactoe' })), env)
    expect(res.status).toBe(503)
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('refuses an unknown game and a body that makes no sense', async () => {
    const { env, room } = setup()
    const cases: [string, string][] = [
      [JSON.stringify({ gameId: 'nope' }), 'unknown_game'],
      [JSON.stringify({}), 'unknown_game'],
      ['null', 'unknown_game'],
      ['not json', 'bad_request'],
      [JSON.stringify({ gameId: 'tictactoe', pad: 'x'.repeat(5000) }), 'bad_request'],
    ]
    for (const [body, error] of cases) {
      const res = await handleRequest(post(body), env)
      expect(res.status, body).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
    expect(room.create).not.toHaveBeenCalled()
  })

  it('only takes POST', async () => {
    const res = await handleRequest(new Request('https://x/api/rooms'), setup().env)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })
})

describe('GET /api/rooms/<id>', () => {
  it('answers the room’s summary', async () => {
    const summary = { id: ID, gameId: 'tictactoe', status: 'waiting' }
    const { env, names } = setup({ summary: async () => summary })
    const res = await handleRequest(new Request(`https://x/api/rooms/${ID}`), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(summary)
    expect(names).toEqual([ID])
  })

  it('answers 404 for no such room, and for what cannot be a room id', async () => {
    const { env, names } = setup()
    expect((await handleRequest(new Request(`https://x/api/rooms/${ID}`), env)).status).toBe(404)
    names.length = 0
    for (const bad of ['short', 'abcdefghi0', `${ID}/more`]) {
      expect((await handleRequest(new Request(`https://x/api/rooms/${bad}`), env)).status).toBe(404)
    }
    // Never even wakes an object
    expect(names).toEqual([])
  })

  it('only takes GET', async () => {
    const res = await handleRequest(
      new Request(`https://x/api/rooms/${ID}`, { method: 'DELETE' }),
      setup().env,
    )
    expect(res.status).toBe(405)
  })
})

describe('/ws/<id>', () => {
  const upgrade = (id: string, headers: Record<string, string> = {}) =>
    new Request(`https://x/ws/${id}?v=1`, { headers: { Upgrade: 'websocket', ...headers } })

  it('hands the upgrade to the room’s object', async () => {
    const { env, room, names } = setup()
    const request = upgrade(ID, { Origin: 'https://x' })
    expect(await (await handleRequest(request, env)).text()).toBe('upgraded')
    // A copy, without any account header (e1-t13: sign-in is not configured here)
    const forwarded = (room.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as Request
    expect(forwarded.url).toBe(request.url)
    expect(forwarded.headers.get('Upgrade')).toBe('websocket')
    expect(forwarded.headers.get('X-Arcade-Account')).toBeNull()
    expect(names).toEqual([ID])
  })

  it('refuses what is not an upgrade, a bad id and a page on another site', async () => {
    const { env, room } = setup()
    const cases: [Request, number][] = [
      [new Request(`https://x/ws/${ID}?v=1`), 426],
      [upgrade('short'), 404],
      [upgrade(ID, { Origin: 'https://evil.example' }), 403],
    ]
    for (const [request, status] of cases) {
      expect((await handleRequest(request, env)).status, request.url).toBe(status)
    }
    expect(room.fetch).not.toHaveBeenCalled()
  })
})

describe('GET /api/codes/<code>', () => {
  const get = (path: string, method = 'GET') => new Request(`https://x${path}`, { method })

  it('answers the room a number belongs to while that room exists', async () => {
    const { env, lobby } = setup({ summary: vi.fn(async () => ({ id: ID })) })
    lobby.codes.set('4827', ID)
    const res = await handleRequest(get('/api/codes/4827'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ id: ID })
  })

  it('frees the number of a room that is gone, and says not found', async () => {
    const { env, lobby } = setup()
    lobby.codes.set('4827', ID)
    const res = await handleRequest(get('/api/codes/4827'), env)
    expect(res.status).toBe(404)
    expect(lobby.codes.has('4827')).toBe(false)
  })

  it('says not found for a free number or anything that is not one, and takes only GET', async () => {
    const { env } = setup()
    for (const path of [
      '/api/codes/4827',
      '/api/codes/0123',
      '/api/codes/12345',
      '/api/codes/abcd',
    ]) {
      expect((await handleRequest(get(path), env)).status, path).toBe(404)
    }
    expect((await handleRequest(get('/api/codes/4827', 'POST'), env)).status).toBe(405)
  })
})

// e1-t16
describe('a room password at creation', () => {
  it('hands the room a trimmed password', async () => {
    const { env, room } = setup()
    await handleRequest(post(JSON.stringify({ gameId: 'tictactoe', password: ' tamsui ' })), env)
    expect(room.create).toHaveBeenCalledWith(
      expect.any(String),
      'tictactoe',
      undefined,
      false,
      expect.any(String),
      'tamsui',
    )
  })

  it('refuses one that is too long rather than drop it', async () => {
    const { env, room } = setup()
    const res = await handleRequest(
      post(JSON.stringify({ gameId: 'tictactoe', password: 'x'.repeat(33) })),
      env,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_password' })
    expect(room.create).not.toHaveBeenCalled()
  })
})

// e2-t09
describe('GET /api/rooms/<id>/replay', () => {
  it('passes on the room’s replay, or 404 while there is no finished game', async () => {
    const none = setup()
    expect(
      (await handleRequest(new Request(`https://x/api/rooms/${ID}/replay`), none.env)).status,
    ).toBe(404)
    const body = JSON.stringify({ gameId: 'tictactoe', frames: [] })
    const { env } = setup({ replay: vi.fn(async () => body) })
    const res = await handleRequest(new Request(`https://x/api/rooms/${ID}/replay`), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.text()).toBe(body)
  })

  it('only answers GET', async () => {
    const { env } = setup()
    const res = await handleRequest(
      new Request(`https://x/api/rooms/${ID}/replay`, { method: 'POST' }),
      env,
    )
    expect(res.status).toBe(405)
  })
})
