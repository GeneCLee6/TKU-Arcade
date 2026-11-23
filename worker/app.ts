import type { HealthResponse } from '../shared/health.ts'
import { handleTelemetry } from './telemetry.ts'
import { handleStats } from './metrics.ts'
import { handleAdminFlags, handleFlags, disabledGames } from './flags.ts'
import { handleUsage } from './usage.ts'
import { handleVoice } from './voice.ts'
import type { LobbyResponse } from '../shared/protocol.ts'
import { handleAuth, isAuthPath } from './auth.ts'
import { handleClientError } from './errors.ts'
import { handleBoardAdmin, handleKartBoard } from './kartBoard.ts'
import {
  lobbyReadLimit,
  lobbyRooms,
  lobbyWatchLimit,
  readLobby,
  type LobbyLister,
} from './lobby-list.ts'
import { ADDRESS_HEADER, addressKey, clientAddress, isLoopback } from './address.ts'
import { CloseCode } from '../shared/protocol.ts'
import { getGame } from '../shared/games/index.ts'
import type { FixedWindowLimit } from './rate-limit.ts'
import type { LimiterDO } from './limiter.ts'
import type { LobbyDO } from './lobby.ts'
import { LOBBY_NAME } from './lobby-board.ts'
import type { RoomDO } from './room.ts'
import { handleRoomCode, handleRooms, handleRoomSocket, refuseSocket } from './rooms.ts'

export interface Env {
  /** The React app's static assets (wrangler `assets`) */
  ASSETS: Fetcher
  /** One object per room: members, seats, the running GameModule (ARCHITECTURE.md §3, A4) */
  ROOM: DurableObjectNamespace<RoomDO>
  /** One object for the whole deployment: the public room list (e1-t09, D1) */
  LOBBY: DurableObjectNamespace<LobbyDO>
  /** Production or staging database (prompts, results, ...; tables from e12-t05) */
  DB: D1Database
  /** glTF models, textures, sounds under content-hashed names (e12-t08) */
  ASSETS_BUCKET: R2Bucket
  /** Daily D1 backups (e12-t05); production only, previews have no backups */
  BACKUPS?: R2Bucket
  // Set at deploy time (wrangler deploy --var APP_VERSION:<commit>)
  APP_VERSION?: string
  /**
   * The optional club account (e1-t12, worker/auth.ts, DEPLOY.md §11): the secret shared with the
   * bridge table (a Worker secret, 32 characters or more) and the bridge table's address (a var).
   * Sign-in is off unless both are set
   */
  AUTH_SHARED_SECRET?: string
  AUTH_BRIDGE_URL?: string
  /**
   * The voice link (e1-t14, worker/voice.ts): LongTalk's address (a var) and, to reach it from this
   * Worker on the same workers.dev subdomain, a service binding to it. Off unless the address is set
   */
  LONGTALK_URL?: string
  LONGTALK?: Fetcher
  /** The owner's key to the daily metrics (e12-t07, worker/metrics.ts): a secret; no secret, no stats */
  STATS_KEY?: string
  /**
   * The cost dashboard (e12-t15, worker/usage.ts, DEPLOY.md §13): a Cloudflare API token with
   * Account Analytics read, and the account's id, both secrets. Without them it says "not set up"
   */
  CF_ANALYTICS_TOKEN?: string
  CF_ACCOUNT_ID?: string
  /** Which allowances the dashboard measures against: `free` (the default) or `paid` (a var) */
  COST_PLAN?: string
  /**
   * The abuse limits shared by every Worker instance (e12-t06, worker/limiter.ts, docs/SECURITY.md
   * §6), keyed by a hashed address (worker/address.ts): new rooms, WebSocket upgrades, and wrong
   * owner keys. Without it only the per-instance limits apply
   */
  LIMITER?: DurableObjectNamespace<LimiterDO>
  /** Optional: where a new 80% alert is also posted as JSON (a Discord or Slack webhook; a secret) */
  ALERT_WEBHOOK_URL?: string
}

const noStore = { 'cache-control': 'no-store' }

const notFound = () => Response.json({ error: 'not_found' }, { status: 404, headers: noStore })

/**
 * GET /api/lobby: the public rooms waiting for people; `?game=<id>` (2026-11-23, the kart's room
 * list): every listed room of that game, playing ones too (worker/lobby-list.ts). Limited per address
 * in memory only (a list polls; the shared limiter would cost a request of its own each time)
 */
