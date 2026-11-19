// Daily metrics (e12-t07, AC-12.3): counts of rooms opened and games started and finished, per day
// and game, in D1 (migrations/0003_daily_metrics.sql). Counted by the room (worker/room.ts) without
// holding anything up: a count that fails is logged and lost. Read by GET /api/stats, which needs
// the STATS_KEY secret (DEPLOY.md §12); without that secret the endpoint is not there.
import type { DailyMetricRow, MetricName, StatsResponse } from '../shared/protocol.ts'
import type { Env } from './app.ts'
import { ownerRefusal } from './owner.ts'

/** The day a count goes to: Taiwan's, since that is where the tables are */
export function metricDay(now: number): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10)
}

export async function countMetric(
  db: D1Database,
  metric: MetricName,
  game: string,
  now: number,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO daily_metrics (day, metric, game, count) VALUES (?, ?, ?, 1)
         ON CONFLICT (day, metric, game) DO UPDATE SET count = count + 1`,
      )
      .bind(metricDay(now), metric, game)
      .run()
  } catch (error) {
    console.error('metric failed', metric, error)
  }
}

/** How many days GET /api/stats goes back */
export const STATS_DAYS = 30

const noStore = { 'cache-control': 'no-store' }

/** GET /api/stats with `Authorization: Bearer <STATS_KEY>`: the last STATS_DAYS days of counts */
export async function handleStats(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const refusal = ownerRefusal(request, env)
  if (refusal) return refusal
  const since = metricDay(now - (STATS_DAYS - 1) * 86_400_000)
  const { results } = await env.DB.prepare(
    'SELECT day, metric, game, count FROM daily_metrics WHERE day >= ? ORDER BY day DESC, metric, game',
  )
    .bind(since)
    .all<DailyMetricRow>()
  const body: StatsResponse = { since, rows: results }
  return Response.json(body, { headers: noStore })
}
