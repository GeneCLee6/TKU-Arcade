/** Addresses remembered; past this the window starts over, which only ever lets someone send sooner */
const MAX_ADDRESSES = 2_000

/**
 * A fixed window per address, in the Worker instance's memory. Not exact (each instance counts for
 * itself, and forgets), but it keeps one address from flooding the logs or the free tier, needs no
 * storage, and the address goes nowhere else.
 */
export class FixedWindowLimit {
  private windowStart = 0
  private total = 0
  private readonly counts = new Map<string, number>()

  private readonly perAddress: number
  private readonly perInstance: number
  private readonly windowMs: number

  constructor(perAddress: number, perInstance: number, windowMs = 60_000) {
    this.perAddress = perAddress
    this.perInstance = perInstance
    this.windowMs = windowMs
  }

  take(address: string, now: number): boolean {
    if (now - this.windowStart >= this.windowMs || this.counts.size >= MAX_ADDRESSES) {
      this.windowStart = now
      this.total = 0
      this.counts.clear()
    }
    const count = this.counts.get(address) ?? 0
    if (count >= this.perAddress || this.total >= this.perInstance) return false
    this.counts.set(address, count + 1)
    this.total++
    return true
  }
}

/** What each shared bucket allows one address a minute (e12-t06, docs/SECURITY.md §6) */
export const SHARED_LIMITS = {
  /** New rooms (POST /api/rooms); the PRD's 5 */
  create: 5,
  /** WebSocket upgrades (/ws/<id>): every one wakes a room, also one that is not there */
  socket: 120,
  /** Wrong owner keys, after which the address is locked out for a minute (worker/owner.ts) */
  ownerFail: 5,
} as const

export type SharedBucket = keyof typeof SHARED_LIMITS

/** The part of a shared limiter the Worker uses: worker/limiter.ts `LimiterDO` */
export interface SharedLimiter {
  take(bucket: string, key: string, limit: number): Promise<boolean> | boolean
}

/** The LIMITER binding, as far as `takeShared` needs it */
export interface LimiterNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): SharedLimiter
}

/**
 * One take of `bucket` for the hashed address `key` from the LimiterDO shard it belongs to:
 * counted for every Worker instance in every location. True when allowed; also true without the
 * binding (tests, a config without it) and when the limiter fails, since a limiter that is down
 * should not take the site down with it
 */
export async function takeShared(
  limiter: LimiterNamespace | undefined,
  bucket: SharedBucket,
  key: string,
): Promise<boolean> {
  if (!limiter) return true
  try {
    const shard = limiter.get(limiter.idFromName(`limiter-${key.slice(0, 1)}`))
    return await shard.take(bucket, key, SHARED_LIMITS[bucket])
  } catch (error) {
    console.error('rate limiter failed', error)
    return true
  }
}
