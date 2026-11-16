// e9-t05, e9-t06a: the item race as the room judges it: boxes first come first served, the draw by
// place, and each of the five direct items reaching whom it should, shields and all.
import { describe, expect, it } from 'vitest'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { isGameError, type RealtimeMemory, type SeatId } from '../../shared/games/types.ts'
import {
  encodeItemFrame,
  ITEM_TABLE,
  ITEM_TUNING,
  itemBoxes,
  KEEP_EVENTS,
  type ItemId,
} from '../../shared/kart/items.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import type { Tracked } from '../../shared/kart/race.ts'
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

function racing(seats: number, mode: 'items' | 'race' = 'items'): KartState {
  let state = kart.init(makeSeats(seats), { track: 'riverside', laps: 3, mode }, createRng(1))
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

const frameAt = (
  x: number,
  z: number,
  nextGate: number,
  extra: Partial<KartFrame> = {},
): KartFrame => ({
  tick: 600,
  x,
  z,
  heading: 0,
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
  nextGate,
  seq: 0,
  ...extra,
})

/** A kart the server has seen just past gate `passed` (on lap 1): the further, the better its place */
function place(state: KartState, memory: RealtimeMemory, seat: SeatId, passed: number, now = NOW) {
  const at = mid(passed)
  const answer = kart.realtime!.frame(
    state,
    memory,
    seat,
    bytes(frameAt(at.x, at.z, passed + 1)),
    now,
  )
  expect(answer.relay).not.toBeNull()
  const tracked = (memory.tracked as Map<SeatId, Tracked>).get(seat)!
  expect(tracked.nextGate).toBe(passed + 1)
}

function send(
  state: KartState,
  memory: RealtimeMemory,
  seat: SeatId,
  frame: Parameters<typeof encodeItemFrame>[0],
  now = NOW,
): { state: KartState; actions: KartAction[] } {
  const answer = kart.realtime!.frame(state, memory, seat, encodeItemFrame(frame), now)
  expect(answer.relay).toBeNull()
  let next = state
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

/** The racer in `seat` holds `item` */
const holding = (state: KartState, seat: SeatId, item: ItemId | null): KartState => ({
  ...state,
  racers: state.racers.map((racer) => (racer.seat === seat ? { ...racer, item } : racer)),
})

const racer = (state: KartState, seat: SeatId) => state.racers.find((one) => one.seat === seat)!

describe('the item race room (e9-t05)', () => {
  it('has a mode option, items by default, and boxes only in an item race', () => {
    expect(kart.options.mode).toMatchObject({ kind: 'select', default: 'items' })
    const items = racing(2)
    expect(items.mode).toBe('items')
    expect(items.boxes).toHaveLength(itemBoxes(track).length)
    expect(items.boxes.every((ready) => ready === 0)).toBe(true)
    expect(items.racers.every((one) => one.item === null && one.shieldUntil === 0)).toBe(true)
    expect(racing(2, 'race').boxes).toEqual([])
  })

  it('ignores item frames in a plain race', () => {
    const state = racing(1, 'race')
    const memory = kart.realtime!.memory()
    place(state, memory, 0, 3)
    expect(send(state, memory, 0, { op: 'pickup', box: 0, tick: 600 }).actions).toEqual([])
  })

  it('hands a box to the first kart through it, and to nobody else until it is back', () => {
    let state = racing(2)
    const memory = kart.realtime!.memory()
    const boxes = itemBoxes(track)
    const box = boxes[0]!
    // Both karts right at the box
    for (const seat of [0, 1]) {
      const gate = gates.findIndex((_, i) => Math.hypot(mid(i).x - box.x, mid(i).z - box.z) < 20)
      const answer = kart.realtime!.frame(
        state,
        memory,
        seat,
        bytes(frameAt(box.x, box.z, gate + 1)),
        NOW,
      )
      expect(answer.relay).not.toBeNull()
    }
    const first = send(state, memory, 0, { op: 'pickup', box: 0, tick: 600 })
    expect(first.actions).toHaveLength(1)
    state = first.state
    expect(racer(state, 0).item).not.toBeNull()
    expect(state.boxes[0]).toBe(NOW + ITEM_TUNING.boxRespawnMs)
    // Taken: the second kart gets nothing, and the first cannot hold two
    expect(send(state, memory, 1, { op: 'pickup', box: 0, tick: 600 }).actions).toEqual([])
    expect(send(state, memory, 0, { op: 'pickup', box: 1, tick: 600 }).actions).toEqual([])
    // Back again
    const later = NOW + ITEM_TUNING.boxRespawnMs
    expect(send(state, memory, 1, { op: 'pickup', box: 0, tick: 600 }, later).actions).toHaveLength(
      1,
    )
  })

  it('refuses a box far from where the kart was seen, and one that does not exist', () => {
    const state = racing(1)
    const memory = kart.realtime!.memory()
    place(state, memory, 0, 1)
    const far = itemBoxes(track).findIndex(
      (box) => Math.hypot(box.x - mid(1).x, box.z - mid(1).z) > 100,
    )
    expect(far).toBeGreaterThanOrEqual(0)
    expect(send(state, memory, 0, { op: 'pickup', box: far, tick: 600 }).actions).toEqual([])
    expect(send(state, memory, 0, { op: 'pickup', box: 200, tick: 600 }).actions).toEqual([])
  })

  it('draws by place: the leader only ever gets a boost or a shield', () => {
    const memory = kart.realtime!.memory()
    let state = racing(3)
    const box = itemBoxes(track)[4]!
    const gate = gates.findIndex((_, i) => Math.hypot(mid(i).x - box.x, mid(i).z - box.z) < 20)
    // Seat 0 at the box, the others far behind
    kart.realtime!.frame(state, memory, 0, bytes(frameAt(box.x, box.z, gate + 1)), NOW)
    place(state, memory, 1, 1)
    place(state, memory, 2, 1)
    const seen = new Set<ItemId>()
    for (let draw = 0; draw < 60; draw++) {
      state = { ...holding(state, 0, null), boxes: state.boxes.map(() => 0), draws: draw }
      const { actions } = send(state, memory, 0, { op: 'pickup', box: 4, tick: 600 })
      const got = actions[0]
      if (got?.t !== 'got') throw new Error('no item')
      seen.add(got.item)
    }
    expect([...seen].every((item) => item === 'boost' || item === 'shield')).toBe(true)
    expect(seen.size).toBe(2)
  })

  it('checks every got and use it is handed', () => {
    const state = racing(2)
    const bad = (action: unknown) =>
      isGameError(kart.reduce(state, action as KartAction, 'system', createRng(7)))
    expect(bad({ t: 'got', seat: 0, box: 999, item: 'boost', at: NOW })).toBe(true)
    expect(bad({ t: 'got', seat: 0, box: 0, item: 'rocket', at: NOW })).toBe(true)
    expect(bad({ t: 'got', seat: 9, box: 0, item: 'boost', at: NOW })).toBe(true)
    // Not held
    expect(
      bad({ t: 'use', seat: 0, item: 'boost', at: NOW, targets: [], blocked: [], warps: [] }),
    ).toBe(true)
    // Not from a player
    expect(
      isGameError(
        kart.reduce(state, { t: 'got', seat: 0, box: 0, item: 'boost', at: NOW }, 0, createRng(7)),
      ),
    ).toBe(true)
  })
})

describe('the direct items (e9-t06a)', () => {
  /** Three karts in a row: seat 2 last, seat 1 in the middle, seat 0 leading, close together */
  function field(): { state: KartState; memory: RealtimeMemory } {
    const state = racing(3)
    const memory = kart.realtime!.memory()
    place(state, memory, 0, 6)
    place(state, memory, 1, 5)
    place(state, memory, 2, 4)
    return { state, memory }
  }

  it('boost: always used, and only on the kart that used it', () => {
    const { state, memory } = field()
    const used = send(holding(state, 0, 'boost'), memory, 0, {
      op: 'use',
      item: 'boost',
      tick: 600,
    })
    expect(used.actions[0]).toMatchObject({ t: 'use', item: 'boost', targets: [], blocked: [] })
    expect(racer(used.state, 0).item).toBeNull()
    expect(used.state.events).toHaveLength(1)
    expect(used.state.events[0]).toMatchObject({ n: 0, item: 'boost', by: 0 })
  })

  it('cannot be used without being held, or as another item', () => {
    const { state, memory } = field()
    expect(send(state, memory, 0, { op: 'use', item: 'boost', tick: 600 }).actions).toEqual([])
    expect(
      send(holding(state, 0, 'shield'), memory, 0, { op: 'use', item: 'boost', tick: 600 }).actions,
    ).toEqual([])
  })

  it('shield: up for its time, stops one harmful item and is gone', () => {
    const { state, memory } = field()
    let next = send(holding(state, 0, 'shield'), memory, 0, {
      op: 'use',
      item: 'shield',
      tick: 600,
    }).state
    expect(racer(next, 0).shieldUntil).toBe(NOW + ITEM_TUNING.shieldMs)
    // A headwind from the back reaches both ahead; the leader's shield stops it there
    next = send(holding(next, 2, 'headwind'), memory, 2, {
      op: 'use',
      item: 'headwind',
      tick: 600,
    }).state
    const event = next.events.at(-1)!
    expect(event.targets.sort()).toEqual([0, 1])
    expect(event.blocked).toEqual([0])
    expect(racer(next, 0).shieldUntil).toBe(0)
    // Past its time it stops nothing
    const late = send(
      holding(
        { ...next, racers: next.racers.map((one) => ({ ...one, shieldUntil: NOW + 1 })) },
        2,
        'headwind',
      ),
      memory,
      2,
      { op: 'use', item: 'headwind', tick: 600 },
      NOW + 2,
    ).state
    expect(late.events.at(-1)!.blocked).toEqual([])
  })

  it('headwind: everyone ahead, nobody behind, and nothing for the leader to use it on', () => {
    const { state, memory } = field()
    const middle = send(holding(state, 1, 'headwind'), memory, 1, {
      op: 'use',
      item: 'headwind',
      tick: 600,
    })
    expect(middle.state.events.at(-1)!.targets).toEqual([0])
    expect(
      send(holding(state, 0, 'headwind'), memory, 0, { op: 'use', item: 'headwind', tick: 600 })
        .actions,
    ).toEqual([])
  })

  it('tow: on the kart just ahead, only within reach; a shield does not stop it', () => {
    const { state, memory } = field()
    const shielded = {
      ...state,
      racers: state.racers.map((one) => ({ ...one, shieldUntil: NOW + 5000 })),
    }
    const tow = send(holding(shielded, 2, 'tow'), memory, 2, { op: 'use', item: 'tow', tick: 600 })
    expect(tow.state.events.at(-1)).toMatchObject({ item: 'tow', targets: [1], blocked: [] })
    // Leader: nobody to tow on
    expect(
      send(holding(state, 0, 'tow'), memory, 0, { op: 'use', item: 'tow', tick: 600 }).actions,
    ).toEqual([])
    // Far behind: out of reach
    const far = kart.realtime!.memory()
    const distant = gates
      .map((_, i) => i)
      .filter((i) => i > 1 && i < gates.length - 1)
      .sort(
        (a, b) =>
          Math.hypot(mid(b).x - mid(1).x, mid(b).z - mid(1).z) -
          Math.hypot(mid(a).x - mid(1).x, mid(a).z - mid(1).z),
      )[0]!
    expect(Math.hypot(mid(distant).x - mid(1).x, mid(distant).z - mid(1).z)).toBeGreaterThan(
      ITEM_TUNING.towReach,
    )
    place(state, far, 0, distant)
    place(state, far, 1, 1)
    expect(
      send(holding(state, 1, 'tow'), far, 1, { op: 'use', item: 'tow', tick: 600 }).actions,
    ).toEqual([])
  })

  it('swap: with the kart just ahead on the same lap, and the server lets both jump there', () => {
    const { state, memory } = field()
    const swap = send(holding(state, 2, 'swap'), memory, 2, { op: 'use', item: 'swap', tick: 600 })
    const event = swap.state.events.at(-1)!
    expect(event.targets).toEqual([1])
    const mine = event.warps.find((warp) => warp.seat === 2)!
    const theirs = event.warps.find((warp) => warp.seat === 1)!
    expect(mine).toMatchObject({ nextGate: 6, crossings: 1 })
    expect(theirs).toMatchObject({ nextGate: 5, crossings: 1 })
    expect(Math.hypot(mine.x - mid(5).x, mine.z - mid(5).z)).toBeLessThan(0.01)
    expect(Math.hypot(theirs.x - mid(4).x, theirs.z - mid(4).z)).toBeLessThan(0.01)
    // Seat 2's jump is taken, with the gates it was given
    const jump = frameAt(mine.x, mine.z, 6, { reset: true, tick: 620, seq: 1 })
    expect(kart.realtime!.frame(swap.state, memory, 2, bytes(jump), NOW + 50).relay).not.toBeNull()
    const tracked = (memory.tracked as Map<SeatId, Tracked>).get(2)!
    expect(tracked).toMatchObject({ nextGate: 6, crossings: 1, warp: null })
  })

  it('swap: stopped by a shield, and not across laps', () => {
    const { state, memory } = field()
    const shielded = {
      ...state,
      racers: state.racers.map((one) =>
        one.seat === 1 ? { ...one, shieldUntil: NOW + 5000 } : one,
      ),
    }
    const blocked = send(holding(shielded, 2, 'swap'), memory, 2, {
      op: 'use',
      item: 'swap',
      tick: 600,
    })
    expect(blocked.state.events.at(-1)).toMatchObject({ blocked: [1], warps: [] })
    expect(racer(blocked.state, 1).shieldUntil).toBe(0)
    // Seat 1 a lap ahead: no swap
    const laps = kart.realtime!.memory()
    place(state, laps, 2, gates.length - 2)
    const ahead = mid(2)
    kart.realtime!.frame(state, laps, 1, bytes(frameAt(ahead.x, ahead.z, 3, { crossings: 2 })), NOW)
    expect(
      send(holding(state, 2, 'swap'), laps, 2, { op: 'use', item: 'swap', tick: 600 }).actions,
    ).toEqual([])
  })

  it('keeps only the latest events, numbered on', () => {
    const { state, memory } = field()
    let next = state
    for (let i = 0; i < KEEP_EVENTS + 4; i++) {
      next = send(holding(next, 0, 'boost'), memory, 0, {
        op: 'use',
        item: 'boost',
        tick: 600,
      }).state
    }
    expect(next.events).toHaveLength(KEEP_EVENTS)
    expect(next.events.at(-1)!.n).toBe(KEEP_EVENTS + 3)
    expect(next.used).toBe(KEEP_EVENTS + 4)
  })

  it('never gives the leader an item that reaches someone ahead', () => {
    for (const item of ['tow', 'headwind', 'swap'] as const) {
      expect(ITEM_TABLE.front[item] ?? 0).toBe(0)
    }
  })
})
