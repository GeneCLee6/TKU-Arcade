// The cost dashboard and its 80% alert (e12-t15, AC-12.4). Usage comes from Cloudflare's GraphQL
// Analytics API (https://developers.cloudflare.com/analytics/graphql-api/), with a read-only token
// the owner sets as a secret (DEPLOY.md §13); nothing here counts on its own. Without the token
// the dashboard says "not set up" and the daily check does nothing.
//
// The daily check (the cron in wrangler.jsonc, worker/index.ts) records every metric past
// ALERT_SHARE of the plan's allowance in D1 (migrations/0005_cost_alerts.sql), once per metric and
// period, and the dashboard shows those in red. Where else an alert goes is up to the owner: if
// ALERT_WEBHOOK_URL is set, each new alert is also posted there as JSON (a Discord or Slack
// webhook takes it as it is); email is not wired (docs/NEXT.md §2).
import {
  ALERT_SHARE,
  ALLOWANCES,
  USAGE_METRICS,
  type CostAlert,
  type CostPlan,
  type UsageLine,
  type UsageMetric,
  type UsageResponse,
} from '../shared/usage.ts'
import type { Env } from './app.ts'
import { ownerRefusal } from './owner.ts'

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

const noStore = { 'cache-control': 'no-store' }

/** How long the dashboard lists past alerts */
const ALERT_DAYS = 60

/** R2 operations that cost nothing; of the rest, these read (Class B), everything else writes (A) */
const R2_FREE = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload'])
const R2_CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
])

/** A Durable Object's duration is billed at 128 MB of memory: GB-s = seconds × 0.125 */
const DO_GB = 128 / 1024

type Fetcher = typeof fetch

export function costPlan(env: Env): CostPlan {
  return env.COST_PLAN === 'paid' ? 'paid' : 'free'
}

type Auth = { token: string; account: string }

function configured(env: Env): Auth | null {
  const token = env.CF_ANALYTICS_TOKEN?.trim()
  const account = env.CF_ACCOUNT_ID?.trim()
  return token && account ? { token, account } : null
}

/** UTC day and month of `now`, the day before, and the month's first day */
export function periods(now: number) {
  const today = new Date(now).toISOString().slice(0, 10)
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10)
  return { today, yesterday, month: today.slice(0, 7), monthStart: `${today.slice(0, 7)}-01` }
}

type Account = Record<string, unknown>

/**
 * One GraphQL query against the account. `variables` are GraphQL `Time` (names starting with `t`)
 * or `Date` (with `d`). Throws on any error, so that its metrics show as unknown
 */
