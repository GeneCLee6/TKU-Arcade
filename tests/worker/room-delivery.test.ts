// Messages delivered once (shared/protocol.ts 20., docs/NETWORK.md §5): a page numbers what it
// sends (`seq`) under its own `session`, the room acknowledges each one it has handled, and one
// sent again after its socket died is not applied twice, also after a restart. RoomHost on a fake
// clock, fake sockets and a storage kept as JSON, as in room-host.test.ts.
import { describe, expect, it } from 'vitest'
import { gameError, type AnyGameModule } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  CloseCode,
  PROTOCOL_VERSION,
  parseClientMessage,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import {
  RoomHost,
  type MemberRecord,
  type OpenSocket,
  type SeqAck,
  type StoredRoom,
} from '../../worker/room-host.ts'

const ROOM_ID = 'abcdefghij'
const SESSION = 'session-aaaaaaaa'
const OTHER_SESSION = 'session-bbbbbbbb'

/** Every `poke` adds one: what a bet is, applied twice */
type CountState = { pokes: number }
const counter = {
  id: 'counter',
  meta: { minPlayers: 2, maxPlayers: 4, minutes: 1, i18nKey: 'games.counter' },
  options: {},
  init: () => ({ pokes: 0 }),
  reduce: (state: CountState, action: { type: string }) =>
    action?.type === 'poke' ? { pokes: state.pokes + 1 } : gameError('nope'),
  view: (state: CountState) => state,
  legalActions: () => [],
  isOver: () => false,
  result: () => ({ summary: { key: 'over' }, standings: [] }),
} as unknown as AnyGameModule

const poke = (seq?: number) => ({
  t: 'action',
  action: { type: 'poke' },
  ...(seq !== undefined ? { seq } : {}),
})

class Client {
  received: ServerMessage[] = []
  view: RoomView | null = null
  you = ''
  token = ''
  closed: number | null = null
  readonly conn: string
  private readonly world: World
  constructor(world: World, conn: string) {
    this.world = world
    this.conn = conn
  }
  receive(message: ServerMessage) {
    this.received.push(message)
    if (message.t === 'welcome') {
      this.you = message.you
      this.token = message.token
    }
    if (message.t === 'welcome' || message.t === 'snapshot') this.view = message.state
    else if (message.t === 'patch') {
      this.view = applyPatch(this.view as JsonValue, message.ops) as RoomView
    }
  }
  send(message: unknown) {
    this.world.host.message(this.conn, JSON.stringify(message))
  }
  get acks(): number[] {
    return this.received.flatMap((message) => (message.t === 'ack' ? [message.seq] : []))
  }
  get welcomeAck(): number | undefined {
    const welcome = this.received.find((message) => message.t === 'welcome')
    return welcome?.t === 'welcome' ? welcome.ack : undefined
  }
  get errors(): string[] {
    return this.received.flatMap((message) => (message.t === 'error' ? [message.code] : []))
  }
  get pokes(): number {
    return (this.view?.game?.view as CountState | undefined)?.pokes ?? -1
  }
}

