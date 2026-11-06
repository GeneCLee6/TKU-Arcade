import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type Env } from '../../worker/app.ts'

function env(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response('<html>')) } as unknown as Fetcher,
    ROOM: {} as unknown as Env['ROOM'],
    LOBBY: {} as unknown as Env['LOBBY'],
    DB: {} as unknown as D1Database,
    ASSETS_BUCKET: {} as unknown as R2Bucket,
    ...overrides,
  }
}

describe('worker', () => {
  it('answers the health check with the deployed version', async () => {
    const res = await handleRequest(
      new Request('https://x/api/health'),
      env({ APP_VERSION: 'abc123' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, version: 'abc123' })
  })

  it("reports 'local' when no version was set", async () => {
    const res = await handleRequest(new Request('https://x/api/health'), env())
    expect(await res.json()).toEqual({ ok: true, version: 'local' })
  })

  it('answers unknown API and WebSocket paths with 404 instead of the app', async () => {
    const e = env()
    for (const path of ['/api/nope', '/ws/abc']) {
      const res = await handleRequest(new Request(`https://x${path}`), e)
      expect(res.status, path).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
    expect(e.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('hands every other path to the static assets', async () => {
    const e = env()
    const res = await handleRequest(new Request('https://x/'), e)
    expect(await res.text()).toBe('<html>')
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
