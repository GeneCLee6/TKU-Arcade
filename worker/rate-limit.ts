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

/**
 * One take from a Cloudflare Rate Limiting binding (wrangler `ratelimits`, e12-t06): counted for
 * every Worker instance in the same Cloudflare location, which is where one address's requests
 * go. True when allowed; also true without the binding (tests, a config without it) and when the
 * binding fails, since a limiter that is down should not take the site down with it
 */
export async function takeShared(binding: RateLimit | undefined, key: string): Promise<boolean> {
  if (!binding) return true
  try {
    return (await binding.limit({ key })).success
  } catch (error) {
    console.error('rate limiter failed', error)
    return true
  }
}
