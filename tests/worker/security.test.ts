// e12-t13 (AC-12.5): the security headers, and the limit on new rooms. The WebSocket's Origin check
// is in rooms.test.ts; that the policy blocks nothing a game needs is checked on the preview
// (docs/SECURITY.md).
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, headersFile } from '../../shared/security-headers.ts'
import { handleRooms } from '../../worker/rooms.ts'
import { FixedWindowLimit } from '../../worker/rate-limit.ts'
import { withSecurityHeaders } from '../../worker/security.ts'
import type { Env } from '../../worker/app.ts'

describe('the security headers', () => {
  it('allow scripts from this site and the inline script by its hash only', () => {
    const policy = contentSecurityPolicy(['sha256-abc='])
    expect(policy).toContain("script-src 'self' 'sha256-abc='")
    expect(policy).not.toMatch(/script-src[^;]*unsafe/)
    expect(policy).toContain("connect-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
  })

  it('go on every path of the static assets', () => {
    const file = headersFile(['sha256-abc='])
    expect(file.split('\n')[0]).toBe('/*')
    for (const name of [
      'Content-Security-Policy',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy: camera=()',
      'X-Frame-Options: DENY',
    ]) {
      expect(file).toContain(name)
    }
  })

  it('go on the Worker’s answers, without overriding one that set its own', () => {
    const json = withSecurityHeaders(Response.json({ ok: true }))
    expect(json.headers.get('x-content-type-options')).toBe('nosniff')
    expect(json.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    const kept = withSecurityHeaders(
      new Response(null, { status: 200, headers: { 'referrer-policy': 'no-referrer' } }),
    )
    expect(kept.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('new rooms', () => {
  it('are limited per address and per instance, and the window starts over', () => {
    const limit = new FixedWindowLimit(2, 3)
    expect([limit.take('a', 0), limit.take('a', 1), limit.take('a', 2)]).toEqual([true, true, false])
    expect([limit.take('b', 3), limit.take('c', 4)]).toEqual([true, false])
    expect(limit.take('a', 60_000)).toBe(true)
  })

  it('past the limit are refused with 429 before anything is created', async () => {
    const limit = new FixedWindowLimit(1, 10)
    const post = () =>
      new Request('https://x/api/rooms', {
        method: 'POST',
        body: '{}',
        headers: { 'cf-connecting-ip': '203.0.113.9' },
      })
    const env = {} as Env
    const url = new URL('https://x/api/rooms')
    // The first gets as far as the body (an unknown game); the second not even that
    expect((await handleRooms(post(), env, url, limit, 0)).status).toBe(400)
    const refused = await handleRooms(post(), env, url, limit, 1)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
  })
})
