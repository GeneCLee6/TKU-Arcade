import { DurableObject } from 'cloudflare:workers'
import type { RoomListing } from '../shared/protocol.ts'
import type { Env } from './app.ts'
import { LobbyBoard, type LobbyEntry } from './lobby-board.ts'

const ENTRY_PREFIX = 'room:'
/** `code:<four digits>` → the id of the room that number belongs to (shared/room-code.ts) */
const CODE_PREFIX = 'code:'

/**
 * One object for the whole deployment: the public room list (e1-t09). Only the glue to Cloudflare;
 * what it does is `LobbyBoard` (lobby-board.ts).
 */
export class LobbyDO extends DurableObject<Env> {
  private readonly board: LobbyBoard
  /** The alarm as last set (or found), so it is only written when it moves */
  private alarmAt: number | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const storage = ctx.storage
    this.board = new LobbyBoard({
      storage: {
        save: (entry) => void storage.put(ENTRY_PREFIX + entry.listing.id, entry),
        drop: (id) => void storage.delete(ENTRY_PREFIX + id),
      },
      now: Date.now,
    })
    void ctx.blockConcurrencyWhile(async () => {
      const [entries, alarm] = await Promise.all([
        storage.list<LobbyEntry>({ prefix: ENTRY_PREFIX }),
        storage.getAlarm(),
      ])
      this.alarmAt = alarm
      this.board.restore(entries.values())
    })
  }

  /** RPC from a RoomDO: this is what the room looks like now; null when it should not be listed */
  async report(id: string, listing: RoomListing | null): Promise<void> {
    this.board.report(id, listing)
    await this.syncAlarm()
  }

  /** RPC from GET /api/lobby */
  async list(): Promise<RoomListing[]> {
    return this.board.list()
  }

  /**
   * RPC from POST /api/rooms: gives `code` to `roomId` if it is free, or if it still belongs to
   * `replacing` (a room the caller found gone). Answers null when the number is now the room's,
   * otherwise the room that holds it. One object, one call at a time: two rooms never get one number
   */
  async claimCode(code: string, roomId: string, replacing: string | null): Promise<string | null> {
    const key = CODE_PREFIX + code
    const holder = (await this.ctx.storage.get<string>(key)) ?? null
    if (holder !== null && holder !== roomId && holder !== replacing) return holder
    await this.ctx.storage.put(key, roomId)
    return null
  }

  /** RPC from GET /api/codes/<code>: the room the number belongs to, or null */
  async lookupCode(code: string): Promise<string | null> {
    return (await this.ctx.storage.get<string>(CODE_PREFIX + code)) ?? null
  }

  /** RPC from GET /api/codes/<code>: the room was found gone, so its number is free again */
  async releaseCode(code: string, roomId: string): Promise<void> {
    const key = CODE_PREFIX + code
    if ((await this.ctx.storage.get<string>(key)) === roomId) await this.ctx.storage.delete(key)
  }

  override async alarm(): Promise<void> {
    // The alarm that fired is spent
    this.alarmAt = null
    this.board.sweep()
    await this.syncAlarm()
  }

  private async syncAlarm(): Promise<void> {
    const next = this.board.nextAlarm()
    if (next === this.alarmAt) return
    this.alarmAt = next
    if (next === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(next)
  }
}
