import type { Account } from '../shared/account.ts'
import { CHAT_CHUNK, CHAT_HISTORY, ChatRateLimit, type ChatMessage } from '../shared/chat.ts'
import type { ReplayStep } from '../shared/games/match.ts'
import { keepHidden, parseOptions } from '../shared/games/options.ts'
import { quickBotLevel } from '../shared/games/quickBots.ts'
import { createRng } from '../shared/games/rng.ts'
import {
  botLegal,
  type AnyGameModule,
  type GameProjection,
  type OptionValues,
  type RealtimeMemory,
  type Viewer,
} from '../shared/games/types.ts'
import { diff, type JsonValue } from '../shared/patch.ts'
import {
  CLOCK_ANSWER_BYTES,
  CLOCK_FRAME,
  CLOCK_PING_BYTES,
  CloseCode,
  JOIN_TIMEOUT_MS,
  KICK_BAN_MS,
  MAX_CONNECTIONS,
  MAX_CONNECTIONS_PER_ADDRESS,
  MAX_MEMBERS,
  PROTOCOL_VERSION,
  PROXY_FRAME,
  PROXY_HEADER_BYTES,
  RECONNECT_GRACE_MS,
  ROOM_CLEANUP_MS,
  ROOM_IDLE_MAX_MS,
  SEAT_RELEASE_MS,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
  parseClientMessage,
  sameName,
  uniqueName,
  type ClientMessage,
  type CoverableSeat,
  type ErrorCode,
  type QuickBots,
  type RoomListing,
  type RoomMember,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
  type ServerMessage,
  type TimerInfo,
  type MetricName,
  REACTION_MIN_MS,
} from '../shared/protocol.ts'
import {
  beginGame,
  coverOptions,
  dueTimer,
  nextTimerAt,
  playAction,
  projectFor,
  spendTimer,
  timerInfos,
  type ActionOutcome,
  type StoredGame,
} from './room-turn.ts'
import { UNKNOWN_ADDRESS } from './address.ts'

export type RoomRecord = {
  id: string
  gameId: string
  options: OptionValues
  status: RoomStatus
  minPlayers: number
  maxSeats: number
  /** Null until the first member joins */
  hostId: string | null
  createdAt: number
  /** Who cannot join yet (shared/protocol.ts 18.). Never part of a view */
  bans: KickBan[]
  /** Listed on the home page while waiting for people; otherwise reachable by link only */
  public: boolean
  /** Its short number (shared/room-code.ts); null when none was free, or the room is older */
  code?: string | null
  /**
   * What someone new must bring to join (e1-t16); absent for an open room. Kept as typed (trimmed):
   * it is a door code for friends, never a person's own password. Members see it in the view, to
   * pass it on; a summary only says the room is locked, and a listing never has such a room
   */
  password?: string
  /**
   * Opened from the lobby's "Play the computer" (2026-11-21, CreateRoomRequest.bots): the game starts
   * as soon as the first person joins, who becomes the host. Gone once that has happened
   */
  startOnJoin?: true
  /** Since when no socket has been open; null while one is (`settleCleanup`) */
  emptySince: number | null
  /** While `ended`: when something last happened; null in any other status (`settleCleanup`) */
  idleSince: number | null
  /**
   * When a member last sent anything (heartbeats aside), to within ACTIVITY_SAVE_MS so that not every
   * message is a write: ROOM_IDLE_MAX_MS later the room goes, sockets or not (shared/protocol.ts 19.).
   * Absent in a room from before 2026-11-22, which starts counting when it wakes
   */
  activeAt?: number
}

/**
 * A kick (shared/protocol.ts 18.): the kicked member's seat token always; their club account if
 * they were signed in; their hashed address (worker/address.ts) and name, which only ban together,
 * since a campus or a dorm shares one address
 */
export type KickBan = {
  token: string
  until: number
  account?: string
  address?: string
  name?: string
}

export type MemberRecord = {
  id: string
  name: string
  /** Only ever sent to this member, in `welcome` */
  token: string
  seat: number | null
  ready: boolean
  /** The socket this member is on now; null while offline */
  conn: string | null
  /** When the socket went; null while online */
  offlineAt: number | null
  /** Offline past RECONNECT_GRACE_MS, as a sweep found; stored, since a view comes from storage */
  absent: boolean
  /**
   * The club account this member joined or came back signed in with (e1-t13); their name is that
   * account's. Absent for a guest. Never part of a view
   */
  account?: string
  /** A game's cosmetic choice, shown to everyone (e10-t05, RoomMember.look) */
  look?: string
  /**
   * The hashed address (worker/address.ts) this member last joined from, for a kick's ban
   * (shared/protocol.ts 18.); absent when unknown. Never part of a view
   */
  address?: string
  /** The side chosen for a game with teams (2026-11-18, RoomMember.team): 0 or 1 */
  team?: number
  /**
   * A computer member (2026-11-17, shared/protocol.ts 14.): never has a socket, is never offline,
   * and its moves come from the host's browser. Its `name` is its name's id
   */
  bot?: { level: string; name: string }
}

/**
 * One open socket, as the socket itself remembers it through hibernation: with the account its
 * session was signed in to when it opened (e1-t13), from the Worker, never from the browser
 */
/** `address`: the hashed address the Worker saw (worker/address.ts, e12-t06); absent in old sockets */
export type OpenSocket = { conn: string; openedAt: number; account?: Account; address?: string }

/**
 * What the room has handled from a member's page (shared/protocol.ts 20.): that page load's
 * `session` ('' for one that sent none) and the highest `seq` handled from it
 */
export type SeqAck = { session: string; seq: number }

/** All the room keeps between two wake-ups, apart from the steps, which only a replay reads */
export type StoredRoom = {
  room: RoomRecord | null
  members: MemberRecord[]
  rev: number
  game: StoredGame | null
  /** Any order */
  chat: ChatMessage[]
  /** By member id; absent in a room from before 2026-11-23 */
  acks?: Record<string, SeqAck>
}

export type RoomHostDeps = {
  sockets: {
    send(conn: string, message: ServerMessage): void
    /** A binary frame (a real-time game's, e2-t11): without waiting, and lost if the socket is closing */
    sendBinary?(conn: string, data: Uint8Array): void
    close(conn: string, code: number, reason: string): void
  }
  /**
   * Called without waiting, and with no `await` between the calls for one change, so a Durable
   * Object commits them together and holds back the messages sent meanwhile until they are safe.
   */
  storage: {
    saveRoom(room: RoomRecord): void
    saveMembers(members: MemberRecord[]): void
    saveRev(rev: number): void
    saveGame(game: StoredGame | null): void
    /** Step `index` of the current game's action log: one key per step, so it only ever grows */
    saveStep(index: number, step: ReplayStep<JsonValue>): void
    /** Forgets the first `count` steps */
    dropSteps(count: number): void
    /** A chat message the room accepted: each is stored on its own, by id */
    saveChat(message: ChatMessage): void
    /** A chat message that fell out of the last CHAT_HISTORY */
    dropChat(id: number): void
    /**
     * A member's SeqAck (shared/protocol.ts 20.), one key each, written with the change the message
     * made; null forgets it. Absent: kept in memory only (a test that does not hibernate)
     */
    saveAck?(member: string, ack: SeqAck | null): void
    /** Forgets the whole room */
    clearAll(): void
  }
  games(id: string): AnyGameModule | null
  now(): number
  newMemberId(): string
  newToken(): string
  /** A uint32 for a new game's Rng, or for picking a turn played for someone */
  newSeed(): number
  /** Counts a daily metric (e12-t07); without waiting, and a failure is the counter's own */
  metric?(name: MetricName, gameId: string): void
  /**
   * Whether a new game of `gameId` may start (e12-t11): false once the owner has paused it. Asked
   * on `start`, `rematch` and `set_game` only; a game already being played goes on. Absent: all open
   */
  gameEnabled?(gameId: string): boolean
}

export type Admission = { ok: true } | { ok: false; code: number; reason: string }

type Connection = {
  openedAt: number
  lastSeen: number
  member: string | null
  account: Account | null
  /** The hashed address it came from (e12-t06), null when unknown */
  address: string | null
  /** Wrong room passwords this socket has sent (e1-t16); lost on hibernation, which only helps them */
  wrongPasswords?: number
}

/** How long a computer player the room moves (`GameModule.bot`) seems to think before each move */
export const BOT_THINK_MS = { min: 600, max: 1500 } as const

