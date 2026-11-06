import { CHAT_CHUNK, CHAT_HISTORY, ChatRateLimit, type ChatMessage } from '../shared/chat.ts'
import type { ReplayStep } from '../shared/games/match.ts'
import { parseOptions } from '../shared/games/options.ts'
import { createRng } from '../shared/games/rng.ts'
import type { AnyGameModule, GameProjection, OptionValues, Viewer } from '../shared/games/types.ts'
import { diff, type JsonValue } from '../shared/patch.ts'
import {
  CloseCode,
  JOIN_TIMEOUT_MS,
  KICK_BAN_MS,
  MAX_CONNECTIONS,
  MAX_MEMBERS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
  parseClientMessage,
  uniqueName,
  type CoverableSeat,
  type ErrorCode,
  type RoomMember,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
  type ServerMessage,
  type TimerInfo,
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
  /** Seat tokens that cannot join yet. Never part of a view */
  bans: { token: string; until: number }[]
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
}

/** One open socket, as the socket itself remembers it through hibernation */
export type OpenSocket = { conn: string; openedAt: number }

/** All the room keeps between two wake-ups, apart from the steps, which only a replay reads */
export type StoredRoom = {
  room: RoomRecord | null
  members: MemberRecord[]
  rev: number
  game: StoredGame | null
  /** Any order */
  chat: ChatMessage[]
}

export type RoomHostDeps = {
  sockets: {
    send(conn: string, message: ServerMessage): void
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
    /** Forgets the whole room */
    clearAll(): void
  }
  games(id: string): AnyGameModule | null
  now(): number
  newMemberId(): string
  newToken(): string
  /** A uint32 for a new game's Rng, or for picking a turn played for someone */
  newSeed(): number
}

export type Admission = { ok: true } | { ok: false; code: number; reason: string }

