// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): the director's cuts, the roadside cameras,
// the shots, the gaps and the highlights. A race recorded as a browser records it (broadcastRace.ts):
// on Riverside, four karts at steady speeds, one late off the line who comes through the field, a
// hit, and two karts home under half a second apart.
import { describe, expect, it } from 'vitest'
import {
  directorStep,
  gapSeconds,
  CONFIRM_SECONDS,
  MIN_HOLD,
  MIN_HOLD_STEADY,
  notePassings,
  startDirector,
  type BroadcastKart,
  type BroadcastMoment,
  type Caption,
  type DirectorState,
} from '../../shared/kart/broadcast.ts'
import { cameraFor, tracksideCameras } from '../../shared/kart/broadcastCameras.ts'
import {
  highlightMoments,
  MAX_HIGHLIGHTS,
  pickHighlights,
  replayOrderAt,
  replayPassings,
} from '../../shared/kart/highlights.ts'
import { lapsAt, msToTicks, openReplay, sampleAt, TICKS_PER_SECOND, type ReplayReel } from '../../shared/kart/replay.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import { glides, shotNow, shotPose, TRANSITION } from '../../src/kart/broadcastShots.ts'
import { CAPTION_MIN, createBroadcastRun, type RunInput } from '../../src/kart/watch/broadcast/broadcastRun.ts'
import { recordRace } from './broadcastRace.ts'

const track = raceTrack('riverside') as Track
const cameras = tracksideCameras(track)
// Seat 1 starts 3 s late and is fastest; seat 3 a hair faster than seat 0; seat 2 is hit at 12 s
const replay = recordRace(track, 2, [2.3, 2.6, 2.0, 2.31], [{ at: 12_000, by: 0, target: 2 }], [0, 3, 0, 0])
const reel = openReplay(replay)

/** The replay at `tick` as a watch page hands it to the broadcast */
function inputAt(reel: ReplayReel, tick: number): RunInput {
  return {
    time: tick / TICKS_PER_SECOND,
    order: replayOrderAt(track, reel, tick),
    karts: [...reel.samples].flatMap(([seat, samples]) => {
      const one = sampleAt(samples, tick)
      return one
        ? [{ seat, x: one.x, z: one.z, heading: one.heading, vx: one.vx, vz: one.vz, airborne: one.airborne === true, crossings: one.crossings, nextGate: one.nextGate }]
        : []
    }),
    racers: reel.replay.racers.map((racer) => ({
      seat: racer.seat,
      finishMs: racer.finishMs !== null && msToTicks(racer.finishMs) <= tick ? racer.finishMs : null,
      out: false,
      lapMs: racer.lapMs.slice(0, lapsAt(racer, tick)),
    })),
    hits: reel.replay.events
      .filter((event) => event.hit)
      .map((event) => ({ by: event.by, target: event.targets[0]!, at: event.tick / TICKS_PER_SECOND })),
  }
}

interface Watched {
  cuts: { time: number; seat: number | null; shot: string; reason: string }[]
  captions: { time: number; caption: Caption }[]
}

/** The whole replay watched with the broadcast on, 30 frames a second */
function watchWhole(reducedMotion: boolean): Watched {
  const run = createBroadcastRun({ track, laps: replay.laps, reducedMotion, passings: replayPassings(track, reel) })
  const watched: Watched = { cuts: [], captions: [] }
  let cuts = 0
  const seen = new Set<number>()
  const pose = { eye: { x: 0, y: 3, z: 0 }, target: { x: 0, y: 1, z: 0 } }
  for (let tick = reel.start; tick <= reel.end; tick += 2) {
    run.step(inputAt(reel, tick), 1 / 30, () => pose)
    const readout = run.readout()
    if (readout.cuts !== cuts) {
      cuts = readout.cuts
      watched.cuts.push({ time: tick / TICKS_PER_SECOND, seat: readout.seat, shot: readout.shot, reason: readout.reason })
    }
    for (const one of readout.captions) {
      if (seen.has(one.id)) continue
      seen.add(one.id)
      watched.captions.push({ time: tick / TICKS_PER_SECOND, caption: one.caption })
    }
  }
  return watched
}

