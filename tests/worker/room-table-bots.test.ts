// Computer players the room moves itself (2026-11-20, `GameModule.bot`, docs/ARCHITECTURE.md
// "電腦玩家"): hold'em, promotion and traders; 2026-11-21 palace, secret-scroll, wasabi and tiles.
// The host adds and removes them in the waiting room; the room moves each a moment after its turn
// comes, from its seat's own view; nobody moves them from a browser; they wait while nobody is in the
// room, and come through hibernation, a rematch and a new host. RoomHost on a fake clock, fake sockets and a storage kept as JSON, as in
// room-host.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { holdem } from '../../shared/games/holdem/rules.ts'
import type { HoldemView } from '../../shared/games/holdem/types.ts'
import { kart } from '../../shared/games/kart/rules.ts'
import { palace } from '../../shared/games/palace/rules.ts'
import { secretScroll } from '../../shared/games/secret-scroll/rules.ts'
import { tiles } from '../../shared/games/tiles/rules.ts'
import { wasabi } from '../../shared/games/wasabi/rules.ts'
import { promotion } from '../../shared/games/promotion/rules.ts'
import { traders } from '../../shared/games/traders/rules.ts'
import { ticTacToe } from '../../shared/games/tictactoe/rules.ts'
import type { AnyGameModule, GameProjection } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  PROTOCOL_VERSION,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import {
  BOT_THINK_MS,
  RoomHost,
  type MemberRecord,
  type OpenSocket,
  type StoredRoom,
} from '../../worker/room-host.ts'

vi.setConfig({ testTimeout: 60_000 })

class Client {
  received: ServerMessage[] = []
  view: RoomView | null = null
  you = ''
  token = ''
  readonly world: World
  conn: string
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
  get game(): GameProjection {
    return this.view!.game as GameProjection
  }
  get errors(): string[] {
    return this.received.flatMap((message) => (message.t === 'error' ? [message.code] : []))
  }
  get bots() {
    return Object.values(this.view!.members)
      .filter((member) => member.bot)
      .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
  }
}

class World {
  clock = 1_000_000
  clients = new Map<string, Client>()
  store = new Map<string, string>()
  sockets: OpenSocket[] = []
  host: RoomHost
  modules: Record<string, AnyGameModule>
  private next = 0
  private seed = 1
  constructor(modules: Record<string, AnyGameModule> = {}) {
    this.modules = {
      holdem: holdem as unknown as AnyGameModule,
      promotion: promotion as unknown as AnyGameModule,
      traders: traders as unknown as AnyGameModule,
      palace: palace as unknown as AnyGameModule,
      'secret-scroll': secretScroll as unknown as AnyGameModule,
      wasabi: wasabi as unknown as AnyGameModule,
      tiles: tiles as unknown as AnyGameModule,
      kart: kart as unknown as AnyGameModule,
      tictactoe: ticTacToe as unknown as AnyGameModule,
      ...modules,
    }
    this.host = this.newHost()
  }
  newHost() {
    return new RoomHost({
      sockets: {
        send: (conn, message) =>
          this.clients.get(conn)?.receive(JSON.parse(JSON.stringify(message))),
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
      games: (id) => this.modules[id] ?? null,
      now: () => this.clock,
      newMemberId: () => `member-${++this.next}`,
      newToken: () => `token-${this.next}`.padEnd(43, '_'),
      newSeed: () => (this.seed = (this.seed * 48271) % 2147483647),
    })
  }
  join(name: string, token: string | null = null): Client {
    expect(this.host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
    const conn = `conn-${++this.next}`
    const client = new Client(this, conn)
    this.clients.set(conn, client)
    this.sockets.push({ conn, openedAt: this.clock })
    this.host.opened(conn, this.clock)
    client.send({ t: 'join', name, token })
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
  /** Time moves to the next alarm, and the room's alarm runs (the sockets keep answering pings) */
  tick() {
    const at = this.host.nextAlarm()
    expect(at).not.toBeNull()
    this.clock = Math.max(this.clock, at as number)
    for (const socket of this.sockets) this.host.heartbeat(socket.conn, this.clock)
    this.host.sweep()
  }
}

function room(gameId: string, options?: Record<string, unknown>) {
  const world = new World()
  expect(world.host.create('abcdefghij', gameId, options, false)).toBe(true)
  const ann = world.join('Ann')
  return { world, ann }
}

/** Ann plays her own turns (calling, or the first thing she may) and the room the rest, to the end */
function playOut(world: World, ann: Client, maxSteps = 20_000): number {
  let steps = 0
  while (ann.view!.room.status === 'playing' && steps < maxSteps) {
    const legal = ann.game.legal as { type?: string }[]
    if (legal.length > 0) {
      ann.send({ t: 'action', action: legal.find((one) => one.type === 'call') ?? legal[0] })
    } else world.tick()
    steps++
  }
  return steps
}

describe('adding computer players to a table game', () => {
  it('only the host, at the table levels, into the lowest free seats, named by the room', () => {
    const { world, ann } = room('holdem')
    const bob = world.join('Bob')
    bob.send({ t: 'add_bot', level: 'easy' })
    expect(bob.errors).toEqual(['forbidden'])
    ann.send({ t: 'add_bot', level: 'hard' })
    expect(ann.errors).toEqual(['bad_game'])
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'add_bot', level: 'normal' })
    expect(ann.bots.map((bot) => [bot.seat, bot.bot, bot.ready, bot.online, bot.host])).toEqual([
      [2, { level: 'easy', name: 'egret' }, true, true, false],
      [3, { level: 'normal', name: 'banyan' }, true, true, false],
    ])
    expect(bob.bots).toHaveLength(2)
  })

  it('is removed by the host in the waiting room, never during a game, never made host', () => {
    const { world, ann } = room('promotion')
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'add_bot', level: 'easy' })
    const [first] = ann.bots
    ann.send({ t: 'transfer', member: first!.id })
    expect(ann.errors).toEqual(['bad_member'])
    ann.send({ t: 'kick', member: first!.id })
    expect(ann.bots).toHaveLength(1)
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    expect(ann.view!.room.status).toBe('playing')
    ann.send({ t: 'kick', member: ann.bots[0]!.id })
    expect(ann.errors).toEqual(['bad_member', 'wrong_status'])
    // The host gone too long: the next host is a person, never a computer
    const bob = world.join('Bob')
    world.disconnect(ann)
    for (let i = 0; i < 40 && bob.view!.members[bob.you]!.host !== true; i++) world.tick()
    expect(bob.view!.members[bob.you]!.host).toBe(true)
  })

