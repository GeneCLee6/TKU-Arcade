import type { ReplayStep } from '../shared/games/match.ts'
import { parseOptions } from '../shared/games/options.ts'
import type { AnyGameModule, GameProjection, OptionValues, Viewer } from '../shared/games/types.ts'
import { diff, type JsonValue } from '../shared/patch.ts'
import {
  CloseCode,
  JOIN_TIMEOUT_MS,
  MAX_CONNECTIONS,
  MAX_MEMBERS,
  PROTOCOL_VERSION,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
  parseClientMessage,
  uniqueName,
  type ErrorCode,
  type RoomMember,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
  type ServerMessage,
} from '../shared/protocol.ts'
import { beginGame, playAction, projectFor, type StoredGame } from './room-turn.ts'

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
}

/** One open socket, as the socket itself remembers it through hibernation */
export type OpenSocket = { conn: string; openedAt: number }

/** All the room keeps between two wake-ups, apart from the steps, which only a replay reads */
export type StoredRoom = {
  room: RoomRecord | null
  members: MemberRecord[]
  rev: number
  game: StoredGame | null
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
  }
  games(id: string): AnyGameModule | null
  now(): number
  newMemberId(): string
  newToken(): string
  /** A uint32 for a new game's Rng */
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
    this.room = stored.room
    this.rev = stored.rev
    this.game = stored.game
    this.members.clear()
    this.conns.clear()
    for (const { conn, openedAt } of sockets) {
      // `heartbeat` brings lastSeen up to date before each sweep
      this.conns.set(conn, { openedAt, lastSeen: openedAt, member: null })
    }
    this.sweepAt = alarmAt ?? (sockets.length > 0 ? this.deps.now() + SWEEP_INTERVAL_MS : null)
    for (const record of stored.members) {
      // A room from before `ready` existed has members without it
      const member = { ...record, ready: record.ready === true }
      const conn = member.conn === null ? undefined : this.conns.get(member.conn)
      if (conn) conn.member = member.id
      this.members.set(member.id, conn ? member : { ...member, conn: null })
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
      case 'chat':
        // e1-t07
        this.refuse(conn, 'unavailable')
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

  /** The alarm: closes sockets that never joined or went silent */
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
    this.sweepAt = this.conns.size > 0 ? now + SWEEP_INTERVAL_MS : null
  }

  /** When the alarm should fire next; null for no alarm. e1-t10 and e2-t08 add their jobs here */
  nextAlarm(): number | null {
    return this.sweepAt
  }

  // ── What members do ────────────────────────────────────────────────────────────────────────

  private join(conn: string, connection: Connection, name: string, token: string | null): void {
    const known = token === null ? undefined : this.findByToken(token)
    if (known) {
      if (known.conn !== null) {
        // A second tab, or a reload that beat the old socket's close
        this.conns.delete(known.conn)
        this.deps.sockets.close(known.conn, CloseCode.replaced, 'replaced')
      }
      this.change(() => {
        known.conn = conn
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
    if (room.status !== 'waiting') return this.refuse(conn, 'wrong_status')
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
      )
    if (!game) return this.refuse(conn, 'game_failed')
    this.change(() => {
      seated.forEach((other, index) => {
        other.seat = index
      })
      // The next waiting room starts over
      for (const other of this.members.values()) other.ready = false
      this.saveMembers()
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
    const outcome = playAction(module, game, action, member.seat)
    if (outcome.kind === 'refused') {
      this.deps.sockets.send(conn, { t: 'error', code: 'game_error', error: outcome.error })
      return
    }
    if (outcome.kind === 'failed') return this.refuse(conn, 'game_failed')
    this.change(() => {
      this.game = outcome.game
      this.deps.storage.saveGame(outcome.game)
      this.deps.storage.saveStep(game.steps, outcome.step)
      if (outcome.over) {
        room.status = 'ended'
        this.deps.storage.saveRoom(room)
      }
    })
  }

  private reopen(conn: string, member: MemberRecord): void {
    const room = this.requireRoom()
    if (member.id !== room.hostId) return this.refuse(conn, 'forbidden')
    if (room.status !== 'ended') return this.refuse(conn, 'wrong_status')
    const steps = this.game?.steps ?? 0
    this.change(() => {
      this.game = null
      this.deps.storage.saveGame(null)
      this.deps.storage.dropSteps(steps)
      room.status = 'waiting'
      this.deps.storage.saveRoom(room)
    })
  }

  // ── Telling the sockets ────────────────────────────────────────────────────────────────────

  /**
   * The one way the room changes once people are in it: runs `mutate`, moves `rev` on and sends
   * every joined socket the difference for its own viewer. Everyone gets a patch for every `rev`,
   * empty if nothing they can see changed, so a gap always means a message went missing.
   */
  private change(mutate: () => void): void {
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
  }

  /**
   * Builds members' views of the room as it is now. Only the game part differs between viewers, and
   * only here does a viewer's game come from: `projectFor`, for the viewer this member's seat says.
   */
  private viewBuilder(): (member: MemberRecord) => RoomView {
    const room = this.requireRoom()
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
      }
    }
    const game = this.game
    const projections = new Map<Viewer, GameProjection | null>()
    return (member) => {
      if (!game) return { room: shared, members, game: null }
      const viewer: Viewer = member.seat ?? 'spectator'
      let projection = projections.get(viewer)
      if (projection === undefined) {
        projection = projectFor(this.deps.games(game.gameId), game, viewer)
        projections.set(viewer, projection)
      }
      return { room: shared, members, game: projection }
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
      this.saveMembers()
    })
  }

  private saveMembers(): void {
    this.deps.storage.saveMembers([...this.members.values()])
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
