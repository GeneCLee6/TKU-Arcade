// The room and the engine (AC-1.3, AC-2.2), driven as a browser drives them: every message goes in
// as text and comes out as JSON. RoomHost runs on a fake clock, fake sockets and a fake storage that
// keeps only what was saved, as JSON, so `restart` rebuilds the room from that and nothing else.
// A real Durable Object is not involved: @cloudflare/vitest-pool-workers needs Vitest 4 and this
// repo is on 5.
import { describe, expect, it, vi } from 'vitest'
import { replayMatch, type ReplayStep } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
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
  MAX_CONNECTIONS,
  MAX_MEMBERS,
  PROTOCOL_VERSION,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
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

  open(): Client {
    expect(this.host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
    const conn = `conn-${++this.nextConn}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({ conn, openedAt: this.clock })
    this.host.opened(conn, this.clock)
    return client
  }

  join(name: string, token: string | null = null): Client {
    const client = this.open()
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
      host: true,
      online: true,
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

  it('refuses chat until e1-t07', () => {
    const world = room()
    const a = world.join('A')
    a.send({ t: 'chat', text: 'hi' })
    expect(a.errors).toEqual([{ t: 'error', code: 'unavailable' }])
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
    expect(world.host.nextAlarm()).toBeNull()
    const a = world.join('A')
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)
    world.clock += 1000
    world.host.sweep()
    expect(world.host.nextAlarm()).toBe(world.clock + SWEEP_INTERVAL_MS)
    world.disconnect(a)
    expect(world.host.nextAlarm()).toBeNull()
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
