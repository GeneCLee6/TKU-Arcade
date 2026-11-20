import { describe, expect, it } from 'vitest'
import { loadoutByte, loadoutOfByte } from '../../shared/kart/karts.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  advancePlayhead,
  createKartTape,
  createReplayRecorder,
  decodeTape,
  heldAt,
  lapsAt,
  openReplay,
  REPLAY_EVERY_TICKS,
  REPLAY_FROM_TICK,
  REPLAY_TAIL_TICKS,
  sampleAt,
  sampleIndex,
  seekPlayhead,
  shieldsAt,
  shotsAt,
  stepSpeed,
  teamBurnsAt,
  teamGaugesAt,
  togglePlayhead,
  type RecordedView,
  type ReplaySample,
} from '../../shared/kart/replay.ts'
import { decodeReplay, encodeReplay } from '../../shared/kart/replayBlob.ts'

const frame = (tick: number, extra: Partial<KartFrame> = {}): KartFrame => ({
  tick,
  x: 10 + tick * 0.5,
  z: -20 - tick * 0.25,
  heading: 0.5,
  vx: 30,
  vz: -15,
  reset: false,
  drifting: false,
  boosting: false,
  skidding: false,
  finished: false,
  driftDirection: 0,
  steer: 0.25,
  body: 1,
  crossings: 1,
  nextGate: 3,
  seq: tick,
  ...extra,
})

const VIEW: RecordedView = {
  track: 'riverside',
  laps: 2,
  mode: 'items',
  goAt: 100_000,
  racers: [
    { seat: 0, item: null, lapMs: [], finishMs: null, out: false },
    { seat: 1, item: null, lapMs: [], finishMs: null, out: false },
  ],
  events: [],
}

describe('a kart tape (e9-t10)', () => {
  it('keeps ten samples a second and codes them in 15 bytes after the first', () => {
    const tape = createKartTape()
    for (let tick = 0; tick <= 60; tick += 3) tape.add(frame(tick))
    // 0, 6, 12 … 60
    expect(tape.count).toBe(11)
    expect(tape.bytes().byteLength).toBe(23 + 10 * 15)
    const samples = decodeTape(tape.bytes())
    expect(samples.map((one) => one.tick)).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60])
  })

  it('comes back within a centimetre, however long the race', () => {
    const tape = createKartTape()
    const frames: KartFrame[] = []
    for (let tick = 0; tick < 60 * 120; tick += REPLAY_EVERY_TICKS) {
      const one = frame(tick, {
        x: 300 * Math.sin(tick / 400) + 0.0037 * tick,
        z: 250 * Math.cos(tick / 300),
        heading: ((tick / 50) % (2 * Math.PI)) - Math.PI,
        vx: 41.23,
        vz: -7.89,
        drifting: tick % 12 === 0,
        driftDirection: tick % 12 === 0 ? -1 : 0,
      })
      frames.push(one)
      tape.add(one)
    }
    const samples = decodeTape(tape.bytes())
    expect(samples).toHaveLength(frames.length)
    for (const [i, sample] of samples.entries()) {
      const sent = frames[i]!
      expect(Math.abs(sample.x - sent.x)).toBeLessThan(0.011)
      expect(Math.abs(sample.z - sent.z)).toBeLessThan(0.011)
      expect(Math.abs(sample.heading - sent.heading)).toBeLessThan(0.001)
      expect(sample.vx).toBeCloseTo(41.23, 2)
      expect(sample.drifting).toBe(sent.drifting)
      expect(sample.driftDirection).toBe(sent.driftDirection)
      expect(sample.body).toBe(1)
      expect(sample.crossings).toBe(1)
      expect(sample.nextGate).toBe(3)
    }
  })

  it('keeps a jump, the finish and a far move whole; drops the old, the repeated and the grid wait', () => {
    const tape = createKartTape()
    expect(tape.add(frame(REPLAY_FROM_TICK - 1))).toBe(false)
    expect(tape.add(frame(0))).toBe(true)
    expect(tape.add(frame(0))).toBe(false)
    expect(tape.add(frame(2))).toBe(false)
    // A reset two ticks later is kept, and as an absolute position
    expect(tape.add(frame(3, { reset: true, x: 900, z: -900 }))).toBe(true)
    expect(tape.add(frame(4, { finished: true, x: 901, z: -900 }))).toBe(true)
    // More than 327 m from the last: absolute too
    expect(tape.add(frame(10, { x: 1500, z: -900 }))).toBe(true)
    // A gap of more than 255 ticks
    expect(tape.add(frame(400, { x: 1500, z: -900 }))).toBe(true)
    const samples = decodeTape(tape.bytes())
    expect(samples.map((one) => [one.tick, one.reset, one.finished, Math.round(one.x)])).toEqual([
      [0, false, false, 10],
      [3, true, false, 900],
      [4, false, true, 901],
      [10, false, false, 1500],
      [400, false, false, 1500],
    ])
  })

  it('stops at bytes cut short instead of reading past them', () => {
    const tape = createKartTape()
    tape.add(frame(0))
    tape.add(frame(6))
    const bytes = tape.bytes()
    expect(decodeTape(bytes.subarray(0, bytes.length - 3))).toHaveLength(1)
    expect(decodeTape(new Uint8Array(0))).toEqual([])
  })
})

