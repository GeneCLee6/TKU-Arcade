import { describe, expect, it } from 'vitest'
import { INITIAL_KART } from '../../shared/kart/physics.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  bumpKart,
  gatesPassed,
  gridSpot,
  judgeFrame,
  lapsDone,
  MAX_RACERS,
  raceProgress,
  RESYNC_AFTER_MS,
  SPEED_CAP,
  startTracking,
  type JudgeContext,
  type Tracked,
} from '../../shared/kart/race.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'
import { driveFrames } from './raceDriver.ts'

const track = raceTrack('riverside')!
const GO = 100_000
const count = track.gates.length

const context = (laps = 0, now = GO + 600_000, slot = 0): JudgeContext => ({
  track,
  slot,
  now,
  goAt: GO,
  laps,
})

/** Drives `frames` frames from the grid through the judge, the server's clock in step with the ticks */
function drive(frames: number, slot = 0) {
  let tracked: Tracked = startTracking(track, slot)
  const laps: number[] = []
  const source = driveFrames(track, slot)
  for (let i = 0; i < frames; i++) {
    const frame = source.next().value as KartFrame
    const now = GO + (frame.tick / 60) * 1000
    const verdict = judgeFrame(tracked, frame, context(laps.length, now, slot))
    expect(verdict.kind).toBe('taken')
    tracked = verdict.tracked
    if (verdict.kind === 'taken' && verdict.lapAt !== null) laps.push(verdict.lapAt)
  }
  return { tracked, laps }
}

const middle = (gate: (typeof track.gates)[number]) => ({
  x: (gate.ax + gate.bx) / 2,
  z: (gate.az + gate.bz) / 2,
})

describe('the race registry', () => {
  it('has every track it lists, and they all parse', () => {
    for (const id of RACE_TRACK_IDS) expect(raceTrack(id)?.id).toBe(id)
    expect(raceTrack('nope')).toBeNull()
    expect(raceTrack('__proto__')).toBeNull()
  })
})

describe('the grid (e9-t07)', () => {
  it.each(RACE_TRACK_IDS)('%s seats eight, none on top of another', (id) => {
    const one = raceTrack(id)!
    const spots = Array.from({ length: MAX_RACERS }, (_, slot) => gridSpot(one, slot))
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const gap = Math.hypot(spots[a]!.x - spots[b]!.x, spots[a]!.z - spots[b]!.z)
        expect(gap, `${a} and ${b}`).toBeGreaterThan(KART_RADIUS * 2)
      }
    }
    expect(spots.slice(0, one.grid.length)).toEqual(one.grid)
  })
})

describe('how far round', () => {
  it('counts gates from the first crossing of the line', () => {
    expect(gatesPassed(0, 0, 10)).toBe(0)
    expect(gatesPassed(1, 1, 10)).toBe(1)
    expect(gatesPassed(1, 0, 10)).toBe(10)
    expect(gatesPassed(2, 1, 10)).toBe(11)
    expect(lapsDone(0)).toBe(0)
    expect(lapsDone(3)).toBe(2)
  })

  it('grows as a kart closes on the next gate', () => {
    const near = middle(track.gates[3]!)
    const far = middle(track.gates[2]!)
    const closer = raceProgress(track, 1, 3, near.x, near.z)
    const further = raceProgress(track, 1, 3, far.x, far.z)
    expect(closer).toBeGreaterThan(further)
    expect(Math.floor(closer)).toBe(3)
  })
})

