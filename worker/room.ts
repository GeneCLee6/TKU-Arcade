import { DurableObject } from 'cloudflare:workers'
import type { Env } from './app.ts'

/**
 * One object per room (ARCHITECTURE.md §3). A stub so the wrangler migration (v1) can deploy;
 * A4 adds the hibernatable WebSocket, members and seats, and runs `GameModule.reduce` here.
 */
export class RoomDO extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return new Response('Not implemented', { status: 501 })
  }
}