const samples = (ticks: number[]): ReplaySample[] => {
  const tape = createKartTape()
  for (const tick of ticks) tape.add(frame(tick))
  return decodeTape(tape.bytes())
}

describe('the kart and driver in a replay (e10-t05)', () => {
  it('keeps the body byte whole, so the replay draws the kart and driver that raced', () => {
    const byte = loadoutByte('flyfish', 'club')
    const tape = createKartTape()
    for (let tick = 0; tick <= 60; tick += 3) tape.add(frame(tick, { body: byte }))
    const samples = decodeTape(tape.bytes())
    expect(samples.length).toBeGreaterThan(2)
    for (const one of samples)
      expect(loadoutOfByte(one.body)).toEqual({ kart: 'flyfish', driver: 'club' })
  })
})

describe('reading a replay at any moment', () => {
  it('finds the sample at or before a tick', () => {
    const list = samples([0, 6, 12, 18])
    expect(sampleIndex(list, -5)).toBe(-1)
    expect(sampleIndex(list, 0)).toBe(0)
    expect(sampleIndex(list, 11.9)).toBe(1)
    expect(sampleIndex(list, 99)).toBe(3)
  })

  it('draws between two samples, and holds at either end', () => {
    const list = samples([0, 6, 12])
    const mid = sampleAt(list, 3)!
    expect(mid.x).toBeCloseTo((list[0]!.x + list[1]!.x) / 2, 5)
    expect(mid.z).toBeCloseTo((list[0]!.z + list[1]!.z) / 2, 5)
    expect(sampleAt(list, -30)!.tick).toBe(0)
    expect(sampleAt(list, 500)!.tick).toBe(12)
    expect(sampleAt([], 3)).toBeNull()
  })

  it('turns the heading the short way round', () => {
    const tape = createKartTape()
    tape.add(frame(0, { heading: 3 }))
    tape.add(frame(6, { heading: -3 }))
    const mid = sampleAt(decodeTape(tape.bytes()), 3)!
    expect(Math.abs(mid.heading)).toBeGreaterThan(3.1)
  })

  it('never draws towards a jump', () => {
    const tape = createKartTape()
    tape.add(frame(0, { x: 0, z: 0 }))
    tape.add(frame(6, { x: 500, z: 500, reset: true }))
    const list = decodeTape(tape.bytes())
    expect(sampleAt(list, 5)!.x).toBe(0)
    expect(sampleAt(list, 6)!.x).toBe(500)
  })

  it('counts laps, items held and shields up at a moment', () => {
    // 30 s and 31 s laps: the first ends at tick 1800, the second at 3660
    expect(lapsAt({ lapMs: [30_000, 31_000] }, 1799)).toBe(0)
    expect(lapsAt({ lapMs: [30_000, 31_000] }, 1800)).toBe(1)
    expect(lapsAt({ lapMs: [30_000, 31_000] }, 5000)).toBe(2)
    const held = [
      { tick: 0, seat: 0, item: null },
      { tick: 100, seat: 0, item: 'boost' as const },
      { tick: 150, seat: 1, item: 'shield' as const },
      { tick: 200, seat: 0, item: null },
    ]
    expect(heldAt(held, 0, 99)).toBeNull()
    expect(heldAt(held, 0, 120)).toBe('boost')
    expect(heldAt(held, 0, 200)).toBeNull()
    expect(heldAt(held, 1, 160)).toBe('shield')
    const events = [
      { tick: 100, item: 'shield' as const, by: 1, targets: [], blocked: [] },
      { tick: 120, item: 'shield' as const, by: 2, targets: [], blocked: [] },
      { tick: 200, item: 'headwind' as const, by: 0, targets: [1, 2], blocked: [1] },
    ]
    expect(shieldsAt(events, 99, 480).sort()).toEqual([])
    expect(shieldsAt(events, 150, 480).sort()).toEqual([1, 2])
    expect(shieldsAt(events, 200, 480).sort()).toEqual([2])
    expect(shieldsAt(events, 600, 480).sort()).toEqual([])
  })
})

