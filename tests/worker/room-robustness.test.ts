// The room's loose ends of 2026-11-22 (docs/NEXT.md §5 "大廳與房間", shared/protocol.ts 16.–19.):
// rule options as a patch, seats of people who are gone, leaving on purpose, kicks that also know
// the address and the name, rooms nobody uses any more, public or not, and a hold'em table where only
// computer players have chips. RoomHost on a fake clock, fake sockets and a storage kept as JSON, as
// in room-host.test.ts.
import { describe, expect, it } from 'vitest'
import type { Account } from '../../shared/account.ts'
import { holdem } from '../../shared/games/holdem/rules.ts'
import type { HoldemState } from '../../shared/games/holdem/types.ts'
import { createRng } from '../../shared/games/rng.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import { isGameError, type AnyGameModule } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  CloseCode,
  KICK_BAN_MS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  ROOM_IDLE_MAX_MS,
  SEAT_RELEASE_MS,
  SWEEP_INTERVAL_MS,
  parseClientMessage,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import { UNKNOWN_ADDRESS } from '../../worker/address.ts'
import {
  ACTIVITY_SAVE_MS,
  RoomHost,
  type MemberRecord,
  type OpenSocket,
  type StoredRoom,
} from '../../worker/room-host.ts'

const ROOM_ID = 'abcdefghij'
const HOME = 'a1a1a1a1a1a1a1a1'
const DORM = 'b2b2b2b2b2b2b2b2'

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
  get errors(): string[] {
    return this.received.flatMap((message) => (message.t === 'error' ? [message.code] : []))
  }
  get me() {
    return this.view?.members[this.you]
  }
}

