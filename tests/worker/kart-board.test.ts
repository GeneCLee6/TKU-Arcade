// 2026-11-23 (docs/ARCHITECTURE.md §4.81): the kart leaderboard's API (worker/kartBoard.ts) on a real
// SQLite with the deployed migrations. A real run, driven here without a screen, goes on the board;
// a nickname keeps only its best; the board ranks, finds a name's row past the top, and hands out
// the replay; and an upload is refused for a stale physics stamp, an old layout, a bad nickname, a
// tampered run, a file too big, too many in a minute, or another site's page.
import { beforeAll, describe, expect, it } from 'vitest'
import { BOARD_MAX_UPLOAD_BYTES, type BoardResponse, type BoardUploadResponse } from '../../shared/kart/board.ts'
import { createBoardRecorder } from '../../shared/kart/boardRun.ts'
import { physicsStamp } from '../../shared/kart/boardStamp.ts'
import { loadoutByte } from '../../shared/kart/karts.ts'
import { KART_TUNING, NO_INPUT, type KartInput } from '../../shared/kart/physics.ts'
import { createKartTape, decodeTape, type Replay } from '../../shared/kart/replay.ts'
import { readReplayFile, writeReplayFile } from '../../shared/kart/replayFile.ts'
import { nearestRoadPoint, startTrial, stepTrial, type Trial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Env } from '../../worker/app.ts'
import { handleRequest } from '../../worker/app.ts'
import { createBoardLimits, handleKartBoard } from '../../worker/kartBoard.ts'
import { migratedD1 } from './sqlite-d1.ts'

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** A careful driver (src/kart/race/autopilot.ts's, without its obstacles: riverside has none) */
function pilot(trial: Trial, track: Track, slow: boolean): KartInput {
  if (trial.phase !== 'racing') return NO_INPUT
  const { kart } = trial.run
  const target = track.road[(nearestRoadPoint(track.road, kart.x, kart.z) + 4) % track.road.length]!
  const turn = wrap(Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading)
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.3
  return {
    ...NO_INPUT,
    throttle: !(sharp && speed > 22) && !(slow && speed > 35),
    brake: sharp && speed > 32,
    steer: Math.max(-1, Math.min(1, turn * 3)),
  }
}

function drive(track: Track, slow = false): Replay {
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const recorder = createBoardRecorder(track.id, track.laps, loadoutByte('tide', 'heart'))
  let trial = startTrial(course)
  for (let step = 0; step < 60 * 60 * 10 && trial.phase !== 'finished'; step++) {
    const input = pilot(trial, track, slow)
    const before = trial.run.resets
    trial = stepTrial(trial, input, course, KART_TUNING)
    recorder.step(trial, input, trial.run.resets !== before)
  }
  const replay = recorder.finish(trial)
  if (!replay) throw new Error('no finish')
  return replay
}

const fileOf = (replay: Replay, track: Track) =>
  writeReplayFile(replay, { revision: track.revision ?? 1, names: [{ seat: 0, name: 'x' }], you: 0, savedAt: 1 })

function setup() {
  const { db, sqlite } = migratedD1()
  const env = { DB: db } as unknown as Env
  return { env, sqlite, limits: createBoardLimits() }
}

type Setup = ReturnType<typeof setup>

let address = 0
const upload = (
  { env, limits }: Setup,
  file: Uint8Array,
  params: Record<string, string | number> = {},
  headers: Record<string, string> = {},
) => {
  const track = raceTrack(String(params.track ?? 'riverside'))
  const query = new URLSearchParams({
    track: 'riverside',
    revision: String(track?.revision ?? 1),
    nick: 'Ann',
    physics: physicsStamp(),
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  })
  const request = new Request(`https://x/api/kart/board?${query}`, {
    method: 'POST',
    body: file as Uint8Array<ArrayBuffer>,
    headers: { 'cf-connecting-ip': `10.0.0.${++address % 250}`, ...headers },
  })
  return handleKartBoard(request, env, new URL(request.url), 1_000_000 + address, limits)
}

const board = async ({ env, limits }: Setup, query: string): Promise<BoardResponse> => {
  const request = new Request(`https://x/api/kart/board?${query}`)
  const response = await handleKartBoard(request, env, new URL(request.url), Date.UTC(2026, 10, 23), limits)
  expect(response.status).toBe(200)
  return response.json()
}

describe('the leaderboard', () => {
  let track: Track
  let fast: Uint8Array
  let slow: Uint8Array
  let fastMs: number
  let slowMs: number
  beforeAll(async () => {
    track = raceTrack('riverside')!
    const quick = drive(track)
    const careful = drive(track, true)
    fastMs = quick.racers[0]!.finishMs!
    slowMs = careful.racers[0]!.finishMs!
    expect(slowMs).toBeGreaterThan(fastMs)
    fast = await fileOf(quick, track)
    slow = await fileOf(careful, track)
  }, 60_000)

  it('takes a real run, ranks it, and hands its replay back', async () => {
    const one = setup()
    const response = await upload(one, slow)
    expect(response.status).toBe(200)
    const body: BoardUploadResponse = await response.json()
    expect(body).toMatchObject({ ok: true, improved: true, total: 1, entry: { rank: 1, nick: 'Ann', totalMs: slowMs } })

    const seen = await board(one, 'track=riverside&nick=ann')
    expect(seen).toMatchObject({ track: 'riverside', revision: track.revision ?? 1, total: 1 })
    expect(seen.entries).toHaveLength(1)
    expect(seen.entries[0]).toMatchObject({ rank: 1, nick: 'Ann', kart: 'tide', driver: 'heart', replay: true })
    // The nickname folded: ann finds Ann's row
    expect(seen.you?.id).toBe(seen.entries[0]!.id)
    expect(typeof seen.weekly).toBe('string')

    const request = new Request(`https://x/api/kart/board/replay?id=${seen.entries[0]!.id}`)
    const file = await handleRequest(request, one.env)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('application/x-tkureplay')
    const read = await readReplayFile(new Uint8Array(await file.arrayBuffer()))
    expect(read.ok && read.file.replay.racers[0]!.finishMs).toBe(slowMs)
  }, 30_000)

  it('keeps one row a nickname, its best', async () => {
    const one = setup()
    expect(await (await upload(one, slow)).json()).toMatchObject({ ok: true, improved: true })
    const better: BoardUploadResponse = await (await upload(one, fast, { nick: 'ANN' })).json()
    expect(better).toMatchObject({ ok: true, improved: true, entry: { totalMs: fastMs, nick: 'ANN' } })
    const worse: BoardUploadResponse = await (await upload(one, slow, { nick: 'ann' })).json()
    expect(worse).toMatchObject({ ok: true, improved: false, entry: { totalMs: fastMs, rank: 1 } })
    const seen = await board(one, 'track=riverside')
    expect(seen.total).toBe(1)
    expect(seen.entries.map((entry) => entry.totalMs)).toEqual([fastMs])
  }, 30_000)

  it('ranks the fastest first, the first set first on a tie, and finds a row past the top 100', async () => {
    const one = setup()
    const insert = one.sqlite.prepare(
      `INSERT INTO kart_board (track, revision, nick_key, nick, id, kart, driver, total_ms, best_lap_ms, lap_ms, physics, created_at, replay)
       VALUES (?, ?, ?, ?, ?, 'tide', 'spade', ?, 1, '[]', 'x', ?, NULL)`,
    )
    const revision = track.revision ?? 1
    for (let n = 0; n < 120; n++) {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
      insert.run('riverside', revision, `p${n}`, `P${n}`, id, 60_000 + n * 100, n)
    }
    // Another layout's and another track's rows are not on this board
    insert.run('riverside', revision + 1, 'old', 'Old', '00000000-0000-4000-8000-999999999998', 1, 1)
    insert.run('harbour', 1, 'h', 'H', '00000000-0000-4000-8000-999999999999', 1, 1)
    // A tie with P5, set later: behind it
    insert.run('riverside', revision, 'tie', 'Tie', '00000000-0000-4000-8000-999999999997', 60_500, 99_999)
    const seen = await board(one, 'track=riverside&nick=P110')
    expect(seen.total).toBe(121)
    expect(seen.entries).toHaveLength(100)
    expect(seen.entries[0]).toMatchObject({ rank: 1, nick: 'P0', replay: false })
    expect(seen.entries[5]!.nick).toBe('P5')
    expect(seen.entries[6]!.nick).toBe('Tie')
    expect(seen.you).toMatchObject({ nick: 'P110', rank: 112 })
    expect((await board(one, 'track=riverside&nick=nobody')).you).toBeNull()
  })

  it('refuses a stale physics stamp, an old layout, a bad nickname, a track without a board', async () => {
    const one = setup()
    const refused = async (params: Record<string, string | number>, status: number, error: string) => {
      const response = await upload(one, fast, params)
      expect(response.status, error).toBe(status)
      expect(await response.json()).toEqual({ ok: false, error })
    }
    await refused({ physics: '0-deadbeef' }, 409, 'physics')
    await refused({ revision: (track.revision ?? 1) - 1 }, 409, 'revision')
    await refused({ nick: 'admin' }, 400, 'nickname')
    await refused({ nick: '' }, 400, 'nickname')
    await refused({ track: 'ch-needle' }, 400, 'track')
    await refused({ track: 'custom:abc' }, 400, 'track')
    // A run on riverside sent as harbour's
    await refused({ track: 'harbour' }, 422, 'track')
    expect((await board(one, 'track=riverside')).total).toBe(0)
    // Each refusal is counted with its reason
    const counted = one.sqlite
      .prepare(`SELECT game, count FROM daily_metrics WHERE metric = 'board_upload' ORDER BY game`)
      .all()
    expect(counted.map((row) => row.game)).toEqual(['nickname', 'physics', 'revision', 'track'])
  })

  it('refuses a tampered run and anything that is not a replay file', async () => {
    const one = setup()
    const read = await readReplayFile(fast)
    if (!read.ok) throw new Error(read.problem)
    // Sped up: every sample moved a little further along each step than the kart could go
    const tape = createKartTape()
    decodeTape(read.file.replay.karts[0]!.bytes).forEach((sample, index) =>
      tape.add({ ...sample, seq: 0, vx: index === 120 ? 300 : sample.vx }),
    )
    const tampered = await fileOf({ ...read.file.replay, karts: [{ seat: 0, bytes: tape.bytes() }] }, track)
    expect(await (await upload(one, tampered)).json()).toEqual({ ok: false, error: 'speed' })
    expect(await (await upload(one, new TextEncoder().encode('not a replay'))).json()).toEqual({
      ok: false,
      error: 'file',
    })
    const big = await upload(one, new Uint8Array(BOARD_MAX_UPLOAD_BYTES + 1))
    expect(big.status).toBe(413)
    expect((await board(one, 'track=riverside')).total).toBe(0)
  })

  it('takes six uploads a minute from one address, and none from another site', async () => {
    const one = setup()
    const from = { 'cf-connecting-ip': '192.0.2.7' }
    const statuses: number[] = []
    for (let n = 0; n < 7; n++) statuses.push((await upload(one, slow, { nick: `Ann${n}` }, from)).status)
    expect(statuses.slice(0, 6).every((status) => status === 200)).toBe(true)
    expect(statuses[6]).toBe(429)
    const other = await upload(one, slow, {}, { origin: 'https://evil.example' })
    expect(other.status).toBe(403)
  }, 30_000)

  it('lets the owner take a row off, and nobody else', async () => {
    const one = setup()
    await upload(one, slow)
    const id = (await board(one, 'track=riverside')).entries[0]!.id
    const remove = (key?: string) =>
      handleRequest(
        new Request(`https://x/api/admin/kart-board?id=${id}`, {
          method: 'DELETE',
          headers: key ? { authorization: `Bearer ${key}` } : {},
        }),
        { ...one.env, STATS_KEY: 'owner-key-123' } as Env,
      )
    expect((await remove()).status).toBe(403)
    expect((await remove('nope')).status).toBe(403)
    const done = await remove('owner-key-123')
    expect(await done.json()).toEqual({ removed: 1 })
    expect((await board(one, 'track=riverside')).total).toBe(0)
  }, 30_000)

  it('answers only what it knows', async () => {
    const one = setup()
    const get = (path: string, init?: RequestInit) => handleRequest(new Request(`https://x${path}`, init), one.env)
    expect((await get('/api/kart/board?track=nowhere')).status).toBe(400)
    expect((await get('/api/kart/board/replay?id=nope')).status).toBe(404)
    expect((await get('/api/kart/board/replay?id=00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await get('/api/kart/board', { method: 'DELETE' })).status).toBe(405)
    expect((await get('/api/kart/board/replay', { method: 'POST' })).status).toBe(405)
  })
})
