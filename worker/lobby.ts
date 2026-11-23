import { DurableObject } from 'cloudflare:workers'
import { LOBBY_FEED_VERSION, type LobbyFeedMessage } from '../shared/lobby-feed.ts'
import {
  CloseCode,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type RoomListing,
} from '../shared/protocol.ts'
import { ADDRESS_HEADER } from './address.ts'
import type { Env } from './app.ts'
import { disabledGames } from './flags.ts'
import { LobbyBoard, type LobbyEntry } from './lobby-board.ts'
import { admitWatcher, feedChange, watcherTag, type LobbyWatcher } from './lobby-feed.ts'
import { QuickHolds } from './lobby-list.ts'

/** How long the paused games (e12-t11) read from D1 are trusted by the pushed list */
const FEED_FLAGS_TTL_MS = 60_000

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
  /** 2026-11-23: quick join's rooms being opened (in memory: lost on eviction, which only reopens the race) */
  private readonly quick = new QuickHolds()
  /** The paused games as last read, and when (the pushed list leaves their rooms out) */
  private paused: { games: Set<string>; at: number } | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const storage = ctx.storage
    this.board = new LobbyBoard({
      storage: {
        save: (entry) => void storage.put(ENTRY_PREFIX + entry.listing.id, entry),
        drop: (id) => void storage.delete(ENTRY_PREFIX + id),
      },
      now: Date.now,
      // 2026-11-23: the pushed list (worker/lobby-feed.ts); sending to a socket costs no request
      changed: (before, after) => this.pushChange(before, after),
    })
    // The pages' heartbeat, answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG))
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

  /**
   * RPC from POST /api/rooms/quick (2026-11-23): null when `roomId` is the new room to open for
   * `gameId`, or the room another quick join is opening for it, to be sent to instead
   */
  async claimQuick(gameId: string, roomId: string): Promise<string | null> {
    return this.quick.claim(gameId, roomId, Date.now())
  }

  /** RPC from POST /api/rooms/quick: that room was not opened, or is full or gone */
  async releaseQuick(gameId: string, roomId: string): Promise<void> {
    this.quick.release(gameId, roomId)
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

  /**
   * The pushed list (2026-11-23, shared/lobby-feed.ts): the upgrade from /ws/lobby, forwarded by the
   * Worker (worker/app.ts handleLobbySocket), which checked the origin, the game and the address's
   * allowance. A hibernatable socket tagged with its game; the first frame is the game's whole list
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const url = new URL(request.url)
    const game = url.searchParams.get('game') ?? ''
    const address = request.headers.get(ADDRESS_HEADER)
    const { 0: client, 1: server } = new WebSocketPair()
    const watchers = this.ctx
      .getWebSockets()
      .map((ws) => ws.deserializeAttachment() as LobbyWatcher | null)
      .filter((watcher): watcher is LobbyWatcher => watcher !== null)
    const admission =
      url.searchParams.get('v') !== String(LOBBY_FEED_VERSION)
        ? { ok: false as const, code: CloseCode.versionMismatch, reason: 'feed version mismatch' }
        : admitWatcher(watchers, address)
    if (!admission.ok) {
      // As RoomDO: a refused socket is a plain one, closed once the upgrade is done
      server.accept()
      server.close(admission.code, admission.reason)
      return new Response(null, { status: 101, webSocket: client })
    }
    const watcher: LobbyWatcher = { game, address, openedAt: Date.now() }
    this.ctx.acceptWebSocket(server, [watcherTag(game)])
    server.serializeAttachment(watcher)
    const paused = await this.pausedGames()
    const rooms = paused.has(game)
      ? []
      : this.board.list().filter((room) => room.gameId === game)
    const first: LobbyFeedMessage = { t: 'rooms', rooms }
    server.send(JSON.stringify(first))
    return new Response(null, { status: 101, webSocket: client })
  }

  /** A watcher sends nothing but the heartbeat (answered by the runtime): anything else closes it */
  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (data === HEARTBEAT_PING) {
      ws.send(HEARTBEAT_PONG)
      return
    }
    try {
      ws.close(CloseCode.badMessage, 'the list is only listened to')
    } catch {
      // Already closed
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // Already closed
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  /** Tells the watchers of the room's game what changed, if anything worth telling */
  private pushChange(before: RoomListing | null, after: RoomListing | null): void {
    const gameId = after?.gameId ?? before?.gameId
    if (gameId === undefined) return
    const sockets = this.ctx.getWebSockets(watcherTag(gameId))
    if (sockets.length === 0) return
    const message = feedChange(before, after, this.paused?.games.has(gameId) === true)
    if (!message) return
    const payload = JSON.stringify(message)
    for (const ws of sockets) {
      try {
        ws.send(payload)
      } catch {
        // Closing; webSocketClose follows
      }
    }
  }

  /**
   * The paused games, from D1 unless read in the last FEED_FLAGS_TTL_MS. Read when a page starts
   * watching; between those the last answer stands (a paused game's rooms cannot start a game anyway)
   */
  private async pausedGames(): Promise<Set<string>> {
    const now = Date.now()
    if (this.paused && now - this.paused.at < FEED_FLAGS_TTL_MS) return this.paused.games
    const games = await disabledGames(this.env.DB)
    this.paused = { games, at: now }
    return games
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