  it('a game without them refuses them; changing games keeps those that fit and drops the rest', () => {
    const plain = room('tictactoe')
    plain.ann.send({ t: 'add_bot', level: 'easy' })
    expect(plain.ann.errors).toEqual(['bad_game'])

    const { ann } = room('holdem')
    for (let i = 0; i < 5; i++) ann.send({ t: 'add_bot', level: i % 2 ? 'easy' : 'normal' })
    expect(ann.bots).toHaveLength(5)
    // Traders seats four: Ann and the three computers in seats 1 to 3 stay, the others go
    ann.send({ t: 'set_game', gameId: 'traders' })
    expect(ann.bots.map((bot) => bot.seat)).toEqual([1, 2, 3])
    ann.send({ t: 'set_game', gameId: 'promotion' })
    expect(ann.bots).toHaveLength(3)
    // The kart's computer karts are other ones
    ann.send({ t: 'set_game', gameId: 'kart' })
    expect(ann.bots).toEqual([])
  })
})

describe('the room moves them', () => {
  it('a moment after their turn comes, from their own view, as their own seat', () => {
    const calls: { view: JsonValue; legal: JsonValue[] }[] = []
    const spy: AnyGameModule = {
      ...(holdem as unknown as AnyGameModule),
      bot(view, legal, level, rng) {
        if (legal.length > 0) calls.push({ view, legal: [...legal] })
        return holdem.bot!(view as never, legal as never, level, rng)
      },
    }
    const world = new World({ holdem: spy })
    world.host.create('abcdefghij', 'holdem', { stack: 100, blindUp: 15, timer: 0 }, false)
    const ann = world.join('Ann')
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    // Until it is a computer's turn, the room has nothing to do for them
    let guard = 0
    while (ann.game.legal.length > 0 && guard++ < 5) {
      ann.send({ t: 'action', action: { type: 'call' } })
      if (ann.errors.length > 0) ann.send({ t: 'action', action: { type: 'check' } })
    }
    const steps = (): number => JSON.parse(world.store.get('game')!).steps
    const before = steps()
    const due = world.host.nextAlarm() as number
    expect(due - world.clock).toBeGreaterThanOrEqual(BOT_THINK_MS.min)
    expect(due - world.clock).toBeLessThanOrEqual(BOT_THINK_MS.max)
    // Not a moment early
    world.clock = due - 1
    world.host.sweep()
    expect(steps()).toBe(before)
    world.clock = due
    world.host.sweep()
    expect(steps()).toBe(before + 1)
    // Each call had one seat's view: its own two cards, nobody else's
    const game = JSON.parse(world.store.get('game')!) as { match: { state: { players: { seat: number; hole: string[] }[] } } }
    for (const { view } of calls) {
      const seen = view as unknown as HoldemView
      expect(seen.you).not.toBeNull()
      const theirs = game.match.state.players.filter((player) => player.seat !== seen.you)
      expect(seen.players.every((player) => player.shown.length === 0)).toBe(true)
      expect(seen.hole).toHaveLength(2)
      for (const other of theirs) {
        // Cards of the hand being played, unseen
        for (const card of other.hole) expect(seen.hole).not.toContain(card)
      }
    }
    expect(calls.length).toBeGreaterThan(0)
  })

  it('nobody moves them from a browser, not even the host', () => {
    const { ann } = room('promotion')
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    const botSeat = ann.bots[0]!.seat as number
    ann.send({ t: 'action', action: { type: 'roll' }, botSeat })
    expect(ann.errors).toContain('forbidden')
  })

  it('wait while nobody is in the room, and go on when someone comes back', () => {
    const { world, ann } = room('traders')
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'start' })
    playUntilBotsTurn(world, ann)
    const token = ann.token
    world.disconnect(ann)
    const steps = (): number => JSON.parse(world.store.get('game')!).steps
    const before = steps()
    world.clock += 60_000
    world.host.sweep()
    expect(steps()).toBe(before)
    const back = world.join('Ann', token)
    expect(world.host.nextAlarm()! - world.clock).toBeLessThanOrEqual(BOT_THINK_MS.max)
    world.tick()
    expect(steps()).toBeGreaterThan(before)
    expect(playOut(world, back)).toBeGreaterThan(0)
    expect(back.view!.room.status).toBe('ended')
  })

  it('go on through hibernation, and play the rematch in their renumbered seats', () => {
    const { world, ann } = room('promotion')
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    playUntilBotsTurn(world, ann)
    world.hibernate()
    playOut(world, ann)
    expect(ann.view!.room.status).toBe('ended')
    ann.send({ t: 'rematch' })
    expect(ann.view!.room.status).toBe('playing')
    expect(ann.bots).toHaveLength(2)
    playOut(world, ann)
    expect(ann.view!.room.status).toBe('ended')
  })
})

