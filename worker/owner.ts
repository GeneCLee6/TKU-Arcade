// The owner's endpoints (/api/stats, /api/admin/*): one key, the STATS_KEY secret (DEPLOY.md §12).
// Without that secret they are not there at all (404), so a site nobody configured shows nothing.
import { addressKey, clientAddress } from './address.ts'
import type { Env } from './app.ts'
import { FixedWindowLimit, takeShared } from './rate-limit.ts'

const noStore = { 'cache-control': 'no-store' }

/** How long an address that sent too many wrong keys is refused outright, in this instance */
const LOCKOUT_MS = 60_000
/** Locked-out addresses remembered by one instance; past this the oldest is forgotten */
const MAX_LOCKED = 1_000

/**
 * Addresses (hashed) that tripped OWNER_FAIL_LIMIT, until when. The binding cannot be asked
 * without counting, so this is what turns away even the right key for a minute after too many
 * wrong ones; a fresh instance learns it again at the first wrong key
 */
const lockedOut = new Map<string, number>()

/** Wrong keys one address may send a minute in one instance: where OWNER_FAIL_LIMIT is missing */
let failures = new FixedWindowLimit(5, 10_000)

/** For the tests */
export function forgetOwnerLockouts(): void {
  lockedOut.clear()
  failures = new FixedWindowLimit(5, 10_000)
}

/**
 * The same time whatever `given` is, for a key of a given length: neither which characters match
 * nor how long the guess is shows in the time taken
 */
export function sameKey(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length
  for (let i = 0; i < expected.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Null when `request` is the owner's, with a method in `methods`; otherwise the answer to give:
 * 404 without STATS_KEY, 405 for another method, 403 for a missing or wrong key, 429 for an
 * address that sent too many wrong keys (OWNER_FAIL_LIMIT, e12-t06) for the next minute. The key
 * comes as `Authorization: Bearer <key>`, a header another site's page cannot make a browser send;
 * never in the address, so it is in no log
 */
export async function ownerRefusal(
  request: Request,
  env: Env,
  methods: readonly string[] = ['GET'],
  now: number = Date.now(),
): Promise<Response | null> {
  const key = env.STATS_KEY?.trim()
  if (!key) return Response.json({ error: 'not_found' }, { status: 404, headers: noStore })
  if (!methods.includes(request.method)) {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: methods.join(', ') } },
    )
  }
  const address = await addressKey(clientAddress(request))
  const until = lockedOut.get(address)
  if (until !== undefined && until > now) return tooMany()
  if (until !== undefined) lockedOut.delete(address)
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? ''
  if (sameKey(given, key)) return null
  if (!failures.take(address, now) || !(await takeShared(env.OWNER_FAIL_LIMIT, address))) {
    if (lockedOut.size >= MAX_LOCKED) lockedOut.delete(lockedOut.keys().next().value as string)
    lockedOut.set(address, now + LOCKOUT_MS)
    return tooMany()
  }
  return Response.json({ error: 'forbidden' }, { status: 403, headers: noStore })
}

function tooMany(): Response {
  return Response.json(
    { error: 'rate_limited' },
    { status: 429, headers: { ...noStore, 'retry-after': String(LOCKOUT_MS / 1000) } },
  )
}
