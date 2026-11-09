import { DurableObject } from 'cloudflare:workers'
import type { ChatMessage } from '../shared/chat.ts'
import { getGame } from '../shared/games/index.ts'
import type { OptionValues } from '../shared/games/types.ts'
import {
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  newSeatToken,
  type RoomSummary,
  type ServerMessage,
} from '../shared/protocol.ts'
import { parseAccount } from '../shared/account.ts'
import type { Env } from './app.ts'
import { ACCOUNT_HEADER, decodeAccountHeader } from './auth.ts'
import { LOBBY_NAME, lobbyReportDue, type LobbyReport } from './lobby-board.ts'
import { RoomHost, type MemberRecord, type OpenSocket, type RoomRecord } from './room-host.ts'
import type { StoredGame } from './room-turn.ts'

const ROOM_KEY = 'room'
const MEMBERS_KEY = 'members'
const REV_KEY = 'rev'
/** The running game: the whole Match, its seed, seats and options (`StoredGame`) */
const GAME_KEY = 'game'
/** The action log, one key per step, zero-padded so that `list({ prefix })` gives them in order */
const STEP_PREFIX = 'step:'
const stepKey = (index: number) => STEP_PREFIX + String(index).padStart(12, '0')
/** Chat messages, one key each: a message is up to 2 kB and the room keeps 200 */
const CHAT_PREFIX = 'chat:'
const chatKey = (id: number) => CHAT_PREFIX + String(id).padStart(12, '0')
/** The most keys one `storage.delete` takes */
const DELETE_BATCH = 128
/** What the lobby was last told (`LobbyReport`); only a public room ever has this key */
const LOBBY_KEY = 'lobby'

/**
 * One room in its own Durable Object (`idFromName(<room id>)`, ARCHITECTURE.md §3). Only the glue
 * to Cloudflare: storage, the alarm and the WebSockets (hibernation API, one per connection, tagged
 * with its connection id). What the room does is `RoomHost` (room-host.ts).
 *
 * `ping` is answered with `pong` by the runtime without waking the object; the alarm's sweep reads
 * when each socket last pinged.
 */
