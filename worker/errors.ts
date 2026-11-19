import { MAX_CLIENT_ERROR_BYTES, parseClientError } from '../shared/client-error.ts'
import type { Env } from './app.ts'
import { FixedWindowLimit } from './rate-limit.ts'

const noStore = { 'cache-control': 'no-store' }

const fail = (error: string, status: number, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...noStore, ...headers } })

/** Reports one address may send a minute; a page sends only a few itself (src/lib/errorReport.ts) */
const PER_ADDRESS = 10
/** Reports one Worker instance logs a minute, whoever they come from */
const PER_INSTANCE = 120

/** worker/rate-limit.ts, with the error reports' numbers */
export class ErrorReportLimit extends FixedWindowLimit {
  constructor() {
    super(PER_ADDRESS, PER_INSTANCE)
  }
}

const instanceLimit = new ErrorReportLimit()

/** The body as text, or null past `max` bytes: stops reading there, whatever the headers claim */
async function readBounded(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * POST /api/errors: a browser telling us what broke. Goes to the Worker's log (observability in
 * wrangler.jsonc) and nowhere else; `parseClientError` decides what may be logged.
 */
export async function handleClientError(
  request: Request,
  env: Env,
  url: URL,
  limit: ErrorReportLimit = instanceLimit,
  now: number = Date.now(),
): Promise<Response> {
  if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
  // As on /ws: a page on another site has no business here, and a non-browser could forge it anyway
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin) return fail('forbidden_origin', 403)
  if (!limit.take(request.headers.get('cf-connecting-ip') ?? 'unknown', now)) {
    return fail('rate_limited', 429, { 'retry-after': '60' })
  }
  const raw = await readBounded(request, MAX_CLIENT_ERROR_BYTES)
  if (raw === null) return fail('too_large', 413)
  const report = parseClientError(raw)
  if (!report) return fail('bad_request', 400)
  console.error(
    JSON.stringify({ event: 'client_error', served: env.APP_VERSION ?? 'local', ...report }),
  )
  return new Response(null, { status: 204, headers: noStore })
}
