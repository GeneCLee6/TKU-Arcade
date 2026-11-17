// Computer karts in a race room (2026-11-17, shared/protocol.ts 14., docs/KART-NETCODE.md §14): the
// host adds and removes them in the waiting room, the host's browser moves them (an `action` with a
// seat, frames wrapped in PROXY_FRAME) and nobody else can, the room judges them as anyone, and they
// drop out when the host goes. RoomHost on a fake clock, fake sockets and a storage kept as JSON, as
// in room-host.test.ts.
import { describe, expect, it } from 'vitest'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartView } from '../../shared/games/kart/types.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import type { AnyGameModule, GameProjection } from '../../shared/games/types.ts'
import { readRelayed, type KartFrame } from '../../shared/kart/net.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  SWEEP_INTERVAL_MS,
  parseClientMessage,
  proxyFrame,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import {
  RoomHost,
  type MemberRecord,
  type OpenSocket,
  type StoredRoom,
} from '../../worker/room-host.ts'
import { bytes, driveFrames } from '../kart/raceDriver.ts'

class Client {
  received: ServerMessage[] = []
  frames: Uint8Array[] = []
  view: RoomView | null = null
  you = ''
  token = ''
  readonly world: World
  readonly conn: string
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
    else if (message.t === 'patch')
      this.view = applyPatch(this.view as JsonValue, message.ops) as RoomView
  }
  send(message: unknown) {
    this.world.host.message(this.conn, JSON.stringify(message))
  }
  binary(data: Uint8Array) {
    this.world.host.binary(
      this.conn,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    )
  }
  get race(): KartView {
    return (this.view!.game as GameProjection).view as unknown as KartView
  }
  get errors(): string[] {
    return this.received.flatMap((message) => (message.t === 'error' ? [message.code] : []))
  }
  get bots() {
    return Object.values(this.view!.members).filter((member) => member.bot)
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
        sendBinary: (conn, data) => this.clients.get(conn)?.frames.push(data),
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
      games: (id) =>
        ({
          kart: kart as unknown as AnyGameModule,
          tictactoe: ticTacToe as unknown as AnyGameModule,
        })[id] ?? null,
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
  disconnect(client: Client) {
    this.clients.delete(client.conn)
    this.sockets = this.sockets.filter((socket) => socket.conn !== client.conn)
    this.host.closed(client.conn)
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

/** Ann (the host) and Bob in a one-lap race room */
function kartRoom() {
  const world = new World()
  expect(world.host.create('abcdefghij', 'kart', { track: 'riverside', laps: 1 }, false)).toBe(true)
  const ann = world.join('Ann')
  const bob = world.join('Bob')
  return { world, ann, bob }
}

/** Into the race, everyone loaded (the host for the computer seats), and GO */
function toGo(world: World, ann: Client, bob: Client, botSeats: number[]) {
  ann.send({ t: 'start' })
  ann.send({ t: 'action', action: { t: 'loaded' } })
  bob.send({ t: 'action', action: { t: 'loaded' } })
  for (const seat of botSeats) ann.send({ t: 'action', action: { t: 'loaded' }, botSeat: seat })
  expect(ann.race.phase).toBe('countdown')
  const goAt = ann.race.goAt as number
  world.clock = goAt
  world.host.sweep()
  expect(ann.race.phase).toBe('racing')
  return goAt
}

describe('adding computer karts (2026-11-17)', () => {
  it('reads the new messages, and nothing malformed', () => {
    expect(parseClientMessage('{"t":"add_bot","level":"hard"}')).toEqual({
      t: 'add_bot',
      level: 'hard',
    })
    expect(parseClientMessage('{"t":"add_bot","level":"hard","look":"heron.club"}')).toEqual({
      t: 'add_bot',
      level: 'hard',
      look: 'heron.club',
    })
    expect(parseClientMessage('{"t":"add_bot","level":"Hard!"}')).toBeNull()
    expect(parseClientMessage('{"t":"add_bot","level":"hard","look":"No"}')).toBeNull()
    expect(parseClientMessage('{"t":"action","action":{},"botSeat":2}')).toEqual({
      t: 'action',
      action: {},
      botSeat: 2,
    })
    expect(parseClientMessage('{"t":"action","action":{},"botSeat":-1}')).toBeNull()
    expect(parseClientMessage('{"t":"action","action":{},"botSeat":"2"}')).toBeNull()
  })

  it('puts one in the lowest free seat, named by the room, always ready and there', () => {
    const { ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'hard', look: 'heron.club' })
    ann.send({ t: 'add_bot', level: 'easy' })
    expect(ann.errors).toEqual([])
    const bots = ann.bots.sort((a, b) => (a.seat as number) - (b.seat as number))
    expect(bots.map((bot) => [bot.seat, bot.bot, bot.ready, bot.online, bot.look])).toEqual([
      [2, { level: 'hard', name: 'pepper' }, true, true, 'heron.club'],
      [3, { level: 'easy', name: 'mochi' }, true, true, undefined],
    ])
    // Everyone sees them
    expect(bob.bots).toHaveLength(2)
    // A free seat between is filled first
    bob.send({ t: 'sit', seat: 5 })
    ann.send({ t: 'add_bot', level: 'normal' })
    expect(ann.bots.find((bot) => bot.bot?.name === 'typhoon')?.seat).toBe(1)
  })

  it('takes them only from the host, at a level the game has, while seats are free', () => {
    const { ann, bob } = kartRoom()
    bob.send({ t: 'add_bot', level: 'easy' })
    expect(bob.errors).toEqual(['forbidden'])
    ann.send({ t: 'add_bot', level: 'insane' })
    expect(ann.errors).toEqual(['bad_game'])
    for (let i = 0; i < 6; i++) ann.send({ t: 'add_bot', level: 'easy' })
    expect(ann.bots).toHaveLength(6)
    // Eight seats: the room is full
    ann.send({ t: 'add_bot', level: 'easy' })
    expect(ann.errors).toEqual(['bad_game', 'seat_taken'])
    expect(ann.bots).toHaveLength(6)
  })

  it('has none in a game without them, and drops them when the game changes', () => {
    const world = new World()
    world.host.create('abcdefghij', 'tictactoe', undefined, false)
    const ann = world.join('Ann')
    ann.send({ t: 'add_bot', level: 'easy' })
    expect(ann.errors).toEqual(['bad_game'])

    const kartWorld = kartRoom()
    kartWorld.ann.send({ t: 'add_bot', level: 'easy' })
    kartWorld.ann.send({ t: 'set_game', gameId: 'tictactoe' })
    expect(kartWorld.ann.bots).toEqual([])
  })

  it('removes one with `kick`, with no ban, but not during a race', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    const [bot] = ann.bots
    bob.send({ t: 'kick', member: bot!.id })
    expect(bob.errors).toEqual(['forbidden'])
    ann.send({ t: 'kick', member: bot!.id })
    expect(ann.bots).toEqual([])
    ann.send({ t: 'add_bot', level: 'easy' })
    toGo(world, ann, bob, [2])
    ann.send({ t: 'kick', member: ann.bots[0]!.id })
    expect(ann.errors).toEqual(['wrong_status'])
    expect(ann.bots).toHaveLength(1)
  })

  it('stays through hibernation, and is never taken for someone gone', () => {
    const { world, ann } = kartRoom()
    ann.send({ t: 'add_bot', level: 'normal' })
    world.hibernate()
    world.clock += RECONNECT_GRACE_MS + 2 * SWEEP_INTERVAL_MS
    world.host.sweep()
    const bot = ann.bots[0]
    expect(bot).toMatchObject({ seat: 2, online: true, absent: false, bot: { name: 'pepper' } })
  })

  it('races in the next game too: seats renumbered with everyone else', () => {
    const { world, ann, bob } = kartRoom()
    bob.send({ t: 'sit', seat: 4 })
    ann.send({ t: 'add_bot', level: 'easy' })
    expect(ann.bots[0]?.seat).toBe(1)
    toGo(world, ann, bob, [1])
    expect(ann.race.racers.map((racer) => racer.seat)).toEqual([0, 1, 2])
    expect(ann.view!.members[bob.you]?.seat).toBe(2)
  })
})