export class RoomDO extends DurableObject<Env> {
  private readonly host: RoomHost
  /** The alarm as last set (or found), so it is only written when it moves */
  private alarmAt: number | null = null
  /** What the lobby was last told; stored, since a sweep every 15 s may find a new instance */
  private reported: LobbyReport | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const storage = ctx.storage
    this.host = new RoomHost({
      sockets: {
        send: (conn, message) => this.send(conn, message),
        close: (conn, code, reason) => {
          for (const ws of ctx.getWebSockets(conn)) {
            try {
              ws.close(code, reason)
            } catch {
              // Already closed
            }
          }
        },
      },
      storage: {
        saveRoom: (room) => void storage.put(ROOM_KEY, room),
        saveMembers: (members) => void storage.put(MEMBERS_KEY, members),
        saveRev: (rev) => void storage.put(REV_KEY, rev),
        saveGame: (game) => void storage.put(GAME_KEY, game),
        saveStep: (index, step) => void storage.put(stepKey(index), step),
        dropSteps: (count) => {
          for (let from = 0; from < count; from += DELETE_BATCH) {
            const end = Math.min(from + DELETE_BATCH, count)
            const keys = Array.from({ length: end - from }, (_, i) => stepKey(from + i))
            void storage.delete(keys)
          }
        },
        saveChat: (message) => void storage.put(chatKey(message.id), message),
        dropChat: (id) => void storage.delete(chatKey(id)),
        clearAll: () => void storage.deleteAll(),
      },
      games: getGame,
      now: Date.now,
      newMemberId: () => crypto.randomUUID(),
      newToken: newSeatToken,
      newSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    })
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG))
    void ctx.blockConcurrencyWhile(async () => {
      const [stored, chat, alarm] = await Promise.all([
        storage.get<unknown>([ROOM_KEY, MEMBERS_KEY, REV_KEY, GAME_KEY, LOBBY_KEY]),
        storage.list<ChatMessage>({ prefix: CHAT_PREFIX }),
        storage.getAlarm(),
      ])
      this.alarmAt = alarm
      this.reported = (stored.get(LOBBY_KEY) as LobbyReport | undefined) ?? null
      this.host.restore(
        {
          room: (stored.get(ROOM_KEY) as RoomRecord | undefined) ?? null,
          members: (stored.get(MEMBERS_KEY) as MemberRecord[] | undefined) ?? [],
          rev: (stored.get(REV_KEY) as number | undefined) ?? 0,
          game: (stored.get(GAME_KEY) as StoredGame | null | undefined) ?? null,
          chat: [...chat.values()],
        },
        ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as OpenSocket),
        alarm,
      )
    })
  }

  /** RPC from POST /api/rooms: false when a room with this id exists already */
  async create(
    id: string,
    gameId: string,
    options: OptionValues | undefined,
    isPublic: boolean,
  ): Promise<boolean> {
    const created = this.host.create(id, gameId, options, isPublic)
    // A room nobody ever joins is cleaned up too
    await this.settle()
    return created
  }

  /** RPC from GET /api/rooms/<id>: null when there is no such room */
  async summary(): Promise<RoomSummary | null> {
    // A room from before clean-up has no alarm: being looked at is what starts its clock
    await this.settle()
    return this.host.summary()
  }

  /** Only the WebSocket upgrade, forwarded by the Worker from /ws/<id> */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    const admission = this.host.admit(new URL(request.url).searchParams.get('v'))
    if (!admission.ok) {
      // A hibernatable socket closed before the 101 goes out stays open in workerd, so a refused
      // one is a plain socket, closed once the upgrade is done
      server.accept()
      server.close(admission.code, admission.reason)
      return new Response(null, { status: 101, webSocket: client })
    }
    // Signed in (e1-t13): the Worker put the session's account here, and the socket keeps it
    // through hibernation
    const account = parseAccount(decodeAccountHeader(request.headers.get(ACCOUNT_HEADER)))
    const attachment: OpenSocket = {
      conn: crypto.randomUUID(),
      openedAt: Date.now(),
      ...(account ? { account } : {}),
    }
    this.ctx.acceptWebSocket(server, [attachment.conn])
    server.serializeAttachment(attachment)
    this.host.opened(attachment.conn, attachment.openedAt, account)
    await this.settle()
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const { conn } = ws.deserializeAttachment() as OpenSocket
    // Normally answered by the auto-response without waking the object
    if (data === HEARTBEAT_PING) ws.send(HEARTBEAT_PONG)
    else if (typeof data === 'string') this.host.message(conn, data)
    else this.host.badFrame(conn)
    await this.settle()
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const { conn } = ws.deserializeAttachment() as OpenSocket
    try {
      ws.close()
    } catch {
      // Already closed
    }
    this.host.closed(conn)
    await this.settle()
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  override async alarm(): Promise<void> {
    // The alarm that fired is spent
    this.alarmAt = null
    for (const ws of this.ctx.getWebSockets()) {
      const at = this.ctx.getWebSocketAutoResponseTimestamp(ws)
      if (at) this.host.heartbeat((ws.deserializeAttachment() as OpenSocket).conn, at.getTime())
    }
    this.host.sweep()
    await this.settle()
  }

  /** After anything that may have changed the room: what the outside world is told of it */
  private async settle(): Promise<void> {
    this.syncLobby()
    await this.syncAlarm()
  }

  /**
   * Tells the lobby, without waiting: a room never holds anything up for the home page's sake. If
   * the call fails the next event or sweep tries again; if the room is gone by then, the lobby's
   * LOBBY_TTL_MS deals with it.
   */
  private syncLobby(): void {
    const listing = this.host.listing()
    const previous = this.reported
    const now = Date.now()
    if (!lobbyReportDue(previous, listing, now)) return
    const id = listing?.id ?? previous?.id
    if (id === undefined) return
    const report: LobbyReport | null = listing && { id, key: JSON.stringify(listing), at: now }
    this.reported = report
    const storage = this.ctx.storage
    if (report) void storage.put(LOBBY_KEY, report)
    else void storage.delete(LOBBY_KEY)
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName(LOBBY_NAME))
    this.ctx.waitUntil(
      lobby.report(id, listing).catch((error: unknown) => {
        console.error('lobby report failed', error)
        if (report === null || this.reported !== report) return
        this.reported = null
        return storage.delete(LOBBY_KEY)
      }),
    )
  }

  private async syncAlarm(): Promise<void> {
    const next = this.host.nextAlarm()
    if (next === this.alarmAt) return
    this.alarmAt = next
    if (next === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(next)
  }

  private send(conn: string, message: ServerMessage): void {
    const payload = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets(conn)) {
      try {
        ws.send(payload)
      } catch {
        // The socket is closing; webSocketClose cleans up
      }
    }
  }
}
