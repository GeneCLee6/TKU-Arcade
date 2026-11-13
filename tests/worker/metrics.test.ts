// e12-t07: the daily metrics, with D1 as a stand-in
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker/app.ts'
import { countMetric, handleStats, metricDay } from '../../worker/metrics.ts'

function fakeDb(rows: unknown[] = []) {
  const calls: { sql: string; args: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, args })
        return { run: vi.fn(async () => ({})), all: vi.fn(async () => ({ results: rows })) }
      },
    }),
  }
  return { db: db as unknown as D1Database, calls }
}

const NOW = Date.parse('2026-11-13T20:00:00Z')

describe('daily metrics', () => {
  it('counts by Taiwan day, adding one', async () => {
    expect(metricDay(NOW)).toBe('2026-11-14')
    const { db, calls } = fakeDb()
    await countMetric(db, 'game_started', 'bluff', NOW)
    expect(calls[0].sql).toMatch(
      /ON CONFLICT \(day, metric, game\) DO UPDATE SET count = count \+ 1/,
    )
    expect(calls[0].args).toEqual(['2026-11-14', 'game_started', 'bluff'])
  })

  it('loses a count rather than throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      prepare: () => ({ bind: () => ({ run: async () => Promise.reject(new Error('down')) }) }),
    }
    await expect(
      countMetric(db as unknown as D1Database, 'room_created', 'spectrum', NOW),
    ).resolves.toBeUndefined()
  })

  it('is not there without STATS_KEY, refuses the wrong key, and answers the right one', async () => {
    const rows = [{ day: '2026-11-14', metric: 'room_created', game: 'bluff', count: 3 }]
    const { db, calls } = fakeDb(rows)
    const env = (key?: string) => ({ DB: db, STATS_KEY: key }) as unknown as Env
    const ask = (key?: string) =>
      new Request('https://x/api/stats', key ? { headers: { authorization: `Bearer ${key}` } } : {})
    expect((await handleStats(ask('k'), env(), NOW)).status).toBe(404)
    expect((await handleStats(ask(), env('secret-key'), NOW)).status).toBe(403)
    expect((await handleStats(ask('secret-kez'), env('secret-key'), NOW)).status).toBe(403)
    const res = await handleStats(ask('secret-key'), env('secret-key'), NOW)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ since: '2026-10-16', rows })
    expect(calls.at(-1)?.args).toEqual(['2026-10-16'])
  })
})
