// The kart time trial's site-wide leaderboard (2026-11-23, docs/ARCHITECTURE.md §4.81; shared/kart/
// board.ts). D1 keeps one row per nickname per board (migrations/0006_kart_board.sql) with the run's
// replay file; an upload is read strictly and judged sample by sample (shared/kart/boardCheck.ts)
// before anything is written, and a refusal is logged with its reason (docs/SECURITY.md §11).
//
//   GET  /api/kart/board?track=<id>[&nick=<name>]   the top 100, the week's track, the name's row
//   GET  /api/kart/board/replay?id=<row id>         a row's replay file (.tkureplay)
//   POST /api/kart/board?track=&revision=&nick=&physics=   a run's replay file as the body
//   DELETE /api/admin/kart-board?id=<row id>        the owner takes a row off (STATS_KEY, owner.ts)
import {
  BOARD_MAX_UPLOAD_BYTES,
  BOARD_TOP,
  BOARD_UPLOADS_PER_MINUTE,
  boardNickKey,
  isBoardTrack,
  weeklyTrack,
  type BoardEntry,
  type BoardRefusal,
  type BoardResponse,
  type BoardUploadResponse,
} from '../shared/kart/board.ts'
import { checkBoardRun } from '../shared/kart/boardCheck.ts'
import { physicsStamp } from '../shared/kart/boardStamp.ts'
import { isDriverId, isKartId } from '../shared/kart/karts.ts'
import { readReplayFile, REPLAY_FILE_EXTENSION, REPLAY_FILE_TYPE } from '../shared/kart/replayFile.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { acceptableName } from '../shared/nickname.ts'
import { addressKey, clientAddress } from './address.ts'
import type { Env } from './app.ts'
import { countMetric } from './metrics.ts'
import { ownerRefusal } from './owner.ts'
import { FixedWindowLimit, takeShared } from './rate-limit.ts'

const noStore = { 'cache-control': 'no-store' }

/** Per Worker instance, on top of the shared limit: uploads and replay downloads a minute */
export interface BoardLimits {
  readonly upload: FixedWindowLimit
  readonly replay: FixedWindowLimit
}

export const createBoardLimits = (): BoardLimits => ({
  upload: new FixedWindowLimit(BOARD_UPLOADS_PER_MINUTE, 120),
  replay: new FixedWindowLimit(60, 1200),
})

const instanceLimits = createBoardLimits()

const fail = (error: string, status: number, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...noStore, ...headers } })

const refusal = (error: BoardRefusal, status: number, headers: Record<string, string> = {}) => {
  const body: BoardUploadResponse = { ok: false, error }
  return Response.json(body, { status, headers: { ...noStore, ...headers } })
}

interface Row {
  id: string
  nick: string
  kart: string
  driver: string
  total_ms: number
  best_lap_ms: number
  created_at: number
  has_replay: number
}

const ROW_COLUMNS =
  'id, nick, kart, driver, total_ms, best_lap_ms, created_at, replay IS NOT NULL AS has_replay'

const entryOf = (row: Row, rank: number): BoardEntry => ({
  rank,
  id: row.id,
  nick: row.nick,
  kart: isKartId(row.kart) ? row.kart : 'tide',
  driver: isDriverId(row.driver) ? row.driver : 'spade',
  totalMs: Number(row.total_ms),
  bestLapMs: Number(row.best_lap_ms),
  at: Number(row.created_at),
  replay: Number(row.has_replay) === 1,
})

/** The row of `nickKey` on a board and its rank, or null */
async function rowOf(
  db: D1Database,
  track: string,
  revision: number,
  nickKey: string,
): Promise<{ entry: BoardEntry; total: number } | null> {
  const { results } = await db
    .prepare(
      `SELECT ${ROW_COLUMNS},
         (SELECT COUNT(*) FROM kart_board b WHERE b.track = a.track AND b.revision = a.revision
            AND (b.total_ms < a.total_ms OR (b.total_ms = a.total_ms AND b.created_at < a.created_at))) AS ahead,
         (SELECT COUNT(*) FROM kart_board c WHERE c.track = a.track AND c.revision = a.revision) AS total
       FROM kart_board a WHERE a.track = ? AND a.revision = ? AND a.nick_key = ?`,
    )
    .bind(track, revision, nickKey)
    .all<Row & { ahead: number; total: number }>()
  const row = results[0]
  return row ? { entry: entryOf(row, Number(row.ahead) + 1), total: Number(row.total) } : null
}

