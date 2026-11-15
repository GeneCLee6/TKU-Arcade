// A real-time game in a room (e2-t11, e9-t02): binary frames passed on with the seat in front, the
// module's judgement turned into actions, the clock's start time, and clock pings. RoomHost on a fake
// clock and fake sockets, as in room-host.test.ts.
import { describe, expect, it } from 'vitest'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartView } from '../../shared/games/kart/types.ts'
import type { AnyGameModule, GameProjection } from '../../shared/games/types.ts'
import { readRelayed, type KartFrame } from '../../shared/kart/net.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import {
  CLOCK_ANSWER_BYTES,
  CLOCK_FRAME,
  CLOCK_PING_BYTES,
  CloseCode,
  PROTOCOL_VERSION,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import { RoomHost } from '../../worker/room-host.ts'
import { bytes, driveFrames } from '../kart/raceDriver.ts'

class Client {
  received: ServerMessage[] = []
  frames: Uint8Array[] = []
  view: RoomView | null = null
  closed: number | null = null
  readonly world: World
  readonly conn: string
  constructor(world: World, conn: string) {
    this.world = world
    this.conn = conn
  }
  receive(message: ServerMessage) {
    this.received.push(message)
    if (message.t === 'welcome' || message.t === 'snapshot') this.view = message.state
    else if (message.t === 'patch')
      this.view = applyPatch(this.view as JsonValue, message.ops) as RoomView
  }
  send(message: unknown) {
    this.world.host.message(this.conn, JSON.stringify(message))
  }
  frame(frame: KartFrame) {
    const data = bytes(frame)
    this.world.host.binary(
      this.conn,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    )
  }
  get race(): KartView {
    return (this.view!.game as GameProjection).view as unknown as KartView
  }
}

class World {
  clock = 1_000_000
  clients = new Map<string, Client>()
  host: RoomHost
  private next = 0
  constructor(modules: Record<string, AnyGameModule>) {
    this.host = new RoomHost({
      sockets: {
        send: (conn, message) =>
          this.clients.get(conn)?.receive(JSON.parse(JSON.stringify(message))),
        sendBinary: (conn, data) => this.clients.get(conn)?.frames.push(data),
        close: (conn, code) => {
          const client = this.clients.get(conn)
          if (client) client.closed = code
        },
      },
      storage: {
        saveRoom: () => {},
        saveMembers: () => {},
        saveRev: () => {},
        saveGame: () => {},
        saveStep: () => {},
        dropSteps: () => {},
        saveChat: () => {},
        dropChat: () => {},
        clearAll: () => {},
      },
      games: (id) => modules[id] ?? null,
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
    this.host.opened(conn, this.clock)
    client.send({ t: 'join', name, token: null })
    return client
  }
}

function kartRoom(laps = 1) {
  const world = new World({ kart: kart as unknown as AnyGameModule })
  expect(world.host.create('abcdefghij', 'kart', { track: 'riverside', laps }, false)).toBe(true)
  const ann = world.join('Ann')
  const bob = world.join('Bob')
  ann.send({ t: 'start' })
  return { world, ann, bob }
}

describe('a real-time game in a room (e2-t11)', () => {
  it('sets GO from the room clock once everyone has loaded', () => {
    const { world, ann, bob } = kartRoom()
    expect(ann.race.phase).toBe('loading')
    ann.send({ t: 'action', action: { t: 'loaded' } })
    bob.send({ t: 'action', action: { t: 'loaded' } })
    expect(ann.race.phase).toBe('countdown')
    expect(ann.race.goAt).toBe(world.clock + 4000)
    expect(bob.race.goAt).toBe(ann.race.goAt)
    // GO fires on the timer, when the alarm comes
    world.clock += 4000
    world.host.sweep()
    expect(ann.race.phase).toBe('racing')
  })

  it('answers a clock ping with the server time', () => {
    const { world, ann } = kartRoom()
    const ping = new Uint8Array(CLOCK_PING_BYTES)
    ping[0] = CLOCK_FRAME
    new DataView(ping.buffer).setFloat64(1, 123.5, true)
    world.host.binary(ann.conn, ping.buffer)
    const answer = ann.frames.at(-1)!
    expect(answer.byteLength).toBe(CLOCK_ANSWER_BYTES)
    const view = new DataView(answer.buffer)
    expect([answer[0], view.getFloat64(1, true), view.getFloat64(9, true)]).toEqual([
      CLOCK_FRAME,
      123.5,
      world.clock,
    ])
  })

  it('passes each frame on to everyone else with the seat in front, and judges laps', () => {
    const { world, ann, bob } = kartRoom(1)
    ann.send({ t: 'action', action: { t: 'loaded' } })
    bob.send({ t: 'action', action: { t: 'loaded' } })
    const goAt = ann.race.goAt as number
    world.clock = goAt
    world.host.sweep()
    const track = raceTrack('riverside')!
    const annFrames = driveFrames(track, 0)
    const bobFrames = driveFrames(track, 1, 2.4)
    for (let i = 0; i < 3000 && !ann.view?.game?.over; i++) {
      const a = annFrames.next().value as KartFrame
      world.clock = goAt + (a.tick / 60) * 1000
      ann.frame(a)
      bob.frame(bobFrames.next().value as KartFrame)
    }
    expect(bob.frames.length).toBeGreaterThan(100)
    const relayed = readRelayed(bob.frames[0]!)
    expect(relayed?.seat).toBe(0)
    expect(ann.frames.every((data) => readRelayed(data)?.seat === 1)).toBe(true)
    // Ann drives a little faster: she wins
    expect(ann.view?.game?.over).toBe(true)
    const standings = ann.view?.game?.result?.standings ?? []
    expect(standings.map((line) => line.seat)).toEqual([0, 1])
    expect(ann.view?.room.status).toBe('ended')
  })

  it('ignores frames from someone with no seat, and refuses binary in a turn-based room', () => {
    const { world, ann } = kartRoom()
    const watcher = world.join('Cy')
    watcher.send({ t: 'sit', seat: null })
    const frame = driveFrames(raceTrack('riverside')!, 0).next().value as KartFrame
    watcher.frame(frame)
    expect(ann.frames).toEqual([])
    expect(watcher.closed).toBeNull()

    const turnBased = new World({ tictactoe: ticTacToe as unknown as AnyGameModule })
    expect(turnBased.host.create('abcdefghij', 'tictactoe', undefined, false)).toBe(true)
    const xia = turnBased.join('Xia')
    turnBased.join('Ou')
    xia.send({ t: 'start' })
    xia.frame(frame)
    expect(xia.closed).toBe(CloseCode.badMessage)
  })
})
