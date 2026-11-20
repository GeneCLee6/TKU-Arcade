// 2026-11-20 (docs/ARCHITECTURE.md §4.45): the six items of the second round as the room judges them
// (a mirror, sea fog, a skip, static, a rally flag, a fake box), how they meet the bubble and the
// other items, the draw (the leader never gets one that reaches the kart in front, the rally only
// in a team race, luck), and the item series' perks, read by the room from the kart a frame names.
import { describe, expect, it } from 'vitest'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { isGameError, type RealtimeMemory, type SeatId } from '../../shared/games/types.ts'
import {
  drawItem,
  drawWeights,
  encodeItemFrame,
  ITEM_IDS,
  ITEM_TABLE,
  ITEM_TUNING,
  itemBoxes,
  LUCK_STEP,
  skipTo,
  STRONG_ITEMS,
  TARGETED_ITEMS,
  TEAM_ONLY_ITEMS,
  type ItemId,
} from '../../shared/kart/items.ts'
import { loadoutByte, type KartId } from '../../shared/kart/karts.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import type { Tracked } from '../../shared/kart/race.ts'
import { rayToWall, SHOT_TUNING } from '../../shared/kart/shots.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { bytes } from '../kart/raceDriver.ts'

const GO = 1_000_000
const NOW = GO + 10_000
const track = raceTrack('riverside')!
const gates = track.gates