describe('judging frames on the server (e9-t02)', () => {
  it('counts laps from the gates passed in order', () => {
    // A lap is about 2.5 km; at 50 m/s three laps and the run-up fit in 4 000 frames
    const { tracked, laps } = drive(4000)
    expect(laps.length).toBeGreaterThanOrEqual(3)
    expect(lapsDone(tracked.crossings)).toBe(laps.length)
    for (let i = 1; i < laps.length; i++) expect(laps[i]).toBeGreaterThan(laps[i - 1]!)
    expect((laps[1]! - laps[0]!) / 1000).toBeGreaterThan(30)
  })

  it('refuses a kart faster than any boost', () => {
    const frame = driveFrames(track, 0).next().value as KartFrame
    const verdict = judgeFrame(
      startTracking(track, 0),
      { ...frame, vx: SPEED_CAP + 1, vz: 0 },
      context(),
    )
    expect(verdict).toMatchObject({ kind: 'refused', why: 'speed' })
  })

  it('refuses a tick ahead of the clock', () => {
    const frame = driveFrames(track, 0).next().value as KartFrame
    const ahead = judgeFrame(
      startTracking(track, 0),
      { ...frame, tick: 600 },
      context(0, GO + 1000),
    )
    expect(ahead).toMatchObject({ kind: 'refused', why: 'tick' })
    // Before GO is set, nothing past zero
    const early = judgeFrame(
      startTracking(track, 0),
      { ...frame, tick: 120 },
      { ...context(), goAt: null },
    )
    expect(early).toMatchObject({ kind: 'refused', why: 'tick' })
  })

  it('refuses a jump that is not a reset, and a reset that lands nowhere', () => {
    const { tracked } = drive(100)
    const last = tracked.last!
    const now = GO + ((last.tick + 3) / 60) * 1000
    const jump = { ...last, tick: last.tick + 3, x: last.x + 500 }
    expect(judgeFrame(tracked, jump, context(0, now))).toMatchObject({
      kind: 'refused',
      why: 'jump',
    })
    const nowhere = { ...jump, reset: true }
    expect(judgeFrame(tracked, nowhere, context(0, now))).toMatchObject({
      kind: 'refused',
      why: 'reset',
    })
    const respawn = track.respawns[1]!
    const reset = { ...jump, reset: true, x: respawn.x, z: respawn.z }
    expect(judgeFrame(tracked, reset, context(0, now)).kind).toBe('taken')
  })

  it('takes a kart where it is after a second of refusals, counting no gates on the way', () => {
    const { tracked } = drive(100)
    const last = tracked.last!
    const now = GO + ((last.tick + 3) / 60) * 1000
    const far = { ...last, tick: last.tick + 3, x: last.x + 300 }
    const refused = judgeFrame(tracked, far, context(0, now))
    expect(refused.kind).toBe('refused')
    const later = { ...far, tick: far.tick + 60 }
    const taken = judgeFrame(refused.tracked, later, context(0, now + RESYNC_AFTER_MS))
    expect(taken.kind).toBe('taken')
    expect(taken.tracked.nextGate).toBe(tracked.nextGate)
  })

  it('refuses frames older than the last', () => {
    const { tracked } = drive(10)
    const old = { ...tracked.last!, tick: tracked.last!.tick - 6 }
    expect(judgeFrame(tracked, old, context())).toMatchObject({ kind: 'refused', why: 'old' })
  })

  it('believes the kart one gate ahead when it is right past that gate, but not two ahead', () => {
    const { tracked } = drive(200)
    const next = tracked.nextGate
    // Standing right past the gate the server waits for (a lost frame hid the crossing)
    const at = middle(track.gates[next]!)
    const here = { ...tracked.last!, x: at.x, z: at.z }
    const missed: Tracked = { ...tracked, last: here }
    const claim = {
      ...here,
      tick: here.tick + 3,
      crossings: tracked.crossings,
      nextGate: (next + 1) % count,
    }
    expect(judgeFrame(missed, claim, context()).tracked.nextGate).toBe((next + 1) % count)
    const twoAhead = { ...claim, nextGate: (next + 2) % count }
    expect(judgeFrame(missed, twoAhead, context()).tracked.nextGate).toBe(next)
    // Far from that gate, not even one
    const elsewhere = middle(track.gates[(next + 5) % count]!)
    const far: Tracked = { ...tracked, last: { ...here, x: elsewhere.x, z: elsewhere.z } }
    const farClaim = { ...claim, x: elsewhere.x, z: elsewhere.z }
    expect(judgeFrame(far, farClaim, context()).tracked.nextGate).toBe(next)
  })

  it('undoes a gate driven back over', () => {
    const { tracked } = drive(200)
    const before = gatesPassed(tracked.crossings, tracked.nextGate, count)
    const behind = track.gates[(tracked.nextGate - 1 + count) % count]!
    const at = middle(behind)
    // Across the gate's line against the way it is passed: a to b is the driver's left to right
    const ux = behind.bx - behind.ax
    const uz = behind.bz - behind.az
    const length = Math.hypot(ux, uz)
    // The road's forward direction is the gate's line turned a quarter: (uz, -ux) / length
    const fx = uz / length
    const fz = -ux / length
    const ahead = { x: at.x + fx * 2, z: at.z + fz * 2 }
    const back = { x: at.x - fx * 2, z: at.z - fz * 2 }
    const last = { ...tracked.last!, ...ahead }
    const frame = { ...last, tick: last.tick + 3, ...back }
    const stepped = judgeFrame({ ...tracked, last }, frame, context())
    expect(stepped.kind).toBe('taken')
    expect(gatesPassed(stepped.tracked.crossings, stepped.tracked.nextGate, count)).toBe(before - 1)
  })
})

describe('karts bumping (e9-t09)', () => {
  it('pushes this kart out of another and takes the speed into it', () => {
    const kart = { ...INITIAL_KART, x: 0, z: 0, vx: 20, vz: 0 }
    const { kart: pushed, hit } = bumpKart(kart, [{ x: 1.5, z: 0, vx: 0, vz: 0 }])
    expect(pushed.x).toBeLessThan(0)
    expect(pushed.vx).toBeLessThan(20)
    expect(hit).toBe(20)
  })

  it('leaves a kart alone when nobody is near', () => {
    const kart = { ...INITIAL_KART, vx: 20 }
    const result = bumpKart(kart, [{ x: 10, z: 0, vx: 0, vz: 0 }])
    expect(result.kart).toBe(kart)
    expect(result.hit).toBe(0)
  })
})
