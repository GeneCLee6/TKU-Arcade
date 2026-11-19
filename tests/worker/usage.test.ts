// e12-t15 (AC-12.4): the cost dashboard and the daily 80% check, with Cloudflare's GraphQL API as a
// stand-in and the alerts in a real SQLite with the deployed migrations.
import { describe, expect, it, vi } from 'vitest'
import type { UsageResponse } from '../../shared/usage.ts'
import type { Env } from '../../worker/app.ts'
import { checkUsage, handleUsage, periods, readUsage } from '../../worker/usage.ts'
import { migratedD1 } from './sqlite-d1.ts'

const NOW = Date.parse('2026-11-19T19:00:00Z')
const KEY = 'owner-key-123'

type Answer = Record<string, unknown>

/** Answers each query by its dataset; `broken` datasets answer a GraphQL error */
function graphql(broken: readonly string[] = []) {
  const queries: { query: string; variables: Record<string, string> }[] = []
  const hook: unknown[] = []
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) !== 'https://api.cloudflare.com/client/v4/graphql') {
      hook.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 204 })
    }
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token')
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> }
    queries.push(body)
    const { query } = body
    if (broken.some((dataset) => query.includes(dataset))) {
      return Response.json({ data: null, errors: [{ message: 'unknown field' }] })
    }
    const sum = (fields: Record<string, number>) => [{ sum: fields }]
    let account: Answer = {}
    if (query.includes('workersInvocationsAdaptive')) {
      account = { y: sum({ requests: 90_000 }), t: sum({ requests: 10_000 }), m: sum({ requests: 1e6 }) }
    } else if (query.includes('durableObjectsInvocationsAdaptiveGroups')) {
      account = { y: sum({ requests: 100 }), t: sum({ requests: 300 }), m: sum({ requests: 5_000 }) }
    } else if (query.includes('durableObjectsPeriodicGroups')) {
      // 1000 s active: 125 GB-s
      account = { y: [], t: sum({ activeTime: 1e9 }), m: sum({ activeTime: 2e9 }) }
    } else if (query.includes('d1AnalyticsAdaptiveGroups')) {
      account = {
        y: sum({ rowsRead: 10, rowsWritten: 85_000 }),
        t: sum({ rowsRead: 20, rowsWritten: 1 }),
        m: sum({ rowsRead: 30, rowsWritten: 85_001 }),
        s: [
          { max: { databaseSizeBytes: 1e6 }, dimensions: { databaseId: 'a' } },
          { max: { databaseSizeBytes: 2e6 }, dimensions: { databaseId: 'b' } },
        ],
      }
    } else if (query.includes('r2OperationsAdaptiveGroups')) {
      account = {
        o: [
          { sum: { requests: 7 }, dimensions: { actionType: 'PutObject' } },
          { sum: { requests: 50 }, dimensions: { actionType: 'GetObject' } },
          { sum: { requests: 3 }, dimensions: { actionType: 'DeleteObject' } },
        ],
        s: [{ max: { payloadSize: 9e9, metadataSize: 1e6 }, dimensions: { bucketName: 'x' } }],
      }
    }
    return Response.json({ data: { viewer: { accounts: [account] } } })
  })
  return { fetcher: fetcher as unknown as typeof fetch, queries, hook }
}

function env(extra: Partial<Env> = {}): Env {
  return {
    DB: migratedD1().db,
    STATS_KEY: KEY,
    CF_ANALYTICS_TOKEN: 'token',
    CF_ACCOUNT_ID: 'account',
    ...extra,
  } as unknown as Env
}

const ask = () =>
  new Request('https://x/api/admin/usage', { headers: { authorization: `Bearer ${KEY}` } })