function act(state: KartState, action: KartAction): KartState {
  const next = kart.reduce(state, action, 'system', createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)}: ${next.gameError}`)
  return next
}

function racing(seats: number, teams = false): KartState {
  let state = kart.init(
    makeSeats(seats),
    { track: 'riverside', laps: 3, mode: 'items', teams: teams ? 'teams' : 'solo' },
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

/** A stretch between two gates long and clear enough: its first gate */
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
const heading = Math.atan2(b.x - a.x, -(b.z - a.z))
const along = (share: number) => ({ x: a.x + (b.x - a.x) * share, z: a.z + (b.z - a.z) * share })
const tickAt = (now: number) => Math.round(((now - GO) / 1000) * 60)

const frameAt = (share: number, now: number, kartId: KartId = 'tide'): KartFrame => {
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
    body: loadoutByte(kartId, 'spade'),
    crossings: 1,
    nextGate: stretch + 1,
    seq: (now - GO) & 0xffff,
  }
}

function at(
  state: KartState,
  memory: RealtimeMemory,
  seat: SeatId,
  share: number,
  now: number,
  kartId: KartId = 'tide',
) {
  const answer = kart.realtime!.frame(state, memory, seat, bytes(frameAt(share, now, kartId)), now)
  expect(answer.relay).not.toBeNull()
  let next = state
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

const holding = (state: KartState, seat: SeatId, item: ItemId | null): KartState => ({
  ...state,
  racers: state.racers.map((one) => (one.seat === seat ? { ...one, item } : one)),
})

const racer = (state: KartState, seat: SeatId) => state.racers.find((one) => one.seat === seat)!

function use(state: KartState, memory: RealtimeMemory, seat: SeatId, item: ItemId, now = NOW) {
  const frame = encodeItemFrame({ op: 'use', item, tick: tickAt(now) })
  const answer = kart.realtime!.frame(holding(state, seat, item), memory, seat, frame, now)
  expect(answer.relay).toBeNull()
  let next = holding(state, seat, item)
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

/** Seat 1 near the start of the stretch, seat 0 near its end (in front), both facing along it */
function lined(kartOf: Partial<Record<SeatId, KartId>> = {}, seats = 2, teams = false) {
  const state = racing(seats, teams)
  const memory = kart.realtime!.memory()
  at(state, memory, 1, 0.1, NOW - 50, kartOf[1])
  at(state, memory, 0, 0.9, NOW - 50, kartOf[0])
  if (seats > 2) at(state, memory, 2, 0.05, NOW - 50, kartOf[2])
  return { state, memory }
}

const shielded = (state: KartState, seat: SeatId, hits?: number): KartState => ({
  ...state,
  racers: state.racers.map((one) =>
    one.seat === seat
      ? { ...one, shieldUntil: NOW + 10_000, ...(hits ? { shieldHits: hits } : {}) }
      : one,
  ),
})

const mirrored = (state: KartState, seat: SeatId): KartState => ({
  ...state,
  racers: state.racers.map((one) =>
    one.seat === seat ? { ...one, mirrorUntil: NOW + 10_000 } : one,
  ),
})

/** When seat 1's hail, thrown at NOW, reaches seat 0 at the far end of the stretch */
function hailArrives(state: KartState): number {
  const shot = state.shots[0]!
  return NOW + Math.ceil(((0.8 * length) / Math.hypot(shot.vx, shot.vz)) * 1000) + 60
}

describe('mirror (2026-11-20)', () => {
  it('goes up for its time, and is anyone’s, the leader’s too', () => {
    const { state, memory } = lined()
    const used = use(state, memory, 0, 'mirror')
    expect(used.actions[0]).toMatchObject({ t: 'use', item: 'mirror', targets: [], blocked: [] })
    expect(racer(used.state, 0).mirrorUntil).toBe(NOW + ITEM_TUNING.mirrorMs)
    expect(racer(used.state, 0).item).toBeNull()
  })

  it('sends a hailstone back at whoever threw it, and is used up', () => {
    const { state, memory } = lined()
    const thrown = use(mirrored(state, 0), memory, 1, 'hail')
    const when = hailArrives(thrown.state)
    const hit = at(thrown.state, memory, 0, 0.9, when)
    expect(hit.state.events.at(-1)).toMatchObject({
      item: 'hail',
      by: 0,
      targets: [1],
      blocked: [],
      hit: true,
      bounced: true,
    })
    expect(racer(hit.state, 0).mirrorUntil).toBe(0)
    expect(hit.state.shots).toEqual([])
  })

  it('comes before a bubble on the same kart, and the thrower’s bubble stops what comes back', () => {
    const { state, memory } = lined()
    const both = shielded(mirrored(state, 0), 0)
    const thrown = use(shielded(both, 1), memory, 1, 'hail')
    const hit = at(thrown.state, memory, 0, 0.9, hailArrives(thrown.state))
    expect(hit.state.events.at(-1)).toMatchObject({ by: 0, targets: [1], blocked: [1], bounced: true })
    // The mirror's kart keeps its bubble; the thrower's is used up
    expect(racer(hit.state, 0).shieldUntil).toBe(NOW + 10_000)
    expect(racer(hit.state, 1).shieldUntil).toBe(0)
  })

  it('sends a cloud back to its sender when it strikes', () => {
    const { state, memory } = lined()
    const sent = use(state, memory, 1, 'cloud')
    const shot = sent.state.shots[0]!
    const hit = at(mirrored(sent.state, 0), memory, 0, 0.9, shot.until + 50)
    expect(hit.state.events.at(-1)).toMatchObject({ item: 'cloud', by: 0, targets: [1], bounced: true })
  })

  it('does nothing against static, a headwind or a swap: those are a bubble’s', () => {
    const { state, memory } = lined()
    const jammed = use(mirrored(state, 0), memory, 1, 'jam')
    expect(jammed.state.events.at(-1)).toMatchObject({ item: 'jam', targets: [0], blocked: [] })
    expect(racer(jammed.state, 0).mirrorUntil).toBe(NOW + 10_000)
  })
})

describe('sea fog (2026-11-20)', () => {
  it('is laid on the road ahead of the kart in front, never by the leader', () => {
    const { state, memory } = lined()
    expect(use(state, memory, 0, 'fog').actions).toEqual([])
    const laid = use(state, memory, 1, 'fog')
    expect(laid.actions[0]).toMatchObject({ t: 'use', item: 'fog', targets: [0] })
    const shot = laid.state.shots[0]!
    expect(shot).toMatchObject({ item: 'fog', by: 1, vx: 0, vz: 0, struck: [] })
    expect(shot.until).toBe(NOW + SHOT_TUNING.fogMs)
    // Ahead of seat 0, along its way
    const front = along(0.9)
    const ahead = (shot.x - front.x) * Math.sin(heading) - (shot.z - front.z) * Math.cos(heading)
    expect(ahead).toBeGreaterThan(0)
    expect(ahead).toBeLessThanOrEqual(SHOT_TUNING.fogLeadMin + 1e-6)
  })

  it('fogs each kart that drives in once, never its owner, and stays for the next', () => {
    const { state, memory } = lined()
    const laid = use(state, memory, 1, 'fog')
    const shot = laid.state.shots[0]!
    // Seat 0 driven to where the fog is
    const share = 0.9 + (Math.hypot(shot.x - along(0.9).x, shot.z - along(0.9).z) / length)
    const into = at(laid.state, memory, 0, share, NOW + 600)
    expect(into.actions).toContainEqual({ t: 'hit', seat: 0, shot: 0, at: NOW + 600 })
    expect(into.state.events.at(-1)).toMatchObject({ item: 'fog', by: 1, targets: [0], hit: true })
    expect(into.state.shots[0]).toMatchObject({ item: 'fog', struck: [0] })
    // Still in it, the next frame: not again
    expect(at(into.state, memory, 0, share, NOW + 650).actions).toEqual([])
    // Its owner drives through it: nothing
    expect(at(into.state, memory, 1, share, NOW + 4_000).actions).toEqual([])
  })

  it('is not stopped by a bubble, which stays up', () => {
    const { state, memory } = lined()
    const laid = use(state, memory, 1, 'fog')
    const shot = laid.state.shots[0]!
    const share = 0.9 + Math.hypot(shot.x - along(0.9).x, shot.z - along(0.9).z) / length
    const into = at(shielded(laid.state, 0), memory, 0, share, NOW + 600)
    expect(into.state.events.at(-1)).toMatchObject({ item: 'fog', targets: [0], blocked: [] })
    expect(racer(into.state, 0).shieldUntil).toBe(NOW + 10_000)
  })
})

describe('static (2026-11-20)', () => {
  it('reaches the kart in front of the whole field, and the leader cannot use it', () => {
    const { state, memory } = lined({}, 3)
    expect(use(state, memory, 0, 'jam').actions).toEqual([])
    // Seat 2 is last: it still reaches the leader, not the kart just ahead
    const used = use(state, memory, 2, 'jam')
    expect(used.state.events.at(-1)).toMatchObject({ item: 'jam', by: 2, targets: [0], blocked: [] })
  })

  it('is stopped by a bubble', () => {
    const { state, memory } = lined()
    const used = use(shielded(state, 0), memory, 1, 'jam')
    expect(used.state.events.at(-1)).toMatchObject({ targets: [0], blocked: [0] })
    expect(racer(used.state, 0).shieldUntil).toBe(0)
  })

  it('passes a team-mate in front by, for the other side’s front kart', () => {
    // Teams of three: seats 0 and 2 red, seat 1 blue. Seat 2 (last, red) jams blue seat 1, not
    // red seat 0 in front
    const { state, memory } = lined({}, 3, true)
    expect(racer(state, 0).team).toBe(racer(state, 2).team)
    const used = use(state, memory, 2, 'jam')
    expect(used.state.events.at(-1)).toMatchObject({ item: 'jam', targets: [1] })
  })
})

describe('skip (2026-11-20)', () => {
  it('lands at the respawn point of a gate ahead, and the room takes the jump', () => {
    const { state, memory } = lined()
    const used = use(state, memory, 1, 'skip')
    const event = used.state.events.at(-1)!
    expect(event).toMatchObject({ item: 'skip', by: 1, targets: [] })
    const warp = event.warps[0]!
    expect(warp.seat).toBe(1)
    const from = along(0.1)
    const distance = Math.hypot(warp.x - from.x, warp.z - from.z)
    expect(distance).toBeGreaterThanOrEqual(ITEM_TUNING.skipMin)
    expect(distance).toBeLessThanOrEqual(ITEM_TUNING.skipReach)
    expect(warp.nextGate).toBeGreaterThan(stretch + 1)
    expect(warp.crossings).toBe(1)
    const tracked = (memory.tracked as Map<SeatId, Tracked>).get(1)!
    expect(tracked.warp).toEqual(warp)
    // Its reset frame there is taken with the skip's count of gates
    const frame: KartFrame = {
      ...frameAt(0.1, NOW + 100),
      x: warp.x,
      z: warp.z,
      heading: warp.heading,
      reset: true,
      nextGate: warp.nextGate,
    }
    const answer = kart.realtime!.frame(used.state, memory, 1, bytes(frame), NOW + 100)
    expect(answer.relay).not.toBeNull()
    expect((memory.tracked as Map<SeatId, Tracked>).get(1)!.nextGate).toBe(warp.nextGate)
  })

  it('never lands on or over the finish line', () => {
    const count = gates.length
    const last = mid(count - 1)
    expect(skipTo(track, 0, last.x, last.z, 0, 1)).toBeNull()
    // From just short of the last gate, at most onto it
    const warp = skipTo(track, 0, mid(count - 2).x, mid(count - 2).z, count - 1, 1)
    if (warp) expect(warp.nextGate).toBe(0)
  })

  it('finds somewhere to land from most of every race track', () => {
    for (const id of RACE_TRACK_IDS) {
      const one = raceTrack(id)!
      const { respawns } = courseOf(one).checkpoints!
      let found = 0
      for (let gate = 1; gate < respawns.length - 1; gate++) {
        const spot = respawns[gate - 1]!
        if (skipTo(one, 0, spot.x, spot.z, gate, 1)) found++
      }
      expect(found / Math.max(1, respawns.length - 2), id).toBeGreaterThan(0.6)
    }
  })
})

describe('rally flag (2026-11-20)', () => {
  it('lifts every team-mate still racing, and only in a team race', () => {
    const solo = lined()
    expect(use(solo.state, solo.memory, 1, 'rally').actions).toEqual([])
    const team = lined({}, 3, true)
    const used = use(team.state, team.memory, 0, 'rally')
    expect(used.state.events.at(-1)).toMatchObject({ item: 'rally', by: 0, targets: [2], blocked: [] })
  })

  it('is drawn only in a team race', () => {
    for (const bucket of ['front', 'middle', 'back'] as const) {
      expect(drawWeights(bucket).some(([id]) => id === 'rally')).toBe(false)
      expect(drawWeights(bucket, { teams: true }).some(([id]) => id === 'rally')).toBe(true)
    }
    for (let i = 0; i < 200; i++) expect(drawItem('back', i / 200)).not.toBe('rally')
  })
})

describe('fake box (2026-11-20)', () => {
  it('is dropped behind like a puddle and stuns whoever drives in; a bubble stops it', () => {
    const { state, memory } = lined()
    const dropped = use(state, memory, 0, 'decoy')
    const shot = dropped.state.shots[0]!
    expect(shot).toMatchObject({ item: 'decoy', by: 0, vx: 0, vz: 0, until: NOW + SHOT_TUNING.decoyMs })
    const behind = (0.9 * length - SHOT_TUNING.puddleBehind) / length
    expect(at(dropped.state, memory, 1, behind - 12 / length, NOW + 700).actions).toEqual([])
    const hit = at(dropped.state, memory, 1, behind + 8 / length, NOW + 1000)
    expect(hit.state.events.at(-1)).toMatchObject({ item: 'decoy', by: 0, targets: [1], blocked: [] })
    expect(hit.state.shots).toEqual([])
    // With a bubble up instead
    const again = lined()
    const twice = use(again.state, again.memory, 0, 'decoy')
    at(twice.state, again.memory, 1, behind - 12 / length, NOW + 700)
    const stopped = at(shielded(twice.state, 1), again.memory, 1, behind + 8 / length, NOW + 1000)
    expect(stopped.state.events.at(-1)).toMatchObject({ item: 'decoy', targets: [1], blocked: [1] })
  })

  it('a mirror sends it back at the kart that dropped it', () => {
    const { state, memory } = lined()
    const dropped = use(state, memory, 0, 'decoy')
    const behind = (0.9 * length - SHOT_TUNING.puddleBehind) / length
    at(dropped.state, memory, 1, behind - 12 / length, NOW + 700)
    const hit = at(mirrored(dropped.state, 1), memory, 1, behind + 8 / length, NOW + 1000)
    expect(hit.state.events.at(-1)).toMatchObject({ item: 'decoy', by: 1, targets: [0], bounced: true })
  })
})

describe('the draw, with the six more (2026-11-20)', () => {
  it('can give every item from some place', () => {
    const given = new Set(Object.values(ITEM_TABLE).flatMap((row) => Object.keys(row)))
    expect([...given].sort()).toEqual([...ITEM_IDS].sort())
  })

  it('never gives the leader anything that reaches the kart in front', () => {
    for (const item of [...TARGETED_ITEMS, 'hail', 'skip'] as const) {
      expect(ITEM_TABLE.front[item] ?? 0, item).toBe(0)
    }
    for (const id of ['jam', 'fog'] as const) expect(TARGETED_ITEMS.has(id)).toBe(true)
  })

  it('makes the strong items likelier with luck, and nothing else', () => {
    const plain = new Map(drawWeights('back'))
    const lucky = new Map(drawWeights('back', { luck: 2 }))
    for (const [id, weight] of plain) {
      expect(lucky.get(id), id).toBeCloseTo(STRONG_ITEMS.has(id) ? weight * (1 + 2 * LUCK_STEP) : weight)
    }
    // Luck never brings an item the place would not give: the leader stays out of reach of them
    expect([...new Map(drawWeights('front', { luck: 2 })).keys()].sort()).toEqual(
      [...new Map(drawWeights('front')).keys()].sort(),
    )
    expect(TEAM_ONLY_ITEMS.has('rally')).toBe(true)
  })

  it('reads the luck from the kart the frames name: a cormorant at the back finds more strong items', () => {
    const count = (kartId: KartId) => {
      const memory = kart.realtime!.memory()
      let state = racing(3)
      const box = itemBoxes(track)[4]!
      const gate = gates.findIndex((_, i) => Math.hypot(mid(i).x - box.x, mid(i).z - box.z) < 20)
      // Seat 0 at the box but last: the others well on
      const frame: KartFrame = { ...frameAt(0, NOW - 50, kartId), x: box.x, z: box.z, nextGate: gate + 1 }
      kart.realtime!.frame(state, memory, 0, bytes(frame), NOW - 50)
      at(state, memory, 1, 0.5, NOW - 50)
      at(state, memory, 2, 0.6, NOW - 50)
      let strong = 0
      for (let draw = 0; draw < 400; draw++) {
        state = { ...holding(state, 0, null), boxes: state.boxes.map(() => 0), draws: draw }
        const answer = kart.realtime!.frame(
          state,
          memory,
          0,
          encodeItemFrame({ op: 'pickup', box: 4, tick: tickAt(NOW) }),
          NOW,
        )
        const got = answer.actions[0]
        if (got?.t !== 'got') throw new Error('no item')
        if (STRONG_ITEMS.has(got.item)) strong++
      }
      return strong
    }
    expect(count('cormorant')).toBeGreaterThan(count('tide'))
  })
})

describe('the item series’ perks, judged by the room (2026-11-20)', () => {
  it('a pelican’s bubble stops two hits', () => {
    const { state, memory } = lined({ 0: 'pelican' })
    const up = use(state, memory, 0, 'shield')
    expect(racer(up.state, 0)).toMatchObject({ shieldHits: 2 })
    const first = use(up.state, memory, 1, 'jam')
    expect(first.state.events.at(-1)).toMatchObject({ blocked: [0], kept: [0] })
    expect(racer(first.state, 0).shieldUntil).toBe(NOW + ITEM_TUNING.shieldMs)
    expect(racer(first.state, 0).shieldHits).toBe(1)
    const second = use(first.state, memory, 1, 'jam')
    expect(second.state.events.at(-1)).toMatchObject({ blocked: [0] })
    expect(second.state.events.at(-1)!.kept).toBeUndefined()
    expect(racer(second.state, 0).shieldUntil).toBe(0)
  })

  it('an otter’s own items last a quarter longer, and the event says how long', () => {
    const { state, memory } = lined({ 1: 'otter' })
    const boost = use(state, memory, 1, 'boost')
    expect(boost.state.events.at(-1)!.ms).toBe(Math.round(ITEM_TUNING.boostSeconds * 1000 * 1.25))
    const mirror = use(state, memory, 1, 'mirror')
    expect(racer(mirror.state, 1).mirrorUntil).toBe(NOW + Math.round(ITEM_TUNING.mirrorMs * 1.25))
    // A standard kart's events carry no time: the standard one
    const plain = lined()
    expect(use(plain.state, plain.memory, 1, 'boost').state.events.at(-1)!.ms).toBeUndefined()
  })

  it('refuses a use that claims more than the room allows', () => {
    const state = holding(lined().state, 1, 'shield')
    const used = { t: 'use', seat: 1, item: 'shield', at: NOW, targets: [], blocked: [], warps: [], shot: null }
    const bad = (extra: object) =>
      isGameError(kart.reduce(state, { ...used, ...extra } as KartAction, 'system', createRng(7)))
    expect(bad({})).toBe(false)
    expect(bad({ hits: 9 })).toBe(true)
    expect(bad({ ms: -5 })).toBe(true)
    expect(bad({ ms: 1.5 })).toBe(true)
  })
})
