// e9-t06b: the thrown and dropped items as the room judges them: each shot put on the road by a use,
// then hit or missed by the karts' own frames as they come in, shields and all.
import { describe, expect, it } from 'vitest'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { isGameError, type RealtimeMemory, type SeatId } from '../../shared/games/types.ts'
import { encodeItemFrame, type ItemId } from '../../shared/kart/items.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import { rayToWall, SHOT_TUNING } from '../../shared/kart/shots.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { bytes } from '../kart/raceDriver.ts'

const GO = 1_000_000
/** Ten seconds into the race */
const NOW = GO + 10_000
const track = raceTrack('riverside')!
const gates = track.gates

function act(state: KartState, action: KartAction): KartState {
  const next = kart.reduce(state, action, 'system', createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)}: ${next.gameError}`)
  return next
}

function racing(seats: number): KartState {
  let state = kart.init(
    makeSeats(seats),
    { track: 'riverside', laps: 3, mode: 'items' },
    createRng(1),
  )
  for (let seat = 0; seat < seats; seat++) {
    const next = kart.reduce(state, { t: 'loaded' }, seat, createRng(7))
    if (isGameError(next)) throw new Error(next.gameError)
    state = next
  }
  return act(act(state, { t: 'schedule', goAt: GO }), { t: 'go' })
}

const mid = (index: number) => {
  const gate = gates[index]!
  return { x: (gate.ax + gate.bx) / 2, z: (gate.az + gate.bz) / 2 }
}

/** A stretch between two gates long and clear enough to throw along: its first gate */
const stretch = (() => {
  for (let i = 2; i < gates.length - 3; i++) {
    const a = mid(i)
    const b = mid(i + 1)
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const dx = (b.x - a.x) / length
    const dz = (b.z - a.z) / length
    if (length > 30 && rayToWall(track.allWalls, a.x, a.z, dx, dz, 500) > length) return i
  }
  throw new Error('no straight stretch')
})()
const a = mid(stretch)
const b = mid(stretch + 1)
const length = Math.hypot(b.x - a.x, b.z - a.z)
/** The heading that faces from the stretch's first gate to the next */
const heading = Math.atan2(b.x - a.x, -(b.z - a.z))
/** A share of the way along the stretch */
const along = (share: number) => ({ x: a.x + (b.x - a.x) * share, z: a.z + (b.z - a.z) * share })
/** The tick of a frame sent at server time `now` */
const tickAt = (now: number) => Math.round(((now - GO) / 1000) * 60)

const frameAt = (share: number, now: number): KartFrame => {
  const spot = along(share)
  return {
    tick: tickAt(now),
    x: spot.x,
    z: spot.z,
    heading,
    vx: 0,
    vz: 0,
    reset: false,
    drifting: false,
    boosting: false,
    skidding: false,
    finished: false,
    driftDirection: 0,
    steer: 0,
    body: 0,
    crossings: 1,
    nextGate: stretch + 1,
    seq: (now - GO) & 0xffff,
  }
}

/** A frame from `seat` at a share of the stretch, at server time `now`, and what it led to */
function at(state: KartState, memory: RealtimeMemory, seat: SeatId, share: number, now: number) {
  const answer = kart.realtime!.frame(state, memory, seat, bytes(frameAt(share, now)), now)
  expect(answer.relay).not.toBeNull()
  let next = state
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

/** The racer in `seat` holds `item` */
const holding = (state: KartState, seat: SeatId, item: ItemId | null): KartState => ({
  ...state,
  racers: state.racers.map((one) => (one.seat === seat ? { ...one, item } : one)),
})

const racer = (state: KartState, seat: SeatId) => state.racers.find((one) => one.seat === seat)!

/** `seat` uses `item` (held for it), at NOW */
function use(state: KartState, memory: RealtimeMemory, seat: SeatId, item: ItemId) {
  const frame = encodeItemFrame({ op: 'use', item, tick: tickAt(NOW) })
  const answer = kart.realtime!.frame(holding(state, seat, item), memory, seat, frame, NOW)
  expect(answer.relay).toBeNull()
  let next = holding(state, seat, item)
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

/** Seat 1 near the start of the stretch, seat 0 near its end, both facing along it */
function lined(): { state: KartState; memory: RealtimeMemory } {
  const state = racing(2)
  const memory = kart.realtime!.memory()
  at(state, memory, 1, 0.1, NOW - 50)
  at(state, memory, 0, 0.9, NOW - 50)
  return { state, memory }
}

const shielded = (state: KartState, seat: SeatId): KartState => ({
  ...state,
  racers: state.racers.map((one) =>
    one.seat === seat ? { ...one, shieldUntil: NOW + 10_000 } : one,
  ),
})

describe('the thrown and dropped items (e9-t06b)', () => {
  it('starts a race with no shots on the road', () => {
    expect(racing(2).shots).toEqual([])
  })

  it('hail: thrown the way the kart faces, a shot on the road until it hits the kart ahead', () => {
    const { state, memory } = lined()
    const thrown = use(state, memory, 1, 'hail')
    expect(thrown.actions[0]).toMatchObject({ t: 'use', item: 'hail', targets: [] })
    expect(thrown.state.events.at(-1)).toMatchObject({ item: 'hail', by: 1, hit: false })
    expect(racer(thrown.state, 1).item).toBeNull()
    const shot = thrown.state.shots[0]!
    expect(shot).toMatchObject({ item: 'hail', by: 1, n: 0, at: NOW, target: null })
    // Straight at seat 0
    const speed = Math.hypot(shot.vx, shot.vz)
    expect(speed).toBeGreaterThanOrEqual(SHOT_TUNING.hailSpeed - 1e-6)
    expect((shot.vx * (b.x - a.x) + shot.vz * (b.z - a.z)) / speed / length).toBeCloseTo(1, 2)
    // Its thrower's frames never set it off
    expect(at(thrown.state, memory, 1, 0.11, NOW + 50).actions).toEqual([])
    // Seat 0, sitting where the hail goes, is not hit before it gets there, and is hit after
    expect(at(thrown.state, memory, 0, 0.9, NOW + 30).actions).toEqual([])
    const arrives = NOW + Math.ceil(((0.8 * length) / speed) * 1000)
    const hit = at(thrown.state, memory, 0, 0.9, arrives + 60)
    expect(hit.actions).toContainEqual({ t: 'hit', seat: 0, shot: 0, at: arrives + 60 })
    expect(hit.state.shots).toEqual([])
    expect(hit.state.events.at(-1)).toMatchObject({
      n: 1,
      item: 'hail',
      by: 1,
      targets: [0],
      blocked: [],
      hit: true,
    })
  })

  it('hail: a bubble stops it, and both are gone', () => {
    const { state, memory } = lined()
    const thrown = use(shielded(state, 0), memory, 1, 'hail')
    const shot = thrown.state.shots[0]!
    const arrives = NOW + Math.ceil(((0.8 * length) / Math.hypot(shot.vx, shot.vz)) * 1000)
    const hit = at(thrown.state, memory, 0, 0.9, arrives + 60)
    expect(hit.state.events.at(-1)).toMatchObject({ targets: [0], blocked: [0], hit: true })
    expect(racer(hit.state, 0).shieldUntil).toBe(0)
    expect(hit.state.shots).toEqual([])
  })

  it('puddle: dropped behind, it catches the kart driving into it; its owner is safe at first', () => {
    const { state, memory } = lined()
    const dropped = use(state, memory, 0, 'puddle')
    const shot = dropped.state.shots[0]!
    expect(shot).toMatchObject({ item: 'puddle', by: 0, vx: 0, vz: 0 })
    const behind = (0.9 * length - SHOT_TUNING.puddleBehind) / length
    expect(Math.hypot(shot.x - along(behind).x, shot.z - along(behind).z)).toBeLessThan(0.01)
    // Seat 0 is right by it, but it is not armed yet for its owner
    expect(at(dropped.state, memory, 0, 0.9, NOW + 100).actions).toEqual([])
    // Seat 1 drives through it
    expect(at(dropped.state, memory, 1, behind - 12 / length, NOW + 700).actions).toEqual([])
    const hit = at(dropped.state, memory, 1, behind + 8 / length, NOW + 1000)
    expect(hit.actions).toContainEqual({ t: 'hit', seat: 1, shot: 0, at: NOW + 1000 })
    expect(hit.state.events.at(-1)).toMatchObject({ item: 'puddle', by: 0, targets: [1] })
    expect(hit.state.shots).toEqual([])
  })

  it('puddle: still there for the next kart when one drives round it', () => {
    const { state, memory } = lined()
    const dropped = use(state, memory, 0, 'puddle')
    // Seat 1 stays well short of it
    const short = at(dropped.state, memory, 1, 0.2, NOW + 500)
    expect(short.actions).toEqual([])
    expect(short.state.shots).toHaveLength(1)
  })

  it('cloud: after the kart just ahead, strikes it once it arrives; the leader has no one to send it at', () => {
    const { state, memory } = lined()
    expect(use(state, memory, 0, 'cloud').actions).toEqual([])
    const sent = use(state, memory, 1, 'cloud')
    expect(sent.state.events.at(-1)).toMatchObject({
      item: 'cloud',
      by: 1,
      targets: [0],
      blocked: [],
      hit: false,
    })
    const shot = sent.state.shots[0]!
    expect(shot).toMatchObject({ item: 'cloud', target: 0 })
    expect(shot.until).toBeGreaterThanOrEqual(NOW + SHOT_TUNING.cloudMinMs)
    // Not before it arrives, and the sender's frames never set it off
    expect(at(sent.state, memory, 0, 0.9, shot.until - 100).actions).toEqual([])
    expect(at(sent.state, memory, 1, 0.1, shot.until + 50).actions).toEqual([])
    const hit = at(sent.state, memory, 0, 0.9, shot.until + 50)
    expect(hit.actions).toContainEqual({ t: 'hit', seat: 0, shot: 0, at: shot.until + 50 })
    expect(hit.state.events.at(-1)).toMatchObject({ item: 'cloud', targets: [0], hit: true })
  })

  it('cloud: a bubble up when it arrives stops it', () => {
    const { state, memory } = lined()
    const sent = use(state, memory, 1, 'cloud')
    const shot = sent.state.shots[0]!
    const hit = at(shielded(sent.state, 0), memory, 0, 0.9, shot.until + 50)
    expect(hit.state.events.at(-1)).toMatchObject({ blocked: [0], hit: true })
    expect(racer(hit.state, 0).shieldUntil).toBe(0)
  })

  it('nothing hits a kart that has finished', () => {
    const { state, memory } = lined()
    const thrown = use(state, memory, 1, 'hail')
    const finished = {
      ...thrown.state,
      racers: thrown.state.racers.map((one) => (one.seat === 0 ? { ...one, finishMs: 9000 } : one)),
    }
    const shot = thrown.state.shots[0]!
    const when = NOW + Math.ceil(((0.8 * length) / Math.hypot(shot.vx, shot.vz)) * 1000) + 60
    const answer = kart.realtime!.frame(finished, memory, 0, bytes(frameAt(0.9, when)), when)
    expect(answer.actions).toEqual([])
  })

  it('checks every shot and hit it is handed', () => {
    const state = holding(lined().state, 1, 'hail')
    const reduce = (action: unknown, from = state) =>
      kart.reduce(from, action as KartAction, 'system', createRng(7))
    const used = { t: 'use', seat: 1, item: 'hail', at: NOW, targets: [], blocked: [], warps: [] }
    const shot = {
      n: 0,
      item: 'hail',
      by: 1,
      at: NOW,
      x: 0,
      z: 0,
      vx: 1,
      vz: 0,
      until: NOW + 1,
      target: null,
    }
    // A thrown item needs its shot: the right item, its thrower, numbered next
    expect(isGameError(reduce({ ...used, shot: null }))).toBe(true)
    expect(isGameError(reduce({ ...used, shot: { ...shot, item: 'puddle' } }))).toBe(true)
    expect(isGameError(reduce({ ...used, shot: { ...shot, by: 0 } }))).toBe(true)
    expect(isGameError(reduce({ ...used, shot: { ...shot, n: 5 } }))).toBe(true)
    expect(isGameError(reduce({ ...used, shot }))).toBe(false)
    // A direct item puts nothing on the road
    expect(isGameError(reduce({ ...used, item: 'boost', shot }, holding(state, 1, 'boost')))).toBe(
      true,
    )
    // A hit needs a shot on the road and a racer to hit
    expect(isGameError(reduce({ t: 'hit', seat: 0, shot: 0, at: NOW }))).toBe(true)
    const placed = reduce({ ...used, shot }) as KartState
    expect(isGameError(reduce({ t: 'hit', seat: 9, shot: 0, at: NOW }, placed))).toBe(true)
    expect(isGameError(reduce({ t: 'hit', seat: 0, shot: 0, at: NOW }, placed))).toBe(false)
  })
})