type Connection = { openedAt: number; lastSeen: number; member: string | null }

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

  constructor(deps: RoomHostDeps) {
    this.deps = deps
  }

  /**
   * After waking up: `sockets` are the ones the runtime kept. All of them, also one that is closing
   * right now: its `closed` follows, and tells the others that member went offline. A member whose
   * socket is not among them lost it in a restart, which closes every socket and tells nobody.
   */
  restore(stored: StoredRoom, sockets: OpenSocket[], alarmAt: number | null): void {
    // A room or game from before bans and timers existed has neither
    this.room = stored.room && { ...stored.room, bans: stored.room.bans ?? [] }
    this.rev = stored.rev
    this.game = stored.game && { ...stored.game, timers: stored.game.timers ?? [] }
    this.chat = [...(stored.chat ?? [])].sort((a, b) => a.id - b.id).slice(-CHAT_HISTORY)
    this.chatId = this.chat.at(-1)?.id ?? 0
    this.members.clear()
    this.conns.clear()
    for (const { conn, openedAt } of sockets) {
      // `heartbeat` brings lastSeen up to date before each sweep
      this.conns.set(conn, { openedAt, lastSeen: openedAt, member: null })
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
        conn
          ? { ...member, offlineAt: null, absent: false }
          : { ...member, conn: null, offlineAt: member.offlineAt ?? this.deps.now() },
      )
    }
  }

  // ── Before joining ─────────────────────────────────────────────────────────────────────────

  /** False when the room exists already, or there is no such game: the caller checks that first */
  create(id: string, gameId: string, rawOptions: unknown): boolean {
    const module = this.deps.games(gameId)
    if (this.room || !module) return false
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
    }
    this.deps.storage.saveRoom(this.room)
    return true
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
    }
  }

  /** May this upgrade become a socket of the room? */
  admit(version: string | null): Admission {
    if (version !== String(PROTOCOL_VERSION)) {
      return { ok: false, code: CloseCode.versionMismatch, reason: 'protocol version mismatch' }
    }
    if (!this.room) return { ok: false, code: CloseCode.roomNotFound, reason: 'room not found' }
    if (this.conns.size >= MAX_CONNECTIONS) {
      return { ok: false, code: CloseCode.roomFull, reason: 'room full' }
    }
    return { ok: true }
  }

  opened(conn: string, openedAt: number): void {
    this.conns.set(conn, { openedAt, lastSeen: openedAt, member: null })
    this.sweepAt ??= this.deps.now() + SWEEP_INTERVAL_MS
  }

  // ── Sockets ────────────────────────────────────────────────────────────────────────────────

  /** A text frame from a socket. Never throws for anything a client can send */
  message(conn: string, raw: string): void {
    const connection = this.conns.get(conn)
    if (!connection || !this.room) return
    connection.lastSeen = this.deps.now()
    const message = parseClientMessage(raw)
    if (!message) {
      this.drop(conn, CloseCode.badMessage, 'bad message')
      return
    }
    if (message.t === 'join') {
      if (connection.member !== null) this.refuse(conn, 'forbidden')
      else this.join(conn, connection, message.name, message.token)
      return
    }
    const member = connection.member === null ? undefined : this.members.get(connection.member)
    if (!member) {
      this.refuse(conn, 'not_joined')
      return
    }
    switch (message.t) {
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
        this.act(conn, member, message.action)
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
        this.setOptions(conn, member, message.options)
        return
      case 'chat':
        this.postChat(conn, member, message.text)
        return
      case 'cover':
        this.cover(conn, member, message.seat, message.how)
        return
    }
  }

  /** Binary frames are not part of the protocol */
  badFrame(conn: string): void {
    if (this.conns.has(conn)) this.drop(conn, CloseCode.badMessage, 'bad message')
  }

  /** The socket closed. The member keeps its seat and its token */
  closed(conn: string): void {
    const connection = this.conns.get(conn)
    if (!connection) return
    this.conns.delete(conn)
    this.markOffline(conn, connection)
    if (this.conns.size === 0) this.sweepAt = null
  }

  /** When the runtime last answered this socket's `ping` by itself, without waking the room */
  heartbeat(conn: string, at: number): void {
    const connection = this.conns.get(conn)
    if (connection && at > connection.lastSeen) connection.lastSeen = at
  }

  /**
   * The alarm, for whichever job it came for: closes sockets that never joined or went silent, fires
   * the game's timers that ran out and deals with members who have been gone too long.
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
    this.markAbsent(now)
    this.replaceAbsentHost()
    this.removeAbsentSpectators()
    this.sweepAt = this.conns.size > 0 ? now + SWEEP_INTERVAL_MS : null
  }

  /** When the alarm should fire next; null for no alarm. e1-t10 adds its job here */
  nextAlarm(): number | null {
    const timerAt = this.game && this.room?.status === 'playing' ? nextTimerAt(this.game) : null
    if (timerAt === null) return this.sweepAt
    return this.sweepAt === null ? timerAt : Math.min(this.sweepAt, timerAt)
  }

  // ── What members do ────────────────────────────────────────────────────────────────────────

  private join(conn: string, connection: Connection, name: string, token: string | null): void {
    if (token !== null && this.isBanned(token)) {
      this.drop(conn, CloseCode.kicked, 'kicked')
      return
    }
    const known = token === null ? undefined : this.findByToken(token)
    if (known) {
      if (known.conn !== null) {
        // A second tab, or a reload that beat the old socket's close
        this.conns.delete(known.conn)
        this.deps.sockets.close(known.conn, CloseCode.replaced, 'replaced')
      }
      this.change(() => {
        known.conn = conn
        known.offlineAt = null
        known.absent = false
        connection.member = known.id
        this.saveMembers()
      })
      this.welcome(conn, known)
      return
    }
    if (this.members.size >= MAX_MEMBERS) {
      this.drop(conn, CloseCode.roomFull, 'room full')
      return
    }
    const member: MemberRecord = {
      id: this.deps.newMemberId(),
      // Against offline members too: they keep their seat and can come back
      name: uniqueName(
        name,
        [...this.members.values()].map((other) => other.name),
      ),
      token: this.deps.newToken(),
      seat: this.lowestFreeSeat(),
      ready: false,
      conn,
      offlineAt: null,
      absent: false,
    }
    this.change(() => {
      const room = this.requireRoom()
      this.members.set(member.id, member)
      connection.member = member.id
      this.saveMembers()
      if (room.hostId === null) {
        room.hostId = member.id
        this.deps.storage.saveRoom(room)
      }
    })
    this.welcome(conn, member)
  }

  private sit(conn: string, member: MemberRecord, seat: number | null): void {
    const room = this.requireRoom()
    if (room.status === 'playing') return this.refuse(conn, 'wrong_status')
    if (seat !== null && seat >= room.maxSeats) return this.refuse(conn, 'bad_seat')
    if (seat === member.seat) return
    const taken =
      seat !== null && [...this.members.values()].some((other) => other.seat === seat)
    if (taken) return this.refuse(conn, 'seat_taken')
    this.change(() => {
      member.seat = seat
      if (seat === null) member.ready = false
      this.saveMembers()
    })
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
    this.beginFromSeats(conn, room)
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
    const module = this.deps.games(room.gameId)
    const game =
      module &&
      beginGame(
        module,
        seated.map((_, id) => ({ id })),
        room.options,
        this.deps.newSeed(),
        this.deps.now(),
      )
    if (!game) return this.refuse(conn, 'game_failed')
    const oldSteps = this.game?.steps ?? 0
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
  }

  private act(conn: string, member: MemberRecord, action: JsonValue): void {
    const room = this.requireRoom()
    const game = this.game
    if (room.status !== 'playing' || !game) return this.refuse(conn, 'no_game')
    // The seat is the one this socket's member holds: nothing in the message can say otherwise
    if (member.seat === null) return this.refuse(conn, 'not_seated')
    const module = this.deps.games(game.gameId)
    if (!module) return this.refuse(conn, 'game_failed')
    const outcome = playAction(module, game, action, member.seat, this.deps.now())
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
    this.change(() => {
      this.dropGame()
      room.gameId = gameId
      room.options = parseOptions(module.options, rawOptions)
      room.minPlayers = module.meta.minPlayers
      room.maxSeats = module.meta.maxPlayers
      room.status = 'waiting'
      this.deps.storage.saveRoom(room)
      // After the new maxSeats: those without a seat in this game take one that is left, if any
      const others = [...this.members.values()]
      const homeless = others.filter((other) => other.seat !== null && other.seat >= room.maxSeats)
      for (const other of homeless) other.seat = null
      for (const other of homeless) other.seat = this.lowestFreeSeat()
      for (const other of others) other.ready = false
      this.saveMembers()
    })
  }

  private setOptions(conn: string, member: MemberRecord, rawOptions: OptionValues): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status !== 'waiting') return this.refuse(conn, 'wrong_status')
    const module = this.deps.games(room.gameId)
    if (!module) return this.refuse(conn, 'bad_game')
    this.change(() => {
      room.options = parseOptions(module.options, rawOptions)
      this.deps.storage.saveRoom(room)
      for (const other of this.members.values()) other.ready = false
      this.saveMembers()
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
  }

  private kick(conn: string, member: MemberRecord, targetId: string): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    const target = this.members.get(targetId)
    if (!target || target === member) return this.refuse(conn, 'bad_member')
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
        { token: target.token, until: now + KICK_BAN_MS },
      ]
      this.deps.storage.saveRoom(room)
    })
  }

  private dissolve(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    for (const open of this.conns.keys()) {
      this.deps.sockets.close(open, CloseCode.dissolved, 'dissolved')
    }
    this.conns.clear()
    this.members.clear()
    this.room = null
    this.game = null
    this.rev = 0
    this.sweepAt = null
    this.chat = []
    this.chatId = 0
    this.deps.storage.clearAll()
  }

  /** Part of a `change`: forgets the game and its steps, if there is one */
  private dropGame(): void {
    const steps = this.game?.steps ?? 0
    this.game = null
    this.deps.storage.saveGame(null)
    this.deps.storage.dropSteps(steps)
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
    }
    const members: Record<string, RoomMember> = {}
    for (const member of this.members.values()) {
      members[member.id] = {
        id: member.id,
        name: member.name,
        seat: member.seat,
        ready: member.ready,
        host: member.id === room.hostId,
        online: member.conn !== null,
        absent: member.absent,
      }
    }
    const game = this.game
    const projections = new Map<Viewer, GameProjection | null>()
    return (member) => {
      if (!game) return { room: shared, members, game: null, coverable }
      // Someone who took a free seat after the game has no seat in it
      const inGame = game.seats.some((seat) => seat.id === member.seat)
      const viewer: Viewer = inGame ? (member.seat as number) : 'spectator'
      let projection = projections.get(viewer)
      if (projection === undefined) {
        projection = projectFor(this.deps.games(game.gameId), game, viewer)
        projections.set(viewer, projection)
      }
      return { room: shared, members, game: projection, coverable }
    }
  }

  private welcome(conn: string, member: MemberRecord): void {
    this.deps.sockets.send(conn, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      you: member.id,
      token: member.token,
      rev: this.rev,
      state: this.viewBuilder()(member),
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
    this.change(() => {
      member.conn = null
      member.offlineAt = this.deps.now()
      this.saveMembers()
    })
  }

  private saveMembers(): void {
    this.deps.storage.saveMembers([...this.members.values()])
  }

  private isBanned(token: string): boolean {
    const now = this.deps.now()
    return this.requireRoom().bans.some((ban) => ban.token === token && ban.until > now)
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
