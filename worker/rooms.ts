import { getGame } from '../shared/games/index.ts'
import { parseQuickBots, parseSeatBots } from '../shared/games/quickBots.ts'
import type { OptionValues } from '../shared/games/types.ts'
import { weeklyTrack } from '../shared/kart/board.ts'
import { acceptableRoomName } from '../shared/roomName.ts'
import {
  CloseCode,
  normalizePassword,
  type CreateRoomResponse,
  type QuickBots,
  type QuickJoinResponse,
  type RoomCodeResponse,
  type SeatBots,
} from '../shared/protocol.ts'
import { isRoomCode, newRoomCode } from '../shared/room-code.ts'
import { isRoomId, newRoomId } from '../shared/room-id.ts'
import { ADDRESS_HEADER, addressKey, clientAddress, isLoopback } from './address.ts'
import type { Env } from './app.ts'
import { ACCOUNT_HEADER, encodeAccountHeader, sessionAccount } from './auth.ts'
import { isGameEnabled } from './flags.ts'
import { LOBBY_NAME } from './lobby-board.ts'
import { lobbyReadLimit, quickRooms, readLobby, type LobbyLister } from './lobby-list.ts'
import { FixedWindowLimit, takeShared } from './rate-limit.ts'

/** Tries this many fresh ids before giving up (a collision at ~59 bits is not expected at all) */
const CREATE_ATTEMPTS = 3

/** Far more than any game's options; a longer POST /api/rooms is refused without parsing */
const MAX_CREATE_BODY_CHARS = 4_096

/** Random numbers tried for a new room before it goes without one (9000 numbers, a few rooms open) */
const CODE_ATTEMPTS = 12

/**
 * New rooms one address may open a minute, per Worker instance (e12-t13): a first, free check in
 * memory, before the one shared by every instance (LimiterDO, 5 a minute, e12-t06), and the only
 * one where that binding is missing
 */
const CREATES_PER_ADDRESS = 30
/** New rooms one Worker instance opens a minute, whoever asks */
const CREATES_PER_INSTANCE = 600

const createLimit = new FixedWindowLimit(CREATES_PER_ADDRESS, CREATES_PER_INSTANCE)

/** Open rooms quick join asks about (their summary) before it opens a new one */
const QUICK_TRIES = 3

/**
 * 2026-11-23 (#163): sent to a room another quick join is opening, wait at most this long for it to
 * be there, looking every QUICK_LOOK_MS; then open one's own
 */
const QUICK_WAIT_MS = 3_000
const QUICK_LOOK_MS = 150

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

/** One take of the address's allowance of new rooms (in memory, then shared); false when spent */
async function takeCreate(
  request: Request,
  env: Env,
  limit: FixedWindowLimit,
  now: number,
): Promise<boolean> {
  const address = clientAddress(request)
  const key = await addressKey(address)
  // Local development (npm run dev, the browser tests) opens many rooms from one machine
  const shared = address === null || !isLoopback(address)
  return limit.take(key, now) && (!shared || (await takeShared(env.LIMITER, 'create', key)))
}

/**
 * POST /api/rooms creates a room and answers its id; POST /api/rooms/quick (2026-11-23) finds an open
 * public room or opens one; GET /api/rooms/<id> answers its summary
 */