describe('the roadside cameras', () => {
  it.each(RACE_TRACK_IDS)('%s: a few on the outside of its bends, off the road, and one at the finish', (id) => {
    const one = raceTrack(id) as Track
    const placed = tracksideCameras(one)
    const bends = placed.filter((camera) => !camera.finish)
    expect(bends.length).toBeGreaterThanOrEqual(2)
    expect(bends.length).toBeLessThanOrEqual(6)
    expect(placed.filter((camera) => camera.finish)).toHaveLength(1)
    for (const camera of bends) {
      // Beyond the kerb of the nearest stretch of road
      const nearest = one.road.reduce((best, point) =>
        Math.hypot(point.x - camera.x, point.z - camera.z) < Math.hypot(best.x - camera.x, best.z - camera.z) ? point : best,
      )
      expect(Math.hypot(nearest.x - camera.x, nearest.z - camera.z)).toBeGreaterThan(nearest.width / 2)
    }
  })

  it('watches only a kart near it', () => {
    const finish = cameras.find((camera) => camera.finish)!
    expect(cameraFor(cameras, { x: finish.x + 5, z: finish.z }, true)).toBe(finish)
    expect(cameraFor(cameras, { x: finish.x + 5000, z: finish.z })).toBeNull()
  })
})

describe('the shots', () => {
  const kart = { x: 10, z: 20, heading: 0 }
  it('stand where each kind says, the chase camera being the scene’s own', () => {
    expect(shotPose('chase', kart, cameras)).toBeNull()
    const side = shotPose('side', kart, cameras)!
    // Heading 0 faces −z: the right is +x
    expect(side.eye.x).toBeGreaterThan(kart.x + 5)
    const low = shotPose('low', kart, cameras)!
    expect(low.eye.y).toBeLessThan(1)
    expect(low.eye.z).toBeGreaterThan(kart.z)
    const aerial = shotPose('aerial', kart, cameras)!
    expect(aerial.eye.y).toBeGreaterThan(15)
    const finish = cameras.find((camera) => camera.finish)!
    const trackside = shotPose('trackside', { x: finish.x + 6, z: finish.z, heading: 0 }, cameras, true)!
    expect(trackside.eye).toMatchObject({ x: finish.x, z: finish.z })
  })

  it('glide from the last pose over TRANSITION seconds when near; cut when far, or with less motion', () => {
    const from = { eye: { x: 0, y: 3, z: 0 }, target: { x: 0, y: 1, z: -5 } }
    expect(glides(from, { x: 5, z: -5, heading: 0 }, false)).toBe(true)
    expect(glides(from, { x: 500, z: -5, heading: 0 }, false)).toBe(false)
    expect(glides(from, { x: 5, z: -5, heading: 0 }, true)).toBe(false)
    const want = shotPose('aerial', kart, cameras)!
    const start = shotNow(want, { from, at: 10 }, 10)!
    expect(start.eye).toEqual(from.eye)
    const mid = shotNow(want, { from, at: 10 }, 10 + TRANSITION / 2)!
    expect(mid.eye.y).toBeGreaterThan(from.eye.y)
    expect(mid.eye.y).toBeLessThan(want.eye.y)
    expect(shotNow(want, { from, at: 10 }, 10 + TRANSITION)!.eye).toEqual(want.eye)
    // Into the chase camera: the old pose blended out
    expect(shotNow(null, { from, at: 10 }, 10 + TRANSITION / 2)!.blend).toBeCloseTo(0.5, 1)
    expect(shotNow(null, { from, at: 10 }, 10 + TRANSITION)).toBeNull()
  })
})

