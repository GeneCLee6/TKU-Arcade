// The room and the engine (AC-1.3, AC-2.2), driven as a browser drives them: every message goes in
// as text and comes out as JSON. RoomHost runs on a fake clock, fake sockets and a fake storage that
// keeps only what was saved, as JSON, so `restart` rebuilds the room from that and nothing else.
// A real Durable Object is not involved: @cloudflare/vitest-pool-workers needs Vitest 4 and this
// repo is on 5.
import { describe, expect, it, vi } from 'vitest'
import { CHAT_HISTORY, CHAT_RATE, type ChatMessage } from '../../shared/chat.ts'
import { replayMatch, type ReplayStep } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { promotion } from '../../shared/games/promotion/rules.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import {
  gameError,
  isGameError,
  type AnyGameModule,
  type GameModule,
  type GameProjection,
} from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  CloseCode,
  JOIN_TIMEOUT_MS,
  KICK_BAN_MS,
  MAX_CONNECTIONS,
  MAX_MEMBERS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  ROOM_CLEANUP_MS,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import type { Account } from '../../shared/account.ts'
import { RoomHost, type OpenSocket, type StoredRoom } from '../../worker/room-host.ts'

const ROOM_ID = 'abcdefghij'

class Client {
  received: ServerMessage[] = []
  raw: string[] = []
  view: RoomView | null = null
  rev = -1
  you = ''
  token = ''
  closed: number | null = null
  readonly conn: string
  private readonly world: World

  constructor(world: World, conn: string) {
    this.world = world
    this.conn = conn
  }

  receive(json: string) {
    this.raw.push(json)
    const message = JSON.parse(json) as ServerMessage
    this.received.push(message)
    if (message.t === 'welcome') {
      this.you = message.you
      this.token = message.token
    }
    if (message.t === 'welcome' || message.t === 'snapshot') {
      this.view = message.state
      this.rev = message.rev
    } else if (message.t === 'patch') {
      // A gap would make the browser ask for a snapshot: there must never be one
      expect(message.rev).toBe(this.rev + 1)
      this.rev = message.rev
      this.view = applyPatch(this.view as JsonValue, message.ops) as RoomView
    }
  }

  send(message: unknown) {
    this.world.host.message(this.conn, JSON.stringify(message))
  }

  get seat() {
    return this.view?.members[this.you].seat
  }

  get game(): GameProjection {
    return this.view?.game as GameProjection
  }

  get errors() {
    return this.received.filter((message) => message.t === 'error')
  }

  /** What the server would send this client now, to check the patches added up to it */
  fresh(): RoomView {
    this.send({ t: 'resync' })
    const last = this.received.at(-1)
    if (last?.t !== 'snapshot') throw new Error('no snapshot')
    return last.state
  }
}

class World {
  clock = 10_000
  store = new Map<string, string>()
  steps = new Map<number, string>()
  chat = new Map<number, string>()
  clients = new Map<string, Client>()
  host!: RoomHost
  private nextId = 0
  private nextConn = 0
  private seed = 1234
  /** What the runtime keeps through hibernation */
  sockets: OpenSocket[] = []
  modules: Record<string, AnyGameModule>

  constructor(modules: Record<string, AnyGameModule> = {}) {
    this.modules = { tictactoe: ticTacToe as unknown as AnyGameModule, ...modules }
    this.host = this.newHost()
  }

  private put(key: string, value: unknown) {
    this.store.set(key, JSON.stringify(value))
  }

  private newHost() {
    return new RoomHost({
      sockets: {
        send: (conn, message) => this.clients.get(conn)?.receive(JSON.stringify(message)),
        close: (conn, code) => {
          const client = this.clients.get(conn)
          if (client) client.closed = code
          this.sockets = this.sockets.filter((socket) => socket.conn !== conn)
        },
      },
      storage: {
        saveRoom: (room) => this.put('room', room),
        saveMembers: (members) => this.put('members', members),
        saveRev: (rev) => this.put('rev', rev),
        saveGame: (game) => this.put('game', game),
        saveStep: (index, step) => this.steps.set(index, JSON.stringify(step)),
        dropSteps: (count) => {
          for (let index = 0; index < count; index++) this.steps.delete(index)
        },
        saveChat: (message) => this.chat.set(message.id, JSON.stringify(message)),
        dropChat: (id) => this.chat.delete(id),
        clearAll: () => {
          this.store.clear()
          this.steps.clear()
          this.chat.clear()
        },
      },
      games: (id) => this.modules[id] ?? null,
      now: () => this.clock,
      newMemberId: () => `member-${++this.nextId}`,
      newToken: () => `token-${this.nextId}`.padEnd(43, '_'),
      newSeed: () => this.seed,
    })
  }

  stored(): StoredRoom {
    const read = <T>(key: string, fallback: T): T => {
      const json = this.store.get(key)
      return json === undefined ? fallback : (JSON.parse(json) as T)
    }
    return {
      room: read('room', null),
      members: read('members', []),
      rev: read('rev', 0),
      game: read('game', null),
      chat: [...this.chat.values()].map((json) => JSON.parse(json) as ChatMessage),
    }
  }