describe('recording a race', () => {
  it('keeps every kart, the items used by tick from GO, the items held and the results', () => {
    const recorder = createReplayRecorder(VIEW)
    for (let tick = 0; tick <= 120; tick += 3) {
      recorder.frame(0, frame(tick))
      recorder.frame(1, frame(tick, { x: 50 }))
    }
    expect(recorder.now).toBe(120)
    recorder.view({
      ...VIEW,
      racers: [{ ...VIEW.racers[0]!, item: 'shield' }, VIEW.racers[1]!],
    })
    recorder.view({
      ...VIEW,
      racers: [VIEW.racers[0]!, { ...VIEW.racers[1]!, lapMs: [1000], finishMs: 2000 }],
      events: [{ n: 0, item: 'shield', by: 0, targets: [], blocked: [], at: 101_000 }],
    })
    const replay = recorder.replay()
    expect(replay.karts.map((kart) => kart.seat)).toEqual([0, 1])
    expect(replay.events).toEqual([{ tick: 60, item: 'shield', by: 0, targets: [], blocked: [] }])
    expect(replay.held).toEqual([
      { tick: 0, seat: 0, item: null },
      { tick: 0, seat: 1, item: null },
      { tick: 120, seat: 0, item: 'shield' },
      { tick: 120, seat: 0, item: null },
    ])
    expect(replay.racers[1]!.finishMs).toBe(2000)
    expect(recorder.hasFrames()).toBe(true)
  })

  it('keeps whether an event was a shot that hit (2026-11-17), for the replay to spin the kart', () => {
    const recorder = createReplayRecorder(VIEW)
    recorder.view({
      ...VIEW,
      events: [
        { n: 0, item: 'hail', by: 0, targets: [], blocked: [], at: 101_000, hit: false },
        { n: 1, item: 'hail', by: 0, targets: [1], blocked: [], at: 101_500, hit: true },
      ],
    })
    expect(recorder.replay().events.map((event) => event.hit)).toEqual([undefined, true])
  })

  // 2026-11-18: a replay showed a blue boost in the plain colour, and no team HUD
  it('keeps a team race: the sides, the blue boosts fired and the gauges as they moved', () => {
    const racers = VIEW.racers.map((racer, team) => ({ ...racer, team, teamUntil: 0 }))
    const view = { ...VIEW, racers, teams: { gauge: [0, 0] as const } }
    const recorder = createReplayRecorder(view)
    recorder.frame(0, frame(60))
    recorder.view({ ...view, teams: { gauge: [40, 8] } })
    recorder.frame(0, frame(180))
    // Seat 1 fired a blue boost at GO + 2 s: it burns 4.35 s
    recorder.view({
      ...view,
      teams: { gauge: [40, 8] },
      racers: [racers[0]!, { ...racers[1]!, teamUntil: view.goAt! + 2_000 + 4_350 }],
    })
    const replay = decodeReplay(encodeReplay(recorder.replay()))!
    expect(replay.racers.map((racer) => racer.team)).toEqual([0, 1])
    expect(replay.teams!.burns).toEqual([{ seat: 1, tick: 120, until: 381 }])
    expect([...teamBurnsAt(replay.teams, 119)]).toEqual([])
    expect([...teamBurnsAt(replay.teams, 200)]).toEqual([1])
    expect([...teamBurnsAt(replay.teams, 381)]).toEqual([])
    expect(teamGaugesAt(replay.teams, 0)).toEqual([0, 0])
    expect(teamGaugesAt(replay.teams, 59)).toEqual([0, 0])
    expect(teamGaugesAt(replay.teams, 60)).toEqual([40, 8])
    // A race without sides keeps none of it
    const solo = createReplayRecorder(VIEW).replay()
    expect(solo.teams).toBeUndefined()
    expect(teamGaugesAt(solo.teams, 10)).toBeNull()
    expect(teamBurnsAt(solo.teams, 10).size).toBe(0)
  })

  it('does not replay items used before it started listening', () => {
    const recorder = createReplayRecorder({
      ...VIEW,
      events: [{ n: 4, item: 'boost', by: 1, targets: [], blocked: [], at: 100_500 }],
    })
    recorder.view({
      ...VIEW,
      events: [
        { n: 4, item: 'boost', by: 1, targets: [], blocked: [], at: 100_500 },
        { n: 5, item: 'boost', by: 0, targets: [], blocked: [], at: 102_000 },
      ],
    })
    expect(recorder.replay().events.map((event) => event.tick)).toEqual([120])
  })

  it('keeps the shots thrown (e9-t06b), cut short when they leave the room early, and places them', () => {
    const hail = {
      n: 7,
      item: 'hail' as const,
      by: 0,
      at: 101_000,
      x: 0,
      z: 0,
      vx: 80,
      vz: 0,
      until: 103_000,
      target: null,
    }
    const cloud = {
      n: 8,
      item: 'cloud' as const,
      by: 1,
      at: 101_000,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      until: 102_000,
      target: 0,
    }
    const recorder = createReplayRecorder(VIEW)
    recorder.frame(0, frame(60))
    recorder.view({ ...VIEW, shots: [hail, cloud] })
    // Half a second later the hail is gone: it hit something
    recorder.frame(0, frame(90))
    recorder.view({ ...VIEW, shots: [cloud] })
    const shots = recorder.replay().shots!
    expect(shots.map((shot) => [shot.n, shot.at, shot.until])).toEqual([
      [7, 1000, 1500],
      [8, 1000, 2000],
    ])
    const at = (tick: number) => shotsAt(shots, tick, () => ({ x: 100, z: 0 }))
    expect(at(30)).toEqual([])
    expect(at(80).find((shot) => shot.n === 7)!.x).toBeCloseTo(80 * (1 / 3))
    expect(at(120).map((shot) => shot.n)).toEqual([8])
    expect(at(120)[0]!.x).toBeCloseTo(100)
    expect(at(121)).toEqual([])
    expect(createReplayRecorder(VIEW).replay().shots).toBeUndefined()
  })

  it('packs into one blob and back', () => {
    const recorder = createReplayRecorder(VIEW)
    for (let tick = 0; tick <= 600; tick += 3) recorder.frame(1, frame(tick))
    const replay = recorder.replay()
    const bytes = encodeReplay(replay)
    expect(decodeReplay(bytes)).toEqual(replay)
    expect(decodeReplay(bytes.subarray(0, bytes.length - 1))).toBeNull()
    expect(decodeReplay(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull()
  })

  it('fits a full eight-kart race in a couple of hundred kB', () => {
    const recorder = createReplayRecorder(VIEW)
    // Three minutes, every kart's frames at 20 a second
    for (let tick = 0; tick < 3 * 60 * 60; tick += 3) {
      for (let seat = 0; seat < 8; seat++)
        recorder.frame(seat, frame(tick, { x: tick / 10 + seat }))
    }
    const size = encodeReplay(recorder.replay()).byteLength
    expect(size).toBeLessThan(8 * 1800 * 15 + 2_000)
    expect(size).toBeGreaterThan(8 * 1800 * 15)
  })
})

describe('the timeline', () => {
  const reel = { start: 0, end: 600 }

  it('opens from GO to just past the last finish', () => {
    const recorder = createReplayRecorder(VIEW)
    for (let tick = -30; tick <= 1200; tick += 3) {
      recorder.frame(0, frame(tick))
      recorder.frame(1, frame(tick))
    }
    recorder.view({
      ...VIEW,
      racers: [
        { ...VIEW.racers[0]!, finishMs: 10_000 },
        { ...VIEW.racers[1]!, finishMs: 12_000 },
      ],
    })
    const opened = openReplay(recorder.replay())
    expect(opened.start).toBe(0)
    expect(opened.end).toBe(720 + REPLAY_TAIL_TICKS)
    expect(opened.samples.get(0)![0]!.tick).toBe(-30)
    // Someone never finished: to the last sample
    recorder.view(VIEW)
    expect(openReplay(recorder.replay()).end).toBe(1200)
  })

  it('opens an empty replay without falling over', () => {
    const opened = openReplay(createReplayRecorder(VIEW).replay())
    expect([opened.start, opened.end]).toEqual([0, 0])
  })

  it('plays at its speed, stops at the end, and seeks within it', () => {
    let head = { tick: 0, playing: true, speed: 2 }
    head = advancePlayhead(head, 1, reel)
    expect(head.tick).toBe(120)
    head = advancePlayhead(head, 10, reel)
    expect(head).toEqual({ tick: 600, playing: false, speed: 2 })
    expect(advancePlayhead(head, 1, reel).tick).toBe(600)
    expect(seekPlayhead(head, -50, reel).tick).toBe(0)
    expect(seekPlayhead(head, 9999, reel).tick).toBe(600)
    // Playing again from the end starts over
    expect(togglePlayhead(head, reel)).toEqual({ tick: 0, playing: true, speed: 2 })
    expect(togglePlayhead({ tick: 30, playing: true, speed: 1 }, reel).playing).toBe(false)
  })

  it('steps through the speeds', () => {
    expect(stepSpeed(1, 1)).toBe(2)
    expect(stepSpeed(4, 1)).toBe(4)
    expect(stepSpeed(0.5, -1)).toBe(0.5)
    expect(stepSpeed(3, -1)).toBe(0.5)
  })
})