describe('the host moves the computer karts (2026-11-17)', () => {
  it('acts for a computer seat, and nobody acts for another seat', () => {
    const { ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    // Bob is not the host; Ann may not act for Bob
    bob.send({ t: 'action', action: { t: 'loaded' }, botSeat: 2 })
    ann.send({ t: 'action', action: { t: 'loaded' }, botSeat: 1 })
    expect(bob.errors).toEqual(['forbidden'])
    expect(ann.errors).toEqual(['forbidden'])
    expect(ann.race.racers.map((racer) => racer.loaded)).toEqual([false, false, false])
    ann.send({ t: 'action', action: { t: 'loaded' }, botSeat: 2 })
    expect(ann.race.racers.map((racer) => racer.loaded)).toEqual([false, false, true])
  })

  it('judges and passes on the host frames for a computer seat, to the host too', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    const goAt = toGo(world, ann, bob, [2])
    const track = raceTrack('riverside')!
    const botFrames = driveFrames(track, 2, 2.6)
    const annFrames = driveFrames(track, 0, 2.2)
    const bobFrames = driveFrames(track, 1, 2.0)
    for (let i = 0; i < 3000 && !ann.view?.game?.over; i++) {
      const frame = botFrames.next().value as KartFrame
      world.clock = goAt + (frame.tick / 60) * 1000
      ann.binary(proxyFrame(2, bytes(frame)))
      ann.binary(bytes(annFrames.next().value as KartFrame))
      bob.binary(bytes(bobFrames.next().value as KartFrame))
    }
    // Ann's browser gets the computer kart's frames back to draw, and never her own
    const toAnn = ann.frames.map((data) => readRelayed(data)?.seat)
    expect(toAnn).toContain(2)
    expect(toAnn).not.toContain(0)
    expect(bob.frames.map((data) => readRelayed(data)?.seat)).toContain(2)
    // The computer kart drives fastest and wins, judged like anyone
    expect(ann.view?.game?.over).toBe(true)
    expect(ann.view?.game?.result?.standings.map((line) => line.seat)).toEqual([2, 0, 1])
    expect(ann.race.racers[2]?.lapMs).toHaveLength(1)
  })

  it('ignores frames for a computer seat from anyone but the host, and the host for a person', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    const goAt = toGo(world, ann, bob, [2])
    const track = raceTrack('riverside')!
    const forBob = driveFrames(track, 1).next().value as KartFrame
    const forBot = driveFrames(track, 2).next().value as KartFrame
    world.clock = goAt + 100
    bob.binary(proxyFrame(2, bytes(forBot)))
    ann.binary(proxyFrame(1, bytes(forBob)))
    // Nor a seat nobody holds, nor an empty one
    ann.binary(proxyFrame(7, bytes(forBot)))
    ann.binary(new Uint8Array([254, 2]))
    expect(ann.frames).toEqual([])
    expect(bob.frames).toEqual([])
    ann.binary(proxyFrame(2, bytes(forBot)))
    expect(bob.frames.map((data) => readRelayed(data)?.seat)).toEqual([2])
  })

  it('stops taking them from someone no longer the host', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'add_bot', level: 'easy' })
    const goAt = toGo(world, ann, bob, [2, 3])
    ann.send({ t: 'transfer', member: bob.you })
    // The new host's browser is not running them: they are out
    expect(bob.race.racers.map((racer) => racer.out)).toEqual([false, false, true, true])
    world.clock = goAt + 100
    ann.binary(
      proxyFrame(2, bytes(driveFrames(raceTrack('riverside')!, 2).next().value as KartFrame)),
    )
    expect(bob.frames).toEqual([])
  })
})