/** A seed from a computer seat's moment (`botTime`): FNV-1a over the key */
function hashKey(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Wrong passwords one socket may send before it is closed (e1-t16) */
export const PASSWORD_TRIES = 5

/** `RoomRecord.activeAt` is written again only once it is this far behind */
export const ACTIVITY_SAVE_MS = 10 * 60_000

/**
 * One room, without Cloudflare: members, seats, the host, waiting → playing → ended → waiting, and
 * the engine (shared/protocol.ts is the contract; worker/room.ts is the glue, tests/worker runs
 * this directly). It can be rebuilt from storage at any moment (`restore`), since a hibernating
 * Durable Object forgets everything but its storage and its sockets.
 *
 * For the same reason there is no per-socket "last view sent". Every socket that has joined is at
 * the same `rev`, and a view is a pure function of what is stored, so `change` works out each
 * viewer's view before and after and sends the difference.
 */
export class RoomHost {
  private room: RoomRecord | null = null
  private readonly members = new Map<string, MemberRecord>()
  private readonly conns = new Map<string, Connection>()
  private rev = 0
  private game: StoredGame | null = null
  private sweepAt: number | null = null
  /** The latest CHAT_HISTORY messages, oldest first */
  private chat: ChatMessage[] = []
  /** The id of the last message the room accepted (0 before the first) */
  private chatId = 0
  /** In memory: forgetting it in an eviction only ever lets a member send sooner */
  private readonly chatRate = new ChatRateLimit()
  private readonly deps: RoomHostDeps
  /** When each member last reacted (e7-t11); forgotten on hibernation, which costs nothing */
  private readonly reactedAt = new Map<string, number>()
  /**
   * A real-time game's scratch space (e2-t11), for the game it was made for: in memory only, so
   * an eviction starts it over and the module rebuilds what it needs from the next frames
   */
  private realtimeMemory: { game: StoredGame['seed']; gameId: string; memory: RealtimeMemory } | null =
    null
  /** While the clock's actions are being applied: they change the game, which asks again */
  private clocking = false
  /**
   * The computer seats the room will move, by seat, for a game whose module plays them
   * (`GameModule.bot`, 2026-11-20), and when: a moment after its turn came, so that it reads as
   * thinking. One seat at a time (the first in seat order with something to do), or, for a game that
   * times its own computers (`GameModule.botTime`, 2026-11-23), every seat that wants to move, each
   * on its own clock. In memory only: after an eviction `settleBots` works them out again. `key`
   * tells one turn from the next (the game, how many steps in, the seat)
   */
  private readonly botTurns = new Map<number, { key: string; at: number }>()
  /** By member id: what has been handled from their page (shared/protocol.ts 20.), as stored */
  private readonly acks = new Map<string, SeqAck>()

  constructor(deps: RoomHostDeps) {
    this.deps = deps
  }

  /**
   * After waking up: `sockets` are the ones the runtime kept. All of them, also one that is closing
   * right now: its `closed` follows, and tells the others that member went offline. A member whose
   * socket is not among them lost it in a restart, which closes every socket and tells nobody.
   */
  restore(stored: StoredRoom, sockets: OpenSocket[], alarmAt: number | null): void {
    // A room or game from before bans, timers, listing and clean-up existed has none of them. Such a
    // room stays private, and its clean-up clocks start now (`settleCleanup` below)
    this.room = stored.room && {
      ...stored.room,
      bans: stored.room.bans ?? [],
      public: stored.room.public === true,
      emptySince: stored.room.emptySince ?? null,
      idleSince: stored.room.idleSince ?? null,
      activeAt: stored.room.activeAt ?? this.deps.now(),
    }
    this.rev = stored.rev
    this.game = stored.game && { ...stored.game, timers: stored.game.timers ?? [] }
    this.chat = [...(stored.chat ?? [])].sort((a, b) => a.id - b.id).slice(-CHAT_HISTORY)
    this.chatId = this.chat.at(-1)?.id ?? 0
    this.members.clear()
    this.conns.clear()
    for (const { conn, openedAt, account, address } of sockets) {
      // `heartbeat` brings lastSeen up to date before each sweep
      this.conns.set(conn, {
        openedAt,
        lastSeen: openedAt,
        member: null,
        account: account ?? null,
        address: address ?? null,
      })
    }
    // The alarm may be a game timer's, a long way off: sweeps still come every interval
    const nextSweep = this.deps.now() + SWEEP_INTERVAL_MS
    this.sweepAt = sockets.length > 0 ? Math.min(alarmAt ?? nextSweep, nextSweep) : null
    for (const record of stored.members) {
      // A room from before `ready`, `offlineAt` and `absent` existed has members without them
      const member = { ...record, ready: record.ready === true, absent: record.absent === true }
      const conn = member.conn === null ? undefined : this.conns.get(member.conn)
      if (conn) conn.member = member.id
      this.members.set(
        member.id,
        conn || member.bot
          ? { ...member, offlineAt: null, absent: false }
          : { ...member, conn: null, offlineAt: member.offlineAt ?? this.deps.now() },
      )
    }
    this.acks.clear()
    for (const [member, ack] of Object.entries(stored.acks ?? {})) {
      // A member removed since only leaves its key behind: forgotten now
      if (this.members.has(member)) this.acks.set(member, ack)
      else this.deps.storage.saveAck?.(member, null)
    }
    this.settleCleanup()
    this.settleBots()
  }

  // ── Before joining ─────────────────────────────────────────────────────────────────────────

  /** False when the room exists already, or there is no such game: the caller checks that first */
  create(
    id: string,
    gameId: string,
    rawOptions: unknown,
    isPublic = false,
    code: string | null = null,
    password: string | null = null,
    bots: QuickBots | null = null,
  ): boolean {
    const module = this.deps.games(gameId)
    if (this.room || !module) return false
    // Checked by POST /api/rooms already (parseQuickBots); a room never seats more than it has
    // names and seats for, whatever it was asked
    const names = module.bot ? (module.bots?.names ?? []) : []
    const seated = bots === null ? [] : names.slice(0, Math.min(bots.count, module.meta.maxPlayers - 1))
    this.room = {
      id,
      gameId,
      options: parseOptions(module.options, rawOptions),
      status: 'waiting',
      minPlayers: module.meta.minPlayers,
      maxSeats: module.meta.maxPlayers,
      hostId: null,
      createdAt: this.deps.now(),
      bans: [],
      // A room with a password is a private one: never listed for anyone to walk into
      public: isPublic && password === null,
      code,
      ...(password !== null ? { password } : {}),
      ...(seated.length > 0 ? { startOnJoin: true as const } : {}),
      emptySince: this.deps.now(),
      idleSince: null,
      activeAt: this.deps.now(),
    }
    this.deps.storage.saveRoom(this.room)
    // Seats 1 and on: the person who comes takes the lowest free one, the first
    if (bots !== null && seated.length > 0) {
      seated.forEach((name, index) => {
        const bot = this.newBot(index + 1, quickBotLevel(bots, index), name, null)
        this.members.set(bot.id, bot)
      })
      this.saveMembers()
    }
    this.deps.metric?.('room_created', gameId)
    return true
  }

  /**
   * What a replay of the last game needs (e2-t09), once that game is over: never while it is being
   * played, when a replay would show what players are keeping to themselves. The steps themselves
   * are in storage, `game.steps` of them. Null when there is no finished game
   */
  replaySource(): { game: StoredGame; names: Record<string, string> } | null {
    const game = this.game
    if (!game) return null
    const module = this.deps.games(game.gameId)
    if (!module || !module.isOver(game.match.state as never)) return null
    const names: Record<string, string> = {}
    for (const member of this.members.values()) {
      if (member.seat !== null) names[String(member.seat)] = member.name
    }
    return { game, names }
  }

  summary(): RoomSummary | null {
    if (!this.room) return null
    const members = [...this.members.values()]
    return {
      id: this.room.id,
      gameId: this.room.gameId,
      status: this.room.status,
      members: members.length,
      seated: members.filter((member) => member.seat !== null).length,
      maxSeats: this.room.maxSeats,
      ...(this.room.password !== undefined ? { locked: true } : {}),
    }
  }

  /** What the home page shows of this room; null while it should not be listed (e1-t09) */
  listing(): RoomListing | null {
    const room = this.room
    // A room with a password (e1-t16) is not for anyone to walk into
    if (!room?.public || room.status !== 'waiting' || room.password !== undefined) return null
    const host = room.hostId === null ? undefined : this.members.get(room.hostId)
    const members = [...this.members.values()]
    const seated = members.filter((member) => member.seat !== null).length
    if (!host || seated >= room.maxSeats || !members.some((member) => member.conn !== null)) {
      return null
    }
    return {
      id: room.id,
      gameId: room.gameId,
      host: host.name,
      seated,
      maxSeats: room.maxSeats,
      createdAt: room.createdAt,
    }
  }

  /** May this upgrade, from the hashed `address` (null: unknown), become a socket of the room? */
  admit(version: string | null, address: string | null = null): Admission {
    if (version !== String(PROTOCOL_VERSION)) {
      return { ok: false, code: CloseCode.versionMismatch, reason: 'protocol version mismatch' }
    }
    if (!this.room) return { ok: false, code: CloseCode.roomNotFound, reason: 'room not found' }
    if (this.conns.size >= MAX_CONNECTIONS) {
      return { ok: false, code: CloseCode.roomFull, reason: 'room full' }
    }
    if (address !== null) {
      let fromThere = 0
      for (const open of this.conns.values()) if (open.address === address) fromThere++
      if (fromThere >= MAX_CONNECTIONS_PER_ADDRESS) {
        return { ok: false, code: CloseCode.tooManyConnections, reason: 'too many connections' }
      }
    }
    return { ok: true }
  }

  /**
   * `account`: who the session says this is (e1-t13), null for a guest. `address`: the hashed
   * address it came from (e12-t06), null when unknown
   */
  opened(
    conn: string,
    openedAt: number,
    account: Account | null = null,
    address: string | null = null,
  ): void {
    this.conns.set(conn, { openedAt, lastSeen: openedAt, member: null, account, address })
    this.sweepAt ??= this.deps.now() + SWEEP_INTERVAL_MS
    this.settleCleanup()
  }

  // ── Sockets ────────────────────────────────────────────────────────────────────────────────

  /** A text frame from a socket. Never throws for anything a client can send */
  message(conn: string, raw: string): void {
    this.handleMessage(conn, raw)
    this.settleCleanup()
  }

  private handleMessage(conn: string, raw: string): void {
    const connection = this.conns.get(conn)
    if (!connection || !this.room) return
    connection.lastSeen = this.deps.now()
    const message = parseClientMessage(raw)
    if (!message) {
      this.drop(conn, CloseCode.badMessage, 'bad message')
      return
    }
    // Coming back, or anything said or done, shows people are still at a finished room's table
    if (message.t !== 'resync') {
      this.noteActivity()
      this.noteActive()
    }
    if (message.t === 'join') {
      if (connection.member !== null) this.refuse(conn, 'forbidden')
      else {
        this.join(
          conn,
          connection,
          message.name,
          message.token,
          message.password ?? null,
          message.session ?? null,
        )
      }
      return
    }
    const member = connection.member === null ? undefined : this.members.get(connection.member)
    if (!member) {
      this.refuse(conn, 'not_joined')
      return
    }
    const seq = message.seq
    if (seq === undefined) {
      this.dispatch(conn, member, message)
      return
    }
    // shared/protocol.ts 20.: a message sent again after its socket died, already handled
    const handled = this.acks.get(member.id)
    if (handled && seq <= handled.seq) {
      this.deps.sockets.send(conn, { t: 'ack', seq: handled.seq })
      return
    }
    this.dispatch(conn, member, message)
    // Gone with it (the room dissolved, the member kicked): nothing to remember, nobody to tell
    if (!this.room || !this.members.has(member.id)) return
    const ack = { session: handled?.session ?? '', seq }
    this.acks.set(member.id, ack)
    // In the same turn as the change's own writes, so storage keeps both or neither
    this.deps.storage.saveAck?.(member.id, ack)
    this.deps.sockets.send(conn, { t: 'ack', seq })
  }

  private dispatch(conn: string, member: MemberRecord, message: ClientMessage): void {
    switch (message.t) {
      case 'join':
        return
      case 'resync':
        // It also clears a countdown whose ending was the message that went missing
        this.deps.sockets.send(conn, { t: 'timer', timers: this.timers() })
        this.deps.sockets.send(conn, {
          t: 'snapshot',
          rev: this.rev,
          state: this.viewBuilder()(member),
        })
        return
      case 'action':
        this.act(conn, member, message.action, message.botSeat ?? null)
        return
      case 'add_bot':
        this.addBot(conn, member, message.level, message.look ?? null)
        return
      case 'sit':
        this.sit(conn, member, message.seat)
        return
      case 'ready':
        this.ready(conn, member, message.ready)
        return
      case 'start':
        this.start(conn, member)
        return
      case 'reopen':
        this.reopen(conn, member)
        return
      case 'rematch':
        this.rematch(conn, member)
        return
      case 'kick':
        this.kick(conn, member, message.member)
        return
      case 'transfer':
        this.transfer(conn, member, message.member)
        return
      case 'dissolve':
        this.dissolve(conn, member)
        return
      case 'set_game':
        this.setGame(conn, member, message.gameId, message.options)
        return
      case 'set_options':
        this.setOptions(conn, member, message.options, message.patch === true)
        return
      case 'set_public':
        this.setPublic(conn, member, message.public)
        return
      case 'leave':
        this.leave(conn, member)
        return
      case 'set_password':
        this.setPassword(conn, member, message.password)
        return
      case 'set_look':
        this.setLook(member, message.look)
        return
      case 'set_team':
        this.setTeam(conn, member, message.team, message.member ?? null)
        return
      case 'react':
        this.react(member, message.reaction)
        return
      case 'chat':
        this.postChat(conn, member, message.text)
        return
      case 'cover':
        this.cover(conn, member, message.seat, message.how)
        return
    }
  }

  /**
   * A binary frame (e2-t11): a real-time game's, from a seat in it, judged by the module and passed
   * on to every other joined socket with the seat in front. Frames still in flight when the race
   * ends, or from someone without a seat in it, are ignored; in a room whose game is not real-time,
   * a binary frame is a protocol error as before.
   */
  binary(conn: string, data: ArrayBuffer): void {
    const connection = this.conns.get(conn)
    const room = this.room
    if (!connection || !room) return
    // A clock ping, from anyone who has joined: answered with the server's time
    const bytes = new Uint8Array(data)
    if (bytes.byteLength === CLOCK_PING_BYTES && bytes[0] === CLOCK_FRAME) {
      if (connection.member === null || !this.deps.sockets.sendBinary) return
      const answer = new Uint8Array(CLOCK_ANSWER_BYTES)
      answer.set(bytes)
      new DataView(answer.buffer).setFloat64(CLOCK_PING_BYTES, this.deps.now(), true)
      this.deps.sockets.sendBinary(conn, answer)
      return
    }
    const game = this.game
    const module = game ? this.deps.games(game.gameId) : null
    if (!game || !module?.realtime) return this.badFrame(conn)
    const now = this.deps.now()
    connection.lastSeen = now
    if (connection.member !== null) this.noteActive()
    const member = connection.member === null ? undefined : this.members.get(connection.member)
    // The host's frame for a computer seat (shared/protocol.ts 14.): judged as that seat's, and
    // passed on to the host too, whose race draws the computer karts from them like anyone's
    const proxied = bytes[0] === PROXY_FRAME
    if (proxied && bytes.byteLength <= PROXY_HEADER_BYTES) return
    const wanted = bytes[1] ?? -1
    const seat = proxied
      ? member && this.isBotSeatFor(member, wanted)
        ? wanted
        : null
      : (member?.seat ?? null)
    if (room.status !== 'playing' || seat === null || !game.seats.some((one) => one.id === seat)) {
      return
    }
    const payload = proxied ? bytes.subarray(PROXY_HEADER_BYTES) : bytes
    let answer: { relay: Uint8Array | null; actions: JsonValue[] }
    try {
      answer = module.realtime.frame(game.match.state, this.memoryFor(game), seat, payload, now)
    } catch (error) {
      console.error(`game ${game.gameId}: realtime frame threw`, error)
      return
    }
    if (answer.relay && this.deps.sockets.sendBinary) {
      const relayed = new Uint8Array(answer.relay.byteLength + 1)
      relayed[0] = seat
      relayed.set(answer.relay, 1)
      for (const [other, { member: joined }] of this.conns) {
        if ((proxied || other !== conn) && joined !== null) {
          this.deps.sockets.sendBinary(other, relayed)
        }
      }
    }
    for (const action of answer.actions) this.systemAction(action, now)
  }

  /** Whether `member` may move `seat` for the computer: the host, for a computer member's seat */
  private isBotSeatFor(member: MemberRecord, seat: number): boolean {
    if (member.id !== this.room?.hostId || member.bot) return false
    // The room plays these itself (`GameModule.bot`): nobody moves them from a browser
    if (this.deps.games(this.room.gameId)?.bot) return false
    return [...this.members.values()].some((other) => other.bot && other.seat === seat)
  }

  /**
   * Nobody runs the computer seats any more (their host's socket closed, or the host changed):
   * during a real-time game, the module says what becomes of them (the kart retires them)
   */
  private abandonBots(): void {
    const room = this.room
    const game = this.game
    if (room?.status !== 'playing' || !game) return
    const realtime = this.deps.games(game.gameId)?.realtime
    if (!realtime?.abandon) return
    const seats = [...this.members.values()]
      .filter((member) => member.bot && member.seat !== null)
      .map((member) => member.seat as number)
      .filter((seat) => game.seats.some((one) => one.id === seat))
    if (seats.length === 0) return
    const now = this.deps.now()
    let actions: JsonValue[]
    try {
      actions = realtime.abandon(game.match.state, seats, now)
    } catch (error) {
      console.error(`game ${game.gameId}: realtime abandon threw`, error)
      return
    }
    for (const action of actions) this.systemAction(action, now)
  }

  /** The real-time module's scratch space for this game, new for each game */
  private memoryFor(game: StoredGame): RealtimeMemory {
    const known = this.realtimeMemory
    if (known && known.game === game.seed && known.gameId === game.gameId) return known.memory
    const memory = this.deps.games(game.gameId)?.realtime?.memory() ?? {}
    this.realtimeMemory = { game: game.seed, gameId: game.gameId, memory }
    return memory
  }

  /** An action the room itself takes for a real-time game (a judged lap, the start time) */
  private systemAction(action: JsonValue, now: number): void {
    const room = this.room
    const game = this.game
    if (!room || !game || room.status !== 'playing') return
    const module = this.deps.games(game.gameId)
    if (!module) return
    const outcome = playAction(module, game, action, 'system', now)
    if (outcome.kind === 'accepted') return this.accept(room, game.steps, outcome)
    if (outcome.kind === 'refused') {
      console.error(`game ${game.gameId}: realtime action refused: ${outcome.error.gameError}`)
    }
  }

  /**
   * What a real-time game asks of the clock after a change (the kart's start time), applied at
   * once with the same `now`. A few rounds at most: a module that keeps asking is a bug
   */
  private runClock(): void {
    if (this.clocking) return
    this.clocking = true
    try {
      for (let round = 0; round < 4; round++) {
        const room = this.room
        const game = this.game
        if (!room || !game || room.status !== 'playing') return
        const realtime = this.deps.games(game.gameId)?.realtime
        if (!realtime?.clock) return
        const now = this.deps.now()
        let actions: JsonValue[]
        try {
          actions = realtime.clock(game.match.state, now)
        } catch (error) {
          console.error(`game ${game.gameId}: realtime clock threw`, error)
          return
        }
        if (actions.length === 0) return
        for (const action of actions) this.systemAction(action, now)
      }
    } finally {
      this.clocking = false
    }
  }

  /** Binary frames are not part of the protocol */
  badFrame(conn: string): void {
    if (this.conns.has(conn)) this.drop(conn, CloseCode.badMessage, 'bad message')
    this.settleCleanup()
  }

  /** The socket closed. The member keeps its seat and its token */
  closed(conn: string): void {
    const connection = this.conns.get(conn)
    if (!connection) return
    this.conns.delete(conn)
    this.markOffline(conn, connection)
    if (this.conns.size === 0) this.sweepAt = null
    this.settleCleanup()
  }

  /** When the runtime last answered this socket's `ping` by itself, without waking the room */
  heartbeat(conn: string, at: number): void {
    const connection = this.conns.get(conn)
    if (connection && at > connection.lastSeen) connection.lastSeen = at
  }

  /**
   * The alarm, for whichever job it came for: closes sockets that never joined or went silent, fires
   * the game's timers that ran out, deals with members who have been gone too long, forgets kicks
   * that have run out and deletes a room whose time is up.
   */
  sweep(): void {
    const now = this.deps.now()
    for (const [conn, connection] of [...this.conns]) {
      const expired =
        connection.member === null
          ? now - connection.openedAt > JOIN_TIMEOUT_MS
          : now - connection.lastSeen > STALE_AFTER_MS
      if (expired) {
        this.drop(conn, CloseCode.stale, connection.member === null ? 'no join' : 'no heartbeat')
      }
    }
    this.fireTimers(now)
    this.playBot(now)
    this.markAbsent(now)
    this.releaseSeats(now)
    this.replaceAbsentHost()
    this.removeAbsentSpectators()
    this.dropExpiredBans(now)
    this.settleCleanup()
    const cleanupAt = this.cleanupAt()
    if (cleanupAt !== null && now >= cleanupAt) {
      this.wipe(CloseCode.roomNotFound, 'room closed')
      return
    }
    this.sweepAt = this.conns.size > 0 ? now + SWEEP_INTERVAL_MS : null
  }

  /**
   * When the alarm should fire next; null for no alarm. A Durable Object has one alarm, so it is the
   * earliest of what the room is waiting for: the sweep, the game's timers and the clean-up.
   */
  nextAlarm(): number | null {
    const timerAt = this.game && this.room?.status === 'playing' ? nextTimerAt(this.game) : null
    const botAt = this.botTurns.size > 0 ? Math.min(...[...this.botTurns.values()].map((turn) => turn.at)) : null
    const times = [this.sweepAt, timerAt, botAt, this.cleanupAt()].filter(
      (at): at is number => at !== null && Number.isFinite(at),
    )
    return times.length > 0 ? Math.min(...times) : null
  }

  /** When this room is to be deleted if nothing changes; null when nothing is counting down */
  private cleanupAt(): number | null {
    const room = this.room
    if (!room) return null
    const since = [room.emptySince, room.idleSince].filter((at) => at !== null)
    const cleanup = since.length > 0 ? Math.min(...since) + ROOM_CLEANUP_MS : null
    // A tab left open for days keeps no room (shared/protocol.ts 19.)
    const idle = room.activeAt === undefined ? null : room.activeAt + ROOM_IDLE_MAX_MS
    return cleanup === null ? idle : idle === null ? cleanup : Math.min(cleanup, idle)
  }

  /**
   * Brings the two clean-up clocks in line with the room, after anything that may have moved them.
   * They are stored so that waking up does not start them over, but they are no part of any view, so
   * they need no `change` and no `rev` of their own.
   */
  private settleCleanup(): void {
    const room = this.room
    if (!room) return
    const now = this.deps.now()
    const emptySince = this.conns.size > 0 ? null : (room.emptySince ?? now)
    const idleSince = room.status === 'ended' ? (room.idleSince ?? now) : null
    if (emptySince === room.emptySince && idleSince === room.idleSince) return
    room.emptySince = emptySince
    room.idleSince = idleSince
    this.deps.storage.saveRoom(room)
  }

  private noteActivity(): void {
    const room = this.room
    if (room?.status !== 'ended') return
    room.idleSince = this.deps.now()
    this.deps.storage.saveRoom(room)
  }

  /** A member sent something: `activeAt` moves on, written only when it is ACTIVITY_SAVE_MS behind */
  private noteActive(): void {
    const room = this.room
    if (!room) return
    const now = this.deps.now()
    if (room.activeAt !== undefined && now - room.activeAt < ACTIVITY_SAVE_MS) return
    room.activeAt = now
    this.deps.storage.saveRoom(room)
  }

  /** `isBanned` already ignores them: this only keeps them from staying in storage */
  private dropExpiredBans(now: number): void {
    const room = this.room
    if (!room || room.bans.every((ban) => ban.until > now)) return
    room.bans = room.bans.filter((ban) => ban.until > now)
    this.deps.storage.saveRoom(room)
  }

  // ── What members do ────────────────────────────────────────────────────────────────────────

  /** `name`, or with the first free suffix among every member but `self` (uniqueName) */
  private uniqueAmongOthers(name: string, self: string | null): string {
    // A computer member's name is an id, shown through the game's strings: nobody's to clash with
    const others = [...this.members.values()].filter((other) => other.id !== self && !other.bot)
    return uniqueName(
      name,
      others.map((other) => other.name),
    )
  }

  private join(
    conn: string,
    connection: Connection,
    name: string,
    token: string | null,
    password: string | null = null,
    session: string | null = null,
  ): void {
    // Who the session says this is (e1-t13): the name `join` sent is only a guest's
    const account = connection.account
    if (token !== null && this.isBanned(token)) {
      this.drop(conn, CloseCode.kicked, 'kicked')
      return
    }
    const known = token === null ? undefined : this.findByToken(token)
    // Someone new: also by the account, or the address with the name (shared/protocol.ts 18.)
    if (!known && this.isBannedNewcomer(connection, account?.name ?? name)) {
      this.drop(conn, CloseCode.kicked, 'kicked')
      return
    }
    if (known) {
      const replaced = known.conn !== null
      if (known.conn !== null) {
        // A second tab, or a reload that beat the old socket's close
        this.conns.delete(known.conn)
        this.deps.sockets.close(known.conn, CloseCode.replaced, 'replaced')
      }
      this.change(() => {
        known.conn = conn
        known.offlineAt = null
        known.absent = false
        if (connection.address !== null) known.address = connection.address
        connection.member = known.id
        // Signed in since (or as someone else): the seat stays, the name becomes the account's
        if (account && known.account !== account.id) {
          known.account = account.id
          known.name = this.uniqueAmongOthers(account.name, known.id)
        }
        this.saveMembers()
      })
      this.welcome(conn, known, session)
      // A reload that beat the old socket's close: the old page ran the computer karts, not this one
      if (replaced && known.id === this.room?.hostId) this.abandonBots()
      return
    }
    // Someone new to a room with a password (e1-t16); a member coming back has their token instead
    const required = this.requireRoom().password
    if (required !== undefined && password !== required) {
      if (password === null) {
        this.refuse(conn, 'password_required')
        return
      }
      connection.wrongPasswords = (connection.wrongPasswords ?? 0) + 1
      if (connection.wrongPasswords >= PASSWORD_TRIES) {
        this.drop(conn, CloseCode.badMessage, 'too many wrong passwords')
        return
      }
      this.refuse(conn, 'wrong_password')
      return
    }
    if (this.members.size >= MAX_MEMBERS) {
      this.drop(conn, CloseCode.roomFull, 'room full')
      return
    }
    const member: MemberRecord = {
      id: this.deps.newMemberId(),
      // Signed in: the account's name, whatever `join` said. Against offline members too: they
      // keep their seat and can come back
      name: this.uniqueAmongOthers(account?.name ?? name, null),
      token: this.deps.newToken(),
      seat: this.lowestFreeSeat(),
      ready: false,
      conn,
      offlineAt: null,
      absent: false,
      ...(account ? { account: account.id } : {}),
      ...(connection.address !== null ? { address: connection.address } : {}),
    }
    let startNow = false
    this.change(() => {
      const room = this.requireRoom()
      this.members.set(member.id, member)
      connection.member = member.id
      this.saveMembers()
      if (room.hostId === null) {
        room.hostId = member.id
        // Opened with computer players (2026-11-21): their host starts the game by joining
        startNow = room.startOnJoin === true
        delete room.startOnJoin
        this.deps.storage.saveRoom(room)
      }
    })
    this.welcome(conn, member, session)
    // As if the host had pressed start, with the same checks (a paused game stays in the waiting
    // room, where the refusal says why and the host can start it by hand later)
    if (startNow && this.requireRoom().status === 'waiting') this.beginFromSeats(conn, this.requireRoom())
  }

  /**
   * True while the room will start its game when its first person joins (a room opened with
   * computer players, `RoomRecord.startOnJoin`): RoomDO then reads the paused games before a join
   */
  startsOnJoin(): boolean {
    return this.room?.startOnJoin === true && this.room.hostId === null
  }

  private sit(conn: string, member: MemberRecord, seat: number | null): void {
    const room = this.requireRoom()
    if (room.status === 'playing') return this.refuse(conn, 'wrong_status')
    if (seat !== null && seat >= room.maxSeats) return this.refuse(conn, 'bad_seat')
    if (seat === member.seat) return
    const taken = seat !== null && [...this.members.values()].some((other) => other.seat === seat)
    if (taken) return this.refuse(conn, 'seat_taken')
    this.change(() => {
      member.seat = seat
      if (seat === null) member.ready = false
      this.saveMembers()
    })
  }

  /** e10-t05: a cosmetic choice for the others to see, in any status; it changes no game */
  private setLook(member: MemberRecord, look: string | null): void {
    if ((member.look ?? null) === look) return
    this.change(() => {
      if (look === null) delete member.look
      else member.look = look
      this.saveMembers()
    })
  }

  /**
   * 2026-11-18 (shared/protocol.ts 15.): a side for a game with teams. One's own, or from the host
   * anyone's; not while a game is played, which has its sides already
   */
  private setTeam(
    conn: string,
    member: MemberRecord,
    team: number | null,
    targetId: string | null,
  ): void {
    const room = this.requireRoom()
    const target = targetId === null ? member : this.members.get(targetId)
    if (!target) return this.refuse(conn, 'bad_member')
    if (target !== member && member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status === 'playing') return this.refuse(conn, 'wrong_status')
    if ((target.team ?? null) === team) return
    this.change(() => {
      if (team === null) delete target.team
      else target.team = team
      this.saveMembers()
    })
  }

  /**
   * 2026-11-17 (shared/protocol.ts 14.): a computer member in the lowest free seat, for a game that
   * has them, named by the room with the first of the game's names no other computer member has
   */
  private addBot(conn: string, member: MemberRecord, level: string, look: string | null): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status === 'playing') return this.refuse(conn, 'wrong_status')
    const bots = this.deps.games(room.gameId)?.bots
    if (!bots || !bots.levels.includes(level)) return this.refuse(conn, 'bad_game')
    const taken = new Set([...this.members.values()].map((other) => other.seat))
    let seat: number | null = null
    for (let one = 0; one < room.maxSeats && seat === null; one++) if (!taken.has(one)) seat = one
    const named = new Set([...this.members.values()].map((other) => other.bot?.name))
    const name = bots.names.find((one) => !named.has(one))
    if (seat === null || name === undefined || this.members.size >= MAX_MEMBERS) {
      return this.refuse(conn, 'seat_taken')
    }
    const bot = this.newBot(seat, level, name, look)
    this.change(() => {
      this.members.set(bot.id, bot)
      this.saveMembers()
    })
  }

  /** A computer member in `seat`, at `level`, named `name` (one of the game's `bots.names`) */
  private newBot(seat: number, level: string, name: string, look: string | null): MemberRecord {
    return {
      id: this.deps.newMemberId(),
      name,
      // Never sent to anyone: nobody can come back as a computer member
      token: this.deps.newToken(),
      seat,
      ready: true,
      conn: null,
      offlineAt: null,
      absent: false,
      bot: { level, name },
      ...(look !== null ? { look } : {}),
    }
  }

  private ready(conn: string, member: MemberRecord, ready: boolean): void {
    const room = this.requireRoom()
    if (room.status !== 'waiting') return this.refuse(conn, 'wrong_status')
    if (member.seat === null) return this.refuse(conn, 'not_seated')
    if (member.ready === ready) return
    this.change(() => {
      member.ready = ready
      this.saveMembers()
    })
  }

  private start(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status !== 'waiting') return this.refuse(conn, 'wrong_status')
    if (this.waitsOnReady(room) && this.notReady(room).length > 0) {
      return this.refuse(conn, 'not_ready')
    }
    this.beginFromSeats(conn, room)
  }

  /** The room's game starts only once everyone seated is ready (`GameMeta.readyCheck`) */
  private waitsOnReady(room: RoomRecord): boolean {
    return this.deps.games(room.gameId)?.meta.readyCheck === true
  }

  /** Seated people, the host aside, not ready yet: offline counts as not ready (shared/protocol.ts 8.) */
  private notReady(room: RoomRecord): MemberRecord[] {
    return [...this.members.values()].filter(
      (other) =>
        other.seat !== null &&
        other.bot === undefined &&
        other.id !== room.hostId &&
        (!other.ready || other.conn === null),
    )
  }

  private rematch(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status !== 'ended') return this.refuse(conn, 'wrong_status')
    this.beginFromSeats(conn, room)
  }

  /** A new game for whoever is seated, in place of the finished one if there is one */
  private beginFromSeats(conn: string, room: RoomRecord): void {
    const seated = [...this.members.values()]
      .filter((other) => other.seat !== null)
      .sort((a, b) => (a.seat as number) - (b.seat as number))
    if (seated.length < room.minPlayers) return this.refuse(conn, 'not_enough_players')
    if (this.deps.gameEnabled?.(room.gameId) === false) return this.refuse(conn, 'game_disabled')
    const module = this.deps.games(room.gameId)
    const game =
      module &&
      beginGame(
        module,
        // Each seat with the side its member chose, if any (shared/protocol.ts 15.), and whether a
        // computer sits there (Seat.bot)
        seated.map((other, id) => ({
          id,
          ...(other.team !== undefined ? { team: other.team } : {}),
          ...(other.bot ? { bot: true as const } : {}),
        })),
        // Checked again: a room made before a game's options changed may hold values it no longer has
        parseOptions(module.options, room.options),
        this.deps.newSeed(),
        this.deps.now(),
      )
    if (!game) return this.refuse(conn, 'game_failed')
    const oldSteps = this.game?.steps ?? 0
    game.holders = Object.fromEntries(seated.map((other, index) => [String(index), other.id]))
    this.change(() => {
      seated.forEach((other, index) => {
        other.seat = index
      })
      // The next waiting room starts over
      for (const other of this.members.values()) other.ready = false
      this.saveMembers()
      this.deps.storage.dropSteps(oldSteps)
      this.game = game
      this.deps.storage.saveGame(game)
      room.status = 'playing'
      this.deps.storage.saveRoom(room)
    })
    this.deps.metric?.('game_started', game.gameId)
    this.runClock()
  }

  /** `forSeat`: the host acting for a computer seat (shared/protocol.ts 14.), else null */
  private act(conn: string, member: MemberRecord, action: JsonValue, forSeat: number | null): void {
    const room = this.requireRoom()
    const game = this.game
    if (room.status !== 'playing' || !game) return this.refuse(conn, 'no_game')
    // The seat is the one this socket's member holds: nothing in the message can say otherwise,
    // but for the host's computer seats
    if (forSeat !== null && !this.isBotSeatFor(member, forSeat)) {
      return this.refuse(conn, 'forbidden')
    }
    const seat = forSeat ?? member.seat
    if (seat === null) return this.refuse(conn, 'not_seated')
    const module = this.deps.games(game.gameId)
    if (!module) return this.refuse(conn, 'game_failed')
    const outcome = playAction(module, game, action, seat, this.deps.now())
    if (outcome.kind === 'refused') {
      this.deps.sockets.send(conn, { t: 'error', code: 'game_error', error: outcome.error })
      return
    }
    if (outcome.kind === 'failed') return this.refuse(conn, 'game_failed')
    this.accept(room, game.steps, outcome)
  }

  private accept(
    room: RoomRecord,
    step: number,
    outcome: Extract<ActionOutcome, { kind: 'accepted' }>,
  ): void {
    this.change(() => {
      this.game = outcome.game
      this.deps.storage.saveGame(outcome.game)
      this.deps.storage.saveStep(step, outcome.step)
      if (outcome.over) {
        room.status = 'ended'
        this.deps.storage.saveRoom(room)
      }
    })
    if (outcome.over) this.deps.metric?.('game_finished', outcome.game.gameId)
    else this.runClock()
  }

  /**
   * Every timer that ran out, as `actor: 'system'`. Each one is spent first, so that an action the
   * game refuses, or a module that throws, cannot make the room fire it for ever.
   */
  private fireTimers(now: number): void {
    const room = this.room
    if (!room) return
    while (room.status === 'playing' && this.game) {
      const game = this.game
      const timer = dueTimer(game, now)
      if (!timer) return
      const spent = spendTimer(game, timer.id)
      const module = this.deps.games(game.gameId)
      const outcome: ActionOutcome = module
        ? playAction(module, spent, timer.action, 'system', now)
        : { kind: 'failed' }
      if (outcome.kind === 'accepted') {
        this.accept(room, game.steps, outcome)
        continue
      }
      if (outcome.kind === 'refused') {
        // A timer's action is the module's own: being refused is a bug, not a player's mistake
        console.error(`game ${game.gameId}: timer ${timer.id} refused: ${outcome.error.gameError}`)
      }
      this.change(() => {
        this.game = spent
        this.deps.storage.saveGame(spent)
      })
    }
  }

  private markAbsent(now: number): void {
    if (!this.room) return
    const gone = [...this.members.values()].filter(
      (member) =>
        !member.absent &&
        member.conn === null &&
        member.offlineAt !== null &&
        now - member.offlineAt >= RECONNECT_GRACE_MS,
    )
    if (gone.length === 0) return
    this.change(() => {
      for (const member of gone) member.absent = true
      this.saveMembers()
    })
  }

  /**
   * While `waiting` or `ended`, members offline for SEAT_RELEASE_MS give up their seats
   * (shared/protocol.ts 17.); being absent by now, `removeAbsentSpectators` then removes them
   */
  private releaseSeats(now: number): void {
    const room = this.room
    if (!room || room.status === 'playing') return
    const gone = [...this.members.values()].filter(
      (member) =>
        !member.bot &&
        member.seat !== null &&
        member.conn === null &&
        member.offlineAt !== null &&
        now - member.offlineAt >= SEAT_RELEASE_MS,
    )
    if (gone.length === 0) return
    this.change(() => {
      for (const member of gone) {
        member.seat = null
        member.ready = false
      }
      this.saveMembers()
    })
  }

  /**
   * Going on purpose (shared/protocol.ts 17.): the host passes on at once; the member is removed,
   * but for a seat in a game under way, which stays theirs, absent from now on
   */
  private leave(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    const keepsSeat =
      room.status === 'playing' &&
      member.seat !== null &&
      this.game?.seats.some((seat) => seat.id === member.seat) === true
    const wasHost = member.id === room.hostId
    // Gone first, so that nothing below is sent to it and its close tells nobody it went offline
    this.conns.delete(conn)
    this.deps.sockets.close(conn, CloseCode.left, 'left')
    this.change(() => {
      if (keepsSeat) {
        member.conn = null
        member.offlineAt = this.deps.now()
        member.absent = true
        member.ready = false
      } else {
        this.members.delete(member.id)
        this.chatRate.forget(member.id)
      }
      this.saveMembers()
      if (wasHost) {
        room.hostId = this.nextHost(member.id)
        this.deps.storage.saveRoom(room)
      }
    })
    if (wasHost) this.abandonBots()
    if (this.conns.size === 0) this.sweepAt = null
  }

  /** Who takes over from `leaving`: online first, seated first, earliest first; null for nobody */
  private nextHost(leaving: string): string | null {
    const people = [...this.members.values()].filter(
      (other) => other.id !== leaving && !other.bot,
    )
    const online = people.filter((other) => other.conn !== null)
    const next =
      online.find((other) => other.seat !== null) ??
      online[0] ??
      people.find((other) => !other.absent) ??
      people[0]
    return next?.id ?? null
  }

  private replaceAbsentHost(): void {
    const room = this.room
    const host = room?.hostId == null ? undefined : this.members.get(room.hostId)
    if (!room || !host || !host.absent) return
    const online = [...this.members.values()].filter((other) => other.conn !== null)
    const next = online.find((other) => other.seat !== null) ?? online[0]
    if (!next) return
    this.change(() => {
      room.hostId = next.id
      this.deps.storage.saveRoom(room)
    })
    this.abandonBots()
  }

  /** They hold no seat and take up one of MAX_MEMBERS; returning, they are someone new */
  private removeAbsentSpectators(): void {
    const room = this.room
    if (!room) return
    const gone = [...this.members.values()].filter(
      (member) => member.absent && member.seat === null && member.id !== room.hostId,
    )
    if (gone.length === 0) return
    this.change(() => {
      for (const member of gone) {
        this.members.delete(member.id)
        this.chatRate.forget(member.id)
      }
      this.saveMembers()
    })
  }

  /** The seats the game is waiting for whose player is absent or gone, and what each allows */
  private coverable(): CoverableSeat[] {
    const game = this.game
    if (this.room?.status !== 'playing' || !game) return []
    const module = this.deps.games(game.gameId)
    if (!module) return []
    const coverable: CoverableSeat[] = []
    for (const { id: seat } of game.seats) {
      if (!this.isSeatVacated(seat)) continue
      const options = coverOptions(module, game, seat)
      if (options) {
        coverable.push({ seat, skip: options.skip !== null, proxy: options.proxy.length > 0 })
      }
    }
    return coverable
  }

  private isSeatVacated(seat: number): boolean {
    const holder = [...this.members.values()].find((member) => member.seat === seat)
    return !holder || holder.absent
  }

  private cover(conn: string, member: MemberRecord, seat: number, how: 'skip' | 'proxy'): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    const game = this.game
    const module = game && this.deps.games(game.gameId)
    const seated = game?.seats.some((other) => other.id === seat) === true
    if (room.status !== 'playing' || !game || !module || !seated || !this.isSeatVacated(seat)) {
      return this.refuse(conn, 'cannot_cover')
    }
    const options = coverOptions(module, game, seat)
    if (!options) return this.refuse(conn, 'cannot_cover')
    const now = this.deps.now()
    let outcome: ActionOutcome
    if (how === 'skip') {
      if (options.skip === null) return this.refuse(conn, 'cannot_cover')
      outcome = playAction(module, game, options.skip, 'system', now)
    } else {
      if (options.proxy.length === 0) return this.refuse(conn, 'cannot_cover')
      // Not the game's own Rng: which action was picked goes into the steps, like any other action
      const action = createRng(this.deps.newSeed()).pick(options.proxy)
      outcome = playAction(module, game, action, seat, now)
    }
    if (outcome.kind === 'refused') return this.refuse(conn, 'cannot_cover')
    if (outcome.kind === 'failed') return this.refuse(conn, 'game_failed')
    this.accept(room, game.steps, outcome)
  }

  private postChat(conn: string, member: MemberRecord, text: string): void {
    const now = this.deps.now()
    // Before the limit: being refused for a closed chat should not use up someone's allowance
    if (this.room?.status === 'playing' && this.isChatLocked()) {
      return this.refuse(conn, 'chat_locked')
    }
    if (!this.chatRate.take(member.id, now)) return this.refuse(conn, 'rate_limited')
    const message: ChatMessage = {
      id: ++this.chatId,
      from: member.id,
      name: member.name,
      text,
      at: now,
    }
    this.chat.push(message)
    this.deps.storage.saveChat(message)
    while (this.chat.length > CHAT_HISTORY) {
      this.deps.storage.dropChat((this.chat.shift() as ChatMessage).id)
    }
    for (const [open, { member: id }] of this.conns) {
      if (id !== null) this.deps.sockets.send(open, { t: 'chat', messages: [message] })
    }
  }

  /** e7-t11: passed on, never stored; allowed when the chat is not, since it says nothing */
  private react(member: MemberRecord, reaction: number): void {
    const now = this.deps.now()
    const last = this.reactedAt.get(member.id)
    if (last !== undefined && now - last < REACTION_MIN_MS) return
    this.reactedAt.set(member.id, now)
    for (const [open, { member: id }] of this.conns) {
      if (id !== null) this.deps.sockets.send(open, { t: 'reaction', member: member.id, reaction })
    }
  }

  private isChatLocked(): boolean {
    const game = this.game
    const module = game && this.deps.games(game.gameId)
    if (!game || !module) return false
    return projectFor(module, game, 'spectator')?.chatLocked === true
  }

  private reopen(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status === 'waiting') return this.refuse(conn, 'wrong_status')
    this.change(() => {
      this.dropGame()
      room.status = 'waiting'
      this.deps.storage.saveRoom(room)
    })
  }

  private setGame(
    conn: string,
    member: MemberRecord,
    gameId: string,
    rawOptions: OptionValues | undefined,
  ): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    const module = this.deps.games(gameId)
    if (!module) return this.refuse(conn, 'bad_game')
    if (this.deps.gameEnabled?.(gameId) === false) return this.refuse(conn, 'game_disabled')
    this.change(() => {
      this.dropGame()
      room.gameId = gameId
      room.options = parseOptions(module.options, rawOptions)
      room.minPlayers = module.meta.minPlayers
      room.maxSeats = module.meta.maxPlayers
      room.status = 'waiting'
      this.deps.storage.saveRoom(room)
      // A game without computer seats has no computer members, and one whose computer players are
      // other ones (another level or name: the kart's and the table games') has none of these
      const bots = module.bots
      for (const other of [...this.members.values()]) {
        const fits =
          other.bot !== undefined &&
          bots !== undefined &&
          bots.levels.includes(other.bot.level) &&
          bots.names.includes(other.bot.name)
        if (other.bot && !fits) this.members.delete(other.id)
      }
      // After the new maxSeats: those without a seat in this game take one that is left, if any
      const others = [...this.members.values()]
      const homeless = others.filter((other) => other.seat !== null && other.seat >= room.maxSeats)
      for (const other of homeless) other.seat = null
      for (const other of homeless) other.seat = this.lowestFreeSeat()
      // A computer member left without a seat would only watch: it goes
      for (const other of homeless) {
        if (other.bot && other.seat === null) this.members.delete(other.id)
      }
      for (const other of others) other.ready = false
      this.saveMembers()
    })
  }

  /** `patch` (shared/protocol.ts 16.): `rawOptions` are only the fields that change */
  private setOptions(
    conn: string,
    member: MemberRecord,
    rawOptions: OptionValues,
    patch: boolean,
  ): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status !== 'waiting') return this.refuse(conn, 'wrong_status')
    const module = this.deps.games(room.gameId)
    if (!module) return this.refuse(conn, 'bad_game')
    // A hidden option (types.ts) stays as the room was made: the form does not know it
    const options = keepHidden(
      module.options,
      room.options,
      patch ? { ...room.options, ...rawOptions } : rawOptions,
    )
    this.change(() => {
      room.options = options
      this.deps.storage.saveRoom(room)
      for (const other of this.members.values()) other.ready = false
      this.saveMembers()
    })
  }

  /** shared/protocol.ts 19.: in any status; only listed while waiting, with no password */
  private setPublic(conn: string, member: MemberRecord, value: boolean): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.public === value) return
    this.change(() => {
      room.public = value
      this.deps.storage.saveRoom(room)
    })
  }

  /** e1-t16: in any status, since it only decides who new may come in */
  private setPassword(conn: string, member: MemberRecord, password: string | null): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    this.change(() => {
      if (password === null) delete room.password
      else room.password = password
      this.deps.storage.saveRoom(room)
    })
  }

  private transfer(conn: string, member: MemberRecord, targetId: string): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    const target = this.members.get(targetId)
    if (!target || target === member || target.conn === null) {
      return this.refuse(conn, 'bad_member')
    }
    this.change(() => {
      room.hostId = target.id
      this.deps.storage.saveRoom(room)
    })
    // The new host's browser is not running the computer karts
    this.abandonBots()
  }

  private kick(conn: string, member: MemberRecord, targetId: string): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    const target = this.members.get(targetId)
    if (!target || target === member) return this.refuse(conn, 'bad_member')
    if (target.bot) {
      // A computer member leaves with no ban, and not from a game under way
      if (room.status === 'playing') return this.refuse(conn, 'wrong_status')
      this.change(() => {
        this.members.delete(target.id)
        this.saveMembers()
      })
      return
    }
    if (target.conn !== null) {
      // Gone first, so that nothing below is sent to it and its close tells nobody it went offline
      this.conns.delete(target.conn)
      this.deps.sockets.close(target.conn, CloseCode.kicked, 'kicked')
    }
    const now = this.deps.now()
    this.change(() => {
      this.members.delete(target.id)
      this.chatRate.forget(target.id)
      this.saveMembers()
      room.bans = [
        ...room.bans.filter((ban) => ban.until > now),
        {
          token: target.token,
          until: now + KICK_BAN_MS,
          ...(target.account !== undefined ? { account: target.account } : {}),
          ...(target.address !== undefined && target.address !== UNKNOWN_ADDRESS
            ? { address: target.address, name: target.name }
            : {}),
        },
      ]
      this.deps.storage.saveRoom(room)
    })
  }

  private dissolve(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    this.wipe(CloseCode.dissolved, 'dissolved')
  }

  /** Closes every socket and forgets the whole room, in memory and in storage */
  private wipe(code: number, reason: string): void {
    for (const open of this.conns.keys()) this.deps.sockets.close(open, code, reason)
    this.conns.clear()
    this.members.clear()
    this.room = null
    this.game = null
    this.rev = 0
    this.sweepAt = null
    this.chat = []
    this.chatId = 0
    this.acks.clear()
    this.deps.storage.clearAll()
  }

  /** Part of a `change`: forgets the game and its steps, if there is one */
  private dropGame(): void {
    const steps = this.game?.steps ?? 0
    this.game = null
    this.deps.storage.saveGame(null)
    this.deps.storage.dropSteps(steps)
  }

  // ── Computer players the room moves (2026-11-20) ─────────────────────────────────────────

  /**
   * Brings `botTurns` in line with the game after anything that may have changed it: the computer
   * seat whose turn it is, a moment from when its turn came (or, for a game with `botTime`, each
   * computer seat that wants to move, when it said); none when no computer seat can move, the game's
   * module does not play them, or nobody is in the room to watch (they wait for someone to come back
   * rather than play on to an empty room)
   */
  private settleBots(): void {
    const game = this.game
    const module = game ? this.deps.games(game.gameId) : null
    if (!game || !module?.bot || !this.botsMayPlay()) {
      this.botTurns.clear()
      return
    }
    if (module.botTime) {
      this.settleTimedBots(module, game)
      return
    }
    const seat = this.botSeatToMove()
    const kept = seat === null ? undefined : this.botTurns.get(seat)
    this.botTurns.clear()
    if (seat === null) return
    const key = `${game.seed}:${game.steps}:${seat}`
    if (kept?.key === key) {
      this.botTurns.set(seat, kept)
      return
    }
    // 0.6 to 1.5 s: long enough to read as a move, short enough not to drag
    const spread = BOT_THINK_MS.max - BOT_THINK_MS.min + 1
    const think = BOT_THINK_MS.min + createRng(this.deps.newSeed()).int(spread)
    this.botTurns.set(seat, { key, at: this.deps.now() + think })
  }

  /**
   * `botTime`'s games: every computer seat on its own clock, counted from the game's last change
   * (`StoredGame.steppedAt`) with a wait seeded from the moment itself, so that working it out again
   * after waking up gives the same time
   */
  private settleTimedBots(module: AnyGameModule, game: StoredGame): void {
    const since = game.steppedAt ?? this.deps.now()
    const turns = new Map<number, { key: string; at: number }>()
    for (const { seat, level } of this.botSeats(game)) {
      const key = `${game.seed}:${game.steps}:${seat}`
      const kept = this.botTurns.get(seat)
      if (kept?.key === key) {
        turns.set(seat, kept)
        continue
      }
      const projection = projectFor(module, game, seat)
      if (!projection) continue
      let wait: number | null = null
      try {
        const legal = botLegal(module, projection.legal)
        wait = module.botTime?.(projection.view, legal, level, createRng(hashKey(key))) ?? null
      } catch (error) {
        console.error(`game ${game.gameId}: botTime threw`, error)
      }
      if (wait !== null && Number.isFinite(wait)) turns.set(seat, { key, at: since + Math.max(0, wait) })
    }
    this.botTurns.clear()
    for (const [seat, turn] of turns) this.botTurns.set(seat, turn)
  }

  /** Whether computer seats may move now: a game is on and some person is in the room to watch */
  private botsMayPlay(): boolean {
    if (this.room?.status !== 'playing' || !this.game) return false
    return [...this.members.values()].some((member) => !member.bot && member.conn !== null)
  }

  /** The room's computer members seated in `game`, in seat order, with their levels */
  private botSeats(game: StoredGame): { seat: number; level: string }[] {
    return [...this.members.values()]
      .filter((member) => member.bot && member.seat !== null && game.seats.some((one) => one.id === member.seat))
      .map((member) => ({ seat: member.seat as number, level: member.bot?.level ?? '' }))
      .sort((a, b) => a.seat - b.seat)
  }

  /** The first computer seat (in seat order) that has something to do now, or null */
  private botSeatToMove(): number | null {
    const game = this.game
    if (!game || !this.botsMayPlay()) return null
    const module = this.deps.games(game.gameId)
    if (!module?.bot) return null
    for (const { seat, level } of this.botSeats(game)) {
      try {
        // What the game leaves to the people (the next round's button) is not a computer's to press
        if (botLegal(module, module.legalActions(game.match.state, seat)).length > 0) return seat
        // Out of turn, a policy may still have something to say (holdem's coming back from sitting
        // out): asked with what its browser would get, and a throwaway Rng
        const projection = projectFor(module, game, seat)
        if (projection && module.bot(projection.view, [], level, createRng(0)) !== null) return seat
      } catch (error) {
        console.error(`game ${game.gameId}: legalActions threw`, error)
        return null
      }
    }
    return null
  }

  /**
   * The computer seat's move, once its moment has come (the earliest, when several are due): its
   * policy picks from exactly what its browser would get (`projectFor`), and the action goes in as
   * that seat's, like anyone's. A policy that throws, answers nothing or answers something refused
   * gets a random legal action instead, so a computer player can never hold a game up
   */
  private playBot(now: number): void {
    const room = this.room
    const game = this.game
    let seat: number | null = null
    let due: { key: string; at: number } | null = null
    for (const [one, turn] of this.botTurns) {
      const earlier = due === null || turn.at < due.at || (turn.at === due.at && one < (seat as number))
      if (turn.at <= now && earlier) {
        seat = one
        due = turn
      }
    }
    if (seat === null || !due || !room || !game) return
    const module = this.deps.games(game.gameId)
    const stillDue = module?.botTime
      ? this.botsMayPlay() && due.key === `${game.seed}:${game.steps}:${seat}`
      : this.botSeatToMove() === seat
    const member = [...this.members.values()].find((one) => one.bot && one.seat === seat)
    const projection = module ? projectFor(module, game, seat) : null
    if (!stillDue || !module?.bot || !member?.bot || !projection) {
      this.botTurns.delete(seat)
      return
    }
    const rng = createRng(this.deps.newSeed())
    const legal = botLegal(module, projection.legal)
    let action: JsonValue | null = null
    try {
      action = module.bot(projection.view, legal, member.bot.level, rng)
    } catch (error) {
      console.error(`game ${game.gameId}: bot threw`, error)
    }
    let outcome: ActionOutcome | null =
      action === null ? null : playAction(module, game, action, seat, now)
    if (outcome?.kind !== 'accepted') {
      if (outcome?.kind === 'refused') {
        console.error(`game ${game.gameId}: bot action refused: ${outcome.error.gameError}`)
      }
      outcome =
        legal.length > 0
          ? playAction(module, game, rng.pick(legal), seat, now)
          : null
    }
    if (outcome?.kind === 'accepted') {
      // A fresh moment for whatever comes next, even the same seat again (holdem's vote, then its bet)
      this.botTurns.clear()
      this.accept(room, game.steps, outcome)
      return
    }
    // Not even a legal action went in: a module bug. No more tries until something else changes
    console.error(`game ${game.gameId}: no computer move was accepted`)
    this.botTurns.set(seat, { key: due.key, at: Number.POSITIVE_INFINITY })
  }

  // ── Telling the sockets ────────────────────────────────────────────────────────────────────

  /**
   * The one way the room changes once people are in it: runs `mutate`, moves `rev` on and sends
   * every joined socket the difference for its own viewer. Everyone gets a patch for every `rev`,
   * empty if nothing they can see changed, so a gap always means a message went missing.
   */
  private change(mutate: () => void): void {
    const timersBefore = this.timersKey()
    const viewBefore = this.viewBuilder()
    const before = new Map<string, RoomView>()
    for (const [conn, { member }] of this.conns) {
      const record = member === null ? undefined : this.members.get(member)
      if (record) before.set(conn, viewBefore(record))
    }
    mutate()
    this.rev++
    this.deps.storage.saveRev(this.rev)
    this.settleBots()
    const viewAfter = this.viewBuilder()
    for (const [conn, previous] of before) {
      const member = this.conns.get(conn)?.member
      const record = member == null ? undefined : this.members.get(member)
      if (!record) continue
      this.deps.sockets.send(conn, {
        t: 'patch',
        rev: this.rev,
        ops: diff(previous as JsonValue, viewAfter(record) as JsonValue),
      })
    }
    if (this.timersKey() !== timersBefore) {
      const timers = this.timers()
      for (const conn of before.keys()) {
        if (this.conns.has(conn)) this.deps.sockets.send(conn, { t: 'timer', timers })
      }
    }
  }

  private timers(): TimerInfo[] {
    return timerInfos(this.game, this.deps.now())
  }

  /** Changes when a countdown starts or stops, not as time passes */
  private timersKey(): string {
    const running = (this.game?.timers ?? []).filter((timer) => !timer.spent)
    return JSON.stringify(running.map((timer) => [timer.id, timer.endsAt]))
  }

  /**
   * Builds members' views of the room as it is now. Only the game part differs between viewers, and
   * only here does a viewer's game come from: `projectFor`, for the viewer this member's seat says.
   */
  private viewBuilder(): (member: MemberRecord) => RoomView {
    const room = this.requireRoom()
    const coverable = this.coverable()
    const shared: RoomView['room'] = {
      id: room.id,
      gameId: room.gameId,
      status: room.status,
      options: room.options,
      minPlayers: room.minPlayers,
      maxSeats: room.maxSeats,
      ...(room.code ? { code: room.code } : {}),
      ...(room.password !== undefined ? { password: room.password } : {}),
      ...(room.public ? { public: true as const } : {}),
    }
    const members: Record<string, RoomMember> = {}
    for (const member of this.members.values()) {
      members[member.id] = {
        id: member.id,
        name: member.name,
        seat: member.seat,
        // A computer member is always set, and always there
        ready: member.ready || member.bot !== undefined,
        host: member.id === room.hostId,
        online: member.conn !== null || member.bot !== undefined,
        absent: member.absent,
        ...(member.look !== undefined ? { look: member.look } : {}),
        ...(member.team !== undefined ? { team: member.team } : {}),
        ...(member.bot ? { bot: { ...member.bot } } : {}),
      }
    }
    const game = this.game
    const projections = new Map<Viewer, GameProjection | null>()
    return (member) => {
      if (!game) return { room: shared, members, game: null, coverable }
      // Someone who took a free seat after the game has no seat in it, also one left by someone who
      // was (`StoredGame.holders`: a kick, `leave`, a seat given up)
      const inGame =
        game.seats.some((seat) => seat.id === member.seat) &&
        (game.holders === undefined || game.holders[String(member.seat)] === member.id)
      const viewer: Viewer = inGame ? (member.seat as number) : 'spectator'
      let projection = projections.get(viewer)
      if (projection === undefined) {
        projection = projectFor(this.deps.games(game.gameId), game, viewer)
        projections.set(viewer, projection)
      }
      return { room: shared, members, game: projection, coverable }
    }
  }

  /**
   * `session` (shared/protocol.ts 20.): the page's; the same as before, `ack` says how far the room
   * got with it, and a new one starts over at 0
   */
  private welcome(conn: string, member: MemberRecord, session: string | null = null): void {
    let ack: number | undefined
    if (session !== null) {
      const handled = this.acks.get(member.id)
      if (handled?.session === session) ack = handled.seq
      else {
        ack = 0
        const fresh = { session, seq: 0 }
        this.acks.set(member.id, fresh)
        this.deps.storage.saveAck?.(member.id, fresh)
      }
    }
    this.deps.sockets.send(conn, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      you: member.id,
      token: member.token,
      rev: this.rev,
      state: this.viewBuilder()(member),
      ...(ack !== undefined ? { ack } : {}),
    })
    const timers = this.timers()
    if (timers.length > 0) this.deps.sockets.send(conn, { t: 'timer', timers })
    // Always the first chunk, with `reset`: someone coming back must drop what they have
    for (let from = 0; from === 0 || from < this.chat.length; from += CHAT_CHUNK) {
      const messages = this.chat.slice(from, from + CHAT_CHUNK)
      this.deps.sockets.send(
        conn,
        from === 0 ? { t: 'chat', messages, reset: true } : { t: 'chat', messages },
      )
    }
  }

  private refuse(conn: string, code: ErrorCode): void {
    this.deps.sockets.send(conn, { t: 'error', code })
  }

  /** Closes a socket on the room's own decision */
  private drop(conn: string, code: number, reason: string): void {
    const connection = this.conns.get(conn)
    if (!connection) return
    this.conns.delete(conn)
    this.deps.sockets.close(conn, code, reason)
    this.markOffline(conn, connection)
  }

  private markOffline(conn: string, connection: Connection): void {
    const member = connection.member === null ? undefined : this.members.get(connection.member)
    if (!member || member.conn !== conn) return
    const room = this.room
    this.change(() => {
      member.conn = null
      member.offlineAt = this.deps.now()
      // Gone from a room that waits on everyone's ready: they say it again when they are back
      if (room && room.status === 'waiting' && this.waitsOnReady(room)) member.ready = false
      this.saveMembers()
    })
    // The host's browser ran the computer karts: nobody does now (shared/protocol.ts 14.)
    if (member.id === this.room?.hostId) this.abandonBots()
  }

  private saveMembers(): void {
    this.deps.storage.saveMembers([...this.members.values()])
  }

  private isBanned(token: string): boolean {
    const now = this.deps.now()
    return this.requireRoom().bans.some((ban) => ban.token === token && ban.until > now)
  }

  /**
   * Someone new, kicked under another token (shared/protocol.ts 18.): the same club account, or the
   * same address and the same name. The address alone is not enough: a campus shares one
   */
  private isBannedNewcomer(connection: Connection, name: string): boolean {
    const now = this.deps.now()
    const account = connection.account?.id
    const address = connection.address
    return this.requireRoom().bans.some(
      (ban) =>
        ban.until > now &&
        ((account !== undefined && ban.account === account) ||
          (address !== null &&
            ban.address === address &&
            ban.name !== undefined &&
            sameName(ban.name, name))),
    )
  }

  private findByToken(token: string): MemberRecord | undefined {
    return [...this.members.values()].find((member) => member.token === token)
  }

  private lowestFreeSeat(): number | null {
    const room = this.requireRoom()
    if (room.status !== 'waiting') return null
    const taken = new Set([...this.members.values()].map((member) => member.seat))
    for (let seat = 0; seat < room.maxSeats; seat++) if (!taken.has(seat)) return seat
    return null
  }

  private requireRoom(): RoomRecord {
    if (!this.room) throw new Error('The room was not created')
    return this.room
  }
}