class World {
  clock = 1_000_000
  clients = new Map<string, Client>()
  store = new Map<string, string>()
  sockets: OpenSocket[] = []
  host: RoomHost
  readonly modules: Record<string, AnyGameModule> = {
    tictactoe: ticTacToe as unknown as AnyGameModule,
    holdem: holdem as unknown as AnyGameModule,
  }
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
        saveChat: () => {},
        dropChat: () => {},
        clearAll: () => this.store.clear(),
      },
      games: (id) => this.modules[id] ?? null,
      now: () => this.clock,
      newMemberId: () => `member-${++this.next}`,
      newToken: () => `token-${this.next}`.padEnd(43, '_'),
      newSeed: () => 7,
    })
  }
  join(
    name: string,
    { token = null, address = HOME, account = null }: {
      token?: string | null
      address?: string | null
      account?: Account | null
    } = {},
  ): Client {
    expect(this.host.admit(String(PROTOCOL_VERSION), address)).toEqual({ ok: true })
    const conn = `conn-${++this.next}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({
      conn,
      openedAt: this.clock,
      ...(account ? { account } : {}),
      ...(address ? { address } : {}),
    })
    this.host.opened(conn, this.clock, account, address)
    client.send({ t: 'join', name, token })
    return client
  }
  disconnect(client: Client) {
    this.clients.delete(client.conn)
    this.sockets = this.sockets.filter((socket) => socket.conn !== client.conn)
    this.host.closed(client.conn)
  }
  stored(): StoredRoom {
    const read = <T>(key: string, fallback: T): T =>
      this.store.has(key) ? (JSON.parse(this.store.get(key)!) as T) : fallback
    return {
      room: read('room', null),
      members: read<MemberRecord[]>('members', []),
      rev: read('rev', 0),
      game: read('game', null),
      chat: [],
    }
  }
  hibernate() {
    this.host = this.newHost()
    this.host.restore(this.stored(), this.sockets, null)
  }
  /** Time moves on by `ms`, sweeping every interval on the way (the sockets keep answering pings) */
  pass(ms: number) {
    const end = this.clock + ms
    while (this.clock < end) {
      this.clock = Math.min(end, this.clock + SWEEP_INTERVAL_MS)
      for (const socket of this.sockets) this.host.heartbeat(socket.conn, this.clock)
      this.host.sweep()
    }
  }
}

function room(gameId = 'tictactoe', isPublic = false) {
  const world = new World()
  expect(world.host.create(ROOM_ID, gameId, undefined, isPublic)).toBe(true)
  return world
}

describe('rule options as a patch (shared/protocol.ts 16.)', () => {
  it('keeps two quick changes in a row, each sent before the other came back', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    const before = ann.view!.room.options
    expect(before).toMatchObject({ stack: 200, blindUp: 0 })
    // Both from the form as it was, before either answer: only the changed field goes
    ann.send({ t: 'set_options', options: { stack: 300 }, patch: true })
    ann.send({ t: 'set_options', options: { blindUp: 20 }, patch: true })
    expect(ann.view!.room.options).toEqual({ ...before, stack: 300, blindUp: 20 })
    expect(ann.errors).toEqual([])
  })

  it('still takes the whole set from a page from before, a missing field getting its default', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    ann.send({ t: 'set_options', options: { stack: 300, blindUp: 20 }, patch: true })
    ann.send({ t: 'set_options', options: { blindUp: 20 } })
    expect(ann.view!.room.options).toMatchObject({ stack: 200, blindUp: 20 })
  })

  it('checks a patch like anything else: a bad value gets its default, unknown keys go', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    ann.send({ t: 'set_options', options: { stack: 300, blindUp: 20 }, patch: true })
    ann.send({ t: 'set_options', options: { blindUp: 'soon', nope: 1 }, patch: true })
    expect(ann.view!.room.options).toMatchObject({ stack: 300, blindUp: 0 })
    expect(ann.view!.room.options).not.toHaveProperty('nope')
    // Only `true` is a patch
    expect(parseClientMessage('{"t":"set_options","options":{},"patch":1}')).toBeNull()
  })
})

describe('seats of people who are gone (shared/protocol.ts 17.)', () => {
  it('are given up while waiting, SEAT_RELEASE_MS after the socket went, and the member goes', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    expect(bob.me?.seat).toBe(1)
    world.disconnect(bob)
    world.pass(SEAT_RELEASE_MS - SWEEP_INTERVAL_MS)
    expect(ann.view!.members[bob.you]).toMatchObject({ seat: 1, absent: true })
    world.pass(SWEEP_INTERVAL_MS)
    expect(ann.view!.members[bob.you]).toBeUndefined()
    // Someone else can sit there now; Bob coming back is someone new, in a free seat if there is one
    const cy = world.join('Cy')
    expect(cy.me?.seat).toBe(1)
    const back = world.join('Bob', { token: bob.token })
    expect(back.you).not.toBe(bob.you)
    expect(back.me?.seat).toBeNull()
  })

  it('stay with someone back in time, and with the host when nobody can take over', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    world.disconnect(bob)
    world.pass(SEAT_RELEASE_MS - 2 * SWEEP_INTERVAL_MS)
    const back = world.join('Bob', { token: bob.token })
    world.pass(SEAT_RELEASE_MS)
    expect(back.me).toMatchObject({ seat: 1, online: true })

    // The host alone, gone: the seat goes, the member stays as host for when they are back
    world.disconnect(back)
    world.disconnect(ann)
    world.pass(SEAT_RELEASE_MS)
    const stored = world.stored()
    expect(stored.members.find((member) => member.id === ann.you)).toMatchObject({ seat: null })
    expect(stored.room?.hostId).toBe(ann.you)
  })

  it('stay theirs during a game, and go once it has ended', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    ann.send({ t: 'start' })
    world.disconnect(bob)
    world.pass(SEAT_RELEASE_MS * 3)
    expect(ann.view!.members[bob.you]).toMatchObject({ seat: 1, absent: true })
    // Back, the two play it out
    const back = world.join('Bob', { token: bob.token })
    for (let move = 0; ann.view!.room.status === 'playing' && move < 9; move++) {
      for (const one of [ann, back]) {
        const legal = (one.view!.game?.legal ?? []) as JsonValue[]
        if (legal.length > 0) one.send({ t: 'action', action: legal[0] })
      }
    }
    expect(ann.view!.room.status).toBe('ended')
    world.disconnect(back)
    world.pass(SEAT_RELEASE_MS - SWEEP_INTERVAL_MS)
    expect(ann.view!.members[bob.you]?.seat).toBe(1)
    world.pass(SWEEP_INTERVAL_MS)
    expect(ann.view!.members[bob.you]).toBeUndefined()
  })

  it('lets nobody see a finished game from a seat its player left', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    const cy = world.join('Cy')
    cy.send({ t: 'sit', seat: null })
    ann.send({ t: 'start' })
    expect((bob.view!.game!.view as { you: number | null }).you).toBe(1)
    // Over by agreement, Bob goes and Cy takes his seat
    ann.send({ t: 'action', action: { type: 'endVote', on: true } })
    bob.send({ t: 'action', action: { type: 'endVote', on: true } })
    for (let step = 0; ann.view!.room.status === 'playing' && step < 50; step++) {
      for (const one of [ann, bob]) {
        const legal = (one.view!.game?.legal ?? []) as { type: string }[]
        const fold = legal.find((action) => action.type === 'fold' || action.type === 'check')
        if (fold) one.send({ t: 'action', action: fold })
      }
      const at = world.host.nextAlarm()!
      world.clock = Math.max(world.clock, at)
      for (const socket of world.sockets) world.host.heartbeat(socket.conn, world.clock)
      world.host.sweep()
    }
    expect(ann.view!.room.status).toBe('ended')
    bob.send({ t: 'leave' })
    cy.send({ t: 'sit', seat: 1 })
    expect(cy.me?.seat).toBe(1)
    expect((cy.view!.game!.view as { you: number | null }).you).toBeNull()
  })

  it('never takes a computer member’s seat', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    ann.send({ t: 'add_bot', level: 'easy' })
    world.pass(SEAT_RELEASE_MS * 2)
    expect(Object.values(ann.view!.members).filter((member) => member.seat !== null)).toHaveLength(2)
  })
})

describe('leaving on purpose (shared/protocol.ts 17.)', () => {
  it('frees the seat at once and closes the socket with `left`', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    bob.send({ t: 'leave' })
    expect(bob.closed).toBe(CloseCode.left)
    expect(ann.view!.members[bob.you]).toBeUndefined()
    expect(world.host.summary()).toMatchObject({ members: 1, seated: 1 })
  })

  it('hands the host on at once: online first, seated first', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    const cy = world.join('Cy')
    expect(cy.me?.seat).toBeNull()
    bob.send({ t: 'sit', seat: null })
    cy.send({ t: 'sit', seat: 1 })
    ann.send({ t: 'leave' })
    expect(bob.view!.members[cy.you]?.host).toBe(true)
    expect(bob.view!.members[ann.you]).toBeUndefined()
  })

  it('hands it to someone offline when nobody is online, and to whoever comes next when nobody is left', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    world.disconnect(bob)
    ann.send({ t: 'leave' })
    expect(world.stored().room?.hostId).toBe(bob.you)

    const alone = room()
    const dee = alone.join('Dee')
    dee.send({ t: 'leave' })
    expect(alone.stored().room?.hostId).toBeNull()
    expect(alone.stored().members).toEqual([])
    const eve = alone.join('Eve')
    expect(eve.me?.host).toBe(true)
  })

  it('keeps a seat in a game under way, absent at once so the host can cover it, and back with the token', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    ann.send({ t: 'start' })
    // Bob's turn comes after Ann's first move
    ann.send({ t: 'action', action: (ann.view!.game!.legal as JsonValue[])[0] })
    bob.send({ t: 'leave' })
    expect(ann.view!.members[bob.you]).toMatchObject({ seat: 1, online: false, absent: true })
    expect(ann.view!.coverable.map((one) => one.seat)).toEqual([1])
    const back = world.join('Bob', { token: bob.token })
    expect(back.you).toBe(bob.you)
    expect(ann.view!.coverable).toEqual([])
  })

  it('removes a spectator during a game, and a host leaving mid-game hands it on', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    const cy = world.join('Cy')
    ann.send({ t: 'start' })
    cy.send({ t: 'leave' })
    expect(ann.view!.members[cy.you]).toBeUndefined()
    ann.send({ t: 'leave' })
    expect(bob.view!.members[bob.you]?.host).toBe(true)
    expect(bob.view!.members[ann.you]).toMatchObject({ absent: true, host: false })
  })
})

describe('kicks by address and name (shared/protocol.ts 18.)', () => {
  it('keep the kicked name out from the same address, under any token, for KICK_BAN_MS', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    ann.send({ t: 'kick', member: bob.you })
    expect(bob.closed).toBe(CloseCode.kicked)
    // A new browser: no token, same address, the same name as the room compares them
    expect(world.join('Bob').closed).toBe(CloseCode.kicked)
    expect(world.join('BOB').closed).toBe(CloseCode.kicked)
    world.clock += KICK_BAN_MS
    expect(world.join('Bob').closed).toBeNull()
  })

  it('never by the address alone: the rest of the dorm, and Bob elsewhere, come in', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    ann.send({ t: 'kick', member: bob.you })
    expect(world.join('Cy').closed).toBeNull()
    // The ban is for this room's table only, not for a name: Bob from another network is let in
    expect(world.join('Bob', { address: DORM }).closed).toBeNull()
  })

  it('never by an unknown address, which everyone without one shares', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob', { address: UNKNOWN_ADDRESS })
    ann.send({ t: 'kick', member: bob.you })
    expect(world.join('Bob', { address: UNKNOWN_ADDRESS }).closed).toBeNull()
  })

  it('keep a signed-in member’s account out from anywhere, under any name', () => {
    const world = room()
    const ann = world.join('Ann')
    const account: Account = { id: 'acct-7', name: 'Bob' }
    const bob = world.join('whatever', { account })
    ann.send({ t: 'kick', member: bob.you })
    expect(world.join('x', { account, address: DORM }).closed).toBe(CloseCode.kicked)
    // A guest named Bob from elsewhere is someone else
    expect(world.join('Bob', { address: DORM }).closed).toBeNull()
  })

  it('know the address of a member kicked while offline, from when they last joined', () => {
    const world = room()
    const ann = world.join('Ann')
    const bob = world.join('Bob', { address: DORM })
    world.disconnect(bob)
    world.hibernate()
    ann.send({ t: 'kick', member: bob.you })
    expect(world.join('Bob', { address: DORM }).closed).toBe(CloseCode.kicked)
    // Never in anyone's view
    expect(JSON.stringify(ann.view)).not.toContain(DORM)
  })
})

describe('rooms nobody uses, and public or not (shared/protocol.ts 19.)', () => {
  it('deletes a room nobody sends anything to for ROOM_IDLE_MAX_MS, sockets open or not', () => {
    const world = room()
    const ann = world.join('Ann')
    world.pass(ROOM_IDLE_MAX_MS - SWEEP_INTERVAL_MS)
    expect(ann.closed).toBeNull()
    world.pass(SWEEP_INTERVAL_MS)
    expect(ann.closed).toBe(CloseCode.roomNotFound)
    expect(world.host.summary()).toBeNull()
    expect(world.store.size).toBe(0)
  })

  it('counts anything a member sends, heartbeats aside, and writes it down only now and then', () => {
    const world = room()
    const ann = world.join('Ann')
    world.pass(ROOM_IDLE_MAX_MS / 2)
    ann.send({ t: 'chat', text: 'still here' })
    const savedAt = JSON.parse(world.store.get('room')!).activeAt as number
    expect(savedAt).toBe(world.clock)
    world.clock += ACTIVITY_SAVE_MS / 2
    ann.send({ t: 'chat', text: 'and here' })
    expect(JSON.parse(world.store.get('room')!).activeAt).toBe(savedAt)
    world.pass(ROOM_IDLE_MAX_MS - ACTIVITY_SAVE_MS)
    expect(ann.closed).toBeNull()
    // Through hibernation too
    world.hibernate()
    world.pass(ACTIVITY_SAVE_MS)
    expect(ann.closed).toBe(CloseCode.roomNotFound)
  })

  it('starts the clock for a room from before, when it wakes', () => {
    const world = room()
    world.join('Ann')
    const stored = world.stored()
    delete stored.room!.activeAt
    world.host = world.newHost()
    world.host.restore(stored, world.sockets, null)
    expect(world.host.nextAlarm()).toBeLessThanOrEqual(world.clock + ROOM_IDLE_MAX_MS)
  })

  it('takes a cleaned-up room off the public list', () => {
    const world = room('tictactoe', true)
    const ann = world.join('Ann')
    expect(world.host.listing()).not.toBeNull()
    world.disconnect(ann)
    expect(world.host.listing()).toBeNull()
    world.pass(10 * 60_000)
    expect(world.host.summary()).toBeNull()
    expect(world.host.listing()).toBeNull()
  })

  it('shows members whether the room is public, and lets the host list it or take it off', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    expect(ann.view!.room).not.toHaveProperty('public')
    expect(world.host.listing()).toBeNull()
    bob.send({ t: 'set_public', public: true })
    expect(bob.errors).toEqual(['forbidden'])
    ann.send({ t: 'set_public', public: true })
    expect(bob.view!.room.public).toBe(true)
    expect(world.host.listing()).toMatchObject({ id: ROOM_ID, host: 'Ann' })
    // Still never listed with a password
    ann.send({ t: 'set_password', password: 'kite' })
    expect(world.host.listing()).toBeNull()
    ann.send({ t: 'set_password', password: null })
    ann.send({ t: 'set_public', public: false })
    expect(bob.view!.room).not.toHaveProperty('public')
    expect(world.host.listing()).toBeNull()
    expect(parseClientMessage('{"t":"set_public","public":"yes"}')).toBeNull()
  })
})

describe('hold’em with only computer players left (#121)', () => {
  it('tells the game which seats are computers', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    expect(world.stored().game?.seats).toEqual([{ id: 0 }, { id: 1, bot: true }])
  })

  /** A table after a hand, Ann (seat 0) out of chips, two computer players left with them */
  function bustedTable(bots: boolean): HoldemState {
    const rng = createRng(3)
    const seats = [{ id: 0 }, { id: 1, ...(bots ? { bot: true as const } : {}) }, { id: 2, ...(bots ? { bot: true as const } : {}) }]
    const state = holdem.init(seats, { stack: 50, blindUp: 15, timer: 0 } as never, rng)
    return {
      ...state,
      phase: { kind: 'handEnd' },
      players: state.players.map((player) =>
        player.seat === 0
          ? { ...player, stack: 0, out: true, bet: 0, committed: 0 }
          : { ...player, stack: 1500, bet: 0, committed: 0 },
      ),
      outOrder: [0],
    }
  }

  it('ends once no person has chips, with the standings as they are', () => {
    const state = bustedTable(true)
    const next = holdem.reduce(state, { type: 'next', hand: state.hand }, 'system', createRng(1))
    if (isGameError(next)) throw new Error('refused')
    expect(holdem.isOver(next)).toBe(true)
    expect(holdem.result(next).standings.map((one) => [one.seat, one.rank])).toEqual([
      [1, 1],
      [2, 1],
      [0, 3],
    ])
  })

  it('goes on between people, as before', () => {
    const state = bustedTable(false)
    const next = holdem.reduce(state, { type: 'next', hand: state.hand }, 'system', createRng(1))
    if (isGameError(next)) throw new Error('refused')
    expect(holdem.isOver(next)).toBe(false)
  })

  it('plays a whole room game to the end when Ann goes out, rather than on for ever', () => {
    const world = room('holdem')
    const ann = world.join('Ann')
    ann.send({ t: 'set_options', options: { stack: 100, timer: 0 }, patch: true })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    // Ann goes all in every time she can, and the room plays the rest
    for (let step = 0; ann.view!.room.status === 'playing' && step < 5_000; step++) {
      const legal = (ann.view!.game?.legal ?? []) as { type: string; to?: number }[]
      const allIn = legal.filter((one) => one.type === 'raise').at(-1)
      const call = legal.find((one) => one.type === 'call' || one.type === 'check')
      if (allIn ?? call) ann.send({ t: 'action', action: allIn ?? call })
      else {
        const at = world.host.nextAlarm()!
        world.clock = Math.max(world.clock, at)
        for (const socket of world.sockets) world.host.heartbeat(socket.conn, world.clock)
        world.host.sweep()
      }
    }
    expect(ann.view!.room.status).toBe('ended')
    const state = world.stored().game!.match.state as unknown as HoldemState
    const people = state.players.filter((player) => !player.bot)
    const left = state.players.filter((player) => !player.out)
    // Either Ann took every chip, or she went out and the game stopped with the computers still in
    expect(people[0].out ? left.length >= 1 && left.every((one) => one.bot) : left.length === 1).toBe(true)
  })
})

it('keeps RECONNECT_GRACE_MS under SEAT_RELEASE_MS, so a gone member is absent before the seat goes', () => {
  expect(RECONNECT_GRACE_MS).toBeLessThan(SEAT_RELEASE_MS)
})