async function query(
  auth: Auth,
  body: string,
  variables: Record<string, string>,
  fetcher: Fetcher,
): Promise<Account> {
  const declared = Object.keys(variables)
    .map((name) => `$${name}: ${name.startsWith('t') ? 'Time' : 'Date'}!`)
    .join(', ')
  const response = await fetcher(GRAPHQL, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query ($account: string!, ${declared}) { viewer { accounts(filter: { accountTag: $account }) { ${body} } } }`,
      variables: { account: auth.account, ...variables },
    }),
  })
  if (!response.ok) throw new Error(`graphql ${response.status}`)
  const json = (await response.json()) as {
    data?: { viewer?: { accounts?: Account[] } } | null
    errors?: { message?: string }[] | null
  }
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join('; '))
  const account = json.data?.viewer?.accounts?.[0]
  if (!account) throw new Error('graphql: no such account')
  return account
}

type Group = {
  sum?: Record<string, number>
  max?: Record<string, number>
  dimensions?: Record<string, string>
}

const groups = (account: Account, alias: string) => (account[alias] as Group[] | undefined) ?? []
const total = (list: Group[], pick: (group: Group) => number | undefined) =>
  list.reduce((sum, group) => sum + (pick(group) ?? 0), 0)

// Each alias is one window. Without dimensions each answers a single group: the window's total
const workersWindow = (alias: string, from: string, to: string) =>
  `${alias}: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: ${from}, datetime_lt: ${to} }) { sum { requests } }`
const dateWindow = (alias: string, dataset: string, from: string, to: string, fields: string) =>
  `${alias}: ${dataset}(limit: 1, filter: { date_geq: ${from}, date_leq: ${to} }) { sum { ${fields} } }`
/** Yesterday (y), today so far (t) and the month so far (m) of one date-filtered dataset */
const dateWindows = (dataset: string, fields: string) =>
  [
    dateWindow('y', dataset, '$dYesterday', '$dYesterday', fields),
    dateWindow('t', dataset, '$dToday', '$dToday', fields),
    dateWindow('m', dataset, '$dMonth', '$dToday', fields),
  ].join(' ')

/**
 * Every metric of USAGE_METRICS; null without the token. Each dataset is its own query, so that one
 * Cloudflare cannot answer (a dataset renamed, a permission missing) leaves the others standing
 */
export async function readUsage(
  env: Env,
  now: number,
  fetcher: Fetcher = fetch,
): Promise<UsageLine[] | null> {
  const auth = configured(env)
  if (!auth) return null
  const plan = ALLOWANCES[costPlan(env)]
  const p = periods(now)
  const dayStart = (day: string) => `${day}T00:00:00Z`
  const times = {
    tYesterday: dayStart(p.yesterday),
    tToday: dayStart(p.today),
    tMonth: dayStart(p.monthStart),
    tNow: new Date(now).toISOString(),
  }
  const dates = { dYesterday: p.yesterday, dToday: p.today, dMonth: p.monthStart }
  const found = new Map<UsageMetric, { used: number; period: string }>()
  /** A daily allowance: the busier of yesterday and today so far; a monthly one: the month so far */
  const record = (metric: UsageMetric, yesterday: number, today: number, month: number) => {
    if (plan[metric].window !== 'day') found.set(metric, { used: month, period: p.month })
    else if (yesterday > today) found.set(metric, { used: yesterday, period: p.yesterday })
    else found.set(metric, { used: today, period: p.today })
  }
  const run = async (
    body: string,
    variables: Record<string, string>,
    read: (account: Account) => void,
  ) => {
    try {
      read(await query(auth, body, variables, fetcher))
    } catch (error) {
      console.error('usage query failed', error instanceof Error ? error.message : error)
    }
  }
  const windows = (account: Account, field: string, scale = 1) =>
    (['y', 't', 'm'] as const).map((alias) => total(groups(account, alias), (g) => g.sum?.[field]) * scale)

  await Promise.all([
    run(
      [
        workersWindow('y', '$tYesterday', '$tToday'),
        workersWindow('t', '$tToday', '$tNow'),
        workersWindow('m', '$tMonth', '$tNow'),
      ].join(' '),
      times,
      (account) => {
        const [y, t, m] = windows(account, 'requests')
        record('workers_requests', y, t, m)
      },
    ),
    run(dateWindows('durableObjectsInvocationsAdaptiveGroups', 'requests'), dates, (account) => {
      const [y, t, m] = windows(account, 'requests')
      record('do_requests', y, t, m)
    }),
    run(dateWindows('durableObjectsPeriodicGroups', 'activeTime'), dates, (account) => {
      // activeTime is in microseconds
      const [y, t, m] = windows(account, 'activeTime', DO_GB / 1_000_000)
      record('do_duration_gbs', y, t, m)
    }),
    run(
      `${dateWindows('d1AnalyticsAdaptiveGroups', 'rowsRead rowsWritten')} s: d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $dYesterday, date_leq: $dToday }) { max { databaseSizeBytes } dimensions { databaseId } }`,
      dates,
      (account) => {
        const [ry, rt, rm] = windows(account, 'rowsRead')
        record('d1_rows_read', ry, rt, rm)
        const [wy, wt, wm] = windows(account, 'rowsWritten')
        record('d1_rows_written', wy, wt, wm)
        const used = total(groups(account, 's'), (g) => g.max?.databaseSizeBytes)
        found.set('d1_storage_bytes', { used, period: 'now' })
      },
    ),
    run(
      [
        `o: r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $tMonth, datetime_lt: $tNow }) { sum { requests } dimensions { actionType } }`,
        `s: r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $tYesterday, datetime_lt: $tNow }) { max { payloadSize metadataSize } dimensions { bucketName } }`,
      ].join(' '),
      { tMonth: times.tMonth, tNow: times.tNow, tYesterday: times.tYesterday },
      (account) => {
        let classA = 0
        let classB = 0
        for (const group of groups(account, 'o')) {
          const action = group.dimensions?.actionType ?? ''
          const requests = group.sum?.requests ?? 0
          if (R2_FREE.has(action)) continue
          if (R2_CLASS_B.has(action)) classB += requests
          else classA += requests
        }
        found.set('r2_class_a', { used: classA, period: p.month })
        found.set('r2_class_b', { used: classB, period: p.month })
        const stored = total(
          groups(account, 's'),
          (g) => (g.max?.payloadSize ?? 0) + (g.max?.metadataSize ?? 0),
        )
        found.set('r2_storage_bytes', { used: stored, period: 'now' })
      },
    ),
  ])

  return USAGE_METRICS.map((metric) => {
    const { window, allowance } = plan[metric]
    const value = found.get(metric)
    const period = window === 'stored' ? 'now' : window === 'month' ? p.month : p.today
    return { metric, window, period: value?.period ?? period, used: value?.used ?? null, allowance }
  })
}

/** The lines at or past ALERT_SHARE of their allowance */
export function overShare(lines: readonly UsageLine[]): UsageLine[] {
  return lines.filter((line) => line.used !== null && line.used >= line.allowance * ALERT_SHARE)
}

type AlertRow = {
  period: string
  metric: UsageMetric
  used: number
  allowance: number
  created_at: number
}

async function recentAlerts(db: D1Database, now: number): Promise<CostAlert[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT period, metric, used, allowance, created_at FROM cost_alerts
         WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(now - ALERT_DAYS * 86_400_000)
      .all<AlertRow>()
    return results.map((row) => ({
      period: row.period,
      metric: row.metric,
      used: row.used,
      allowance: row.allowance,
      createdAt: row.created_at,
    }))
  } catch (error) {
    console.error('cost alerts unreadable', error)
    return []
  }
}

/**
 * The daily check: the metrics past ALERT_SHARE, recorded once per metric and period and, when
 * ALERT_WEBHOOK_URL is set, posted there. Answers the alerts that were new
 */
export async function checkUsage(
  env: Env,
  now: number = Date.now(),
  fetcher: Fetcher = fetch,
): Promise<CostAlert[]> {
  const lines = await readUsage(env, now, fetcher)
  if (!lines) return []
  const fresh: CostAlert[] = []
  for (const line of overShare(lines)) {
    const alert: CostAlert = {
      // What is stored has no period of its own: alerted once a month while it stays high
      period: line.window === 'stored' ? periods(now).month : line.period,
      metric: line.metric,
      used: line.used ?? 0,
      allowance: line.allowance,
      createdAt: now,
    }
    const result = await env.DB.prepare(
      `INSERT INTO cost_alerts (period, metric, used, allowance, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (period, metric) DO NOTHING`,
    )
      .bind(alert.period, alert.metric, alert.used, alert.allowance, alert.createdAt)
      .run()
    if ((result.meta?.changes ?? 0) > 0) fresh.push(alert)
  }
  for (const alert of fresh) console.warn(JSON.stringify({ event: 'cost_alert', ...alert }))
  const hook = env.ALERT_WEBHOOK_URL?.trim()
  if (fresh.length > 0 && hook) {
    const text = fresh
      .map((alert) => {
        const share = Math.round((alert.used / alert.allowance) * 100)
        return `${alert.metric} ${alert.period}: ${share}% of ${alert.allowance}`
      })
      .join('\n')
    try {
      // `content` for Discord, `text` for Slack, `alerts` for anything else
      const response = await fetcher(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: `TKU Arcade usage past 80%:\n${text}`, text, alerts: fresh }),
      })
      if (!response.ok) console.error('alert webhook answered', response.status)
    } catch (error) {
      console.error('alert webhook failed', error)
    }
  }
  return fresh
}

/** GET /api/admin/usage (owner): this moment's usage, and the alerts of the last ALERT_DAYS days */
export async function handleUsage(
  request: Request,
  env: Env,
  now: number = Date.now(),
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const refusal = ownerRefusal(request, env)
  if (refusal) return refusal
  const [lines, alerts] = await Promise.all([
    readUsage(env, now, fetcher),
    recentAlerts(env.DB, now),
  ])
  const body: UsageResponse = {
    configured: lines !== null,
    plan: costPlan(env),
    lines: lines ?? [],
    alerts,
  }
  return Response.json(body, { headers: noStore })
}
