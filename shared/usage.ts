// The cost dashboard's contract (e12-t15, AC-12.4; worker/usage.ts): how much of the Cloudflare
// plan's allowance the account has used, from Cloudflare's GraphQL Analytics API. Account-wide on
// purpose: the free plan's allowances are the account's, shared with every other Worker on it
// (the previews, the bridge table, LongTalk).

export type UsageMetric =
  | 'workers_requests'
  | 'do_requests'
  | 'do_duration_gbs'
  | 'd1_rows_read'
  | 'd1_rows_written'
  | 'd1_storage_bytes'
  | 'r2_storage_bytes'
  | 'r2_class_a'
  | 'r2_class_b'

/** `day` and `month` are UTC, as Cloudflare counts them; `stored` is what is held right now */
export type UsageWindow = 'day' | 'month' | 'stored'

export type CostPlan = 'free' | 'paid'

export const USAGE_METRICS: readonly UsageMetric[] = [
  'workers_requests',
  'do_requests',
  'do_duration_gbs',
  'd1_rows_read',
  'd1_rows_written',
  'd1_storage_bytes',
  'r2_storage_bytes',
  'r2_class_a',
  'r2_class_b',
]

const GB = 1_000_000_000

/**
 * What each plan includes (Cloudflare's pricing pages, 2026-11). The paid plan's are the amounts
 * included in its $5 a month, past which it bills; the free plan stops (or errors) instead
 */
export const ALLOWANCES: Record<CostPlan, Record<UsageMetric, { window: UsageWindow; allowance: number }>> = {
  free: {
    workers_requests: { window: 'day', allowance: 100_000 },
    do_requests: { window: 'day', allowance: 100_000 },
    do_duration_gbs: { window: 'day', allowance: 13_000 },
    d1_rows_read: { window: 'day', allowance: 5_000_000 },
    d1_rows_written: { window: 'day', allowance: 100_000 },
    d1_storage_bytes: { window: 'stored', allowance: 5 * GB },
    r2_storage_bytes: { window: 'stored', allowance: 10 * GB },
    r2_class_a: { window: 'month', allowance: 1_000_000 },
    r2_class_b: { window: 'month', allowance: 10_000_000 },
  },
  paid: {
    workers_requests: { window: 'month', allowance: 10_000_000 },
    do_requests: { window: 'month', allowance: 1_000_000 },
    do_duration_gbs: { window: 'month', allowance: 400_000 },
    d1_rows_read: { window: 'month', allowance: 25_000_000_000 },
    d1_rows_written: { window: 'month', allowance: 50_000_000 },
    d1_storage_bytes: { window: 'stored', allowance: 5 * GB },
    r2_storage_bytes: { window: 'stored', allowance: 10 * GB },
    r2_class_a: { window: 'month', allowance: 1_000_000 },
    r2_class_b: { window: 'month', allowance: 10_000_000 },
  },
}

/** The share of an allowance past which the daily check raises an alert */
export const ALERT_SHARE = 0.8

/**
 * One metric: `period` is the UTC day (YYYY-MM-DD) or month (YYYY-MM) it was counted over, or
 * `now`; for a daily allowance, the busier of yesterday and today so far. `used` is null when
 * Cloudflare did not answer for it
 */
export type UsageLine = {
  metric: UsageMetric
  window: UsageWindow
  period: string
  used: number | null
  allowance: number
}

/** A metric that crossed ALERT_SHARE, as the daily check recorded it (migrations/0005) */
export type CostAlert = {
  period: string
  metric: UsageMetric
  used: number
  allowance: number
  createdAt: number
}

/**
 * GET /api/admin/usage (owner). `configured`: whether the Worker has the API token and account id
 * (DEPLOY.md §13); without them `lines` is empty and the page says so
 */
export type UsageResponse = {
  configured: boolean
  plan: CostPlan
  lines: UsageLine[]
  alerts: CostAlert[]
}