/** Bytes from what D1 gives back for a BLOB (an array of numbers, or a buffer, by runtime) */
function blobBytes(value: unknown): Uint8Array | null {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value as ArrayBuffer)
  if (Array.isArray(value)) return Uint8Array.from(value as number[])
  return null
}

/** The body, or null past `max` bytes: stops reading there, whatever the headers claim */
async function readBytes(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

async function handleBoard(env: Env, url: URL, now: number): Promise<Response> {
  const track = url.searchParams.get('track')
  if (!isBoardTrack(track)) return fail('bad_track', 400)
  const revision = raceTrack(track)?.revision ?? 1
  const { results } = await env.DB.prepare(
    `SELECT ${ROW_COLUMNS} FROM kart_board WHERE track = ? AND revision = ?
     ORDER BY total_ms, created_at LIMIT ?`,
  )
    .bind(track, revision, BOARD_TOP)
    .all<Row>()
  const counted = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM kart_board WHERE track = ? AND revision = ?',
  )
    .bind(track, revision)
    .all<{ total: number }>()
  const nick = acceptableName(url.searchParams.get('nick'))
  const you = nick ? await rowOf(env.DB, track, revision, boardNickKey(nick)) : null
  const body: BoardResponse = {
    track,
    revision,
    entries: results.map((row, index) => entryOf(row, index + 1)),
    total: Number(counted.results[0]?.total ?? 0),
    you: you?.entry ?? null,
    weekly: weeklyTrack(now),
  }
  return Response.json(body, { headers: noStore })
}

