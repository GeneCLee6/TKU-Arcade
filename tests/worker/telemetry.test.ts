// e12-t10: the kart's anonymous frame rate and load time
import { describe, expect, it, vi } from 'vitest'
import { fpsBand, loadBand } from '../../shared/protocol.ts'
import type { Env } from '../../worker/app.ts'
import { handleTelemetry, parseTelemetry } from '../../worker/telemetry.ts'

const URL_ = new URL('https://x/api/telemetry')

function env() {
  const counted: unknown[][] = []
  const db = {
    prepare: () => ({
      bind: (...args: unknown[]) => ({ run: vi.fn(async () => counted.push(args)) }),
    }),
  }
  return { env: { DB: db } as unknown as Env, counted }
}

const post = (body: unknown, origin = 'https://x') =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body), headers: { origin } })

describe('/api/telemetry', () => {
  it('counts a report in bands, by quality, and keeps nothing else', async () => {
    const { env: e, counted } = env()
    const res = await handleTelemetry(
      post({ kind: 'kart', fps: 58.2, loadMs: 1400, quality: 'medium', gpu: 'x' }),
      e,
      URL_,
      0,
    )
    expect(res.status).toBe(204)
    expect(counted.map((args) => args.slice(1))).toEqual([
      ['kart_fps_55up', 'medium'],
      ['kart_load_1to3s', 'medium'],
    ])
  })

  it('refuses other sites, nonsense and anything but POST', async () => {
    const { env: e, counted } = env()
    expect(
      (
        await handleTelemetry(
          post({ kind: 'kart', fps: 60, loadMs: 1, quality: 'high' }, 'https://evil'),
          e,
          URL_,
        )
      ).status,
    ).toBe(403)
    expect(
      (await handleTelemetry(post({ kind: 'kart', fps: -1, loadMs: 1, quality: 'high' }), e, URL_))
        .status,
    ).toBe(400)
    expect((await handleTelemetry(new Request(URL_), e, URL_)).status).toBe(405)
    expect(counted).toEqual([])
    expect(parseTelemetry('x'.repeat(600))).toBeNull()
    expect(
      parseTelemetry(JSON.stringify({ kind: 'kart', fps: 30, loadMs: 1, quality: 'ultra' })),
    ).toBeNull()
  })

  it('bands', () => {
    expect([29, 30, 50, 60].map(fpsBand)).toEqual(['under30', '30to45', '45to55', '55up'])
    expect([900, 1000, 5999, 7000].map(loadBand)).toEqual(['under1s', '1to3s', '3to6s', '6sup'])
  })
})
