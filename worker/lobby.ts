import { DurableObject } from 'cloudflare:workers'
import type { Env } from './app.ts'

/**
 * One object for the whole deployment: the public room list (e1-t09). A stub so the wrangler
 * migration (v1) can deploy; batch D1 adds the room heartbeats and alarm clean-up.
 */
export class LobbyDO extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return new Response('Not implemented', { status: 501 })
  }
}
