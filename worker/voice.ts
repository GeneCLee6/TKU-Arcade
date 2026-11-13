// A voice room for the table (e1-t14): LongTalk opens one, and the room's chat gets its link. This
// site has no voice of its own (PRD Q6). Off unless LONGTALK_URL is set; LongTalk is reached through
// the LONGTALK service binding where there is one, since a Worker cannot fetch another Worker on the
// same workers.dev subdomain, and by its address otherwise.
import type { VoiceResponse, VoiceStatus } from '../shared/protocol.ts'
import type { Env } from './app.ts'

/** LongTalk's room ids: 10 characters of base58 (its shared/room-id.ts) */
const LONGTALK_ROOM = /^[1-9A-HJ-NP-Za-km-z]{10}$/

const noStore = { 'cache-control': 'no-store' }

const voiceBase = (env: Env): string | null => {
  const url = env.LONGTALK_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/** GET /api/voice: whether a voice room can be opened; POST /api/voice opens one */
export async function handleVoice(request: Request, env: Env): Promise<Response> {
  const base = voiceBase(env)
  if (request.method === 'GET') {
    const body: VoiceStatus = { available: base !== null }
    return Response.json(body, { headers: noStore })
  }
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { ...noStore, allow: 'GET, POST' } },
    )
  }
  if (base === null)
    return Response.json({ error: 'unavailable' }, { status: 404, headers: noStore })
  try {
    const fetcher = env.LONGTALK ?? {
      fetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
    }
    const response = await fetcher.fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const { id } = (await response.json()) as { id?: unknown }
    if (response.status !== 201 || typeof id !== 'string' || !LONGTALK_ROOM.test(id)) {
      console.error('voice room refused', response.status)
      return Response.json({ error: 'unavailable' }, { status: 503, headers: noStore })
    }
    const body: VoiceResponse = { url: `${base}/r/${id}` }
    return Response.json(body, { status: 201, headers: noStore })
  } catch (error) {
    console.error('voice room failed', error)
    return Response.json({ error: 'unavailable' }, { status: 503, headers: noStore })
  }
}
