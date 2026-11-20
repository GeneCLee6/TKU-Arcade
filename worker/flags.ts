// Per-game feature flags (e12-t11, AC-12.7). The owner pauses a game from /stats; the flag lives in
// D1 (migrations/0004_game_flags.sql), so it changes without a deploy. What a paused game means:
// - the lobby still shows its card, marked paused, and its New room button is off; its public
//   rooms are not listed
// - POST /api/rooms refuses it (403 `game_disabled`)
// - a room already open keeps going: a game being played goes on to its end, but no new one starts
//   (`start` and `rematch` are refused with `game_disabled`), and the host can switch the room to
//   another game (`set_game` to the paused one is refused)
// A table that cannot be read leaves every game open: a flag only ever closes, and an outage of
// the flags must not close the site.
import { GAME_IDS, getGame } from '../shared/games/index.ts'
import type { AdminFlagsResponse, FlagsResponse } from '../shared/protocol.ts'
import type { Env } from './app.ts'
import { ownerRefusal } from './owner.ts'

const noStore = { 'cache-control': 'no-store' }

const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: noStore })

/** The paused games' ids; empty when the table cannot be read */
export async function disabledGames(db: D1Database): Promise<Set<string>> {
  try {
    const { results } = await db
      .prepare('SELECT game FROM game_flags WHERE enabled = 0')
      .all<{ game: string }>()
    return new Set(results.map((row) => row.game))
  } catch (error) {
    console.error('flags unreadable', error)
    return new Set()
  }
}

/** Whether a new room or game of `gameId` may start */
export async function isGameEnabled(db: D1Database, gameId: string): Promise<boolean> {
  return !(await disabledGames(db)).has(gameId)
}

/** GET /api/flags: the paused games, for the lobby's cards */
export async function handleFlags(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return fail('method_not_allowed', 405)
  const body: FlagsResponse = { disabled: [...(await disabledGames(env.DB))].sort() }
  return Response.json(body, { headers: noStore })
}

/** GET /api/admin/flags lists every game; PUT with `{ game, enabled }` opens or pauses one */
export async function handleAdminFlags(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<Response> {
  const refusal = await ownerRefusal(request, env, ['GET', 'PUT'])
  if (refusal) return refusal
  if (request.method === 'PUT') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('bad_request', 400)
    }
    const { game, enabled } = (typeof body === 'object' && body !== null ? body : {}) as {
      game?: unknown
      enabled?: unknown
    }
    if (typeof game !== 'string' || !getGame(game)) return fail('unknown_game', 400)
    if (typeof enabled !== 'boolean') return fail('bad_request', 400)
    await env.DB.prepare(
      `INSERT INTO game_flags (game, enabled, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (game) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
      .bind(game, enabled ? 1 : 0, now)
      .run()
  }
  const { results } = await env.DB.prepare('SELECT game, enabled, updated_at FROM game_flags').all<{
    game: string
    enabled: number
    updated_at: number
  }>()
  const rows = new Map(results.map((row) => [row.game, row]))
  const body: AdminFlagsResponse = {
    games: GAME_IDS.map((id) => {
      const row = rows.get(id)
      return { id, enabled: row?.enabled !== 0, updatedAt: row?.updated_at ?? null }
    }),
  }
  return Response.json(body, { headers: noStore })
}
