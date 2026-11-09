import {
  accountName,
  AUTH_CALLBACK_PATH,
  AUTH_SIGN_OUT_PATH,
  AUTH_START_PATH,
  ME_PATH,
  safeReturnPath,
  type Account,
  type MeResponse,
} from '../shared/account.ts'

// The optional club account (e1-t12, ARCHITECTURE.md §6, DEPLOY.md §11). The bridge table
// (Overtrick, another repo and Worker) signs a token of at most five minutes with a secret both
// Workers hold; this Worker checks it once and starts its own session. Nothing of the bridge
// table's session or account code is shared. Inert until AUTH_SHARED_SECRET and AUTH_BRIDGE_URL
// are both set: then /api/me says `configured: false` and the other routes `not_configured`.
//
// Where the token travels: the bridge table puts it after `#` in the address it sends the browser
// back to, so it never reaches either server's logs or a Referer. The page takes it out of the
// address before anything else runs and POSTs it here. A query string would sit in logs and in the
// history; a form POST from the bridge table would need an inline script its CSP refuses.

/** What a shorter secret counts as: none */
export const MIN_SECRET_CHARS = 32
/** The longest a token may live, from issue to expiry */
export const TOKEN_MAX_AGE_S = 300
/** How far the two Workers' clocks may disagree */
export const CLOCK_SKEW_S = 30
/** How long a session lasts; signing in again starts a new one */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60
/** How long the sign-in may take on the bridge table: the `state` cookie lives this long */
export const STATE_MAX_AGE_S = 10 * 60
/** The header the Worker gives a room's upgrade: who the session says this is. Never the browser's */
export const ACCOUNT_HEADER = 'X-Arcade-Account'

const TOKEN_VERSION = 'v1'
const TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{1,2000}\.[A-Za-z0-9_-]{43}$/
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const JTI_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
/** Derives the session key from the shared secret, so the bridge table's tokens and this site's cookies never share a key */
const SESSION_KEY_LABEL = 'tku-arcade session v1'

export type AuthEnv = {
  AUTH_SHARED_SECRET?: string
  AUTH_BRIDGE_URL?: string
  DB: D1Database
}

export type AuthConfig = { secret: string; bridge: URL }

/** The configuration, or null while either half is missing or unusable */
export function authConfig(
  env: Pick<AuthEnv, 'AUTH_SHARED_SECRET' | 'AUTH_BRIDGE_URL'>,
): AuthConfig | null {
  const secret = env.AUTH_SHARED_SECRET
  if (!secret || secret.length < MIN_SECRET_CHARS || !env.AUTH_BRIDGE_URL) return null
  try {
    const bridge = new URL(env.AUTH_BRIDGE_URL)
    const local = bridge.protocol === 'http:' && bridge.hostname === 'localhost'
    if (bridge.protocol !== 'https:' && !local) return null
    return { secret, bridge }
  } catch {
    return null
  }
}

// ── Tokens from the bridge table ─────────────────────────────────────────────────────────────

export type TokenRefusal =
  | 'malformed'
  | 'signature'
  | 'issuer'
  | 'audience'
  | 'state'
  | 'expired'
  | 'not_yet_valid'
  | 'lifetime'
  | 'name'
  | 'reused'

export type TokenCheck =
  | { ok: true; account: Account; jti: string; exp: number }
  | { ok: false; reason: TokenRefusal }

/** Remembers which token ids were taken, until they expire. A D1 table in production (`d1Ledger`) */
export interface TokenLedger {
  /** True the first time `jti` is claimed; false when it was claimed before and has not expired */
  claim(jti: string, expiresAt: number, now: number): Promise<boolean>
}

