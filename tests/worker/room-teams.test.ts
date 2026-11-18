// The sides of a team race in the room (2026-11-18, shared/protocol.ts 15.): anyone picks their own,
// the host anyone's (a computer kart's too), nobody else's; not while a game is played; and each
// seat's side goes into the race when it starts. RoomHost on a fake clock, fake sockets and a
// storage kept as JSON, as in room-bots.test.ts.
import { describe, expect, it } from 'vitest'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartView } from '../../shared/games/kart/types.ts'
import type { AnyGameModule, GameProjection } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import {
  RoomHost,
  type MemberRecord,
  type OpenSocket,
  type StoredRoom,
} from '../../worker/room-host.ts'

class Client {
  received: ServerMessage[] = []
  view: RoomView | null = null
  you = ''
  readonly world: World
  readonly conn: string
  constructor(world: World, conn: string) {
    this.world = world
    this.conn = conn
  }
  receive(message: ServerMessage) {
    this.received.push(message)
    if (message.t === 'welcome') this.you = message.you
    if (message.t === 'welcome' || message.t === 'snapshot') this.view = message.state
    else if (message.t === 'patch')
      this.view = applyPatch(this.view as JsonValue, message.ops) as RoomView
  }
  send(message: unknown) {
    this.world.host.message(this.conn, JSON.stringify(message))
  }
  get race(): KartView {
    return (this.view!.game as GameProjection).view as unknown as KartView
  }
  get errors(): string[] {
    return this.received.flatMap((message) => (message.t === 'error' ? [message.code] : []))
  }
  teamOf(member: string): number | undefined {
    return this.view!.members[member]?.team
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
          this.clients.get(conn)?.receive(JSON.parse(JSON.stringify(message))),
        sendBinary: () => {},
        close: () => {},
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
      games: (id) => (id === 'kart' ? (kart as unknown as AnyGameModule) : null),
      now: () => this.clock,
      newMemberId: () => `member-${++this.next}`,
      newToken: () => `token-${this.next}`.padEnd(43, '_'),
      newSeed: () => 42,
    })
  }
  join(name: string): Client {
    expect(this.host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
    const conn = `conn-${++this.next}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({ conn, openedAt: this.clock })
    this.host.opened(conn, this.clock)
    client.send({ t: 'join', name, token: null })
    return client
  }
  hibernate() {
    const read = <T>(key: string, fallback: T): T =>
      this.store.has(key) ? (JSON.parse(this.store.get(key)!) as T) : fallback
    const stored: StoredRoom = {
      room: read('room', null),
      members: read<MemberRecord[]>('members', []),
      rev: read('rev', 0),
      game: read('game', null),
      chat: [],
    }
    this.host = this.newHost()
    this.host.restore(stored, this.sockets, null)
  }
}

/** Ann (the host), Bob and Cat in a one-lap team race room */
function teamRoom(teams: 'solo' | 'teams' = 'teams') {
  const world = new World()
  expect(
    world.host.create('abcdefghij', 'kart', { track: 'riverside', laps: 1, mode: 'race', teams }, false),
  ).toBe(true)
  const ann = world.join('Ann')
  const bob = world.join('Bob')
  const cat = world.join('Cat')
  return { world, ann, bob, cat }
}

describe('picking a side (2026-11-18)', () => {
  it('reads the message, and nothing malformed', () => {
    expect(parseClientMessage('{"t":"set_team","team":1}')).toEqual({ t: 'set_team', team: 1 })
    expect(parseClientMessage('{"t":"set_team","team":null}')).toEqual({ t: 'set_team', team: null })
    expect(parseClientMessage('{"t":"set_team","team":0,"member":"member-2"}')).toEqual({
      t: 'set_team',
      team: 0,
      member: 'member-2',
    })
    for (const bad of [
      '{"t":"set_team"}',
      '{"t":"set_team","team":2}',
      '{"t":"set_team","team":"red"}',
      '{"t":"set_team","team":1,"member":""}',
      '{"t":"set_team","team":1,"member":3}',
    ]) {
      expect(parseClientMessage(bad)).toBeNull()
    }
  })

  it('lets anyone pick their own side, shown to everyone, and take it back', () => {
    const { ann, bob } = teamRoom()
    bob.send({ t: 'set_team', team: 1 })
    expect(ann.teamOf(bob.you)).toBe(1)
    expect(bob.teamOf(bob.you)).toBe(1)
    bob.send({ t: 'set_team', team: 0 })
    expect(ann.teamOf(bob.you)).toBe(0)
    bob.send({ t: 'set_team', team: null })
    expect(ann.teamOf(bob.you)).toBeUndefined()
    expect(bob.errors).toEqual([])
  })

  it('lets only the host move someone else, a computer kart too', () => {
    const { ann, bob, cat } = teamRoom()
    bob.send({ t: 'set_team', team: 1, member: cat.you })
    expect(bob.errors).toEqual(['forbidden'])
    expect(ann.teamOf(cat.you)).toBeUndefined()
    ann.send({ t: 'set_team', team: 1, member: cat.you })
    expect(bob.teamOf(cat.you)).toBe(1)
    ann.send({ t: 'add_bot', level: 'normal' })
    const bot = Object.values(ann.view!.members).find((member) => member.bot)!
    ann.send({ t: 'set_team', team: 0, member: bot.id })
    expect(bob.teamOf(bot.id)).toBe(0)
    // A computer kart is not the host: nobody but the host moves it
    cat.send({ t: 'set_team', team: 1, member: bot.id })
    expect(cat.errors).toEqual(['forbidden'])
    ann.send({ t: 'set_team', team: 1, member: 'nobody' })
    expect(ann.errors).toEqual(['bad_member'])
  })

  it('goes into the race with the seats, and is kept through a sleep; not changed mid-race', () => {
    const { world, ann, bob, cat } = teamRoom()
    // Ann and Bob both blue; Cat makes no choice and fills red
    ann.send({ t: 'set_team', team: 1 })
    bob.send({ t: 'set_team', team: 1 })
    world.hibernate()
    ann.send({ t: 'start' })
    expect(ann.race.teams).toEqual({ gauge: [0, 0], fills: [0, 0] })
    expect(ann.race.racers.map((racer) => racer.team)).toEqual([1, 1, 0])
    cat.send({ t: 'set_team', team: 1 })
    expect(cat.errors).toEqual(['wrong_status'])
    expect(ann.race.racers.map((racer) => racer.team)).toEqual([1, 1, 0])
  })

  it('splits everyone evenly when nobody chose, and not at all in a race without sides', () => {
    const teams = teamRoom()
    teams.ann.send({ t: 'start' })
    expect(teams.ann.race.racers.map((racer) => racer.team)).toEqual([0, 1, 0])
    const solo = teamRoom('solo')
    solo.bob.send({ t: 'set_team', team: 1 })
    solo.ann.send({ t: 'start' })
    expect(solo.ann.race.teams).toBeUndefined()
    expect(solo.ann.race.racers.every((racer) => racer.team === undefined)).toBe(true)
  })
})