async function handleReplay(
  request: Request,
  env: Env,
  url: URL,
  now: number,
  limits: BoardLimits,
): Promise<Response> {
  const id = url.searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('not_found', 404)
  if (!limits.replay.take(await addressKey(clientAddress(request)), now)) {
    return fail('rate_limited', 429, { 'retry-after': '60' })
  }
  const { results } = await env.DB.prepare(
    'SELECT track, replay FROM kart_board WHERE id = ? AND replay IS NOT NULL',
  )
    .bind(id)
    .all<{ track: string; replay: unknown }>()
  const row = results[0]
  const bytes = row ? blobBytes(row.replay) : null
  if (!row || !bytes) return fail('not_found', 404)
  const name = `tku-kart-${row.track.replace(/[^a-z0-9-]/g, '')}-board${REPLAY_FILE_EXTENSION}`
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      'content-type': REPLAY_FILE_TYPE,
      'content-disposition': `attachment; filename="${name}"`,
      // A row's id changes with every new best: what is behind one never changes
      'cache-control': 'public, max-age=86400, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** A refusal, logged and counted with its reason (docs/SECURITY.md §11) */
async function refuseUpload(
  env: Env,
  why: BoardRefusal,
  status: number,
  now: number,
  detail: Record<string, unknown> = {},
): Promise<Response> {
  console.log(JSON.stringify({ event: 'kart_board_refused', why, ...detail }))
  if (why !== 'rateLimited') await countMetric(env.DB, 'board_upload', why, now)
  return refusal(why, status, why === 'rateLimited' ? { 'retry-after': '60' } : {})
}

async function handleUpload(
  request: Request,
  env: Env,
  url: URL,
  now: number,
  limits: BoardLimits,
): Promise<Response> {
  // Only this site's own pages: a browser on another site always says where it is
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin) return fail('forbidden_origin', 403)
  const address = await addressKey(clientAddress(request))
  if (!limits.upload.take(address, now) || !(await takeShared(env.LIMITER, 'board', address))) {
    return refuseUpload(env, 'rateLimited', 429, now)
  }
  const trackId = url.searchParams.get('track')
  if (!isBoardTrack(trackId)) return refuseUpload(env, 'track', 400, now)
  const track = raceTrack(trackId)!
  const revision = Number(url.searchParams.get('revision'))
  if (revision !== (track.revision ?? 1)) return refuseUpload(env, 'revision', 409, now, { track: trackId })
  if (url.searchParams.get('physics') !== physicsStamp()) {
    return refuseUpload(env, 'physics', 409, now, { track: trackId })
  }
  const nick = acceptableName(url.searchParams.get('nick'))
  if (!nick) return refuseUpload(env, 'nickname', 400, now, { track: trackId })
  const bytes = await readBytes(request, BOARD_MAX_UPLOAD_BYTES)
  if (!bytes) return refuseUpload(env, 'tooBig', 413, now, { track: trackId })
  const read = await readReplayFile(bytes)
  if (!read.ok) {
    return refuseUpload(env, read.problem === 'tooBig' ? 'tooBig' : 'file', 400, now, {
      track: trackId,
      problem: read.problem,
    })
  }
  const verdict = checkBoardRun(read.file, track, revision)
  if (!verdict.ok) {
    return refuseUpload(env, verdict.why, 422, now, { track: trackId, at: verdict.at ?? null })
  }
  const { run } = verdict
  const nickKey = boardNickKey(nick)
  const result = await env.DB.prepare(
    `INSERT INTO kart_board
       (track, revision, nick_key, nick, id, kart, driver, total_ms, best_lap_ms, lap_ms, physics, created_at, replay)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (track, revision, nick_key) DO UPDATE SET
       nick = excluded.nick, id = excluded.id, kart = excluded.kart, driver = excluded.driver,
       total_ms = excluded.total_ms, best_lap_ms = excluded.best_lap_ms, lap_ms = excluded.lap_ms,
       physics = excluded.physics, created_at = excluded.created_at, replay = excluded.replay
     WHERE excluded.total_ms < kart_board.total_ms`,
  )
    .bind(
      trackId,
      revision,
      nickKey,
      nick,
      crypto.randomUUID(),
      run.kart,
      run.driver,
      run.totalMs,
      run.bestLapMs,
      JSON.stringify(run.lapMs),
      physicsStamp(),
      now,
      bytes,
    )
    .run()
  const improved = Number(result.meta.changes ?? 0) > 0
  await countMetric(env.DB, 'board_upload', improved ? 'improved' : 'kept', now)
  const mine = await rowOf(env.DB, trackId, revision, nickKey)
  if (!mine) return fail('unavailable', 503)
  const body: BoardUploadResponse = { ok: true, improved, entry: mine.entry, total: mine.total }
  return Response.json(body, { headers: noStore })
}

/**
 * DELETE /api/admin/kart-board?id=<row id> (the owner, with STATS_KEY): a row taken off its board,
 * replay and all; the nickname can go on it again with a new run. For a run the checks let through
 * that the owner knows to be a cheat (docs/SECURITY.md §11)
 */
export async function handleBoardAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const refused = await ownerRefusal(request, env, ['DELETE'])
  if (refused) return refused
  const id = url.searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('bad_request', 400)
  const result = await env.DB.prepare('DELETE FROM kart_board WHERE id = ?').bind(id).run()
  const removed = Number(result.meta.changes ?? 0)
  console.log(JSON.stringify({ event: 'kart_board_removed', id, removed }))
  return Response.json({ removed }, { headers: noStore })
}

/** /api/kart/board and /api/kart/board/replay */
export async function handleKartBoard(
  request: Request,
  env: Env,
  url: URL,
  now = Date.now(),
  limits: BoardLimits = instanceLimits,
): Promise<Response> {
  const replay = url.pathname === '/api/kart/board/replay'
  if (!replay && url.pathname !== '/api/kart/board') return fail('not_found', 404)
  const allowed = replay ? ['GET'] : ['GET', 'POST']
  if (!allowed.includes(request.method)) {
    return fail('method_not_allowed', 405, { allow: allowed.join(', ') })
  }
  if (!env.DB) return refusal('unavailable', 503)
  try {
    if (replay) return await handleReplay(request, env, url, now, limits)
    if (request.method === 'GET') return await handleBoard(env, url, now)
    return await handleUpload(request, env, url, now, limits)
  } catch (error) {
    console.error('kart board failed', error)
    return refusal('unavailable', 503)
  }
}