export async function handleRooms(
  request: Request,
  env: Env,
  url: URL,
  limit: FixedWindowLimit = createLimit,
  now: number = Date.now(),
  reads: FixedWindowLimit = lobbyReadLimit,
): Promise<Response> {
  if (url.pathname === '/api/rooms') {
    if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
    if (!(await takeCreate(request, env, limit, now))) {
      return fail('rate_limited', 429, { 'retry-after': '60' })
    }
    return createRoom(request, env)
  }
  if (url.pathname === '/api/rooms/quick') {
    if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
    return quickJoin(request, env, limit, now, reads)
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

/** The JSON body (at most MAX_CREATE_BODY_CHARS), as an object; null when it is not JSON */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text()
  if (text.length > MAX_CREATE_BODY_CHARS) return null
  try {
    const body: unknown = JSON.parse(text)
    // Anything but an object asks for no game at all: `unknown_game`, as before
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return null
  }
}

/** A new room as asked, checked: what `openRoom` needs */
type RoomAsk = {
  gameId: string
  options: OptionValues | undefined
  isPublic: boolean
  password: string | null
  bots: QuickBots | null
  name: string | null
  seatBots: SeatBots | null
}

type GameModuleOf = NonNullable<ReturnType<typeof getGame>>

/** `body`'s room name and seated computer players, or the error to refuse it with */
function parseExtras(
  module: GameModuleOf,
  body: Record<string, unknown>,
): { name: string | null; seatBots: SeatBots | null } | { error: string } {
  // 2026-11-23: a room's name is shown to strangers: the nickname rules, refused when it breaks them
  const named = body.name !== undefined && body.name !== ''
  const name = named ? acceptableRoomName(body.name) : null
  if (named && name === null) return { error: 'bad_name' }
  const seatBots = body.seatBots === undefined ? null : parseSeatBots(module, body.seatBots)
  if (body.seatBots !== undefined && seatBots === null) return { error: 'bad_bots' }
  return { name, seatBots }
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  if (body === null) return fail('bad_request', 400)
  const { gameId, options, public: isPublic, password, bots: rawBots } = body
  const module = typeof gameId === 'string' ? getGame(gameId) : null
  if (typeof gameId !== 'string' || !module) return fail('unknown_game', 400)
  // The lobby's "Play the computer" (2026-11-21): computer players seated from the start, and the
  // game under way once its person joins. Refused, not dropped, when they do not fit the game
  const bots = rawBots === undefined ? null : parseQuickBots(module, rawBots)
  if (rawBots !== undefined && bots === null) return fail('bad_bots', 400)
  const extras = parseExtras(module, body)
  if ('error' in extras) return fail(extras.error, 400)
  // Paused by the owner (e12-t11, worker/flags.ts)
  if (!(await isGameEnabled(env.DB, gameId))) return fail('game_disabled', 403)
  // A password that is there but no good (too long, only spaces) is refused, not dropped silently
  if (password !== undefined && password !== '' && normalizePassword(password) === null) {
    return fail('bad_password', 400)
  }
  const opened = await openRoom(env, {
    gameId,
    options: plainOptions(options),
    // A room with computer players is one person's game: never listed for strangers
    isPublic: isPublic === true && bots === null,
    password: normalizePassword(password),
    bots,
    ...extras,
  })
  if (!opened) return fail('unavailable', 503)
  return Response.json(opened, { status: 201, headers: noStore })
}

/**
 * Opens the room asked for; null when no fresh id would take (not expected). `firstId`: the id to try
 * first (quick join's, held for it in the lobby)
 */
async function openRoom(
  env: Env,
  ask: RoomAsk,
  firstId?: string,
): Promise<CreateRoomResponse | null> {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const id = attempt === 0 && firstId !== undefined ? firstId : newRoomId()
    // The number first, so that the room can show it from the start. Should the id be taken (not
    // expected at ~59 bits), the number points at a room that is not there and is soon reused
    const code = await claimCode(env, id)
    // The room checks `options` against the game's schema: this only keeps them plain for the RPC
    const created = await roomStub(env, id).create(
      id,
      ask.gameId,
      ask.options,
      ask.isPublic,
      code,
      ask.password,
      ask.bots,
      ask.name,
      ask.seatBots,
    )
    if (created) return { id, code }
  }
  return null
}

/**
 * What a quick join opens when there is no room to join (2026-11-23): the kart's track of the week
 * (shared/kart/board.ts, the leaderboard's rotation) with items; another game's defaults
 */
export function quickOptions(gameId: string, now: number): OptionValues | undefined {
  return gameId === 'kart' ? { track: weeklyTrack(now), mode: 'items' } : undefined
}

/**
 * POST /api/rooms/quick (2026-11-23, docs/ARCHITECTURE.md §4.83): the best open public room of the
 * game (worker/lobby-list.ts quickRooms), checked with the room itself since the list may be a few
 * seconds old; else a new public room, which is a new room like any (the same limits)
 */
async function quickJoin(
  request: Request,
  env: Env,
  limit: FixedWindowLimit,
  now: number,
  reads: FixedWindowLimit,
): Promise<Response> {
  const body = await readBody(request)
  if (body === null) return fail('bad_request', 400)
  const { gameId } = body
  const module = typeof gameId === 'string' ? getGame(gameId) : null
  if (typeof gameId !== 'string' || !module) return fail('unknown_game', 400)
  const extras = parseExtras(module, body)
  if ('error' in extras) return fail(extras.error, 400)
  if (!(await isGameEnabled(env.DB, gameId))) return fail('game_disabled', 403)
  const address = clientAddress(request)
  if ((address === null || !isLoopback(address)) && !reads.take(await addressKey(address), now)) {
    return fail('rate_limited', 429, { 'retry-after': '60' })
  }
  const rooms = await readLobby(env.LOBBY as unknown as LobbyLister, now)
  const found = (id: string): Response =>
    Response.json({ id, created: false } satisfies QuickJoinResponse, { headers: noStore })
  for (const room of quickRooms(rooms, gameId).slice(0, QUICK_TRIES)) {
    if (quickOpen(await roomStub(env, room.id).summary(), gameId)) return found(room.id)
  }
  // 2026-11-23 (#163): none listed. Another quick join may be opening one this moment (the list is
  // a few seconds old): the lobby, one call at a time, holds the first new room for the game, and
  // whoever asks meanwhile is sent to it once it is there
  const lobby = lobbyStub(env)
  const id = newRoomId()
  const held = await claimQuick(lobby, gameId, id)
  if (held !== null) {
    if (await waitForQuickRoom(env, held, gameId)) return found(held)
    // Full or never opened: the next one asking opens one, starting with this one
    await releaseQuick(lobby, gameId, held)
    await claimQuick(lobby, gameId, id)
  }
  if (!(await takeCreate(request, env, limit, now))) {
    await releaseQuick(lobby, gameId, id)
    return fail('rate_limited', 429, { 'retry-after': '60' })
  }
  const opened = await openRoom(
    env,
    {
      gameId,
      options: quickOptions(gameId, now),
      isPublic: true,
      password: null,
      bots: null,
      ...extras,
    },
    id,
  )
  if (opened?.id !== id) await releaseQuick(lobby, gameId, id)
  if (!opened) return fail('unavailable', 503)
  const created: QuickJoinResponse = { ...opened, created: true }
  return Response.json(created, { status: 201, headers: noStore })
}

