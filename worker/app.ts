import type { HealthResponse } from '../shared/health.ts'
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
}

const noStore = { 'cache-control': 'no-store' }

const notFound = () => Response.json({ error: 'not_found' }, { status: 404, headers: noStore })

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
  if (url.pathname.startsWith('/api/')) return notFound()
  if (url.pathname.startsWith('/ws/')) return handleRoomSocket(request, env, url)
  return env.ASSETS.fetch(request)
}