class World {
  clock = 1_000_000
  clients = new Map<string, Client>()
  store = new Map<string, string>()
  sockets: OpenSocket[] = []
  host: RoomHost
  private next = 0
  constructor() {
    this.host = this.newHost()
  }
  newHost() {
    return new RoomHost({
      sockets: {
        send: (conn, message) =>
          this.clients.get(conn)?.receive(JSON.parse(JSON.stringify(message)) as ServerMessage),
        close: (conn, code) => {
          const client = this.clients.get(conn)
          if (client) client.closed = code
          this.sockets = this.sockets.filter((socket) => socket.conn !== conn)
        },
      },
      storage: {
        saveRoom: (room) => this.store.set('room', JSON.stringify(room)),
        saveMembers: (members) => this.store.set('members', JSON.stringify(members)),
        saveRev: (rev) => this.store.set('rev', JSON.stringify(rev)),
        saveGame: (game) => this.store.set('game', JSON.stringify(game)),
        saveStep: () => {},
        dropSteps: () => {},
        saveChat: (message) => this.store.set(`chat:${message.id}`, JSON.stringify(message)),
        dropChat: (id) => this.store.delete(`chat:${id}`),
        saveAck: (member, ack) => {
          if (ack) this.store.set(`ack:${member}`, JSON.stringify(ack))
          else this.store.delete(`ack:${member}`)
        },
        clearAll: () => this.store.clear(),
      },
      games: (id) => (id === 'counter' ? counter : null),
      now: () => this.clock,
      newMemberId: () => `member-${++this.next}`,
      newToken: () => `token-${this.next}`.padEnd(43, '_'),
      newSeed: () => 7,
    })
  }
  join(name: string, { token = null, session }: { token?: string | null; session?: string } = {}) {
    expect(this.host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
    const conn = `conn-${++this.next}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({ conn, openedAt: this.clock })
    this.host.opened(conn, this.clock, null, null)
    client.send({ t: 'join', name, token, ...(session !== undefined ? { session } : {}) })
    return client
  }
  /** The socket died without a word reaching anyone: the room hears the close later, or never */
  disconnect(client: Client) {
    this.clients.delete(client.conn)
    this.sockets = this.sockets.filter((socket) => socket.conn !== client.conn)
    this.host.closed(client.conn)
  }
  stored(): StoredRoom {
    const read = <T>(key: string, fallback: T): T =>
      this.store.has(key) ? (JSON.parse(this.store.get(key)!) as T) : fallback
    const acks: Record<string, SeqAck> = {}
    for (const [key, value] of this.store) {
      if (key.startsWith('ack:')) acks[key.slice(4)] = JSON.parse(value) as SeqAck
    }
    return {
      room: read('room', null),
      members: read<MemberRecord[]>('members', []),
      rev: read('rev', 0),
      game: read('game', null),
      chat: [],
      acks,
    }
  }
  /** A deploy: every socket closes and the object starts over from storage */
  restart() {
    this.clients.clear()
    this.sockets = []
    this.host = this.newHost()
    this.host.restore(this.stored(), [], null)
  }
}

/** Two at the table, the game started; Ann's page numbers what it sends */
function playing() {
  const world = new World()
  expect(world.host.create(ROOM_ID, 'counter', undefined, false)).toBe(true)
  const ann = world.join('Ann', { session: SESSION })
  const bob = world.join('Bob')
  ann.send({ t: 'start', seq: 1 })
  expect(ann.view?.room.status).toBe('playing')
  return { world, ann, bob }
}

describe('delivered once (shared/protocol.ts 20.)', () => {
  it('acknowledges each numbered message, after its patch, to the sender only', () => {
    const { ann, bob } = playing()
    ann.send(poke(2))
    expect(ann.pokes).toBe(1)
    expect(ann.acks).toEqual([1, 2])
    expect(ann.received.at(-1)).toEqual({ t: 'ack', seq: 2 })
    expect(ann.received.at(-2)?.t).toBe('patch')
    expect(bob.acks).toEqual([])
  })

  it('welcomes a new session at 0', () => {
    const world = new World()
    world.host.create(ROOM_ID, 'counter', undefined, false)
    const ann = world.join('Ann', { session: SESSION })
    expect(ann.welcomeAck).toBe(0)
  })

  it('applies a message sent again on a new socket only once, and still acknowledges it', () => {
    const { world, ann, bob } = playing()
    ann.send(poke(2))
    // The ack never reached the page: its socket was already dead
    world.disconnect(ann)
    const back = world.join('Ann', { token: ann.token, session: SESSION })
    expect(back.welcomeAck).toBe(2)
    back.send(poke(2))
    expect(back.pokes).toBe(1)
    expect(bob.pokes).toBe(1)
    expect(back.acks).toEqual([2])
    expect(back.errors).toEqual([])
    // What comes after is applied as usual
    back.send(poke(3))
    expect(bob.pokes).toBe(2)
  })

  it('applies one that never arrived, sent again with its number', () => {
    const { world, ann, bob } = playing()
    world.disconnect(ann)
    const back = world.join('Ann', { token: ann.token, session: SESSION })
    expect(back.welcomeAck).toBe(1)
    back.send(poke(2))
    expect(bob.pokes).toBe(1)
  })

  it('treats a number at or below the last handled as a repeat: out of order or twice', () => {
    const { ann, bob } = playing()
    ann.send(poke(2))
    ann.send(poke(5))
    ann.send(poke(5))
    ann.send(poke(4))
    ann.send(poke(3))
    expect(bob.pokes).toBe(2)
    expect(ann.acks).toEqual([1, 2, 5, 5, 5, 5])
    // A gap is fine: a page lets go of taps that waited too long
    ann.send(poke(9))
    expect(bob.pokes).toBe(3)
  })

  it('counts a refused message as handled: sent again, it is not tried again', () => {
    const { world, ann, bob } = playing()
    ann.send({ t: 'action', action: { type: 'nope' }, seq: 2 })
    expect(ann.errors).toEqual(['game_error'])
    expect(ann.acks.at(-1)).toBe(2)
    world.disconnect(ann)
    const back = world.join('Ann', { token: ann.token, session: SESSION })
    back.send({ t: 'action', action: { type: 'nope' }, seq: 2 })
    expect(back.errors).toEqual([])
    expect(bob.pokes).toBe(0)
  })

  it('numbers chat too: one message, however often it is sent', () => {
    const { ann, bob } = playing()
    ann.send({ t: 'chat', text: 'hi', seq: 2 })
    ann.send({ t: 'chat', text: 'hi', seq: 2 })
    const chats = bob.received.flatMap((message) => (message.t === 'chat' ? message.messages : []))
    expect(chats.filter((message) => message.text === 'hi')).toHaveLength(1)
  })

  it('starts over with a new session (the page was reloaded)', () => {
    const { world, ann, bob } = playing()
    ann.send(poke(2))
    world.disconnect(ann)
    const reloaded = world.join('Ann', { token: ann.token, session: OTHER_SESSION })
    expect(reloaded.welcomeAck).toBe(0)
    reloaded.send(poke(1))
    expect(bob.pokes).toBe(2)
  })

  it('remembers through a restart: what was handled is stored with the change it made', () => {
    const { world, ann } = playing()
    ann.send(poke(2))
    const token = ann.token
    world.restart()
    const back = world.join('Ann', { token, session: SESSION })
    expect(back.welcomeAck).toBe(2)
    back.send(poke(2))
    expect(back.pokes).toBe(1)
    back.send(poke(3))
    expect(back.pokes).toBe(2)
  })

  it('forgets the numbers of a member who is gone, and of a dissolved room', () => {
    const { world, ann, bob } = playing()
    bob.send({ t: 'chat', text: 'x' })
    expect([...world.store.keys()].filter((key) => key.startsWith('ack:'))).toHaveLength(1)
    // A key whose member is no longer in the room is dropped on the next wake-up
    world.store.set('ack:member-99', JSON.stringify({ session: SESSION, seq: 4 }))
    world.restart()
    expect(world.store.has('ack:member-99')).toBe(false)
    const back = world.join('Ann', { token: ann.token, session: SESSION })
    back.send({ t: 'dissolve', seq: 2 })
    expect(back.closed).toBe(CloseCode.dissolved)
    expect(world.store.size).toBe(0)
    expect(back.acks).toEqual([])
  })

  it('changes nothing for a page from before: no ack in welcome, none after a message', () => {
    const world = new World()
    world.host.create(ROOM_ID, 'counter', undefined, false)
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    expect(ann.welcomeAck).toBeUndefined()
    ann.send({ t: 'start' })
    ann.send(poke())
    ann.send(poke())
    expect(bob.pokes).toBe(2)
    expect(ann.acks).toEqual([])
    expect([...world.store.keys()].some((key) => key.startsWith('ack:'))).toBe(false)
  })
})

describe('parsing seq and session', () => {
  it('takes a positive whole seq on anything but join and resync', () => {
    expect(parseClientMessage(JSON.stringify(poke(3)))).toEqual({
      t: 'action',
      action: { type: 'poke' },
      seq: 3,
    })
    expect(parseClientMessage('{"t":"resync","seq":4}')).toEqual({ t: 'resync' })
    for (const seq of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(parseClientMessage(JSON.stringify({ t: 'start', seq }))).toBeNull()
    }
  })

  it('takes a session in join, and treats a malformed one as none', () => {
    const join = (session: unknown) =>
      parseClientMessage(JSON.stringify({ t: 'join', name: 'Ann', token: null, session }))
    expect(join(SESSION)).toEqual({ t: 'join', name: 'Ann', token: null, session: SESSION })
    for (const session of ['short', 'x'.repeat(33), 'has space ok', 12345678]) {
      expect(join(session)).toEqual({ t: 'join', name: 'Ann', token: null })
    }
  })

  it('closes a socket that sends a malformed seq, as any bad message', () => {
    const { ann } = playing()
    ann.send({ t: 'action', action: { type: 'poke' }, seq: 'two' })
    expect(ann.closed).toBe(CloseCode.badMessage)
  })
})