const encoder = new TextEncoder()

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function hmacKey(secret: Uint8Array<ArrayBuffer> | string, usage: 'sign' | 'verify') {
  const raw = typeof secret === 'string' ? encoder.encode(secret) : secret
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

/** Compares in time that does not depend on where two strings differ */
export function sameString(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/**
 * Checks a token from the bridge table: its format, the HMAC (crypto.subtle.verify compares in
 * constant time), issuer, audience (this site's origin), the `state` this browser was given, the
 * times with CLOCK_SKEW_S of slack, a lifetime of at most TOKEN_MAX_AGE_S, a usable name, and last
 * that its id was never taken before (`ledger`), so a token works once.
 */
export async function checkToken(
  token: unknown,
  options: {
    secret: string
    audience: string
    state: string | null
    now: number
    ledger: TokenLedger
  },
): Promise<TokenCheck> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token))
    return { ok: false, reason: 'malformed' }
  const [version, payload, signature] = token.split('.')
  let signed: boolean
  try {
    const key = await hmacKey(options.secret, 'verify')
    signed = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64url(signature),
      encoder.encode(`${version}.${payload}`),
    )
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!signed || version !== TOKEN_VERSION) return { ok: false, reason: 'signature' }
  let claims: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return { ok: false, reason: 'malformed' }
    claims = parsed as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const { iss, aud, sub, name, iat, exp, jti, nonce } = claims
  if (
    typeof sub !== 'string' ||
    sub.length === 0 ||
    sub.length > 128 ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    !Number.isInteger(iat) ||
    !Number.isInteger(exp) ||
    typeof jti !== 'string' ||
    !JTI_PATTERN.test(jti) ||
    typeof nonce !== 'string'
  ) {
    return { ok: false, reason: 'malformed' }
  }
  if (iss !== 'overtrick') return { ok: false, reason: 'issuer' }
  if (aud !== options.audience) return { ok: false, reason: 'audience' }
  if (options.state === null || !sameString(nonce, options.state))
    return { ok: false, reason: 'state' }
  const now = Math.floor(options.now / 1000)
  if (exp - iat <= 0 || exp - iat > TOKEN_MAX_AGE_S) return { ok: false, reason: 'lifetime' }
  if (iat > now + CLOCK_SKEW_S) return { ok: false, reason: 'not_yet_valid' }
  if (exp < now - CLOCK_SKEW_S) return { ok: false, reason: 'expired' }
  const shown = accountName(name)
  if (shown === null) return { ok: false, reason: 'name' }
  // Last, so a token that fails another check does not use up its id
  if (!(await options.ledger.claim(jti, exp + CLOCK_SKEW_S, now)))
    return { ok: false, reason: 'reused' }
  return { ok: true, account: { id: sub, name: shown }, jti, exp }
}

/**
 * Token ids in D1 (`auth_token_uses`, migrations/0002). The primary key makes the claim atomic:
 * two requests with the same token cannot both insert. Expired rows go on the next claim
 */
export function d1Ledger(db: D1Database): TokenLedger {
  return {
    async claim(jti, expiresAt, now) {
      const [, inserted] = await db.batch([
        db.prepare('DELETE FROM auth_token_uses WHERE expires_at < ?').bind(now),
        db
          .prepare('INSERT OR IGNORE INTO auth_token_uses (jti, expires_at) VALUES (?, ?)')
          .bind(jti, expiresAt),
      ])
      return inserted.meta.changes === 1
    },
  }
}

// ── This site's session ──────────────────────────────────────────────────────────────────────

async function sessionKey(secret: string, usage: 'sign' | 'verify') {
  const master = await hmacKey(secret, 'sign')
  const derived = new Uint8Array(
    await crypto.subtle.sign('HMAC', master, encoder.encode(SESSION_KEY_LABEL)),
  )
  return hmacKey(derived, usage)
}

/**
 * The session cookie's value: the account and its times, signed. Readable to nobody but the
 * Worker (HttpOnly), and any change to it breaks the signature, so the browser cannot edit the
 * account or the name
 */
export async function signSession(
  account: Account,
  secret: string,
  nowMs: number,
): Promise<string> {
  const iat = Math.floor(nowMs / 1000)
  const body = base64url(
    encoder.encode(
      JSON.stringify({ sub: account.id, name: account.name, iat, exp: iat + SESSION_MAX_AGE_S }),
    ),
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await sessionKey(secret, 'sign'), encoder.encode(body)),
  )
  return `${body}.${base64url(signature)}`
}

export async function readSession(
  value: string | null,
  secret: string,
  nowMs: number,
): Promise<Account | null> {
  if (!value || !/^[A-Za-z0-9_-]{1,1000}\.[A-Za-z0-9_-]{43}$/.test(value)) return null
  const [body, signature] = value.split('.')
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await sessionKey(secret, 'verify'),
      fromBase64url(signature),
      encoder.encode(body),
    )
    if (!ok) return null
    const { sub, name, exp } = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Record<
      string,
      unknown
    >
    if (typeof sub !== 'string' || typeof exp !== 'number' || exp * 1000 <= nowMs) return null
    const shown = accountName(name)
    return shown === null ? null : { id: sub, name: shown }
  } catch {
    return null
  }
}

/** `__Host-` binds the cookie to this exact host over HTTPS; plain http (local dev) cannot have it */
export const sessionCookieName = (url: URL) =>
  url.protocol === 'https:' ? '__Host-arcade_session' : 'arcade_session'
const stateCookieName = (url: URL) =>
  url.protocol === 'https:' ? '__Secure-arcade_auth_state' : 'arcade_auth_state'

function cookie(url: URL, name: string, value: string, maxAge: number, path: string): string {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(url.protocol === 'https:' ? ['Secure'] : []),
  ].join('; ')
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return null
}

/** Who the request's session says this is; null when signed out, or when sign-in is not configured */
export async function sessionAccount(
  request: Request,
  env: AuthEnv,
  now = Date.now(),
): Promise<Account | null> {
  const config = authConfig(env)
  if (!config) return null
  const url = new URL(request.url)
  return readSession(
    readCookie(request.headers.get('Cookie'), sessionCookieName(url)),
    config.secret,
    now,
  )
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────

const noStore = { 'cache-control': 'no-store' }

function fail(error: string, status: number, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...noStore, ...headers } })
}

