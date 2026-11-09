import { getGame } from '../shared/games/index.ts'
import type { OptionValues } from '../shared/games/types.ts'
import type { CreateRoomResponse } from '../shared/protocol.ts'
import { isRoomId, newRoomId } from '../shared/room-id.ts'
import type { Env } from './app.ts'
import { ACCOUNT_HEADER, encodeAccountHeader, sessionAccount } from './auth.ts'

/** Tries this many fresh ids before giving up (a collision at ~59 bits is not expected at all) */
const CREATE_ATTEMPTS = 3

/** Far more than any game's options; a longer POST /api/rooms is refused without parsing */
const MAX_CREATE_BODY_CHARS = 4_096

const ROOM_PATH = /^\/api\/rooms\/([^/]+)$/
const SOCKET_PATH = /^\/ws\/([^/]+)$/

const noStore = { 'cache-control': 'no-store' }

function fail(error: string, status: number, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...noStore, ...headers } })
}

function roomStub(env: Env, id: string) {
  return env.ROOM.get(env.ROOM.idFromName(id))
}

/** POST /api/rooms creates a room and answers its id; GET /api/rooms/<id> answers its summary */
export async function handleRooms(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api/rooms') {
    if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
    return createRoom(request, env)
  }
  const match = ROOM_PATH.exec(url.pathname)
  if (!match || !isRoomId(match[1])) return fail('not_found', 404)
  if (request.method !== 'GET') return fail('method_not_allowed', 405, { allow: 'GET' })
  const summary = await roomStub(env, match[1]).summary()
  return summary ? Response.json(summary, { headers: noStore }) : fail('not_found', 404)
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_CREATE_BODY_CHARS) return fail('bad_request', 400)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return fail('bad_request', 400)
  }
  const {
    gameId,
    options,
    public: isPublic,
  } = (typeof body === 'object' && body !== null ? body : {}) as {
    gameId?: unknown
    options?: unknown
    public?: unknown
  }
  if (typeof gameId !== 'string' || !getGame(gameId)) return fail('unknown_game', 400)
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const id = newRoomId()
    // The room checks `options` against the game's schema: this only keeps them plain for the RPC
    if (await roomStub(env, id).create(id, gameId, plainOptions(options), isPublic === true)) {
      const created: CreateRoomResponse = { id }
      return Response.json(created, { status: 201, headers: noStore })
    }
  }
  return fail('unavailable', 503)
}

function plainOptions(options: unknown): OptionValues | undefined {
  return typeof options === 'object' && options !== null ? (options as OptionValues) : undefined
}

/** /ws/<id>: the room's WebSocket, handed to its RoomDO (shared/protocol.ts) */
export async function handleRoomSocket(request: Request, env: Env, url: URL): Promise<Response> {
  const match = SOCKET_PATH.exec(url.pathname)
  if (!match || !isRoomId(match[1])) return fail('not_found', 404)
  if (request.headers.get('Upgrade') !== 'websocket') return fail('expected_websocket', 426)
  // Browsers always send Origin on a WebSocket, and a page on another site has no business opening
  // one here. Non-browser clients (no Origin) could forge any header anyway
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin) return fail('forbidden_origin', 403)
  // Who the session says this is (e1-t13): the room takes a signed-in person's name from here, not
  // from `join`. A Durable Object cannot be reached from outside, so this header only ever comes
  // from this line; whatever a browser sent under that name is dropped
  const headers = new Headers(request.headers)
  headers.delete(ACCOUNT_HEADER)
  const account = await sessionAccount(request, env)
  if (account) headers.set(ACCOUNT_HEADER, encodeAccountHeader(account))
  return roomStub(env, match[1]).fetch(new Request(request, { headers }))
}