describe('when the host goes (2026-11-17)', () => {
  it('drops the computer karts out at once, and the race goes on', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    toGo(world, ann, bob, [2])
    world.disconnect(ann)
    expect(bob.race.racers.map((racer) => racer.out)).toEqual([false, false, true])
    expect(bob.race.phase).toBe('racing')
  })

  it('does not hold up the start for them', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    bob.send({ t: 'action', action: { t: 'loaded' } })
    ann.send({ t: 'action', action: { t: 'loaded' } })
    world.disconnect(ann)
    expect(bob.race.racers.map((racer) => racer.out)).toEqual([false, false, true])
    expect(bob.race.phase).toBe('countdown')
  })

  it('ends a race of the host and computer karts alone', () => {
    const world = new World()
    world.host.create('abcdefghij', 'kart', { track: 'riverside', laps: 1 }, false)
    const ann = world.join('Ann')
    const bob = world.join('Bob')
    bob.send({ t: 'sit', seat: null })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    ann.send({ t: 'action', action: { t: 'loaded' } })
    ann.send({ t: 'action', action: { t: 'loaded' }, botSeat: 1 })
    expect(bob.race.phase).toBe('countdown')
    world.disconnect(ann)
    // Ann still holds her seat and may come back; the computer kart is out
    expect(bob.race.racers.map((racer) => racer.out)).toEqual([false, true])
    expect(bob.view?.room.status).toBe('playing')
  })
})

describe('a host coming back (2026-11-17)', () => {
  it('drops the computer karts out on a reload that beat the old socket', () => {
    const { world, ann, bob } = kartRoom()
    ann.send({ t: 'add_bot', level: 'easy' })
    toGo(world, ann, bob, [2])
    // Ann's token on a new socket, before the old one closed
    const back = new Client(world, 'conn-back')
    world.clients.set(back.conn, back)
    world.host.opened(back.conn, world.clock)
    back.send({ t: 'join', name: 'Ann', token: ann.token })
    expect(back.view?.members[ann.you]?.host).toBe(true)
    expect(bob.race.racers.map((racer) => racer.out)).toEqual([false, false, true])
  })
})