export type AuthDeps = { now?: () => number; ledger?: TokenLedger; newState?: () => string }

/** True when the request is one of the auth routes */
export function isAuthPath(pathname: string): boolean {
  return (
    pathname === ME_PATH ||
    pathname === AUTH_START_PATH ||
    pathname === AUTH_CALLBACK_PATH ||
    pathname === AUTH_SIGN_OUT_PATH
  )
}

/** GET /api/me, GET /api/auth/start, POST /api/auth/callback, POST /api/auth/signout */
export async function handleAuth(
  request: Request,
  env: AuthEnv,
  url: URL,
  deps: AuthDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now
  const config = authConfig(env)
  if (url.pathname === ME_PATH) {
    if (request.method !== 'GET') return fail('method_not_allowed', 405, { allow: 'GET' })
    const body: MeResponse = {
      configured: config !== null,
      account: await sessionAccount(request, env, now()),
    }
    return Response.json(body, { headers: noStore })
  }
  if (!config) return fail('not_configured', 404)
  if (url.pathname === AUTH_START_PATH) {
    if (request.method !== 'GET') return fail('method_not_allowed', 405, { allow: 'GET' })
    return start(
      url,
      config,
      deps.newState ?? (() => base64url(crypto.getRandomValues(new Uint8Array(32)))),
    )
  }
  if (request.method !== 'POST') return fail('method_not_allowed', 405, { allow: 'POST' })
  // A form or fetch from another site has no business here (sign-in or sign-out CSRF)
  if (request.headers.get('Origin') !== url.origin) return fail('forbidden_origin', 403)
  if (url.pathname === AUTH_SIGN_OUT_PATH) {
    return new Response(null, {
      status: 204,
      headers: { ...noStore, 'set-cookie': cookie(url, sessionCookieName(url), '', 0, '/') },
    })
  }
  return callback(request, url, config, now(), deps.ledger ?? d1Ledger(env.DB))
}

/** Sends the browser to the bridge table with a fresh `state`, kept in a cookie only this Worker reads */
function start(url: URL, config: AuthConfig, newState: () => string): Response {
  const state = newState()
  const back = new URL(safeReturnPath(url.searchParams.get('return')), url.origin)
  const to = new URL('/api/arcade/login', config.bridge)
  to.searchParams.set('return_to', back.href)
  to.searchParams.set('state', state)
  return new Response(null, {
    status: 302,
    headers: {
      ...noStore,
      location: to.href,
      'referrer-policy': 'no-referrer',
      'set-cookie': cookie(url, stateCookieName(url), state, STATE_MAX_AGE_S, '/api/auth/'),
    },
  })
}

/** Takes the token the page found in its address: checks it, then starts the session */
async function callback(
  request: Request,
  url: URL,
  config: AuthConfig,
  now: number,
  ledger: TokenLedger,
): Promise<Response> {
  const text = await request.text()
  let token: unknown = null
  if (text.length <= 4096) {
    try {
      token = (JSON.parse(text) as { token?: unknown }).token
    } catch {
      token = null
    }
  }
  const state = readCookie(request.headers.get('Cookie'), stateCookieName(url))
  const check = await checkToken(token, {
    secret: config.secret,
    audience: url.origin,
    state: state !== null && STATE_PATTERN.test(state) ? state : null,
    now,
    ledger,
  })
  const headers = new Headers(noStore)
  // The state is spent either way: one sign-in per trip to the bridge table
  headers.append('set-cookie', cookie(url, stateCookieName(url), '', 0, '/api/auth/'))
  if (!check.ok) {
    console.log(JSON.stringify({ event: 'auth_refused', reason: check.reason }))
    headers.set('content-type', 'application/json')
    return new Response(JSON.stringify({ error: 'sign_in_failed', reason: check.reason }), {
      status: 400,
      headers,
    })
  }
  headers.append(
    'set-cookie',
    cookie(
      url,
      sessionCookieName(url),
      await signSession(check.account, config.secret, now),
      SESSION_MAX_AGE_S,
      '/',
    ),
  )
  console.log(JSON.stringify({ event: 'auth_signed_in' }))
  const body: MeResponse = { configured: true, account: check.account }
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status: 200, headers })
}

/**
 * The account a room's upgrade carries, encoded for a header (names are not Latin-1). The Worker
 * deletes whatever the browser sent under ACCOUNT_HEADER first
 */
export const encodeAccountHeader = (account: Account) => encodeURIComponent(JSON.stringify(account))

export function decodeAccountHeader(value: string | null): unknown {
  if (!value || value.length > 1024) return null
  try {
    return JSON.parse(decodeURIComponent(value))
  } catch {
    return null
  }
}
