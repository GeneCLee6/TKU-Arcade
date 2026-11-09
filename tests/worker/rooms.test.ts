// The HTTP routes in front of RoomDO. The Durable Object is a stand-in here: what it does is
// tests/worker/room-host.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { isRoomId } from '../../shared/room-id.ts'
import { handleRequest, type Env } from '../../worker/app.ts'

function setup(stub: { create?: unknown; summary?: unknown; fetch?: unknown } = {}) {
  const room = {
    create: vi.fn(async () => true),
    summary: vi.fn(async () => null),
    fetch: vi.fn(async () => new Response('upgraded')),
    ...stub,
  }
  const names: string[] = []
  const env = {
    ASSETS: { fetch: vi.fn(async () => new Response('<html>')) },
    ROOM: {
      idFromName: (name: string) => {
        names.push(name)
        return name
      },
      get: () => room,
    },
  } as unknown as Env
  return { env, room, names }
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
    expect(room.create).toHaveBeenCalledWith(id, 'tictactoe', options, false)
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
      )
    }
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