describe('one person and two computers play a whole game', () => {
  const games: [string, Record<string, unknown> | undefined][] = [
    ['holdem', { stack: 100, blindUp: 15, timer: 30 }],
    ['promotion', undefined],
    ['promotion', { edition: 'full' }],
    ['traders', undefined],
    // 2026-11-21
    ['palace', undefined],
    ['secret-scroll', { length: 'short' }],
    ['wasabi', undefined],
    ['tiles', { clock: 60 }],
  ]
  for (const [gameId, options] of games) {
    it(`${gameId}${options?.edition ? ' (full)' : ''}`, () => {
      const { world, ann } = room(gameId, options)
      ann.send({ t: 'add_bot', level: 'normal' })
      ann.send({ t: 'add_bot', level: 'easy' })
      ann.send({ t: 'start' })
      expect(ann.view!.room.status).toBe('playing')
      playOut(world, ann)
      expect(ann.view!.room.status).toBe('ended')
      expect(ann.game.result!.standings).toHaveLength(3)
      expect(ann.errors).toEqual([])
    })
  }
})

describe('the next round is the people’s to start', () => {
  it('secret-scroll: after a round the computers wait for Ann or the clock', () => {
    const { world, ann } = room('secret-scroll', { length: 'short' })
    ann.send({ t: 'add_bot', level: 'normal' })
    ann.send({ t: 'add_bot', level: 'easy' })
    ann.send({ t: 'start' })
    const phase = () => (ann.game.view as { phase: string }).phase
    for (let i = 0; i < 2000 && phase() === 'turn'; i++) {
      if (ann.game.legal.length > 0) ann.send({ t: 'action', action: ann.game.legal[0] })
      else world.tick()
    }
    if (phase() === 'over') return
    expect(phase()).toBe('roundEnd')
    // Only the round's own clock is due, long after any computer's moment
    expect(world.host.nextAlarm()! - world.clock).toBeGreaterThan(BOT_THINK_MS.max)
    ann.send({ t: 'action', action: { type: 'next' } })
    expect(phase()).toBe('turn')
  })
})

/** Ann plays until it is a computer seat's turn */
function playUntilBotsTurn(world: World, ann: Client) {
  for (let i = 0; i < 50 && ann.game.legal.length > 0; i++) {
    ann.send({ t: 'action', action: ann.game.legal[0] })
  }
  expect(ann.game.legal).toHaveLength(0)
  expect(world.host.nextAlarm()).not.toBeNull()
}
