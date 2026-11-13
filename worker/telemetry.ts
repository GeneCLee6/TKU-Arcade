// e12-t10 (AC-12.3): the kart's frame rate and load time, anonymous. A browser sends one report a
// visit (src/kart/spikeLoop.ts); it is counted in the daily metrics as bands, by quality setting:
// no GPU name, no address, nothing about the person, nothing kept but the counts.
import { fpsBand, loadBand, type KartTelemetry } from '../shared/protocol.ts'
import type { Env } from './app.ts'
import { countMetric } from './metrics.ts'

const MAX_BODY_CHARS = 512
const noStore = { 'cache-control': 'no-store' }
const QUALITIES = new Set(['low', 'medium', 'high'])

export function parseTelemetry(text: string): KartTelemetry | null {
  if (text.length > MAX_BODY_CHARS) return null
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    const { kind, fps, loadMs, quality } = value
    if (kind !== 'kart' || typeof quality !== 'string' || !QUALITIES.has(quality)) return null
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 0 || fps > 1000) return null
    if (typeof loadMs !== 'number' || !Number.isFinite(loadMs) || loadMs < 0 || loadMs > 600_000)
      return null
    return { kind, fps, loadMs, quality: quality as KartTelemetry['quality'] }
  } catch {
    return null
  }
}

/** POST /api/telemetry: 204 whatever happens after the checks, so nothing is learned by probing */
export async function handleTelemetry(
  request: Request,
  env: Env,
  url: URL,
  now = Date.now(),
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: 'POST' } },
    )
  }
  // Only this site's own pages: a browser on another site always says where it is
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin)
    return Response.json({ error: 'forbidden_origin' }, { status: 403, headers: noStore })
  const report = parseTelemetry(await request.text())
  if (!report) return Response.json({ error: 'bad_request' }, { status: 400, headers: noStore })
  await Promise.all([
    countMetric(env.DB, `kart_fps_${fpsBand(report.fps)}`, report.quality, now),
    countMetric(env.DB, `kart_load_${loadBand(report.loadMs)}`, report.quality, now),
  ])
  return new Response(null, { status: 204, headers: noStore })
}
