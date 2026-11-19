// The owner's endpoints (/api/stats, /api/admin/*): one key, the STATS_KEY secret (DEPLOY.md §12).
// Without that secret they are not there at all (404), so a site nobody configured shows nothing.
import type { Env } from './app.ts'

const noStore = { 'cache-control': 'no-store' }

/** Constant time for equal lengths: the key is not guessable a character at a time */
function sameKey(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/**
 * Null when `request` is the owner's, with a method in `methods`; otherwise the answer to give:
 * 404 without STATS_KEY, 405 for another method, 403 for a missing or wrong key. The key comes as
 * `Authorization: Bearer <key>`, a header another site's page cannot make a browser send
 */
export function ownerRefusal(
  request: Request,
  env: Env,
  methods: readonly string[] = ['GET'],
): Response | null {
  const key = env.STATS_KEY?.trim()
  if (!key) return Response.json({ error: 'not_found' }, { status: 404, headers: noStore })
  if (!methods.includes(request.method)) {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: methods.join(', ') } },
    )
  }
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? ''
  if (!sameKey(given, key))
    return Response.json({ error: 'forbidden' }, { status: 403, headers: noStore })
  return null
}
