import { DurableObject } from 'cloudflare:workers'
import type { Env } from './app.ts'
import { FixedWindowLimit } from './rate-limit.ts'

/**
 * The abuse limits shared by every Worker instance, everywhere (e12-t06, docs/SECURITY.md §6): a
 * fixed window per hashed address, in memory only. Nothing is stored: an eviction forgets the
 * counts, which only ever lets someone go sooner. Sharded by the first character of the hash
 * (worker/rate-limit.ts `takeShared`), so that no one object takes every request.
 */
export class LimiterDO extends DurableObject<Env> {
  private readonly windows = new Map<string, FixedWindowLimit>()

  /** One take of `bucket` for `key`, at most `limit` a minute; false when over */
  take(bucket: string, key: string, limit: number): boolean {
    let window = this.windows.get(bucket)
    if (!window) {
      window = new FixedWindowLimit(limit, Number.POSITIVE_INFINITY)
      this.windows.set(bucket, window)
    }
    return window.take(key, Date.now())
  }
}
