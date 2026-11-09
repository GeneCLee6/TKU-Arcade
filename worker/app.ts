import type { HealthResponse } from '../shared/health.ts'
import type { LobbyResponse } from '../shared/protocol.ts'
import { handleAuth, isAuthPath } from './auth.ts'
import { handleClientError } from './errors.ts'
import { LOBBY_NAME } from './lobby-board.ts'
import type { LobbyDO } from './lobby.ts'
import type { RoomDO } from './room.ts'
import { handleRooms, handleRoomSocket } from './rooms.ts'

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
}

const noStore = { 'cache-control': 'no-store' }

const notFound = () => Response.json({ error: 'not_found' }, { status: 404, headers: noStore })

/** GET /api/lobby: the public rooms waiting for people */
async function handleLobby(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: 'GET' } },
    )
  }
  const rooms = await env.LOBBY.get(env.LOBBY.idFromName(LOBBY_NAME)).list()
  const body: LobbyResponse = { rooms }
  return Response.json(body, { headers: noStore })
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
  if (url.pathname === '/api/lobby') return handleLobby(request, env)
  if (isAuthPath(url.pathname)) return handleAuth(request, env, url)
  if (url.pathname === '/api/errors') return handleClientError(request, env, url)
  if (url.pathname.startsWith('/api/')) return notFound()
  if (url.pathname.startsWith('/ws/')) return handleRoomSocket(request, env, url)
  return env.ASSETS.fetch(request)
}