describe('the cost dashboard', () => {
  it('counts UTC days and months', () => {
    expect(periods(NOW)).toEqual({
      today: '2026-11-19',
      yesterday: '2026-11-18',
      month: '2026-11',
      monthStart: '2026-11-01',
    })
  })

  it('says "not set up" without the token, and asks Cloudflare nothing', async () => {
    const { fetcher } = graphql()
    const res = await handleUsage(ask(), env({ CF_ANALYTICS_TOKEN: undefined }), NOW, fetcher)
    expect(await res.json()).toEqual({ configured: false, plan: 'free', lines: [], alerts: [] })
    expect(fetcher).not.toHaveBeenCalled()
    expect(await checkUsage(env({ CF_ACCOUNT_ID: ' ' }), NOW, fetcher)).toEqual([])
  })

  it('is the owner’s only', async () => {
    const { fetcher } = graphql()
    expect((await handleUsage(new Request('https://x/api/admin/usage'), env(), NOW, fetcher)).status).toBe(403)
    expect((await handleUsage(ask(), env({ STATS_KEY: undefined }), NOW, fetcher)).status).toBe(404)
  })

  it('measures each allowance over its own window, the account as a whole', async () => {
    const { fetcher, queries } = graphql()
    const lines = await readUsage(env(), NOW, fetcher)
    const used = Object.fromEntries((lines ?? []).map((line) => [line.metric, [line.used, line.period]]))
    expect(used).toEqual({
      // Free plan: daily, the busier of yesterday and today
      workers_requests: [90_000, '2026-11-18'],
      do_requests: [300, '2026-11-19'],
      do_duration_gbs: [125, '2026-11-19'],
      d1_rows_read: [20, '2026-11-19'],
      d1_rows_written: [85_000, '2026-11-18'],
      d1_storage_bytes: [3e6, 'now'],
      r2_storage_bytes: [9.001e9, 'now'],
      // Delete is free, Get is Class B, Put is Class A
      r2_class_a: [7, '2026-11'],
      r2_class_b: [50, '2026-11'],
    })
    expect(queries).toHaveLength(5)
    expect(queries.every((query) => query.variables.account === 'account')).toBe(true)
  })

  it('measures the paid plan by the month', async () => {
    const { fetcher } = graphql()
    const lines = await readUsage(env({ COST_PLAN: 'paid' }), NOW, fetcher)
    expect(lines?.find((line) => line.metric === 'workers_requests')).toEqual({
      metric: 'workers_requests',
      window: 'month',
      period: '2026-11',
      used: 1e6,
      allowance: 10_000_000,
    })
  })

  it('leaves a metric unknown when its dataset does not answer, and the others standing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetcher } = graphql(['durableObjectsPeriodicGroups'])
    const lines = (await readUsage(env(), NOW, fetcher)) ?? []
    expect(lines.find((line) => line.metric === 'do_duration_gbs')?.used).toBeNull()
    expect(lines.find((line) => line.metric === 'do_requests')?.used).toBe(300)
  })
})

describe('the daily 80% check', () => {
  it('records each metric past 80% once, posts it to the webhook, and the dashboard shows it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = env({ ALERT_WEBHOOK_URL: 'https://hooks.example/alert' })
    const { fetcher, hook } = graphql()
    const fresh = await checkUsage(site, NOW, fetcher)
    // 90% of the Workers requests, 85% of D1's writes, 90% of R2's storage
    expect(fresh.map((alert) => [alert.metric, alert.period])).toEqual([
      ['workers_requests', '2026-11-18'],
      ['d1_rows_written', '2026-11-18'],
      ['r2_storage_bytes', '2026-11'],
    ])
    expect(hook).toHaveLength(1)
    expect(hook[0]).toMatchObject({ alerts: fresh })
    expect((hook[0] as { content: string }).content).toContain('workers_requests 2026-11-18: 90%')

    // The next day's run raises nothing new for the same periods
    expect(await checkUsage(site, NOW + 1000, fetcher)).toEqual([])
    expect(hook).toHaveLength(1)

    const body = (await (await handleUsage(ask(), site, NOW, fetcher)).json()) as UsageResponse
    expect(body.configured).toBe(true)
    expect(body.alerts.map((alert) => alert.metric).sort()).toEqual(
      ['d1_rows_written', 'r2_storage_bytes', 'workers_requests'],
    )
  })

  it('records the alert without a webhook', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetcher, hook } = graphql()
    expect(await checkUsage(env(), NOW, fetcher)).toHaveLength(3)
    expect(hook).toEqual([])
  })
})
