// @vitest-environment node
// The optional club account (e1-t12): the bridge table's token, this site's session and the routes.
// The bridge table's side is its own repo (worker/arcade-login.ts there); `sign` below makes tokens
// the same way: v1.<base64url JSON>.<HMAC-SHA256 base64url>.
import { describe, expect, it, vi } from 'vitest'
import { accountName, safeReturnPath, type MeResponse } from '../../shared/account.ts'
import { handleRequest, type Env } from '../../worker/app.ts'
import {
  ACCOUNT_HEADER,
  authConfig,
  base64url,
  checkToken,
  CLOCK_SKEW_S,
  d1Ledger,
  handleAuth,
  readSession,
  sameString,
  signSession,
  TOKEN_MAX_AGE_S,
  type TokenLedger,
} from '../../worker/auth.ts'

const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz'
const ORIGIN = 'https://tku-arcade.genelee-pro.workers.dev'
const BRIDGE = 'https://tku-bridge-table.genelee-pro.workers.dev'
const STATE = 'S'.repeat(43)
const NOW = Date.UTC(2026, 10, 9, 12)
const NOW_S = NOW / 1000

const encoder = new TextEncoder()

async function sign(
  claims: Record<string, unknown>,
  secret = SECRET,
  version = 'v1',
): Promise<string> {
  const body = `${version}.${base64url(encoder.encode(JSON.stringify(claims)))}`
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return `${body}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body))))}`
}

let jtiCount = 0
function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'overtrick',
    aud: ORIGIN,
    sub: 'acct-amy',
    name: '小艾',
    club: 'tku',
    iat: NOW_S,
    exp: NOW_S + TOKEN_MAX_AGE_S,
    jti: `jti-${++jtiCount}-abcdefghijklmnop`,
    nonce: STATE,
    ...overrides,
  }
}

function memoryLedger(): TokenLedger & { taken: Map<string, number> } {
  const taken = new Map<string, number>()
  return {
    taken,
    async claim(jti, expiresAt, now) {
      for (const [id, until] of taken) if (until < now) taken.delete(id)
      if (taken.has(jti)) return false
      taken.set(jti, expiresAt)
      return true
    },
  }
}

const check = (token: unknown, overrides: Partial<Parameters<typeof checkToken>[1]> = {}) =>
  checkToken(token, {
    secret: SECRET,
    audience: ORIGIN,
    state: STATE,
    now: NOW,
    ledger: memoryLedger(),
    ...overrides,
  })