  storedSteps(): ReplayStep<JsonValue>[] {
    return [...this.steps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, json]) => JSON.parse(json) as ReplayStep<JsonValue>)
  }

  /** The object forgets everything but its storage and its sockets, as hibernation does */
  hibernate() {
    this.host = this.newHost()
    this.host.restore(this.stored(), this.sockets, null)
  }

  /** A deploy or a crash: the sockets are gone too, and nobody's `closed` runs */
  restart() {
    for (const client of this.clients.values()) client.closed ??= 1006
    this.sockets = []
    this.clients.clear()
    this.host = this.newHost()
    this.host.restore(this.stored(), [], null)
  }

  /** `account`: what the Worker found in the session (e1-t13), none for a guest */
  open(account: Account | null = null): Client {
    expect(this.host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
    const conn = `conn-${++this.nextConn}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({ conn, openedAt: this.clock, ...(account ? { account } : {}) })
    this.host.opened(conn, this.clock, account)
    return client
  }

  join(name: string, token: string | null = null, account: Account | null = null): Client {
    const client = this.open(account)
    client.send({ t: 'join', name, token })
    return client
  }

  disconnect(client: Client) {
    this.clients.delete(client.conn)
    this.sockets = this.sockets.filter((socket) => socket.conn !== client.conn)
    this.host.closed(client.conn)
  }
}

function room(gameId = 'tictactoe', modules: Record<string, AnyGameModule> = {}) {
  const world = new World(modules)
  expect(world.host.create(ROOM_ID, gameId, undefined)).toBe(true)
  return world
}

/** A room with two seated players and a game under way */
function started() {
  const world = room()
  const x = world.join('Xia')
  const o = world.join('Ou')
  x.send({ t: 'start' })
  return { world, x, o }
}

const place = (cell: number) => ({ t: 'action', action: { type: 'place', cell } })

describe('a room', () => {
  it('exists once created, and only once', () => {
    const world = new World()
    expect(world.host.summary()).toBeNull()
    expect(world.host.admit('1')).toMatchObject({ code: CloseCode.roomNotFound })
    expect(world.host.create(ROOM_ID, 'nope', undefined)).toBe(false)
    expect(world.host.create(ROOM_ID, 'tictactoe', undefined)).toBe(true)
    expect(world.host.create(ROOM_ID, 'tictactoe', undefined)).toBe(false)
    expect(world.host.summary()).toEqual({
      id: ROOM_ID,
      gameId: 'tictactoe',
      status: 'waiting',
      members: 0,
      seated: 0,
      maxSeats: 2,
    })
  })

  it('refuses another protocol version, and more sockets than it takes', () => {
    const world = room()
    expect(world.host.admit('0')).toMatchObject({ code: CloseCode.versionMismatch })
    expect(world.host.admit(null)).toMatchObject({ code: CloseCode.versionMismatch })
    for (let i = 0; i < MAX_CONNECTIONS; i++) world.open()
    expect(world.host.admit('1')).toMatchObject({ code: CloseCode.roomFull })
  })

  it('makes the first to join the host and seats people until the seats run out', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    const c = world.join('C')
    expect(c.view?.members[a.you]).toEqual({
      id: a.you,
      name: 'A',
      seat: 0,
      ready: false,
      host: true,
      online: true,
      absent: false,
    })
    expect(c.view?.members[b.you]).toMatchObject({ seat: 1, host: false })
    expect(c.seat).toBeNull()
    expect(a.view).toEqual(c.view)
    expect(world.host.summary()).toMatchObject({ members: 3, seated: 2 })
  })

  it('takes no more than MAX_MEMBERS people', () => {
    const world = room()
    for (let i = 0; i < MAX_MEMBERS; i++) world.join(`P${i}`)
    const late = world.join('Late')
    expect(late.closed).toBe(CloseCode.roomFull)
    expect(world.host.summary()?.members).toBe(MAX_MEMBERS)
  })

  it('lets members change seats while waiting', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'sit', seat: 1 })
    expect(a.errors).toEqual([{ t: 'error', code: 'seat_taken' }])
    a.send({ t: 'sit', seat: 2 })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'bad_seat' })
    b.send({ t: 'sit', seat: null })
    expect(a.view?.members[b.you].seat).toBeNull()
    a.send({ t: 'sit', seat: 1 })
    expect(b.view?.members[a.you].seat).toBe(1)
    const before = a.received.length
    a.send({ t: 'sit', seat: 1 })
    expect(a.received.length).toBe(before)
  })

  it('tells everyone who is ready, and keeps it through a move but not out of the seat', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    expect(a.view?.members[a.you].ready).toBe(false)

    a.send({ t: 'ready', ready: true })
    expect(b.view?.members[a.you].ready).toBe(true)
    const before = a.received.length
    a.send({ t: 'ready', ready: true })
    expect(a.received.length).toBe(before)

    b.send({ t: 'sit', seat: null })
    a.send({ t: 'sit', seat: 1 })
    expect(b.view?.members[a.you]).toMatchObject({ seat: 1, ready: true })

    a.send({ t: 'sit', seat: null })
    expect(b.view?.members[a.you]).toMatchObject({ seat: null, ready: false })
    a.send({ t: 'ready', ready: true })
    expect(a.errors).toEqual([{ t: 'error', code: 'not_seated' }])
    expect(b.view?.members[a.you].ready).toBe(false)
  })

  it('does not hold back the start for someone not ready', () => {
    const world = room()
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    expect(a.view?.room.status).toBe('playing')
  })

  it('answers a socket that has not joined, and a second join, with an error', () => {
    const world = room()
    const a = world.open()
    a.send({ t: 'start' })
    expect(a.errors).toEqual([{ t: 'error', code: 'not_joined' }])
    a.send({ t: 'join', name: 'A', token: null })
    a.send({ t: 'join', name: 'A again', token: null })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'forbidden' })
    expect(world.host.summary()?.members).toBe(1)
  })

  it('closes the socket on what is not a message, and the member goes offline', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    world.host.message(b.conn, 'not json')
    expect(b.closed).toBe(CloseCode.badMessage)
    expect(a.view?.members[b.you].online).toBe(false)
    world.host.badFrame(a.conn)
    expect(a.closed).toBe(CloseCode.badMessage)
  })
})

describe('nicknames (AC-1.2)', () => {
  const nameOf = (client: Client) => client.view?.members[client.you].name

  it('gives a repeated name the next free suffix, and tells everyone', () => {
    const world = room()
    const first = world.join('Al')
    const second = world.join('Al')
    const third = world.join('al')
    expect(nameOf(first)).toBe('Al')
    expect(nameOf(second)).toBe('Al (2)')
    expect(nameOf(third)).toBe('al (3)')
    expect(first.view?.members[second.you].name).toBe('Al (2)')
    expect(first.view?.members[third.you].name).toBe('al (3)')
    expect(world.stored().members.map((member) => member.name)).toEqual(['Al', 'Al (2)', 'al (3)'])
    expect(first.view).toEqual(first.fresh())
  })

  it('brings a token back to its stored name, whatever the join says, with no new suffix', () => {
    const world = room()
    world.join('Al')
    const second = world.join('Al')
    const [token, you] = [second.token, second.you]
    world.disconnect(second)

    const same = world.join('Al', token)
    expect(same.you).toBe(you)
    expect(nameOf(same)).toBe('Al (2)')
    world.disconnect(same)

    const renamed = world.join('Zed', token)
    expect(renamed.you).toBe(you)
    expect(nameOf(renamed)).toBe('Al (2)')
    expect(world.host.summary()?.members).toBe(2)
  })

  it('does not compare someone coming back with themselves', () => {
    const world = room()
    const al = world.join('Al')
    const again = world.join('Al', al.token)
    expect(nameOf(again)).toBe('Al')
    expect(world.stored().members.map((member) => member.name)).toEqual(['Al'])
  })

  it('counts an offline member’s name, also after a restart', () => {
    const world = room()
    const al = world.join('Al')
    world.disconnect(al)
    expect(nameOf(world.join('Al'))).toBe('Al (2)')
    world.restart()
    expect(nameOf(world.join('Al'))).toBe('Al (3)')
  })
})

describe('signed-in names (e1-t13)', () => {
  const nameOf = (client: Client) => client.view?.members[client.you].name
  const amy: Account = { id: 'acct-amy', name: 'Amy' }

  it('takes a signed-in name from the session, never from join', () => {
    const world = room()
    const forged = world.join('Somebody Else', null, amy)
    expect(nameOf(forged)).toBe('Amy')
    expect(world.stored().members[0]).toMatchObject({ name: 'Amy', account: 'acct-amy' })
    // The account id is the server's own business: no view carries it
    expect(JSON.stringify(forged.view)).not.toContain('acct-amy')
    expect(forged.view).toEqual(forged.fresh())
  })

  it('still gives the same-room suffix, against guests and other accounts alike', () => {
    const world = room()
    const guest = world.join('Amy')
    const signedIn = world.join('Amy', null, amy)
    expect(nameOf(guest)).toBe('Amy')
    expect(nameOf(signedIn)).toBe('Amy (2)')
    // The same account on a second device is a second member, with the next suffix
    const world2 = room()
    world2.join('x', null, amy)
    expect(nameOf(world2.join('y', null, amy))).toBe('Amy (2)')
  })

  it('leaves guests as they were', () => {
    const world = room()
    expect(nameOf(world.join('Bo'))).toBe('Bo')
    expect(world.stored().members[0].account).toBeUndefined()
  })

  it('keeps a signed-in member’s name when they come back, whatever join says', () => {
    const world = room()
    const first = world.join('x', null, amy)
    const [token, you] = [first.token, first.you]
    world.disconnect(first)
    const back = world.join('Forged', token, amy)
    expect(back.you).toBe(you)
    expect(nameOf(back)).toBe('Amy')
  })

  it('renames a guest who comes back signed in, keeping the seat', () => {
    const world = room()
    const other = world.join('Amy')
    const guest = world.join('Bo')
    const [token, you, seat] = [guest.token, guest.you, guest.seat]
    world.disconnect(guest)
    const back = world.join('Bo', token, amy)
    expect(back.you).toBe(you)
    expect(back.seat).toBe(seat)
    // Not compared with themselves, but with the guest already called Amy
    expect(nameOf(back)).toBe('Amy (2)')
    expect(other.view?.members[you].name).toBe('Amy (2)')
    expect(world.stored().members[1]).toMatchObject({ account: 'acct-amy' })
  })

  it('keeps the account through hibernation', () => {
    const world = room()
    const socket = world.open(amy)
    world.hibernate()
    socket.send({ t: 'join', name: 'Forged', token: null })
    expect(nameOf(socket)).toBe('Amy')
  })
})

describe('starting a game', () => {
  it('only the host may', () => {
    const world = room()
    const host = world.join('Host')
    const other = world.join('Other')
    other.send({ t: 'start' })
    expect(other.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    expect(host.view?.room.status).toBe('waiting')
    expect(host.view?.game).toBeNull()
    host.send({ t: 'start' })
    expect(other.view?.room.status).toBe('playing')
    host.send({ t: 'start' })
    expect(host.errors).toEqual([{ t: 'error', code: 'wrong_status' }])
  })

  it('needs minPlayers seated', () => {
    const world = room()
    const host = world.join('Host')
    host.send({ t: 'start' })
    expect(host.errors).toEqual([{ t: 'error', code: 'not_enough_players' }])
    expect(world.stored().game).toBeNull()
  })

  it('renumbers the seated members from 0, keeping their order', () => {
    const three = { ...hiddenGame, meta: { ...hiddenGame.meta, maxPlayers: 4 } }
    const world = room('hidden', { hidden: three as unknown as AnyGameModule })
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'sit', seat: 3 })
    b.send({ t: 'sit', seat: 2 })
    a.send({ t: 'start' })
    expect(a.seat).toBe(1)
    expect(b.seat).toBe(0)
    expect(world.stored().game?.seats).toEqual([{ id: 0 }, { id: 1 }])
  })

  it('sends a member who joins during the game to the spectators, where they cannot sit', () => {
    const { world } = started()
    const late = world.join('Late')
    expect(late.seat).toBeNull()
    expect(late.game).not.toBeNull()
    late.send({ t: 'sit', seat: 0 })
    expect(late.errors).toEqual([{ t: 'error', code: 'wrong_status' }])
  })
})

describe('playing a game', () => {
  it('plays a whole game by patches, ends it, and goes back to waiting', () => {
    const { world, x, o } = started()
    expect(x.seat).toBe(0)
    expect(o.seat).toBe(1)
    const spectator = world.join('Spectator')
    // X takes the top row
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    for (const client of [x, o, spectator]) {
      expect(client.errors).toEqual([])
      expect(client.view?.room.status).toBe('ended')
      expect(client.game.over).toBe(true)
      expect(client.game.result?.standings).toHaveLength(2)
      expect(client.view).toEqual(client.fresh())
    }
    expect(world.host.summary()?.status).toBe('ended')

    // Nothing more can happen to it
    x.send(place(8))
    expect(x.errors).toEqual([{ t: 'error', code: 'no_game' }])

    o.send({ t: 'reopen' })
    expect(o.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    x.send({ t: 'reopen' })
    expect(o.view?.room.status).toBe('waiting')
    expect(o.view?.game).toBeNull()
    expect(o.seat).toBe(1)
    expect(world.stored().game).toBeNull()
    expect(world.storedSteps()).toEqual([])
    x.send({ t: 'reopen' })
    expect(x.errors.at(-1)).toEqual({ t: 'error', code: 'wrong_status' })

    x.send({ t: 'start' })
    expect(o.view?.room.status).toBe('playing')
    expect(o.game.over).toBe(false)
  })

  it('clears ready when the game starts, so the next waiting room starts over', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'ready', ready: true })
    a.send({ t: 'start' })
    expect(b.view?.room.status).toBe('playing')
    expect(b.view?.members[a.you].ready).toBe(false)

    a.send({ t: 'ready', ready: true })
    expect(a.errors).toEqual([{ t: 'error', code: 'wrong_status' }])
    expect(a.view).toEqual(a.fresh())
  })

  it('answers an illegal action to the sender alone, and changes nothing', () => {
    const { world, x, o } = started()
    const spectator = world.join('Spectator')
    x.send(place(0))
    const stored = JSON.stringify(world.stored())
    const counts = [x, o, spectator].map((client) => client.received.length)

    // O's turn, but X plays; then O plays a taken cell; then junk
    x.send(place(1))
    o.send(place(0))
    o.send({ t: 'action', action: { type: 'nope' } })
    o.send({ t: 'action', action: null })

    expect(x.received.length).toBe(counts[0] + 1)
    expect(x.received.at(-1)).toMatchObject({ t: 'error', code: 'game_error' })
    expect(o.received.length).toBe(counts[1] + 3)
    expect(o.received.slice(-3).every((message) => message.t === 'error')).toBe(true)
    expect(spectator.received.length).toBe(counts[2])
    expect(JSON.stringify(world.stored())).toBe(stored)
    expect(world.storedSteps()).toHaveLength(1)
  })

  it('takes the seat from the connection, whatever the message claims', () => {
    const { world, x, o } = started()
    // O's message claims seat 0, whose turn it is
    o.send({ ...place(0), seat: 0, actor: 0, member: x.you })
    expect(o.errors).toHaveLength(1)
    expect(world.storedSteps()).toEqual([])
    o.send({ ...place(0), actor: 'system' })
    expect(o.errors).toHaveLength(2)
    expect(world.storedSteps()).toEqual([])
    x.send({ ...place(0), seat: 1 })
    expect(world.storedSteps()).toEqual([{ actor: 0, action: { type: 'place', cell: 0 } }])
  })

  it('tells a spectator, and anyone before a game, that they cannot act', () => {
    const world = room()
    const x = world.join('X')
    const o = world.join('O')
    const spectator = world.join('Spectator')
    x.send(place(0))
    expect(x.errors).toEqual([{ t: 'error', code: 'no_game' }])
    x.send({ t: 'start' })
    spectator.send(place(0))
    expect(spectator.errors).toEqual([{ t: 'error', code: 'not_seated' }])
    expect(spectator.game.view).toMatchObject({ you: null })
    expect(o.game.view).toMatchObject({ you: 1 })
    expect(spectator.game.legal).toEqual([])
  })
})

// ── A game with secrets ──────────────────────────────────────────────────────────────────────

type HiddenState = {
  hands: string[][]
  deck: string[]
  target: string
  turn: number
  plays: number
}
type HiddenAction = { type: 'draw' }
type HiddenView = { mine: string[] | null; counts: number[]; turn: number; plays: number }

const SECRET = /card-|target-/

/**
 * Everything in `hands`, `deck` and `target` is secret from anyone it does not belong to, and all
 * of it looks like `card-…` or `target-…`, so a leak is easy to see in the raw frames.
 */
const hiddenGame: GameModule<HiddenState, HiddenAction, HiddenView, Record<string, never>> = {
  id: 'hidden',
  meta: { minPlayers: 2, maxPlayers: 2, minutes: 1, i18nKey: 'games.hidden' },
  options: {},
  init(seats, _options, rng) {
    const deck = rng.shuffle(Array.from({ length: 20 }, (_, i) => `card-${i}`))
    return {
      hands: seats.map(() => [deck.pop() as string]),
      deck,
      target: `target-${rng.int(1000)}`,
      turn: 0,
      plays: 0,
    }
  },
  reduce(state, action, actor, rng) {
    if (action?.type !== 'draw') return gameError('games.hidden.bad')
    if (actor !== state.turn) return gameError('games.hidden.turn')
    if (state.plays >= 6) return gameError('games.hidden.over')
    const deck = rng.shuffle(state.deck)
    const hands = state.hands.map((hand, seat) =>
      seat === actor ? [...hand, deck.pop() as string] : hand,
    )
    return {
      ...state,
      hands,
      deck,
      turn: (state.turn + 1) % state.hands.length,
      plays: state.plays + 1,
    }
  },
  view(state, viewer) {
    return {
      mine: viewer === 'spectator' ? null : state.hands[viewer],
      counts: state.hands.map((hand) => hand.length),
      turn: state.turn,
      plays: state.plays,
    }
  },
  legalActions(state, seat) {
    return state.turn === seat && state.plays < 6 ? [{ type: 'draw' }] : []
  },
  isOver: (state) => state.plays >= 6,
  result: (state) => ({
    summary: { key: 'games.hidden.done' },
    standings: state.hands.map((_, seat) => ({
      seat,
      rank: 1,
      score: null,
      note: { key: 'games.hidden.note' },
    })),
  }),
}

function hiddenRoom() {
  const world = room('hidden', { hidden: hiddenGame as unknown as AnyGameModule })
  const a = world.join('A')
  const b = world.join('B')
  const spectator = world.join('Spectator')
  a.send({ t: 'start' })
  return { world, a, b, spectator }
}

describe('hidden information', () => {
  const hand = (world: World, seat: number) =>
    (world.stored().game!.match.state as HiddenState).hands[seat]

  it('reaches a socket only through its own seat', () => {
    const { world, a, b, spectator } = hiddenRoom()
    const late = world.join('Late')
    const seenByA = new Set<string>()
    const seenByB = new Set<string>()
    for (let i = 0; i < 6; i++) {
      for (const card of hand(world, 0)) seenByA.add(card)
      for (const card of hand(world, 1)) seenByB.add(card)
      ;(i % 2 === 0 ? a : b).send({ t: 'action', action: { type: 'draw' } })
    }
    for (const card of hand(world, 0)) seenByA.add(card)
    for (const card of hand(world, 1)) seenByB.add(card)
    expect(seenByA.size).toBeGreaterThan(1)

    const state = world.stored().game?.match.state as HiddenState
    const everyFrame = (client: Client) => client.raw.join('\n')
    for (const card of seenByB) expect(everyFrame(a)).not.toContain(`"${card}"`)
    for (const card of seenByA) expect(everyFrame(b)).not.toContain(`"${card}"`)
    for (const client of [a, b, spectator, late]) {
      expect(everyFrame(client)).not.toContain(state.target)
      for (const card of state.deck) expect(everyFrame(client)).not.toContain(`"${card}"`)
    }
    // Their own cards did arrive
    for (const card of seenByA) expect(everyFrame(a)).toContain(`"${card}"`)
    for (const card of seenByB) expect(everyFrame(b)).toContain(`"${card}"`)
    // A spectator gets nothing secret at all, in any frame
    expect(everyFrame(spectator)).not.toMatch(SECRET)
    expect(everyFrame(late)).not.toMatch(SECRET)
  })

  it('never sends the Rng, the seed, the state or anyone’s token', () => {
    const { world, a, b, spectator } = hiddenRoom()
    a.send({ t: 'action', action: { type: 'draw' } })
    const game = world.stored().game
    for (const client of [a, b, spectator]) {
      const frames = client.raw.join('\n')
      expect(frames).not.toContain('rngState')
      expect(frames).not.toContain('"seed"')
      expect(frames).not.toContain('"deck"')
      expect(frames).not.toContain(String(game?.match.rngState))
    }
    // Each token goes to its owner, and to nobody else
    expect(a.raw.join()).not.toContain(b.token)
    expect(b.raw.join()).not.toContain(a.token)
    expect(spectator.raw.join()).not.toContain(a.token)
    expect(spectator.raw.join()).not.toContain(b.token)
  })

  it('keeps the seat’s view when the same socket asks again, and stays cut after a restart', () => {
    const { world, a, b } = hiddenRoom()
    expect((a.fresh().game!.view as HiddenView).mine).toEqual(hand(world, 0))
    expect((b.fresh().game!.view as HiddenView).mine).toEqual(hand(world, 1))
    const tokenB = b.token
    world.restart()
    const backAsSpectator = world.join('Someone')
    expect((backAsSpectator.game.view as HiddenView).mine).toBeNull()
    expect(backAsSpectator.seat).toBeNull()
    const backB = world.join('B', tokenB)
    expect((backB.game.view as HiddenView).mine).toEqual(hand(world, 1))
  })
})

// ── Modules with bugs ────────────────────────────────────────────────────────────────────────

function buggy(overrides: Partial<typeof hiddenGame>): Record<string, AnyGameModule> {
  return { hidden: { ...hiddenGame, ...overrides } as unknown as AnyGameModule }
}

describe('a module that throws', () => {
  const draw = { t: 'action', action: { type: 'draw' } }

  it('in reduce refuses the action, and the room goes on', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    const world = room(
      'hidden',
      buggy({
        reduce(state, action, actor, rng) {
          if (broken) throw new Error('bug')
          return hiddenGame.reduce(state, action, actor, rng)
        },
      }),
    )
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'start' })
    const stored = JSON.stringify(world.stored())
    const bFrames = b.received.length
    a.send(draw)
    expect(a.errors).toEqual([{ t: 'error', code: 'game_failed' }])
    expect(b.received.length).toBe(bFrames)
    expect(JSON.stringify(world.stored())).toBe(stored)
    broken = false
    a.send(draw)
    expect(b.game.view).toMatchObject({ plays: 1 })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('in reduce after changing the state leaves nothing behind', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const world = room(
      'hidden',
      buggy({
        reduce(state) {
          state.plays = 99
          throw new Error('bug')
        },
      }),
    )
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    a.send(draw)
    expect(a.errors).toEqual([{ t: 'error', code: 'game_failed' }])
    expect((a.fresh().game!.view as HiddenView).plays).toBe(0)
    consoleError.mockRestore()
  })

  it('in view for one seat refuses the action that led there', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const world = room(
      'hidden',
      buggy({
        view(state, viewer) {
          if (state.plays === 1 && viewer === 1) throw new Error('bug')
          return hiddenGame.view(state, viewer)
        },
      }),
    )
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    a.send(draw)
    expect(a.errors).toEqual([{ t: 'error', code: 'game_failed' }])
    expect(world.storedSteps()).toEqual([])
    consoleError.mockRestore()
  })

  it('in init leaves the room waiting', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const world = room(
      'hidden',
      buggy({
        init() {
          throw new Error('bug')
        },
      }),
    )
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    expect(a.errors).toEqual([{ t: 'error', code: 'game_failed' }])
    expect(a.view?.room.status).toBe('waiting')
    consoleError.mockRestore()
  })

  it('shows no game, not the state, if a stored position cannot be viewed', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = false
    const world = room(
      'hidden',
      buggy({
        view(state, viewer) {
          if (broken) throw new Error('bug')
          return hiddenGame.view(state, viewer)
        },
      }),
    )
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    broken = true
    const late = world.join('Late')
    expect(late.view?.game).toBeNull()
    expect(late.raw.join()).not.toMatch(SECRET)
    consoleError.mockRestore()
  })
})

// ── Surviving ────────────────────────────────────────────────────────────────────────────────

describe('hibernation', () => {
  it('goes on between any two messages as if nothing happened', () => {
    const { world, a, b, spectator } = hiddenRoom()
    const draw = { t: 'action', action: { type: 'draw' } }
    for (let i = 0; i < 6; i++) {
      world.hibernate()
      ;(i % 2 === 0 ? a : b).send(draw)
    }
    world.hibernate()
    for (const client of [a, b, spectator]) {
      expect(client.errors).toEqual([])
      expect(client.view).toEqual(client.fresh())
      expect(client.view?.room.status).toBe('ended')
    }
  })

  it('gives the same game as never hibernating: the Rng carries on from where it was', () => {
    const play = (sleep: boolean) => {
      const { world, a, b } = hiddenRoom()
      for (let i = 0; i < 6; i++) {
        if (sleep) world.hibernate()
        ;(i % 2 === 0 ? a : b).send({ t: 'action', action: { type: 'draw' } })
      }
      return world.stored().game
    }
    expect(play(true)).toEqual(play(false))
  })

  it('stores the whole Match, the seed and a log that replays to the same Match', () => {
    const { world, a, b } = hiddenRoom()
    const seedRng = createRng(1234)
    expect(world.stored().game?.seed).toBe(1234)
    expect(world.stored().game?.match.rngState).not.toBe(seedRng.state())
    for (let i = 0; i < 4; i++) {
      world.hibernate()
      ;(i % 2 === 0 ? a : b).send({ t: 'action', action: { type: 'draw' } })
    }
    const game = world.stored().game
    if (!game) throw new Error('no game')
    const steps = world.storedSteps()
    expect(steps).toHaveLength(4)
    expect(game.steps).toBe(4)
    expect(steps.map((step) => step.actor)).toEqual([0, 1, 0, 1])
    const replayed = replayMatch(
      hiddenGame as unknown as AnyGameModule,
      game.seats,
      game.options,
      game.seed,
      steps,
    )
    expect(isGameError(replayed)).toBe(false)
    expect(replayed).toEqual(game.match)
  })

  it('tells the others when a socket closes while the room sleeps', () => {
    const { world, a, b } = hiddenRoom()
    world.hibernate()
    world.disconnect(a)
    expect(b.view?.members[a.you].online).toBe(false)
    expect(b.view).toEqual(b.fresh())
  })
})

describe('a restart', () => {
  it('reads a member stored before `ready` existed as not ready', () => {
    const world = room()
    const a = world.join('A')
    const { token, you } = a
    const members = JSON.parse(world.store.get('members') as string) as Record<string, unknown>[]
    world.store.set(
      'members',
      JSON.stringify(members.map(({ ready: _ready, ...member }) => member)),
    )
    world.restart()
    const back = world.join('A', token)
    expect(back.view?.members[you].ready).toBe(false)
    expect(back.view).toEqual(back.fresh())
  })

  it('keeps the game and everyone’s seat; a token brings a member back', () => {
    const { world, x, o } = started()
    x.send(place(4))
    const { rev } = world.stored()
    const [tokenX, tokenO, youX, youO] = [x.token, o.token, x.you, o.you]
    world.restart()
    expect(world.host.summary()).toMatchObject({ status: 'playing', members: 2, seated: 2 })

    const backO = world.join('Ou', tokenO)
    expect(backO.you).toBe(youO)
    expect(backO.seat).toBe(1)
    expect(backO.rev).toBeGreaterThan(rev)
    expect(backO.view?.members[youX].online).toBe(false)
    expect(backO.game.view).toMatchObject({ board: expect.anything() })

    const backX = world.join('Xia', tokenX)
    expect(backX.you).toBe(youX)
    expect(backX.seat).toBe(0)
    expect(backO.view?.members[youX].online).toBe(true)

    backO.send(place(0))
    expect(backO.errors).toEqual([])
    expect(world.storedSteps()).toHaveLength(2)
    expect(backX.view).toEqual(backX.fresh())
  })
})

describe('tokens', () => {
  it('a new socket with the token replaces the old one; an unknown token is someone new', () => {
    const world = room()
    const a = world.join('A')
    const other = world.join('B')
    const again = world.join('A', a.token)
    expect(a.closed).toBe(CloseCode.replaced)
    expect(again.you).toBe(a.you)
    expect(world.host.summary()?.members).toBe(2)
    expect(other.view).toEqual(other.fresh())
    expect(other.view?.members[a.you].online).toBe(true)

    // The old socket's close, arriving late, must not take the member offline
    world.host.closed(a.conn)
    expect(other.view?.members[a.you].online).toBe(true)

    const stranger = world.join('C', 'z'.repeat(43))
    expect(stranger.you).not.toBe(a.you)
    expect(world.host.summary()?.members).toBe(3)
  })

  it('keeps the seat and host role of someone who left, for e1-t05 and e2-t05 to deal with', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    world.disconnect(a)
    expect(b.view?.members[a.you]).toMatchObject({ seat: 0, host: true, online: false })
    b.send({ t: 'start' })
    expect(b.errors).toEqual([{ t: 'error', code: 'forbidden' }])
  })
})

describe('the sweep', () => {
  it('runs while sockets are open, and not otherwise', () => {
    const world = room()
    // With nobody in it, only the clean-up is left to wait for
    expect(world.host.nextAlarm()).toBe(world.clock + ROOM_CLEANUP_MS)
    const a = world.join('A')
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)
    world.clock += 1000
    world.host.sweep()
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)
    world.disconnect(a)
    expect(world.host.nextAlarm()).toBe(world.clock + ROOM_CLEANUP_MS)
  })

  it('closes a socket that never joined', () => {
    const world = room()
    const a = world.open()
    world.clock += JOIN_TIMEOUT_MS
    world.host.sweep()
    expect(a.closed).toBeNull()
    world.clock += 1
    world.host.sweep()
    expect(a.closed).toBe(CloseCode.stale)
  })

  it('closes a silent socket, its member going offline, and spares one that pings', () => {
    const world = room()
    const silent = world.join('Silent')
    const pinging = world.join('Pinging')
    world.clock += STALE_AFTER_MS - 1000
    world.host.heartbeat(pinging.conn, world.clock)
    world.clock += 1001
    world.host.sweep()
    expect(silent.closed).toBe(CloseCode.stale)
    expect(pinging.closed).toBeNull()
    expect(pinging.view?.members[silent.you].online).toBe(false)
  })

  it('counts from when the socket opened after hibernation, not from waking up', () => {
    const world = room()
    const a = world.join('A')
    world.clock += STALE_AFTER_MS + 1
    world.hibernate()
    world.host.sweep()
    expect(a.closed).toBe(CloseCode.stale)
  })
})

// ── Host controls (AC-1.4) and timers (e2-t08) ──────────────────────────────────────────────────

/** Two phases of 1 s each, moved on only by the clock; a seat can `poke` without changing the timer */
type TimedState = { phase: number; pokes: number }
const timedGame = {
  id: 'timed',
  meta: { minPlayers: 2, maxPlayers: 4, minutes: 1, i18nKey: 'games.timed' },
  options: {},
  init: () => ({ phase: 0, pokes: 0 }),
  reduce: (state: TimedState, action: { type: string }, actor: number | 'system') => {
    if (action?.type === 'poke') return { ...state, pokes: state.pokes + 1 }
    if (action?.type === 'next' && actor === 'system') return { ...state, phase: state.phase + 1 }
    return gameError('nope')
  },
  view: (state: TimedState) => state,
  legalActions: () => [],
  isOver: (state: TimedState) => state.phase >= 2,
  result: () => ({ summary: { key: 'over' }, standings: [] }),
  timers: (state: TimedState) =>
    state.phase < 2 ? [{ id: `phase-${state.phase}`, ms: 1000, action: { type: 'next' } }] : [],
} as unknown as AnyGameModule

/** Its one timer's action is always refused, and the state keeps asking for it */
const stubbornGame = {
  ...timedGame,
  id: 'stubborn',
  init: () => ({ phase: 0, pokes: 0 }),
  reduce: (state: TimedState, action: { type: string }) =>
    action?.type === 'poke' ? { ...state, pokes: state.pokes + 1 } : gameError('nope'),
  timers: () => [{ id: 'forever', ms: 1000, action: { type: 'next' } }],
} as unknown as AnyGameModule

/** A big table, with a rule option */
const bigGame = {
  ...timedGame,
  id: 'big',
  meta: { minPlayers: 2, maxPlayers: 6, minutes: 1, i18nKey: 'games.big' },
  options: {
    rounds: { kind: 'int', labelKey: 'x', min: 1, max: 5, default: 3 },
    fast: { kind: 'boolean', labelKey: 'y', default: false },
  },
  timers: undefined,
} as unknown as AnyGameModule

const modules = { timed: timedGame, stubborn: stubbornGame, big: bigGame }

function timedRoom(gameId = 'timed') {
  const world = room(gameId, modules)
  const a = world.join('A')
  const b = world.join('B')
  a.send({ t: 'start' })
  return { world, a, b }
}

const lastTimer = (client: Client) => client.received.filter((m) => m.t === 'timer').at(-1)
const phaseOf = (client: Client) => (client.game.view as TimedState).phase

describe('kicking', () => {
  it('removes the member, closes their socket and keeps their token out for five minutes', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    const c = world.join('C')

    b.send({ t: 'kick', member: c.you })
    expect(b.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    expect(c.closed).toBeNull()

    a.send({ t: 'kick', member: c.you })
    expect(c.closed).toBe(CloseCode.kicked)
    expect(Object.keys(b.view?.members ?? {})).not.toContain(c.you)
    expect(b.view).toEqual(b.fresh())

    // Its close arriving later changes nothing for the others
    const rev = b.rev
    world.host.closed(c.conn)
    expect(b.rev).toBe(rev)

    const back = world.join('C', c.token)
    expect(back.closed).toBe(CloseCode.kicked)
    expect(back.received).toEqual([])
    expect(world.host.summary()?.members).toBe(2)

    world.clock += KICK_BAN_MS + 1
    const later = world.join('C', c.token)
    expect(later.closed).toBeNull()
    expect(later.view?.members[later.you].name).toBe('C')
  })

  it('survives hibernation, and never shows anyone the banned token', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    const c = world.join('C')
    a.send({ t: 'kick', member: c.you })
    world.hibernate()
    expect(world.join('C', c.token).closed).toBe(CloseCode.kicked)
    expect(a.raw.join()).not.toContain(c.token)
    expect(b.raw.join()).not.toContain(c.token)
  })

  it('refuses kicking yourself or nobody, and can kick someone offline', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'kick', member: a.you })
    a.send({ t: 'kick', member: 'nobody' })
    expect(a.errors).toEqual([
      { t: 'error', code: 'bad_member' },
      { t: 'error', code: 'bad_member' },
    ])
    world.disconnect(b)
    a.send({ t: 'kick', member: b.you })
    expect(Object.keys(a.view?.members ?? {})).toEqual([a.you])
    expect(world.join('B', b.token).closed).toBe(CloseCode.kicked)
  })

  it('leaves the seat empty during a game, and reopen is the way out', () => {
    const { world, x, o } = started()
    x.send({ t: 'kick', member: o.you })
    expect(o.closed).toBe(CloseCode.kicked)
    expect(x.view?.room.status).toBe('playing')
    x.send({ t: 'reopen' })
    expect(x.view?.room.status).toBe('waiting')
    expect(world.stored().game).toBeNull()
  })
})

describe('the host', () => {
  it('can hand over to an online member, and only that', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    const c = world.join('C')
    b.send({ t: 'transfer', member: b.you })
    expect(b.errors.at(-1)).toEqual({ t: 'error', code: 'forbidden' })
    a.send({ t: 'transfer', member: a.you })
    a.send({ t: 'transfer', member: 'nobody' })
    world.disconnect(c)
    a.send({ t: 'transfer', member: c.you })
    expect(a.errors).toHaveLength(3)
    expect(a.errors.every((e) => e.code === 'bad_member')).toBe(true)

    a.send({ t: 'transfer', member: b.you })
    expect(a.view?.members[b.you].host).toBe(true)
    expect(a.view?.members[a.you].host).toBe(false)
    a.send({ t: 'start' })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'forbidden' })
    world.hibernate()
    b.send({ t: 'start' })
    expect(b.view?.room.status).toBe('playing')
  })

  it('passes on after the grace, to the earliest seated member online; coming back does not undo it', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const spectator = world.join('S')
    spectator.send({ t: 'sit', seat: null })
    const c = world.join('C')
    const d = world.join('D')

    world.disconnect(a)
    world.clock += RECONNECT_GRACE_MS - 1
    world.host.sweep()
    expect(c.view?.members[a.you].host).toBe(true)

    world.clock += 1
    world.host.sweep()
    expect(c.view?.members[a.you].host).toBe(false)
    expect(c.view?.members[c.you].host).toBe(true)
    expect(d.view?.members[d.you].host).toBe(false)
    expect(c.view).toEqual(c.fresh())

    const back = world.join('A', a.token)
    expect(back.you).toBe(a.you)
    expect(back.view?.members[a.you].host).toBe(false)
  })

  it('stays host when back within the grace, and counts the absence from the last one', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    world.disconnect(a)
    world.clock += RECONNECT_GRACE_MS - 1
    const back = world.join('A', a.token)
    world.clock += RECONNECT_GRACE_MS
    b.send({ t: 'resync' })
    back.send({ t: 'resync' })
    world.host.sweep()
    expect(b.view?.members[a.you].host).toBe(true)
  })

  it('falls to a spectator when nobody seated is online, and waits if nobody is', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    b.send({ t: 'sit', seat: null })
    world.disconnect(a)
    world.disconnect(b)
    world.clock += RECONNECT_GRACE_MS * 2
    world.host.sweep()
    expect(world.stored().room?.hostId).toBe(a.you)

    const spectator = world.join('S')
    spectator.send({ t: 'sit', seat: null })
    world.clock += 1
    world.host.sweep()
    expect(spectator.view?.members[spectator.you].host).toBe(true)
  })

  it('counts a host lost in a restart as gone from the restart on', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    world.restart()
    const back = world.join('B', b.token)
    world.clock += RECONNECT_GRACE_MS
    back.send({ t: 'resync' })
    world.host.sweep()
    expect(back.view?.members[a.you].host).toBe(false)
    expect(back.view?.members[b.you].host).toBe(true)
  })
})

describe('dissolving', () => {
  it('closes everyone and deletes the room for good', () => {
    const { world, x, o } = started()
    o.send({ t: 'dissolve' })
    expect(o.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    x.send(place(0))

    x.send({ t: 'dissolve' })
    expect(x.closed).toBe(CloseCode.dissolved)
    expect(o.closed).toBe(CloseCode.dissolved)
    expect(world.host.summary()).toBeNull()
    expect(world.host.admit('1')).toMatchObject({ code: CloseCode.roomNotFound })
    expect(world.host.nextAlarm()).toBeNull()
    expect(world.store.size).toBe(0)
    expect(world.steps.size).toBe(0)

    // The sockets' own close, and anything already on its way, find nothing to do
    world.host.closed(x.conn)
    world.host.message(o.conn, JSON.stringify({ t: 'resync' }))
    world.host.sweep()

    world.hibernate()
    expect(world.host.summary()).toBeNull()
  })
})

describe('a rematch', () => {
  it('starts a new game with the same seats, without the old steps', () => {
    const { world, x, o } = started()
    x.send({ t: 'rematch' })
    expect(x.errors).toEqual([{ t: 'error', code: 'wrong_status' }])
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    expect(x.view?.room.status).toBe('ended')
    expect(world.storedSteps()).toHaveLength(5)

    o.send({ t: 'rematch' })
    expect(o.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    x.send({ t: 'rematch' })
    expect(o.view?.room.status).toBe('playing')
    expect(o.game.over).toBe(false)
    expect(o.seat).toBe(1)
    expect(world.storedSteps()).toEqual([])
    expect(o.view).toEqual(o.fresh())
  })

  it('needs enough players left', () => {
    const { x, o } = started()
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    x.send({ t: 'kick', member: o.you })
    x.send({ t: 'rematch' })
    expect(x.errors.at(-1)).toEqual({ t: 'error', code: 'not_enough_players' })
    expect(x.view?.room.status).toBe('ended')
  })
})

describe('changing the game', () => {
  it('goes back to waiting from any status, with the new rules and no old game', () => {
    const world = room('tictactoe', modules)
    const a = world.join('A')
    const b = world.join('B')
    b.send({ t: 'set_game', gameId: 'big' })
    expect(b.errors).toEqual([{ t: 'error', code: 'forbidden' }])
    a.send({ t: 'set_game', gameId: 'nope' })
    expect(a.errors).toEqual([{ t: 'error', code: 'bad_game' }])

    a.send({ t: 'start' })
    a.send(place(0))
    a.send({ t: 'set_game', gameId: 'big', options: { rounds: 5, fast: 'nonsense' } })
    expect(b.view?.room).toMatchObject({
      gameId: 'big',
      status: 'waiting',
      options: { rounds: 5, fast: false },
      minPlayers: 2,
      maxSeats: 6,
    })
    expect(b.view?.game).toBeNull()
    expect(world.stored().game).toBeNull()
    expect(world.storedSteps()).toEqual([])
    expect(world.host.summary()?.gameId).toBe('big')
    expect(b.view).toEqual(b.fresh())
    world.hibernate()
    expect(world.host.summary()?.maxSeats).toBe(6)
  })

  it('moves whoever has no seat in the new game, and clears ready', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    const c = world.join('C')
    b.send({ t: 'sit', seat: 5 })
    c.send({ t: 'sit', seat: 4 })
    a.send({ t: 'ready', ready: true })

    // Two seats: A stays in 0, B takes the one left, C has none
    a.send({ t: 'set_game', gameId: 'tictactoe' })
    expect(a.seat).toBe(0)
    expect(c.view?.members[b.you].seat).toBe(1)
    expect(c.view?.members[c.you].seat).toBeNull()
    expect(c.view?.members[a.you].ready).toBe(false)
    expect(c.view).toEqual(c.fresh())
  })
})

describe('rule options', () => {
  it('are the host’s to set while waiting, and fall back to defaults', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const b = world.join('B')
    expect(b.view?.room.options).toEqual({ rounds: 3, fast: false })

    b.send({ t: 'set_options', options: { rounds: 1 } })
    expect(b.errors).toEqual([{ t: 'error', code: 'forbidden' }])

    b.send({ t: 'ready', ready: true })
    a.send({ t: 'set_options', options: { rounds: 5, fast: true, extra: 1 } })
    expect(b.view?.room.options).toEqual({ rounds: 5, fast: true })
    expect(b.view?.members[b.you].ready).toBe(false)

    a.send({ t: 'set_options', options: { rounds: 99 } })
    expect(b.view?.room.options).toEqual({ rounds: 3, fast: false })

    a.send({ t: 'start' })
    a.send({ t: 'set_options', options: { rounds: 1 } })
    expect(a.errors).toEqual([{ t: 'error', code: 'wrong_status' }])
  })
})

describe('timers', () => {
  it('count from the phase that asks, fire as system, and are stored as replay steps', () => {
    const { world, a, b } = timedRoom()
    expect(lastTimer(b)).toEqual({
      t: 'timer',
      timers: [{ id: 'phase-0', remainingMs: 1000, totalMs: 1000 }],
    })
    expect(world.host.nextAlarm()).toBe(world.clock + 1000)

    world.clock += 999
    world.host.sweep()
    expect(phaseOf(a)).toBe(0)

    world.clock += 1
    world.host.sweep()
    expect(phaseOf(a)).toBe(1)
    expect(lastTimer(b)).toEqual({
      t: 'timer',
      timers: [{ id: 'phase-1', remainingMs: 1000, totalMs: 1000 }],
    })
    expect(world.storedSteps()).toEqual([{ actor: 'system', action: { type: 'next' } }])

    world.clock += 1000
    world.host.sweep()
    expect(a.view?.room.status).toBe('ended')
    expect(lastTimer(b)).toEqual({ t: 'timer', timers: [] })
    expect(a.view).toEqual(a.fresh())

    const stored = world.stored().game
    const again = replayMatch(
      timedGame,
      stored?.seats ?? [],
      {},
      stored?.seed ?? 0,
      world.storedSteps(),
    )
    expect(again).toEqual(stored?.match)
  })

  it('keeps running through an action that leaves the same id, without telling anyone again', () => {
    const { world, a, b } = timedRoom()
    const before = b.received.filter((m) => m.t === 'timer').length
    world.clock += 400
    a.send({ t: 'action', action: { type: 'poke' } })
    expect((b.game.view as TimedState).pokes).toBe(1)
    expect(b.received.filter((m) => m.t === 'timer')).toHaveLength(before)
    expect(world.host.nextAlarm()).toBe(world.clock + 600)
  })

  it('tells someone who joins or reconnects what is left, not the whole time', () => {
    const { world, a } = timedRoom()
    world.clock += 300
    const late = world.join('Late')
    expect(lastTimer(late)).toEqual({
      t: 'timer',
      timers: [{ id: 'phase-0', remainingMs: 700, totalMs: 1000 }],
    })
    const received = a.received.length
    a.send({ t: 'resync' })
    expect(a.received.slice(received).map((m) => m.t)).toEqual(['timer', 'snapshot'])
    expect(lastTimer(a)).toEqual({
      t: 'timer',
      timers: [{ id: 'phase-0', remainingMs: 700, totalMs: 1000 }],
    })
  })

  it('tells nobody about timers in a game without any', () => {
    const { x: a } = started()
    expect(lastTimer(a)).toBeUndefined()
  })

  it('survive hibernation and a restart, firing on the original time', () => {
    const { world, a } = timedRoom()
    world.clock += 400
    world.hibernate()
    expect(world.host.nextAlarm()).toBe(world.clock + 600)
    world.clock += 600
    world.host.sweep()
    expect(phaseOf(a)).toBe(1)

    world.clock += 200
    world.restart()
    // Nobody connected, and the clock still runs
    expect(world.host.nextAlarm()).toBe(world.clock + 800)
    world.clock += 800
    world.host.sweep()
    expect(world.host.summary()?.status).toBe('ended')
    // Not a timer any more: what is left is the clean-up, counted from the restart that emptied it
    expect(world.host.nextAlarm()).toBe(world.clock - 800 + ROOM_CLEANUP_MS)
  })

  it('catches up in order after a late alarm, a timer started now counting from now', () => {
    const { world, a } = timedRoom()
    world.clock += 5000
    world.host.sweep()
    expect(phaseOf(a)).toBe(1)
    expect(world.host.nextAlarm()).toBe(world.clock + 1000)
  })

  it('stop when the game is dropped', () => {
    const { world, a, b } = timedRoom()
    a.send({ t: 'reopen' })
    expect(lastTimer(b)).toEqual({ t: 'timer', timers: [] })
    world.clock += 5000
    world.host.sweep()
    expect(b.view?.room.status).toBe('waiting')
    expect(world.storedSteps()).toEqual([])
  })

  it('fire once even when the game refuses the action and keeps asking', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { world, a, b } = timedRoom('stubborn')
    world.clock += 1000
    world.host.sweep()
    expect(log).toHaveBeenCalledOnce()
    expect(lastTimer(b)).toEqual({ t: 'timer', timers: [] })
    expect(b.view?.room.status).toBe('playing')
    expect(b.view).toEqual(b.fresh())

    // Still listed by the state, so it does not start over either
    a.send({ t: 'action', action: { type: 'poke' } })
    expect(lastTimer(b)).toEqual({ t: 'timer', timers: [] })
    world.clock += 5000
    world.host.sweep()
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('leave the sweep every interval when the alarm was a far-off timer', () => {
    const { world } = timedRoom()
    world.hibernate()
    const far = world.clock + 10 * SWEEP_INTERVAL_MS
    world.host.restore(world.stored(), world.sockets, far)
    expect(world.host.nextAlarm()).toBeLessThanOrEqual(world.clock + SWEEP_INTERVAL_MS)
  })
})

// ── Chat (e1-t07), spectators (e1-t08), absence and cover (e2-t05) ──────────────────────────────

const chats = (client: Client) => client.received.filter((m) => m.t === 'chat')
const texts = (client: Client) =>
  chats(client).flatMap((m) => (m.t === 'chat' ? m.messages.map((x) => x.text) : []))

describe('chat', () => {
  it('goes to everyone, sender and spectators too, stamped by the room', () => {
    const { world, x, o } = started()
    const spectator = world.join('Sam')
    x.send({ t: 'chat', text: '  hello\r\nthere‮ ' })
    for (const client of [x, o, spectator]) {
      expect(chats(client).at(-1)).toEqual({
        t: 'chat',
        messages: [{ id: 1, from: x.you, name: 'Xia', text: 'hello\nthere', at: world.clock }],
      })
    }
    spectator.send({ t: 'chat', text: 'me too' })
    expect(texts(x)).toEqual(['hello\nthere', 'me too'])
  })

  it('does not touch rev, so nobody sees a gap', () => {
    const { x, o } = started()
    const rev = o.rev
    x.send({ t: 'chat', text: 'hi' })
    expect(o.rev).toBe(rev)
  })

  it('closes a socket sending what cannot be a message', () => {
    const { x } = started()
    x.send({ t: 'chat', text: '   ' })
    expect(x.closed).toBe(CloseCode.badMessage)
  })

  it('starts every welcome with a reset, then the history in chunks', () => {
    const world = room()
    const a = world.join('A')
    expect(a.received.at(-1)).toEqual({ t: 'chat', messages: [], reset: true })
    for (let i = 0; i < 120; i++) {
      world.clock += CHAT_RATE.windowMs
      a.send({ t: 'chat', text: `m${i}` })
    }
    const later = world.join('Later')
    const frames = chats(later)
    expect(frames.map((m) => (m.t === 'chat' ? m.messages.length : 0))).toEqual([50, 50, 20])
    expect(frames.map((m) => (m.t === 'chat' ? m.reset : null))).toEqual([
      true,
      undefined,
      undefined,
    ])
    expect(texts(later)[0]).toBe('m0')
    expect(texts(later).at(-1)).toBe('m119')
  })

  it('keeps the latest ones, in storage too, and ids go on through a restart', () => {
    const world = room()
    const a = world.join('A')
    for (let i = 0; i < CHAT_HISTORY + 5; i++) {
      world.clock += CHAT_RATE.windowMs
      a.send({ t: 'chat', text: `m${i}` })
    }
    expect(world.chat.size).toBe(CHAT_HISTORY)
    world.restart()
    const back = world.join('A', a.token)
    expect(texts(back)).toHaveLength(CHAT_HISTORY)
    expect(texts(back)[0]).toBe('m5')
    world.clock += CHAT_RATE.windowMs
    back.send({ t: 'chat', text: 'next' })
    const last = chats(back).at(-1)
    expect(last?.t === 'chat' && last.messages[0].id).toBe(CHAT_HISTORY + 6)
  })

  it('limits each member by itself, with the window sliding', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    for (let i = 0; i < CHAT_RATE.count; i++) a.send({ t: 'chat', text: 'x' })
    expect(a.errors).toEqual([])
    a.send({ t: 'chat', text: 'too many' })
    expect(a.errors).toEqual([{ t: 'error', code: 'rate_limited' }])
    expect(texts(b)).not.toContain('too many')
    b.send({ t: 'chat', text: 'still fine' })
    expect(b.errors).toEqual([])
    world.clock += CHAT_RATE.windowMs
    a.send({ t: 'chat', text: 'again' })
    expect(texts(b)).toContain('again')
  })

  it('is refused while the game locks it, and open again after', () => {
    const locked = {
      ...timedGame,
      id: 'locked',
      timers: undefined,
      chatLocked: (state: TimedState) => state.pokes === 0,
    } as unknown as AnyGameModule
    const world = room('locked', { locked })
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'chat', text: 'before' })
    a.send({ t: 'start' })
    b.send({ t: 'chat', text: 'during' })
    expect(b.errors).toEqual([{ t: 'error', code: 'chat_locked' }])
    expect(texts(a)).toEqual(['before'])
    a.send({ t: 'action', action: { type: 'poke' } })
    b.send({ t: 'chat', text: 'unlocked' })
    expect(texts(a)).toEqual(['before', 'unlocked'])
  })

  it('needs a join first, and leaves with the room', () => {
    const world = room()
    const stranger = world.open()
    stranger.send({ t: 'chat', text: 'hi' })
    expect(stranger.errors).toEqual([{ t: 'error', code: 'not_joined' }])
    const a = world.join('A')
    a.send({ t: 'chat', text: 'hi' })
    a.send({ t: 'dissolve' })
    expect(world.chat.size).toBe(0)
  })

  it('keeps a kicked member’s old messages under their name', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    b.send({ t: 'chat', text: 'bye' })
    a.send({ t: 'kick', member: b.you })
    const later = world.join('Later')
    const first = chats(later)[0]
    expect(first.t === 'chat' && first.messages[0]).toMatchObject({ name: 'B', text: 'bye' })
  })
})

describe('spectators', () => {
  it('join a running game with the spectator’s view and no actions', () => {
    const { world, x } = started()
    const spectator = world.join('Sam')
    expect(spectator.seat).toBeNull()
    expect(spectator.game.legal).toEqual([])
    spectator.send(place(0))
    expect(spectator.errors).toEqual([{ t: 'error', code: 'not_seated' }])
    expect(x.view?.members[spectator.you].seat).toBeNull()
  })

  it('cannot take a seat during a game, can once it has ended, and play the rematch', () => {
    const { world, x, o } = started()
    const spectator = world.join('Sam')
    spectator.send({ t: 'sit', seat: 1 })
    expect(spectator.errors.at(-1)).toEqual({ t: 'error', code: 'wrong_status' })
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    expect(x.view?.room.status).toBe('ended')

    spectator.send({ t: 'sit', seat: 1 })
    expect(spectator.errors.at(-1)).toEqual({ t: 'error', code: 'seat_taken' })
    o.send({ t: 'sit', seat: null })
    spectator.send({ t: 'sit', seat: 1 })
    expect(spectator.seat).toBe(1)
    expect(x.view).toEqual(x.fresh())

    x.send({ t: 'rematch' })
    expect(spectator.view?.room.status).toBe('playing')
    expect(spectator.game.view).toMatchObject({ you: 1 })
    expect(o.game.legal).toEqual([])
  })

  it('see a finished game as a spectator from a seat that was not in it', () => {
    const viewers = {
      ...timedGame,
      id: 'viewers',
      view: (_: TimedState, viewer: number | 'spectator') => ({ viewer }),
    } as unknown as AnyGameModule
    const world = room('viewers', { viewers })
    const a = world.join('A')
    world.join('B')
    a.send({ t: 'start' })
    const late = world.join('Late')
    world.clock += 1000
    world.host.sweep()
    world.clock += 1000
    world.host.sweep()
    expect(a.view?.room.status).toBe('ended')

    // A seat the two-player game never had: its view would be for a seat that does not exist
    late.send({ t: 'sit', seat: 3 })
    expect(late.seat).toBe(3)
    expect(late.game.view).toEqual({ viewer: 'spectator' })
    expect(a.game.view).toEqual({ viewer: 0 })
    expect(late.view).toEqual(late.fresh())
  })

  it('are removed once absent, and are someone new when they return', () => {
    const world = room('big', modules)
    const a = world.join('A')
    const spectator = world.join('Sam')
    spectator.send({ t: 'sit', seat: null })
    world.disconnect(spectator)
    world.clock += RECONNECT_GRACE_MS
    a.send({ t: 'resync' })
    world.host.sweep()
    expect(a.view?.members[spectator.you]).toBeUndefined()
    expect(world.stored().members).toHaveLength(1)
    expect(a.view).toEqual(a.fresh())

    const back = world.join('Sam', spectator.token)
    expect(back.you).not.toBe(spectator.you)
  })

  it('stay while they are the host, there being nobody to hand it to', () => {
    const world = room('big', modules)
    const a = world.join('A')
    a.send({ t: 'sit', seat: null })
    world.disconnect(a)
    world.clock += RECONNECT_GRACE_MS * 2
    world.host.sweep()
    expect(world.stored().members).toHaveLength(1)
    expect(world.stored().room?.hostId).toBe(a.you)
  })
})

/** Turns go round the seats; each is a `roll`; `skipAction` passes as `system` */
type TurnState = { turn: number; seats: number; log: string[] }
const turnGame = {
  id: 'turns',
  meta: { minPlayers: 2, maxPlayers: 4, minutes: 1, i18nKey: 'games.turns', proxyTurns: true },
  options: {},
  init: (seats: { id: number }[]) => ({ turn: 0, seats: seats.length, log: [] }),
  reduce: (state: TurnState, action: { type: string }, actor: number | 'system') => {
    const next = (state.turn + 1) % state.seats
    if (action?.type === 'pass' && actor === 'system') {
      return { ...state, turn: next, log: [...state.log, `pass ${state.turn}`] }
    }
    if (['roll', 'stay'].includes(action?.type) && actor === state.turn) {
      return { ...state, turn: next, log: [...state.log, `${action.type} ${actor}`] }
    }
    return gameError('nope')
  },
  view: (state: TurnState) => state,
  legalActions: (state: TurnState, seat: number) =>
    state.turn === seat ? [{ type: 'roll' }, { type: 'stay' }] : [],
  skipAction: () => ({ type: 'pass' }),
  isOver: () => false,
  result: () => ({ summary: { key: 'over' }, standings: [] }),
} as unknown as AnyGameModule
const noCoverGame = {
  ...turnGame,
  id: 'nocover',
  meta: { ...turnGame.meta, proxyTurns: undefined },
  skipAction: undefined,
} as unknown as AnyGameModule

function turnRoom(gameId = 'turns') {
  const world = room(gameId, { turns: turnGame, nocover: noCoverGame })
  const a = world.join('A')
  const b = world.join('B')
  a.send({ t: 'start' })
  return { world, a, b }
}

/** B, whose turn comes after A's, goes away for long enough */
function absentB() {
  const { world, a, b } = turnRoom()
  a.send({ t: 'action', action: { type: 'roll' } })
  world.disconnect(b)
  world.clock += RECONNECT_GRACE_MS
  a.send({ t: 'resync' })
  world.host.sweep()
  return { world, a, b }
}

describe('someone gone', () => {
  it('is offline at once, and absent only past the grace', () => {
    const { world, a, b } = turnRoom()
    world.disconnect(b)
    expect(a.view?.members[b.you]).toMatchObject({ online: false, absent: false })
    world.clock += RECONNECT_GRACE_MS - 1
    a.send({ t: 'resync' })
    world.host.sweep()
    expect(a.view?.members[b.you].absent).toBe(false)
    world.clock += 1
    a.send({ t: 'resync' })
    world.host.sweep()
    expect(a.view?.members[b.you].absent).toBe(true)
    expect(a.view).toEqual(a.fresh())
    expect(world.join('B', b.token).view?.members[b.you]).toMatchObject({
      online: true,
      absent: false,
      seat: 1,
    })
  })

  it('stays absent through hibernation, and a socket lost in a restart counts from then', () => {
    const { world, a } = absentB()
    world.hibernate()
    expect(a.fresh().coverable).toHaveLength(1)
    world.restart()
    const back = world.join('A', a.token)
    expect(back.view?.coverable).toHaveLength(1)
  })

  it('makes their turn coverable, and only while it is their turn', () => {
    const { world, a, b } = absentB()
    expect(a.view?.coverable).toEqual([{ seat: 1, skip: true, proxy: true }])
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(a.view?.coverable).toEqual([])
    expect((a.game.view as TurnState).log.at(-1)).toBe('pass 1')
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'cannot_cover' })
    const stored = world.stored().game
    const again = replayMatch(
      turnGame,
      stored?.seats ?? [],
      {},
      stored?.seed ?? 0,
      world.storedSteps(),
    )
    expect(again).toEqual(stored?.match)
    void b
  })

  it('can have a random legal action played for them, as their own seat, replayably', () => {
    const { world, a } = absentB()
    a.send({ t: 'cover', seat: 1, how: 'proxy' })
    const last = (a.game.view as TurnState).log.at(-1)
    expect(['roll 1', 'stay 1']).toContain(last)
    expect(world.storedSteps().at(-1)?.actor).toBe(1)
    const stored = world.stored().game
    const again = replayMatch(
      turnGame,
      stored?.seats ?? [],
      {},
      stored?.seed ?? 0,
      world.storedSteps(),
    )
    expect(again).toEqual(stored?.match)
  })

  it('counts a seat emptied by a kick at once', () => {
    const { a, b } = turnRoom()
    a.send({ t: 'action', action: { type: 'roll' } })
    a.send({ t: 'kick', member: b.you })
    expect(a.view?.coverable).toEqual([{ seat: 1, skip: true, proxy: true }])
    a.send({ t: 'cover', seat: 1, how: 'proxy' })
    expect(a.view?.coverable).toEqual([])
    expect(a.errors).toEqual([])
  })

  it('is covered by the host only, not before the grace, and not after they return', () => {
    const { world, a, b } = turnRoom()
    a.send({ t: 'action', action: { type: 'roll' } })
    world.disconnect(b)
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'cannot_cover' })

    world.clock += RECONNECT_GRACE_MS
    a.send({ t: 'resync' })
    world.host.sweep()
    const spectator = world.join('Sam')
    spectator.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(spectator.errors).toEqual([{ t: 'error', code: 'forbidden' }])

    const back = world.join('B', b.token)
    expect(back.view?.coverable).toEqual([])
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'cannot_cover' })
    expect(a.game.legal).toEqual([])
    back.send({ t: 'action', action: { type: 'roll' } })
    expect(back.errors).toEqual([])
  })

  it('cannot be covered in a game that allows neither', () => {
    const { world, a, b } = turnRoom('nocover')
    a.send({ t: 'action', action: { type: 'roll' } })
    world.disconnect(b)
    world.clock += RECONNECT_GRACE_MS
    a.send({ t: 'resync' })
    world.host.sweep()
    expect(a.view?.coverable).toEqual([{ seat: 1, skip: false, proxy: false }])
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    a.send({ t: 'cover', seat: 1, how: 'proxy' })
    expect(a.errors).toEqual([
      { t: 'error', code: 'cannot_cover' },
      { t: 'error', code: 'cannot_cover' },
    ])
  })

  it('refuses a seat not in the game, and outside a game', () => {
    const { a } = absentB()
    a.send({ t: 'cover', seat: 3, how: 'skip' })
    expect(a.errors.at(-1)).toEqual({ t: 'error', code: 'cannot_cover' })
    a.send({ t: 'reopen' })
    a.send({ t: 'cover', seat: 1, how: 'skip' })
    expect(a.errors).toHaveLength(2)
    expect(a.view?.coverable).toEqual([])
  })

  it('in promotion: a real pass moves the turn and the rounds, a browser cannot send one', () => {
    const world = new World({ promotion: promotion as unknown as AnyGameModule })
    expect(world.host.create(ROOM_ID, 'promotion', undefined)).toBe(true)
    const a = world.join('A')
    const b = world.join('B')
    a.send({ t: 'start' })
    const first = a.game.legal.length > 0 ? a : b
    const other = first === a ? b : a
    first.send({ t: 'action', action: { type: 'pass' } })
    expect(first.errors.at(-1)?.code).toBe('game_error')
    first.send({ t: 'action', action: { type: 'roll' } })
    world.disconnect(other)
    world.clock += RECONNECT_GRACE_MS
    first.send({ t: 'resync' })
    world.host.sweep()
    expect(first.view?.coverable).toEqual([{ seat: other.seat, skip: true, proxy: true }])
    first.send({ t: 'cover', seat: other.seat, how: 'skip' })
    expect(first.game.legal).toEqual([{ type: 'roll' }])
    first.send({ t: 'action', action: { type: 'roll' } })
    first.send({ t: 'cover', seat: other.seat, how: 'proxy' })
    expect(first.errors.filter((e) => e.code === 'cannot_cover')).toEqual([])
    expect(first.view).toEqual(first.fresh())
  })
})

describe('clean-up (e1-t10)', () => {
  /** Runs the alarm whenever the room asked for it, as the runtime does, until `until` */
  function runAlarms(world: World, until: number) {
    for (;;) {
      const at = world.host.nextAlarm()
      if (at === null || at > until) break
      world.clock = at
      world.host.sweep()
    }
    world.clock = until
  }

  const wiped = (world: World) => {
    expect(world.host.summary()).toBeNull()
    expect(world.host.nextAlarm()).toBeNull()
    expect(world.store.size).toBe(0)
    expect(world.steps.size).toBe(0)
    expect(world.chat.size).toBe(0)
  }

  it('deletes a room nobody ever joined, ten minutes after it was made', () => {
    const world = room()
    expect(world.host.nextAlarm()).toBe(world.clock + ROOM_CLEANUP_MS)
    const start = world.clock
    runAlarms(world, start + ROOM_CLEANUP_MS - 1)
    expect(world.host.summary()).not.toBeNull()
    runAlarms(world, start + ROOM_CLEANUP_MS)
    wiped(world)
    expect(world.host.admit('1')).toMatchObject({ code: CloseCode.roomNotFound })
  })

  it('counts from the last socket going, and starts over for someone coming back', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    world.clock += 30_000
    world.disconnect(a)
    world.clock += 60_000
    world.disconnect(b)
    const emptied = world.clock
    expect(world.host.nextAlarm()).toBe(emptied + ROOM_CLEANUP_MS)

    world.clock += ROOM_CLEANUP_MS / 2
    const back = world.join('B', b.token)
    expect(back.you).toBe(b.you)
    world.disconnect(back)
    expect(world.host.nextAlarm()).toBe(world.clock + ROOM_CLEANUP_MS)

    const second = world.clock
    runAlarms(world, second + ROOM_CLEANUP_MS - 1)
    expect(world.host.summary()).not.toBeNull()
    runAlarms(world, second + ROOM_CLEANUP_MS)
    wiped(world)
  })

  it('keeps counting through hibernation and restarts, and does not start over', () => {
    const world = room()
    const a = world.join('A')
    world.disconnect(a)
    const emptied = world.clock
    world.clock += 60_000
    world.hibernate()
    expect(world.host.nextAlarm()).toBe(emptied + ROOM_CLEANUP_MS)
    world.clock += 60_000
    world.restart()
    expect(world.host.nextAlarm()).toBe(emptied + ROOM_CLEANUP_MS)
  })

  it('starts counting when a restart took every socket and told nobody', () => {
    const world = room()
    world.join('A')
    world.clock += 60_000
    world.restart()
    expect(world.host.nextAlarm()).toBe(world.clock + ROOM_CLEANUP_MS)
    expect(world.stored().room?.emptySince).toBe(world.clock)
  })

  it('leaves a room with someone in it alone, however long', () => {
    const { world, x } = started()
    for (let i = 0; i < 6; i++) {
      world.clock += ROOM_CLEANUP_MS / 2
      for (const { conn } of world.sockets) world.host.heartbeat(conn, world.clock)
      world.host.sweep()
    }
    expect(world.host.summary()).not.toBeNull()
    expect(x.closed).toBeNull()
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)
  })

  it('takes every part of a finished game with it', () => {
    const { world, x, o } = started()
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
    ] as const) {
      client.send(place(cell))
    }
    x.send({ t: 'chat', text: 'bye' })
    world.disconnect(x)
    world.disconnect(o)
    expect(world.steps.size).toBeGreaterThan(0)
    expect(world.chat.size).toBeGreaterThan(0)
    runAlarms(world, world.clock + ROOM_CLEANUP_MS)
    wiped(world)
  })

  it('deletes a finished room nobody does anything in, and tells those still there', () => {
    const { world, x, o } = started()
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    expect(x.view?.room.status).toBe('ended')
    const ended = world.clock
    expect(world.stored().room?.idleSince).toBe(ended)
    expect(world.host.nextAlarm()).toBe(ended + SWEEP_INTERVAL_MS)

    // Chat counts as something happening
    world.clock += ROOM_CLEANUP_MS - 1000
    x.send({ t: 'chat', text: 'one more?' })
    const lastWord = world.clock
    for (const { conn } of world.sockets) world.host.heartbeat(conn, world.clock)
    world.host.sweep()
    expect(world.host.summary()).not.toBeNull()

    world.clock = lastWord + ROOM_CLEANUP_MS - 1
    for (const { conn } of world.sockets) world.host.heartbeat(conn, world.clock)
    world.host.sweep()
    expect(world.host.summary()).not.toBeNull()

    world.clock += 1
    world.host.sweep()
    expect(x.closed).toBe(CloseCode.roomNotFound)
    expect(o.closed).toBe(CloseCode.roomNotFound)
    wiped(world)
  })

  it('stops the finished clock for a rematch, and an unfinished game has none', () => {
    const { world, x, o } = started()
    expect(world.stored().room?.idleSince).toBeNull()
    for (const [client, cell] of [
      [x, 0],
      [o, 3],
      [x, 1],
      [o, 4],
      [x, 2],
    ] as const) {
      client.send(place(cell))
    }
    expect(world.stored().room?.idleSince).toBe(world.clock)
    x.send({ t: 'rematch' })
    expect(x.view?.room.status).toBe('playing')
    expect(world.stored().room?.idleSince).toBeNull()
  })

  it('shares the alarm with the sweep and a game timer, earliest first', () => {
    const { world, a, b } = timedRoom('stubborn')
    // The stubborn game's timer is due in a second, before the sweep
    expect(world.host.nextAlarm()).toBe(world.clock + 1000)
    world.clock += 1000
    world.host.sweep()
    // Spent, and refused by the game: the sweep is next
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)

    // Nobody left: no more sweeps, and the clean-up is what is left
    world.disconnect(a)
    world.disconnect(b)
    const emptied = world.clock
    expect(world.host.nextAlarm()).toBe(emptied + ROOM_CLEANUP_MS)
    world.clock = emptied + ROOM_CLEANUP_MS
    world.host.sweep()
    wiped(world)
  })

  it('lets game timers go on firing in an empty room, before the clean-up', () => {
    const { world, a, b } = timedRoom()
    world.disconnect(a)
    world.disconnect(b)
    const emptied = world.clock
    expect(world.host.nextAlarm()).toBe(emptied + 1000)
    world.clock += 1000
    world.host.sweep()
    expect(world.storedSteps().at(-1)?.actor).toBe('system')
    expect(world.host.nextAlarm()).toBe(world.clock + 1000)
    runAlarms(world, emptied + ROOM_CLEANUP_MS)
    wiped(world)
  })

  it('moves the host on before the clean-up has any say, with someone still there', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    world.disconnect(a)
    world.clock += RECONNECT_GRACE_MS
    world.host.heartbeat(b.conn, world.clock)
    world.host.sweep()
    expect(b.view?.members[b.you].host).toBe(true)
    expect(world.stored().room?.emptySince).toBeNull()
  })

  it('takes rooms from before this existed as private, with clocks that start when they wake', () => {
    const world = room()
    world.join('A')
    world.clients.clear()
    world.sockets = []
    const stored = world.stored()
    const old = { ...stored.room } as Record<string, unknown>
    delete old.public
    delete old.emptySince
    delete old.idleSince
    world.store.set('room', JSON.stringify(old))

    world.hibernate()
    expect(world.host.listing()).toBeNull()
    expect(world.stored().room).toMatchObject({ public: false, emptySince: world.clock })
    const woke = world.clock
    expect(world.host.nextAlarm()).toBe(woke + ROOM_CLEANUP_MS)
    // Saved, or the alarm that wakes it would find the clock starting over
    world.clock += ROOM_CLEANUP_MS
    world.hibernate()
    world.host.sweep()
    wiped(world)
  })

  it('forgets a kick once it has run out, keeping those that have not', () => {
    const world = room()
    const host = world.join('Host')
    const first = world.join('First')
    const second = world.join('Second')
    host.send({ t: 'kick', member: first.you })
    expect(world.stored().room?.bans).toHaveLength(1)
    world.clock += 60_000
    host.send({ t: 'kick', member: second.you })
    expect(world.stored().room?.bans).toHaveLength(2)

    world.clock += KICK_BAN_MS - 60_000
    world.host.heartbeat(host.conn, world.clock)
    world.host.sweep()
    expect(world.stored().room?.bans.map((ban) => ban.token)).toEqual([second.token])
    // Past the ban, the token is someone new again
    expect(world.join('First', first.token).closed).toBeNull()
    expect(world.join('Second', second.token).closed).toBe(CloseCode.kicked)
  })

  it('does not move the view or rev by itself', () => {
    const world = room()
    const a = world.join('A')
    const b = world.join('B')
    const rev = a.rev
    world.clock += 1000
    world.host.heartbeat(a.conn, world.clock)
    world.host.heartbeat(b.conn, world.clock)
    world.host.sweep()
    expect(a.rev).toBe(rev)
    expect(a.fresh()).toEqual(a.view)
  })
})

describe('the public listing (e1-t09)', () => {
  function publicRoom(gameId = 'tictactoe') {
    const world = new World()
    expect(world.host.create(ROOM_ID, gameId, undefined, true)).toBe(true)
    return world
  }

  it('is never there for a private room', () => {
    const world = room()
    const a = world.join('A')
    expect(world.host.listing()).toBeNull()
    expect(a.view?.room).not.toHaveProperty('public')
  })

  it('shows a waiting room with free seats once someone is in it', () => {
    const world = publicRoom()
    expect(world.host.listing()).toBeNull()
    world.join('Ann')
    expect(world.host.listing()).toEqual({
      id: ROOM_ID,
      gameId: 'tictactoe',
      host: 'Ann',
      seated: 1,
      maxSeats: 2,
      createdAt: 10_000,
    })
  })

  it('goes away when the seats fill, the game starts or everyone leaves, and comes back', () => {
    const world = publicRoom()
    const a = world.join('Ann')
    expect(world.host.listing()).not.toBeNull()
    const b = world.join('Bo')
    expect(world.host.listing()).toBeNull()
    b.send({ t: 'sit', seat: null })
    expect(world.host.listing()).toMatchObject({ seated: 1 })
    b.send({ t: 'sit', seat: 1 })
    a.send({ t: 'start' })
    expect(a.view?.room.status).toBe('playing')
    expect(world.host.listing()).toBeNull()
    a.send({ t: 'reopen' })
    expect(world.host.listing()).toBeNull()
    b.send({ t: 'sit', seat: null })
    expect(world.host.listing()).toMatchObject({ seated: 1 })
    world.disconnect(a)
    expect(world.host.listing()).toMatchObject({ host: 'Ann' })
    world.disconnect(b)
    expect(world.host.listing()).toBeNull()
  })

  it('survives hibernation, and a dissolved room has none', () => {
    const world = publicRoom()
    const a = world.join('Ann')
    world.hibernate()
    expect(world.host.listing()).toMatchObject({ host: 'Ann' })
    a.send({ t: 'dissolve' })
    expect(world.host.listing()).toBeNull()
  })
})
