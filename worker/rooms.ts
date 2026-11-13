import { getGame } from '../shared/games/index.ts'
import type { OptionValues } from '../shared/games/types.ts'
import {
  normalizePassword,
  type CreateRoomResponse,
  type RoomCodeResponse,
} from '../shared/protocol.ts'
import { isRoomCode, newRoomCode } from '../shared/room-code.ts'
import { isRoomId, newRoomId } from '../shared/room-id.ts'
import type { Env } from './app.ts'
import { ACCOUNT_HEADER, encodeAccountHeader, sessionAccount } from './auth.ts'
import { LOBBY_NAME } from './lobby-board.ts'

/** Tries this many fresh ids before giving up (a collision at ~59 bits is not expected at all) */
const CREATE_ATTEMPTS = 3

/** Far more than any game's options; a longer POST /api/rooms is refused without parsing */
const MAX_CREATE_BODY_CHARS = 4_096

/** Random numbers tried for a new room before it goes without one (9000 numbers, a few rooms open) */
const CODE_ATTEMPTS = 12

const ROOM_PATH = /^\/api\/rooms\/([^/]+)$/
const REPLAY_PATH = /^\/api\/rooms\/([^/]+)\/replay$/
const CODE_PATH = /^\/api\/codes\/([^/]+)$/
const SOCKET_PATH = /^\/ws\/([^/]+)$/

const noStore = { 'cache-control': 'no-store' }

function fail(error: string, status: number, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...noStore, ...headers } })
}

function roomStub(env: Env, id: string) {
  return env.ROOM.get(env.ROOM.idFromName(id))
}

const lobbyStub = (env: Env) => env.LOBBY.get(env.LOBBY.idFromName(LOBBY_NAME))

/**
 * A short number for the new room `id`: a random one that is free, or whose room has been cleaned
 * up. Null when a dozen draws all hit open rooms, or the lobby cannot be reached: the room still
 * works by its link, only without a number
 */
async function claimCode(env: Env, id: string): Promise<string | null> {
  try {
    const lobby = lobbyStub(env)
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = newRoomCode()
      const holder = await lobby.claimCode(code, id, null)
      if (holder === null) return code
      if ((await roomStub(env, holder).summary()) !== null) continue
      if ((await lobby.claimCode(code, id, holder)) === null) return code
    }
  } catch (error) {
    console.error('room code failed', error)
  }
  return null
}

/** GET /api/codes/<code>: the room behind a short number, while that room exists */
export async function handleRoomCode(request: Request, env: Env, url: URL): Promise<Response> {
  const match = CODE_PATH.exec(url.pathname)
  if (!match || !isRoomCode(match[1])) return fail('not_found', 404)
  if (request.method !== 'GET') return fail('method_not_allowed', 405, { allow: 'GET' })
  const code = match[1]
  const lobby = lobbyStub(env)
  const id = await lobby.lookupCode(code)
  if (id === null) return fail('not_found', 404)
  if ((await roomStub(env, id).summary()) === null) {
    await lobby.releaseCode(code, id)
    return fail('not_found', 404)
  }
  const body: RoomCodeResponse = { id }
  return Response.json(body, { headers: noStore })
}

/** POST /api/rooms creates a room and answers its id; GET /api/rooms/<id> answers its summary */
export async function handleRooms(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api/rooms') {
    if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
    return createRoom(request, env)
  }
  const replay = REPLAY_PATH.exec(url.pathname)
  if (replay && isRoomId(replay[1])) {
    if (request.method !== 'GET') return fail('method_not_allowed', 405, { allow: 'GET' })
    // Only a finished game: the room answers null while one is being played (e2-t09)
    const body = await roomStub(env, replay[1]).replay()
    if (body === null) return fail('not_found', 404)
    return new Response(body, { headers: { ...noStore, 'content-type': 'application/json' } })
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
    password,
  } = (typeof body === 'object' && body !== null ? body : {}) as {
    gameId?: unknown
    options?: unknown
    public?: unknown
    password?: unknown
  }
  if (typeof gameId !== 'string' || !getGame(gameId)) return fail('unknown_game', 400)
  // A password that is there but no good (too long, only spaces) is refused, not dropped silently
  if (password !== undefined && password !== '' && normalizePassword(password) === null) {
    return fail('bad_password', 400)
  }
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const id = newRoomId()
    // The number first, so that the room can show it from the start. Should the id be taken (not
    // expected at ~59 bits), the number points at a room that is not there and is soon reused
    const code = await claimCode(env, id)
    // The room checks `options` against the game's schema: this only keeps them plain for the RPC
    const created = await roomStub(env, id).create(
      id,
      gameId,
      plainOptions(options),
      isPublic === true,
      code,
      normalizePassword(password),
    )
    if (created) {
      const created: CreateRoomResponse = { id, code }
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