describe('the bridge table token', () => {
  it('signs in with a good one, once', async () => {
    const ledger = memoryLedger()
    const token = await sign(claims())
    expect(await check(token, { ledger })).toMatchObject({
      ok: true,
      account: { id: 'acct-amy', name: '小艾' },
    })
    expect(await check(token, { ledger })).toEqual({ ok: false, reason: 'reused' })
  })

  it('refuses a bad signature: another secret, a changed claim, a changed version', async () => {
    expect(await check(await sign(claims(), `${SECRET}-other`))).toEqual({
      ok: false,
      reason: 'signature',
    })
    const token = await sign(claims())
    const [version, payload, signature] = token.split('.')
    const forged = base64url(encoder.encode(JSON.stringify({ ...claims(), sub: 'acct-admin' })))
    expect(await check(`${version}.${forged}.${signature}`)).toEqual({
      ok: false,
      reason: 'signature',
    })
    expect(await check(`${version}.${payload}.${signature.slice(0, -2)}AA`)).toEqual({
      ok: false,
      reason: 'signature',
    })
    expect(await check(await sign(claims(), SECRET, 'v2'))).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('refuses anything malformed', async () => {
    const valid = await sign(claims())
    for (const token of [
      undefined,
      null,
      42,
      '',
      'v1',
      'v1..',
      `${valid}.extra`,
      valid.replace('v1.', 'v1.!'),
      `v1.${'a'.repeat(3000)}.${'b'.repeat(43)}`,
      await sign({ ...claims(), sub: undefined }),
      await sign({ ...claims(), sub: '' }),
      await sign({ ...claims(), iat: '0' }),
      await sign({ ...claims(), exp: NOW_S + 0.5 }),
      await sign({ ...claims(), jti: 'short' }),
      await sign({ ...claims(), nonce: 7 }),
    ]) {
      expect(await check(token), String(token).slice(0, 40)).toMatchObject({
        ok: false,
        reason: 'malformed',
      })
    }
    // Signed but not a JSON object
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const body = `v1.${base64url(encoder.encode('[1,2]'))}`
    const array = `${body}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body))))}`
    expect(await check(array)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('refuses another issuer or another audience (a preview token on production)', async () => {
    expect(await check(await sign(claims({ iss: 'someone' })))).toEqual({
      ok: false,
      reason: 'issuer',
    })
    expect(
      await check(await sign(claims({ aud: 'https://tku-arcade-pr-7.genelee-pro.workers.dev' }))),
    ).toEqual({
      ok: false,
      reason: 'audience',
    })
    expect(await check(await sign(claims({ aud: undefined })))).toEqual({
      ok: false,
      reason: 'audience',
    })
  })

  it('refuses a token whose state is not this browser’s (sign-in CSRF)', async () => {
    expect(await check(await sign(claims({ nonce: 'T'.repeat(43) })))).toEqual({
      ok: false,
      reason: 'state',
    })
    expect(await check(await sign(claims()), { state: null })).toEqual({
      ok: false,
      reason: 'state',
    })
  })

  it('refuses an expired one, allowing a small clock skew', async () => {
    const old = claims({
      iat: NOW_S - TOKEN_MAX_AGE_S - CLOCK_SKEW_S - 1,
      exp: NOW_S - CLOCK_SKEW_S - 1,
    })
    expect(await check(await sign(old))).toEqual({ ok: false, reason: 'expired' })
    const justIn = claims({
      iat: NOW_S - TOKEN_MAX_AGE_S - CLOCK_SKEW_S,
      exp: NOW_S - CLOCK_SKEW_S,
    })
    expect(await check(await sign(justIn))).toMatchObject({ ok: true })
  })

  it('refuses one from the future, or one that lives too long', async () => {
    const ahead = NOW_S + CLOCK_SKEW_S + 1
    expect(await check(await sign(claims({ iat: ahead, exp: ahead + 60 })))).toEqual({
      ok: false,
      reason: 'not_yet_valid',
    })
    expect(await check(await sign(claims({ exp: NOW_S + TOKEN_MAX_AGE_S + 1 })))).toEqual({
      ok: false,
      reason: 'lifetime',
    })
    expect(await check(await sign(claims({ exp: NOW_S })))).toEqual({
      ok: false,
      reason: 'lifetime',
    })
  })

  it('refuses a name that leaves nothing to show, and cuts a long one', async () => {
    expect(await check(await sign(claims({ name: '​ \u0007' })))).toEqual({
      ok: false,
      reason: 'name',
    })
    expect(await check(await sign(claims({ name: 42 })))).toEqual({ ok: false, reason: 'name' })
    const long = await check(await sign(claims({ name: 'A very long display name indeed' })))
    expect(long).toMatchObject({ ok: true, account: { name: 'A very long disp' } })
    expect(accountName('  Amy‮  ')).toBe('Amy')
  })

  it('does not use up the id of a token another check refused', async () => {
    const ledger = memoryLedger()
    const jti = 'same-id-abcdefghijklmnop'
    expect(
      await check(await sign(claims({ jti, aud: 'https://evil.example' })), { ledger }),
    ).toMatchObject({ ok: false })
    expect(await check(await sign(claims({ jti })), { ledger })).toMatchObject({ ok: true })
  })

  it('compares strings whole', () => {
    expect(sameString('abc', 'abc')).toBe(true)
    expect(sameString('abc', 'abd')).toBe(false)
    expect(sameString('abc', 'abcd')).toBe(false)
    expect(sameString('', '')).toBe(true)
  })
})

describe('the D1 ledger', () => {
  it('deletes expired ids, then inserts, and counts a claim only when a row went in', async () => {
    const statements: { sql: string; args: unknown[] }[] = []
    const taken = new Set<string>()
    const db = {
      prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ sql, args }) }),
      batch: async (list: { sql: string; args: unknown[] }[]) => {
        statements.push(...list)
        const jti = list[1].args[0] as string
        const fresh = !taken.has(jti)
        taken.add(jti)
        return [{ meta: { changes: 0 } }, { meta: { changes: fresh ? 1 : 0 } }]
      },
    } as unknown as D1Database
    const ledger = d1Ledger(db)
    expect(await ledger.claim('id-1', 200, 100)).toBe(true)
    expect(await ledger.claim('id-1', 200, 100)).toBe(false)
    expect(statements[0]).toEqual({
      sql: 'DELETE FROM auth_token_uses WHERE expires_at < ?',
      args: [100],
    })
    expect(statements[1]).toEqual({
      sql: 'INSERT OR IGNORE INTO auth_token_uses (jti, expires_at) VALUES (?, ?)',
      args: ['id-1', 200],
    })
  })
})

describe('the session cookie', () => {
  it('reads back what it signed', async () => {
    const value = await signSession({ id: 'acct-amy', name: 'Amy' }, SECRET, NOW)
    expect(await readSession(value, SECRET, NOW + 1000)).toEqual({ id: 'acct-amy', name: 'Amy' })
  })

  it('cannot be edited, moved to another secret, or kept past 30 days', async () => {
    const value = await signSession({ id: 'acct-amy', name: 'Amy' }, SECRET, NOW)
    const [body, signature] = value.split('.')
    const edited = base64url(
      encoder.encode(
        JSON.stringify({ sub: 'acct-admin', name: 'Amy', iat: NOW_S, exp: NOW_S + 999 }),
      ),
    )
    expect(await readSession(`${edited}.${signature}`, SECRET, NOW)).toBeNull()
    expect(await readSession(`${body}.${signature}`, `${SECRET}-rotated`, NOW)).toBeNull()
    expect(await readSession(value, SECRET, NOW + 31 * 24 * 3600 * 1000)).toBeNull()
    expect(await readSession('garbage', SECRET, NOW)).toBeNull()
    expect(await readSession(null, SECRET, NOW)).toBeNull()
  })

  it('is never signed with the token key: a token is not a session', async () => {
    const token = await sign(claims())
    const [, payload, signature] = token.split('.')
    expect(await readSession(`${payload}.${signature}`, SECRET, NOW)).toBeNull()
  })
})

describe('the configuration', () => {
  it('is off unless both the secret and an https bridge address are set', () => {
    expect(authConfig({})).toBeNull()
    expect(authConfig({ AUTH_SHARED_SECRET: SECRET })).toBeNull()
    expect(authConfig({ AUTH_BRIDGE_URL: BRIDGE })).toBeNull()
    expect(authConfig({ AUTH_SHARED_SECRET: 'short', AUTH_BRIDGE_URL: BRIDGE })).toBeNull()
    expect(
      authConfig({ AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: 'http://bridge.example' }),
    ).toBeNull()
    expect(authConfig({ AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: 'not a url' })).toBeNull()
    expect(authConfig({ AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: BRIDGE })).not.toBeNull()
    expect(
      authConfig({ AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: 'http://localhost:5173' }),
    ).not.toBeNull()
  })

  it('keeps the way back on this site', () => {
    expect(safeReturnPath('/r/abc?x=1')).toBe('/r/abc?x=1')
    for (const raw of [
      null,
      '',
      'https://evil.example/',
      '//evil.example',
      '/\\evil.example',
      '/a#b',
      '/a b',
      `/${'a'.repeat(200)}`,
    ]) {
      expect(safeReturnPath(raw), String(raw)).toBe('/')
    }
  })
})

// ── The routes ───────────────────────────────────────────────────────────────────────────────

const configured = { AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: BRIDGE, DB: {} as D1Database }

function cookiesOf(response: Response): string[] {
  return response.headers.getSetCookie()
}

async function signedInCookie(): Promise<string> {
  return `__Host-arcade_session=${await signSession({ id: 'acct-amy', name: 'Amy' }, SECRET, NOW)}`
}

describe('the routes, not configured', () => {
  it('say so, and /api/me says nobody is signed in even with a cookie', async () => {
    const env = { DB: {} as D1Database }
    const me = await handleAuth(
      new Request(`${ORIGIN}/api/me`, { headers: { Cookie: await signedInCookie() } }),
      env,
      new URL(`${ORIGIN}/api/me`),
    )
    expect(await me.json()).toEqual({ configured: false, account: null } satisfies MeResponse)
    for (const [path, method] of [
      ['/api/auth/start', 'GET'],
      ['/api/auth/callback', 'POST'],
      ['/api/auth/signout', 'POST'],
    ]) {
      const response = await handleAuth(
        new Request(`${ORIGIN}${path}`, { method, headers: { Origin: ORIGIN } }),
        env,
        new URL(`${ORIGIN}${path}`),
      )
      expect(response.status, path).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_configured' })
    }
  })

  it('are reached through the Worker', async () => {
    const env = { ASSETS: { fetch: vi.fn() }, DB: {} } as unknown as Env
    const response = await handleRequest(new Request(`${ORIGIN}/api/me`), env)
    expect(await response.json()).toEqual({ configured: false, account: null })
  })
})

describe('the routes, configured', () => {
  const at = (path: string, init: RequestInit = {}) => {
    const request = new Request(`${ORIGIN}${path}`, init)
    return [request, new URL(request.url)] as const
  }

  it('/api/auth/start sends the browser to the bridge table with a fresh state in a cookie', async () => {
    const response = await handleAuth(
      ...splice(at('/api/auth/start?return=%2Fr%2Fabc'), configured),
      { newState: () => STATE },
    )
    expect(response.status).toBe(302)
    const to = new URL(response.headers.get('location') ?? '')
    expect(to.origin + to.pathname).toBe(`${BRIDGE}/api/arcade/login`)
    expect(to.searchParams.get('return_to')).toBe(`${ORIGIN}/r/abc`)
    expect(to.searchParams.get('state')).toBe(STATE)
    const [state] = cookiesOf(response)
    expect(state).toContain(`__Secure-arcade_auth_state=${STATE}`)
    expect(state).toContain('HttpOnly')
    expect(state).toContain('Secure')
    expect(state).toContain('SameSite=Lax')
    expect(state).toContain('Path=/api/auth/')
  })

  it('/api/auth/start never sends anyone back to another site (return_to not allowed)', async () => {
    for (const back of ['https://evil.example/', '//evil.example/x', '/\\evil.example']) {
      const response = await handleAuth(
        ...splice(at(`/api/auth/start?return=${encodeURIComponent(back)}`), configured),
        { newState: () => STATE },
      )
      expect(
        new URL(response.headers.get('location') ?? '').searchParams.get('return_to'),
        back,
      ).toBe(`${ORIGIN}/`)
    }
  })

  const callback = async (
    token: string,
    options: { state?: string | null; origin?: string | null; ledger?: TokenLedger } = {},
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN
    if (options.state !== null)
      headers.Cookie = `__Secure-arcade_auth_state=${options.state ?? STATE}`
    const [request, url] = at('/api/auth/callback', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    })
    return handleAuth(request, configured, url, {
      now: () => NOW,
      ledger: options.ledger ?? memoryLedger(),
    })
  }

  it('/api/auth/callback starts a session the browser cannot read or edit', async () => {
    const response = await callback(await sign(claims()))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      configured: true,
      account: { id: 'acct-amy', name: '小艾' },
    })
    const cookies = cookiesOf(response)
    const session = cookies.find((c) => c.startsWith('__Host-arcade_session='))
    expect(session).toBeDefined()
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
      expect(session).toContain(part)
    // The state is spent
    expect(cookies.find((c) => c.startsWith('__Secure-arcade_auth_state='))).toContain('Max-Age=0')
    // And /api/me knows who this is
    const value = (session ?? '').split(';')[0]
    const me = await handleAuth(
      ...splice(at('/api/me', { headers: { Cookie: value } }), configured),
      { now: () => NOW },
    )
    expect(await me.json()).toEqual({ configured: true, account: { id: 'acct-amy', name: '小艾' } })
  })

  it('/api/auth/callback refuses a reused token, a missing state, another site’s request', async () => {
    const ledger = memoryLedger()
    const token = await sign(claims())
    expect((await callback(token, { ledger })).status).toBe(200)
    const again = await callback(token, { ledger })
    expect(again.status).toBe(400)
    expect(await again.json()).toEqual({ error: 'sign_in_failed', reason: 'reused' })
    expect(cookiesOf(again).some((c) => c.startsWith('__Host-arcade_session='))).toBe(false)

    const noState = await callback(await sign(claims()), { state: null })
    expect(await noState.json()).toMatchObject({ reason: 'state' })
    const otherState = await callback(await sign(claims()), { state: 'T'.repeat(43) })
    expect(await otherState.json()).toMatchObject({ reason: 'state' })
    expect((await callback(await sign(claims()), { origin: 'https://evil.example' })).status).toBe(
      403,
    )
    expect((await callback(await sign(claims()), { origin: null })).status).toBe(403)
    const garbage = await callback('not a token')
    expect(await garbage.json()).toMatchObject({ reason: 'malformed' })
  })

  it('/api/auth/signout forgets the session, and only from this site', async () => {
    const out = await handleAuth(
      ...splice(
        at('/api/auth/signout', { method: 'POST', headers: { Origin: ORIGIN } }),
        configured,
      ),
    )
    expect(out.status).toBe(204)
    expect(cookiesOf(out)[0]).toMatch(/^__Host-arcade_session=; Path=\/; Max-Age=0/)
    const forged = await handleAuth(
      ...splice(
        at('/api/auth/signout', { method: 'POST', headers: { Origin: 'https://evil.example' } }),
        configured,
      ),
    )
    expect(forged.status).toBe(403)
    const get = await handleAuth(...splice(at('/api/auth/signout'), configured))
    expect(get.status).toBe(405)
  })
})