describe('the director over a recorded race', () => {
  const whole = watchWhole(false)

  it('cuts to the leader at once, and never again before MIN_HOLD', () => {
    expect(whole.cuts[0]!.time).toBeLessThan(0.1)
    for (let i = 1; i < whole.cuts.length; i++) {
      expect(whole.cuts[i]!.time - whole.cuts[i - 1]!.time).toBeGreaterThanOrEqual(MIN_HOLD - 0.05)
    }
    // A race of nearly two minutes is not one long shot
    expect(whole.cuts.length).toBeGreaterThan(10)
    expect(new Set(whole.cuts.map((cut) => cut.shot)).size).toBeGreaterThanOrEqual(4)
  })

  it('calls the overtakes, the hit, the final lap, the fastest lap and every finish', () => {
    const kinds = whole.captions.map((one) => one.caption.kind)
    expect(kinds).toContain('overtake')
    expect(kinds).toContain('hit')
    expect(kinds.filter((kind) => kind === 'finalLap')).toHaveLength(1)
    expect(kinds).toContain('fastestLap')
    const finishes = whole.captions.filter((one) => one.caption.kind === 'finish')
    expect(finishes.map((one) => one.caption.seat)).toEqual([1, 3, 0, 2])
    expect(finishes[0]!.caption).toMatchObject({ place: 1 })
    // The hit at 12 s, called as it lands (or once the caption up has had its moment)
    const hit = whole.captions.find((one) => one.caption.kind === 'hit')!
    expect(hit.time).toBeGreaterThanOrEqual(12)
    expect(hit.time).toBeLessThan(12 + CAPTION_MIN + 0.1)
    expect(hit.caption).toMatchObject({ seat: 2, other: 0 })
  })

  it('goes to an overtake soon after it, from the side', () => {
    const passes = whole.captions.filter((one) => one.caption.kind === 'overtake')
    const shown = passes.filter((pass) =>
      whole.cuts.some(
        (cut) => cut.reason === 'overtake' && cut.seat === pass.caption.seat && cut.time >= pass.time && cut.time - pass.time <= MIN_HOLD + 0.1,
      ),
    )
    expect(shown.length).toBeGreaterThan(0)
    for (const cut of whole.cuts.filter((one) => one.reason === 'overtake')) expect(cut.shot).toBe('side')
  })

  it('is on the winner, from the finish line’s camera, as it crosses', () => {
    const winnerHome = (replay.racers.find((racer) => racer.seat === 1)!.finishMs as number) / 1000
    const last = [...whole.cuts].reverse().find((cut) => cut.time <= winnerHome)!
    expect(last.seat).toBe(1)
    expect(last.reason).toBe('finish')
    expect(last.shot).toBe('trackside')
  })

  it('makes the same cuts every time', () => {
    expect(watchWhole(false)).toEqual(whole)
  })

  it('with less motion asked for: only the steady shots, each up longer', () => {
    const steady = watchWhole(true)
    expect(new Set(steady.cuts.map((cut) => cut.shot))).toEqual(new Set(['chase', 'aerial']))
    for (let i = 1; i < steady.cuts.length; i++) {
      expect(steady.cuts[i]!.time - steady.cuts[i - 1]!.time).toBeGreaterThanOrEqual(MIN_HOLD_STEADY - 0.05)
    }
  })

  it('gives the standings their gaps, the leader none', () => {
    const run = createBroadcastRun({ track, laps: 2, reducedMotion: false, passings: replayPassings(track, reel) })
    const tick = 60 * TICKS_PER_SECOND
    run.step(inputAt(reel, tick), 1 / 30, () => ({ eye: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }))
    const rows = run.readout().rows
    expect(rows.map((row) => row.seat)).toEqual(replayOrderAt(track, reel, tick))
    expect(rows[0]!.gap).toBeNull()
    for (const row of rows.slice(1)) expect(row.gap).toBeGreaterThan(0)
    // Seat 2, slowest, is many seconds back from the kart ahead of it
    const last = rows.at(-1)!
    expect(last.seat).toBe(2)
    expect(last.gap!).toBeGreaterThan(3)
    // A minute in: the winner-to-be on its second lap, the slowest still on its first
    expect(rows.find((row) => row.seat === 1)!.lap).toBe(2)
    expect(last.lap).toBe(1)
  })
})

describe('the director, step by step', () => {
  const kart = (seat: number, progress: number, extra: Partial<BroadcastKart> = {}): BroadcastKart => ({
    seat,
    x: progress * 20,
    z: 0,
    heading: Math.PI / 2,
    speed: 40,
    progress,
    airborne: false,
    finishMs: null,
    out: false,
    lapMs: [],
    ...extra,
  })
  const moment = (time: number, karts: BroadcastKart[], hits: BroadcastMoment['hits'] = []): BroadcastMoment => ({
    time,
    karts,
    laps: 3,
    gates: 10,
    hits,
  })
  const options = { cameras: [], reducedMotion: false }

  it('holds a shot through something better until MIN_HOLD, then cuts to it', () => {
    let state: DirectorState = startDirector()
    state = directorStep(state, moment(10, [kart(0, 5), kart(1, 3)]), options).state
    expect(state).toMatchObject({ seat: 0, reason: 'leader' })
    // Seat 1 takes off over a jump a second later: still on the leader
    const air = [kart(0, 5.1), kart(1, 3.1, { airborne: true })]
    state = directorStep(state, moment(11, air), options).state
    expect(state.seat).toBe(0)
    // Past MIN_HOLD: the jump, from low down
    state = directorStep(state, moment(10 + MIN_HOLD + 0.01, air), options).state
    expect(state).toMatchObject({ seat: 1, reason: 'jump', shot: 'low' })
  })

  it('cuts at once when the kart on screen is gone', () => {
    let state = directorStep(startDirector(), moment(10, [kart(0, 5), kart(1, 3)]), options).state
    state = directorStep(state, moment(10.5, [kart(1, 3)]), options).state
    expect(state.seat).toBe(1)
  })

  it('counts no overtakes in the first seconds, while the grid sorts itself out', () => {
    let state = directorStep(startDirector(), moment(1, [kart(0, 0.2), kart(1, 0.1)]), options).state
    const early = directorStep(state, moment(1.2, [kart(1, 0.3), kart(0, 0.25)]), options)
    expect(early.captions).toEqual([])
    state = directorStep(early.state, moment(6, [kart(1, 2), kart(0, 1.9)]), options).state
    const swapped = directorStep(state, moment(6.2, [kart(0, 2.1), kart(1, 2.05)]), options)
    // Called once it has held
    expect(swapped.captions).toEqual([])
    const held = directorStep(swapped.state, moment(6.21 + CONFIRM_SECONDS, [kart(0, 2.3), kart(1, 2.2)]), options)
    expect(held.captions).toEqual([{ kind: 'overtake', seat: 0, other: 1, place: 1 }])
  })

  it('calls no overtake when two karts swap back and forth', () => {
    let state = directorStep(startDirector(), moment(10, [kart(0, 3), kart(1, 2.95)]), options).state
    const back = directorStep(state, moment(10.2, [kart(1, 3.1), kart(0, 3.05)]), options)
    state = directorStep(back.state, moment(10.4, [kart(0, 3.2), kart(1, 3.15)]), options).state
    const later = directorStep(state, moment(11.5, [kart(0, 3.5), kart(1, 3.4)]), options)
    expect([...back.captions, ...later.captions]).toEqual([])
  })

  it('favours a highlight’s kart', () => {
    const state = directorStep(startDirector(), moment(10, [kart(0, 5), kart(1, 3)]), { ...options, favour: 1 }).state
    expect(state.seat).toBe(1)
  })

  it('starts afresh when a replay is sought backwards', () => {
    let state = directorStep(startDirector(), moment(30, [kart(0, 5), kart(1, 3)]), options).state
    state = directorStep(state, moment(31, [kart(0, 5.2), kart(1, 3.2)]), options).state
    const back = directorStep(state, moment(5, [kart(1, 3), kart(0, 1)]), options)
    expect(back.state.seat).toBe(1)
    expect(back.captions).toEqual([])
  })
})