/** Whether a room's summary says quick join may send someone in: waiting, a free seat, no password */
function quickOpen(
  summary: Awaited<ReturnType<ReturnType<typeof roomStub>['summary']>>,
  gameId: string,
): boolean {
  return (
    summary?.status === 'waiting' &&
    summary.locked !== true &&
    summary.gameId === gameId &&
    summary.seated < summary.maxSeats
  )
}

/** The lobby's hold on quick join's new room for `gameId` (LobbyDO.claimQuick); null if unreachable */
async function claimQuick(
  lobby: ReturnType<typeof lobbyStub>,
  gameId: string,
  id: string,
): Promise<string | null> {
  try {
    return await lobby.claimQuick(gameId, id)
  } catch (error) {
    console.error('quick hold failed', error)
    return null
  }
}

async function releaseQuick(lobby: ReturnType<typeof lobbyStub>, gameId: string, id: string): Promise<void> {
  try {
    await lobby.releaseQuick(gameId, id)
  } catch (error) {
    console.error('quick release failed', error)
  }
}

/**
 * Whether room `id`, which another quick join is opening, is there and open within QUICK_WAIT_MS
 * (it may still be being made)
 */
async function waitForQuickRoom(env: Env, id: string, gameId: string): Promise<boolean> {
  const until = Date.now() + QUICK_WAIT_MS
  for (;;) {
    const summary = await roomStub(env, id).summary()
    if (summary !== null) return quickOpen(summary, gameId)
    if (Date.now() + QUICK_LOOK_MS > until) return false
    await new Promise((resolve) => setTimeout(resolve, QUICK_LOOK_MS))
  }
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
  // Sockets opened a minute by one address, anywhere on the site (e12-t06): each one wakes a room,
  // also one that is not there. Refused with a close the page explains, not a failed upgrade it
  // would keep retrying
  const address = clientAddress(request)
  const key = await addressKey(address)
  if ((address === null || !isLoopback(address)) && !(await takeSocket(env, key, url))) {
    return refuseSocket(CloseCode.tooManyConnections, 'too many connections')
  }
  // Who the session says this is (e1-t13): the room takes a signed-in person's name from here, not
  // from `join`. A Durable Object cannot be reached from outside, so this header only ever comes
  // from this line; whatever a browser sent under that name is dropped
  const headers = new Headers(request.headers)
  headers.delete(ACCOUNT_HEADER)
  // Same for the hashed address, which the room counts sockets by (MAX_CONNECTIONS_PER_ADDRESS)
  headers.set(ADDRESS_HEADER, key)
  const account = await sessionAccount(request, env)
  if (account) headers.set(ACCOUNT_HEADER, encodeAccountHeader(account))
  return roomStub(env, match[1]).fetch(new Request(request, { headers }))
}

/**
 * One take of the address's socket allowance; a page coming back after a drop (`?resume=1`) has a
 * further one of its own once that is spent (worker/rate-limit.ts SHARED_LIMITS.resume)
 */
async function takeSocket(env: Env, key: string, url: URL): Promise<boolean> {
  if (await takeShared(env.LIMITER, 'socket', key)) return true
  return url.searchParams.get('resume') === '1' && (await takeShared(env.LIMITER, 'resume', key))
}

/** An upgrade that is accepted only to be closed at once with `code`, which the page understands */
export function refuseSocket(code: number, reason: string): Response {
  const { 0: client, 1: server } = new WebSocketPair()
  server.accept()
  server.close(code, reason)
  return new Response(null, { status: 101, webSocket: client })
}