/** [request, url] and env, in handleAuth's order */
function splice(
  pair: readonly [Request, URL],
  env: typeof configured,
): [Request, typeof configured, URL] {
  return [pair[0], env, pair[1]]
}

describe('a room socket (e1-t13)', () => {
  function socketEnv(extra: Partial<Env> = {}) {
    const seen: Request[] = []
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: {},
      ROOM: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async (request: Request) => {
            seen.push(request)
            return new Response('upgraded')
          },
        }),
      },
      ...extra,
    } as unknown as Env
    return { env, seen }
  }
  const upgrade = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/ws/abcdefghij?v=1`, {
      headers: { Upgrade: 'websocket', Origin: ORIGIN, ...headers },
    })

  it('carries the session’s account to the room, and never one the browser made up', async () => {
    vi.useFakeTimers({ now: NOW })
    try {
      const { env, seen } = socketEnv({ AUTH_SHARED_SECRET: SECRET, AUTH_BRIDGE_URL: BRIDGE })
      await handleRequest(
        upgrade({ Cookie: await signedInCookie(), [ACCOUNT_HEADER]: 'forged' }),
        env,
      )
      expect(JSON.parse(decodeURIComponent(seen[0].headers.get(ACCOUNT_HEADER) ?? ''))).toEqual({
        id: 'acct-amy',
        name: 'Amy',
      })
      await handleRequest(
        upgrade({
          [ACCOUNT_HEADER]: encodeURIComponent(JSON.stringify({ id: 'acct-admin', name: 'Admin' })),
        }),
        env,
      )
      expect(seen[1].headers.get(ACCOUNT_HEADER)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('carries nothing while sign-in is not configured, whatever the cookie says', async () => {
    const { env, seen } = socketEnv()
    await handleRequest(upgrade({ Cookie: await signedInCookie() }), env)
    expect(seen[0].headers.get(ACCOUNT_HEADER)).toBeNull()
  })
})
