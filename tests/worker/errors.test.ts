// POST /api/errors: nobody logs in to reach it, so it must stay small and say nothing about anyone
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CLIENT_ERROR_BYTES,
  MAX_ERROR_MESSAGE_CHARS,
  MAX_ERROR_STACK_CHARS,
  parseClientError,
  routeOf,
  scrubText,
} from '../../shared/client-error.ts'
import type { Env } from '../../worker/app.ts'
import { ErrorReportLimit, handleClientError } from '../../worker/errors.ts'

const URL_ = new URL('https://x/api/errors')
const ENV = { APP_VERSION: 'served-sha' } as Env
const good = { kind: 'boundary', message: 'boom', path: '/r/abc', version: 'page-sha' }

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: 'POST', body, headers })

function logged(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleClientError', () => {
  it('logs a good report, with the versions and nothing about the sender', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleClientError(
      post(JSON.stringify(good), { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Secret/1' }),
      ENV,
      URL_,
      new ErrorReportLimit(),
    )
    expect(res.status).toBe(204)
    expect(logged(log)).toEqual([
      {
        event: 'client_error',
        served: 'served-sha',
        kind: 'boundary',
        message: 'boom',
        stack: null,
        path: '/r/:id',
        version: 'page-sha',
      },
    ])
    expect(log.mock.calls.join()).not.toMatch(/203\.0\.113\.9|Secret/)
  })

  it('refuses other methods, other sites, junk and what is too large, logging none of it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const huge = 'x'.repeat(MAX_CLIENT_ERROR_BYTES + 1)
    const trickle = new ReadableStream({
      start(controller) {
        const chunk = new TextEncoder().encode('x'.repeat(1024))
        for (let i = 0; i < 16; i++) controller.enqueue(chunk)
        controller.close()
      },
    })
    const cases: [Request, number][] = [
      [new Request(URL_), 405],
      [post(JSON.stringify(good), { Origin: 'https://evil.example' }), 403],
      [post('not json'), 400],
      [post(JSON.stringify({ ...good, kind: 'nope' })), 400],
      [post(JSON.stringify({ ...good, message: '' })), 400],
      [post(JSON.stringify({ ...good, message: 3 })), 400],
      [post('null'), 400],
      [post(huge), 413],
      // No content-length to go by: stops reading at the limit all the same
      [new Request(URL_, { method: 'POST', body: trickle, duplex: 'half' } as RequestInit), 413],
    ]
    for (const [request, status] of cases) {
      const res = await handleClientError(request, ENV, URL_, new ErrorReportLimit())
      expect(res.status).toBe(status)
    }
    expect(log).not.toHaveBeenCalled()
  })

  it('accepts its own site', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleClientError(
      post(JSON.stringify(good), { Origin: 'https://x' }),
      ENV,
      URL_,
      new ErrorReportLimit(),
    )
    expect(res.status).toBe(204)
  })

  it('limits each address, then the whole instance, and a new minute starts over', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const limit = new ErrorReportLimit()
    const from = (ip: string, now: number) =>
      handleClientError(
        post(JSON.stringify(good), { 'cf-connecting-ip': ip }),
        ENV,
        URL_,
        limit,
        now,
      )
    const start = 1_000_000
    for (let i = 0; i < 10; i++) expect((await from('a', start)).status).toBe(204)
    const refused = await from('a', start)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
    expect((await from('b', start)).status).toBe(204)
    expect((await from('a', start + 60_000)).status).toBe(204)

    const crowd = new ErrorReportLimit()
    let accepted = 0
    for (let i = 0; i < 200; i++) {
      if (crowd.take(`ip-${i}`, start)) accepted++
    }
    expect(accepted).toBe(120)
    expect(log).toHaveBeenCalled()
  })
})

describe('parseClientError', () => {
  it('cuts what is long', () => {
    const report = parseClientError(
      JSON.stringify({ ...good, message: 'm '.repeat(9000), stack: 's '.repeat(9000) }),
    )
    expect(report?.message).toHaveLength(MAX_ERROR_MESSAGE_CHARS)
    expect(report?.stack).toHaveLength(MAX_ERROR_STACK_CHARS)
  })

  it('takes only a version that looks like one, and only a route for the path', () => {
    const report = parseClientError(
      JSON.stringify({ ...good, version: '<script>', path: '/r/SecretRoom1/x?token=abc' }),
    )
    expect(report?.version).toBe('unknown')
    expect(report?.path).toBe('/r/:id/xtokenabc')
    expect(routeOf('/')).toBe('/')
    expect(routeOf('/some/where')).toBe('/some/where')
  })
})

describe('scrubText', () => {
  it('takes out what someone may have written, keeping the names of things', () => {
    expect(scrubText(`Unexpected token 'h', "hello there" is not valid JSON`)).toBe(
      `Unexpected token 'h', "…" is not valid JSON`,
    )
    expect(scrubText(`Cannot read properties of undefined (reading 'room')`)).toBe(
      `Cannot read properties of undefined (reading 'room')`,
    )
    expect(scrubText(`bad text 'my secret plan'`)).toBe(`bad text '…'`)
    expect(scrubText('tmpl `hi there`')).toBe('tmpl `…`')
  })

  it('takes out addresses, tokens, room ids and query strings', () => {
    expect(scrubText('mail me at someone@example.com now')).toBe('mail me at [email] now')
    expect(scrubText(`seat ${'A1_-'.repeat(11)} gone`)).toBe('seat [token] gone')
    expect(scrubText('at https://x/assets/a.js?token=abc:1:2')).toBe('at https://x/assets/a.js')
    expect(scrubText('fetching https://x/r/abcdefghij failed')).toBe(
      'fetching https://x/r/:id failed',
    )
    expect(scrubText('GET /api/rooms/abcdefghij 500')).toBe('GET /api/rooms/:id 500')
    expect(scrubText('at https://x/assets/RoomPage-Ab12Cd34.js:1:2')).toBe(
      'at https://x/assets/RoomPage-Ab12Cd34.js:1:2',
    )
  })
})