describe('the gaps', () => {
  it('are the difference at the last gate both have passed', () => {
    const passings = new Map<number, number[]>()
    notePassings(passings, 0, [{ seat: 0, progress: 0.5 }, { seat: 1, progress: 0.2 }])
    notePassings(passings, 10, [{ seat: 0, progress: 1.1 }, { seat: 1, progress: 0.8 }])
    notePassings(passings, 12.5, [{ seat: 0, progress: 1.4 }, { seat: 1, progress: 1.05 }])
    expect(gapSeconds(passings, { seat: 0, finishMs: null }, { seat: 1, finishMs: null, progress: 1.05 })).toBeCloseTo(2.5)
    expect(gapSeconds(passings, { seat: 0, finishMs: 60_000 }, { seat: 1, finishMs: 61_250, progress: 30 })).toBeCloseTo(1.25)
    expect(gapSeconds(passings, { seat: 0, finishMs: null }, { seat: 1, finishMs: null, progress: 0.5 })).toBeNull()
  })
})

describe('the highlights', () => {
  const picked = pickHighlights(track, reel)

  it('are three to five, in order, apart, inside the replay', () => {
    expect(picked.length).toBeGreaterThanOrEqual(3)
    expect(picked.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS)
    for (let i = 0; i < picked.length; i++) {
      const one = picked[i]!
      expect(one.from).toBeGreaterThanOrEqual(reel.start)
      expect(one.to).toBeLessThanOrEqual(reel.end)
      expect(one.from).toBeLessThan(one.at)
      expect(one.at).toBeLessThanOrEqual(one.to)
      if (i > 0) expect(one.from).toBeGreaterThanOrEqual(picked[i - 1]!.to)
    }
  })

  it('find the late starter coming through, the hit, the winner and the closest finish', () => {
    const moments = highlightMoments(track, reel)
    expect(moments.some((one) => one.kind === 'overtake' && one.seat === 1)).toBe(true)
    expect(moments.some((one) => one.kind === 'hit' && one.seat === 2 && one.other === 0)).toBe(true)
    expect(moments.some((one) => one.kind === 'finish' && one.seat === 1)).toBe(true)
    // Seat 3 held off seat 0 by under half a second
    const photo = moments.find((one) => one.kind === 'photoFinish')!
    expect(photo).toMatchObject({ seat: 3, other: 0 })
    expect(picked.some((one) => one.kind === 'photoFinish')).toBe(true)
    expect(picked.some((one) => one.kind === 'finish')).toBe(true)
  })

  it('are the same every time', () => {
    expect(pickHighlights(track, openReplay(replay))).toEqual(picked)
  })

  it('of a race run alone: the finish, and nothing made up', () => {
    const alone = openReplay(recordRace(track, 1, [2.6]))
    const one = pickHighlights(track, alone)
    expect(one.map((highlight) => highlight.kind)).toEqual(['finish'])
  })
})