export async function handleLobby(
  request: Request,
  env: Env,
  url: URL = new URL(request.url),
  limit: FixedWindowLimit = lobbyReadLimit,
  now: number = Date.now(),
): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: 'GET' } },
    )
  }
  const game = url.searchParams.get('game')
  if (game !== null && !getGame(game)) {
    return Response.json({ error: 'unknown_game' }, { status: 400, headers: noStore })
  }
  // Local development (the browser tests) polls from one machine
  const address = clientAddress(request)
  if ((address === null || !isLoopback(address)) && !limit.take(await addressKey(address), now)) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { ...noStore, 'retry-after': '60' } },
    )
  }
  const [rooms, paused] = await Promise.all([
    readLobby(env.LOBBY as unknown as LobbyLister, now),
    disabledGames(env.DB),
  ])
  // A paused game's rooms cannot start a game (e12-t11): nobody is invited to them
  const shown = rooms.filter((room) => !paused.has(room.gameId))
  const body: LobbyResponse = { rooms: lobbyRooms(shown, game) }
  return Response.json(body, { headers: noStore })
}

/**
 * /ws/lobby?game=<id> (2026-11-23, shared/lobby-feed.ts): the game's room list, pushed by the LobbyDO.
 * Same origin only, a game this site has, and LOBBY_WATCHES_PER_ADDRESS upgrades a minute per
 * address in this instance (memory only: a page opens one and keeps it, so a shared limiter's extra
 * request is not worth it). The LobbyDO caps how many are open at once (worker/lobby-feed.ts)
 */
export async function handleLobbySocket(
  request: Request,
  env: Env,
  url: URL,
  limit: FixedWindowLimit = lobbyWatchLimit,
  now: number = Date.now(),
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return Response.json({ error: 'expected_websocket' }, { status: 426, headers: noStore })
  }
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin) {
    return Response.json({ error: 'forbidden_origin' }, { status: 403, headers: noStore })
  }
  const game = url.searchParams.get('game')
  if (game === null || !getGame(game)) {
    return Response.json({ error: 'unknown_game' }, { status: 400, headers: noStore })
  }
  const address = clientAddress(request)
  const key = await addressKey(address)
  // Refused with the close the page falls back to polling on, not a failed upgrade it would retry
  if ((address === null || !isLoopback(address)) && !limit.take(key, now)) {
    return refuseSocket(CloseCode.tooManyConnections, 'too many connections')
  }
  const headers = new Headers(request.headers)
  headers.set(ADDRESS_HEADER, key)
  const lobby = env.LOBBY.get(env.LOBBY.idFromName(LOBBY_NAME))
  return lobby.fetch(new Request(request, { headers }))
}

// The Worker answers /api/* and /ws/* (wrangler `run_worker_first`) and hands everything else to
// the static assets (the React app; client routes fall back to index.html).
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/api/health') {
    const body: HealthResponse = { ok: true, version: env.APP_VERSION ?? 'local' }
    return Response.json(body, { headers: noStore })
  }
  if (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')) {
    return handleRooms(request, env, url)
  }
  if (url.pathname.startsWith('/api/codes/')) return handleRoomCode(request, env, url)
  if (url.pathname === '/api/lobby') return handleLobby(request, env, url)
  if (url.pathname === '/api/voice') return handleVoice(request, env)
  if (url.pathname === '/api/stats') return handleStats(request, env)
  if (url.pathname === '/api/flags') return handleFlags(request, env)
  if (url.pathname === '/api/admin/flags') return handleAdminFlags(request, env)
  if (url.pathname === '/api/admin/usage') return handleUsage(request, env)
  if (url.pathname === '/api/telemetry') return handleTelemetry(request, env, url)
  if (isAuthPath(url.pathname)) return handleAuth(request, env, url)
  if (url.pathname === '/api/errors') return handleClientError(request, env, url)
  if (url.pathname === '/api/kart/board' || url.pathname === '/api/kart/board/replay') {
    return handleKartBoard(request, env, url)
  }
  if (url.pathname === '/api/admin/kart-board') return handleBoardAdmin(request, env, url)
  if (url.pathname.startsWith('/api/')) return notFound()
  if (url.pathname === '/ws/lobby') return handleLobbySocket(request, env, url)
  if (url.pathname.startsWith('/ws/')) return handleRoomSocket(request, env, url)
  return env.ASSETS.fetch(request)
}
