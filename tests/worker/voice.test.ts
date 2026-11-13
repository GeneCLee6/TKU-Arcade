// e1-t14: the voice link, with LongTalk as a stand-in
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type Env } from '../../worker/app.ts'

const LONGTALK = 'https://longtalk.example'

function envWith(answer: Response | Error | null, url: string | null = LONGTALK) {
  const fetch = vi.fn(async () => {
    if (answer instanceof Error) throw answer
    return answer ?? new Response('{}', { status: 500 })
  })
  const env = {
    ASSETS: { fetch: vi.fn(async () => new Response('<html>')) },
    LONGTALK_URL: url ?? undefined,
    LONGTALK: { fetch },
  } as unknown as Env
  return { env, fetch }
}

const voice = (method = 'GET') => new Request('https://x/api/voice', { method })

describe('/api/voice', () => {
  it('says it is off, and opens nothing, without LONGTALK_URL', async () => {
    const { env, fetch } = envWith(null, null)
    expect(await (await handleRequest(voice(), env)).json()).toEqual({ available: false })
    expect((await handleRequest(voice('POST'), env)).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens a LongTalk room through the binding and answers its address', async () => {
    const { env, fetch } = envWith(
      Response.json({ id: 'xLWgKmudmK' }, { status: 201 }),
      `${LONGTALK}/`,
    )
    expect(await (await handleRequest(voice(), env)).json()).toEqual({ available: true })
    const res = await handleRequest(voice('POST'), env)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ url: `${LONGTALK}/r/xLWgKmudmK` })
    expect(fetch).toHaveBeenCalledWith(
      `${LONGTALK}/api/rooms`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('answers 503 when LongTalk refuses, sends something odd, or cannot be reached', async () => {
    for (const answer of [
      Response.json({ error: 'rate_limited' }, { status: 429 }),
      Response.json({ id: '<script>' }, { status: 201 }),
      new Error('down'),
    ]) {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { env } = envWith(answer)
      expect((await handleRequest(voice('POST'), env)).status).toBe(503)
    }
  })

  it('only answers GET and POST', async () => {
    const { env } = envWith(null)
    expect((await handleRequest(voice('DELETE'), env)).status).toBe(405)
  })
})
