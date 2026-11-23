// 2026-11-23 (NEXT §5, docs/ARCHITECTURE.md §4.92): the broadcast's director looks ahead. A race of
// real drivers (botRace.ts: the physics and a driver's hands, late starters coming through the field)
// watched as a replay knows its future: every overtake foreseen at least PREDICT_EARLY before the
// places swap, the passer on screen before it; watched live, guessed from the pairs closing in (speed,
// and the inside of the bend), most of them foreseen in time and the wrong guesses let go gently. And
// the pieces: when a pass is due, when a shot reaches a kart, a hit foreseen, a guess let go.
import { describe, expect, it } from 'vitest'
import {
  directorStep,
  passIn,
  PREDICT_EARLY,
  PREDICT_GRACE,
  RETRACT_SECONDS,
  shotReaches,
  startDirector,
  type BroadcastKart,
  type BroadcastMoment,
  type DirectorOptions,
  type DirectorState,
  type ForeseenPass,
  type Prediction,
} from '../../shared/kart/broadcast.ts'
import { tracksideCameras } from '../../shared/kart/broadcastCameras.ts'
import { foreseePasses, replayOrderAt } from '../../shared/kart/highlights.ts'
import { raceProgress } from '../../shared/kart/race.ts'
import { lapsAt, msToTicks, openReplay, sampleAt, TICKS_PER_SECOND, type ReplayReel } from '../../shared/kart/replay.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import { recordBotRace } from './botRace.ts'

/** The replay at `tick` as the director sees it (broadcastRun.ts makes the same of a watch page's) */
function momentAt(track: Track, reel: ReplayReel, tick: number, hits: BroadcastMoment['hits'] = []): BroadcastMoment {
  const karts = replayOrderAt(track, reel, tick).flatMap((seat): BroadcastKart[] => {
    const sample = sampleAt(reel.samples.get(seat)!, tick)
    const racer = reel.replay.racers.find((one) => one.seat === seat)!
    if (!sample) return []
    return [
      {
        seat,
        x: sample.x,
        z: sample.z,
        heading: sample.heading,
        speed: sample.vx * Math.sin(sample.heading) - sample.vz * Math.cos(sample.heading),
        progress:
          sample.nextGate >= track.gates.length
            ? 0
            : raceProgress(track, sample.crossings, sample.nextGate, sample.x, sample.z),
        airborne: sample.airborne === true,
        finishMs: racer.finishMs !== null && msToTicks(racer.finishMs) <= tick ? racer.finishMs : null,
        out: false,
        lapMs: racer.lapMs.slice(0, lapsAt(racer, tick)),
      },
    ]
  })
  return { time: tick / TICKS_PER_SECOND, karts, laps: reel.replay.laps, gates: track.gates.length, hits }
}

interface Watch {
  readonly made: Prediction[]
  readonly cuts: { time: number; seat: number | null; reason: string; shot: string }[]
  readonly overtakes: { time: number; seat: number; other: number }[]
  readonly last: DirectorState
}

/** The whole race watched by the director at 30 frames a second */
function watch(track: Track, reel: ReplayReel, options: Partial<DirectorOptions> = {}): Watch {
  const made: Prediction[] = []
  const cuts: Watch['cuts'] = []
  const overtakes: Watch['overtakes'] = []
  let state = startDirector()
  const cameras = tracksideCameras(track)
  for (let tick = reel.start; tick <= reel.end; tick += 2) {
    const result = directorStep(state, momentAt(track, reel, tick), { cameras, reducedMotion: false, ...options })
    for (const one of result.state.predictions) if (!state.predictions.includes(one)) made.push(one)
    if (result.cut) {
      cuts.push({ time: tick / TICKS_PER_SECOND, seat: result.state.seat, reason: result.state.reason, shot: result.state.shot })
    }
    for (const caption of result.captions) {
      if (caption.kind === 'overtake') overtakes.push({ time: tick / TICKS_PER_SECOND, seat: caption.seat, other: caption.other })
    }
    state = result.state
  }
  return { made, cuts, overtakes, last: state }
}

/** Whether a prediction of `pass` was made in time: PREDICT_EARLY or more before, and not long before */
const foreseenInTime = (made: readonly Prediction[], pass: ForeseenPass) =>
  made.some(
    (one) => one.seat === pass.seat && one.other === pass.other && one.made <= pass.at - PREDICT_EARLY && one.made >= pass.at - 4,
  )

/** The kart on screen at `time`, by the cuts */
const onScreen = (cuts: Watch['cuts'], time: number) => cuts.filter((cut) => cut.time <= time).at(-1)

const RACES = [
  ['riverside', 'harbour'],
  ['oldstreet', 'tamkang'],
] as const

describe.each(RACES)('a race of real drivers on %s and %s', (...ids) => {
  const races = ids.map((id) => {
    const track = raceTrack(id) as Track
    const replay = recordBotRace(track, 2, [
      { driver: 'novice', kart: 'tide' },
      { driver: 'average', kart: 'comet', late: 1.5 },
      { driver: 'expert', kart: 'ray', late: 4 },
      { driver: 'master', kart: 'kite', late: 7 },
      { driver: 'average', kart: 'eel', late: 0.5, seed: 9 },
    ])
    const reel = openReplay(replay)
    return { id, track, reel, passes: foreseePasses(track, reel) }
  })

  it('has overtakes to foresee: the late starters come through the field', () => {
    for (const race of races) expect(race.passes.length, race.id).toBeGreaterThanOrEqual(6)
  })

  it('foresees the overtakes the director then confirms, at the swap', () => {
    for (const race of races) {
      const { overtakes } = watch(race.track, race.reel)
      for (const caption of overtakes) {
        const pass = race.passes.find((one) => one.seat === caption.seat && one.other === caption.other && Math.abs(one.at - (caption.time - 0.8)) < 0.25)
        expect(pass, `${race.id} ${caption.seat}>${caption.other} @${caption.time}`).toBeDefined()
      }
      expect(overtakes.length, race.id).toBe(race.passes.length)
    }
  }, 60_000)

  it('watching the replay: every overtake foreseen in time, none wrong, and the passer on screen before it', () => {
    let total = 0
    let shown = 0
    for (const race of races) {
      const watched = watch(race.track, race.reel, { foreseen: race.passes })
      expect(watched.last.foresight.missed, race.id).toBe(0)
      expect(watched.last.foresight.made, race.id).toBe(race.passes.filter((pass) => pass.at > race.reel.start / 60).length)
      for (const pass of race.passes) {
        expect(foreseenInTime(watched.made, pass), `${race.id} ${pass.seat}>${pass.other}@${pass.at}`).toBe(true)
        // Two passes at once (the start's shuffle) cannot both be on screen: the other's passer is
        const busy = race.passes.some((other) => other !== pass && Math.abs(other.at - pass.at) < 1.5)
        if (busy) continue
        total++
        const screen = onScreen(watched.cuts, pass.at - PREDICT_EARLY)
        if (screen?.seat !== pass.seat) continue
        shown++
        expect(screen.shot, race.id).toBe('side')
      }
    }
    // On screen, from the side, PREDICT_EARLY or more before the swap (the confirmed overtake, before
    // 2026-11-23, came CONFIRM_SECONDS after it)
    expect(total).toBeGreaterThanOrEqual(4)
    expect(shown / total).toBeGreaterThanOrEqual(0.9)
  }, 60_000)

  it('watching live: most mid-race overtakes foreseen in time, and a fair share of guesses right', () => {
    let mid = 0
    let early = 0
    let made = 0
    let missed = 0
    for (const race of races) {
      const watched = watch(race.track, race.reel)
      made += watched.last.foresight.made
      missed += watched.last.foresight.missed
      for (const pass of race.passes) {
        // The start's shuffle (the first seconds) is not guessed: the director settles first
        if (pass.at < 6) continue
        mid++
        if (foreseenInTime(watched.made, pass)) early++
      }
    }
    expect(mid).toBeGreaterThanOrEqual(10)
    expect(early / mid).toBeGreaterThanOrEqual(0.55)
    expect(missed / made).toBeLessThanOrEqual(0.45)
  }, 60_000)
})

describe('the pieces', () => {
  const kart = (x: number, z: number, speed: number, heading = 0): BroadcastKart => ({
    seat: 0,
    x,
    z,
    heading,
    speed,
    progress: 0,
    airborne: false,
    finishMs: null,
    out: false,
    lapMs: [],
  })

  it('a pass is due when the faster kart behind has closed the gap, and the inside line counts', () => {
    // Heading 0 goes towards −z: the one ahead at z = −10, the one behind at 0
    expect(passIn(kart(0, -10, 20), kart(0, 0, 25), 0)!.seconds).toBeCloseTo(11 / 5, 5)
    expect(passIn(kart(0, -10, 25), kart(0, 0, 20), 0)).toBeNull()
    expect(passIn(kart(0, -60, 20), kart(0, 0, 40), 0)).toBeNull()
    // The same speed, turning right at 0.5 rad/s: 4 m to the right is the inside (2 m/s gained)
    expect(passIn(kart(0, -3, 20), kart(4, 0, 20), 0.5)!.seconds).toBeCloseTo(4 / 2, 5)
    expect(passIn(kart(0, -3, 20), kart(-4, 0, 20), 0.5)).toBeNull()
  })

  it('a shot reaches a kart in its way, or the kart it homes in on; not one it passes by', () => {
    const target = { ...kart(0, -30, 10), seat: 2 }
    // Thrown from z = 0 towards −z at 40 m/s: closes at 30 m/s on a kart going 10
    expect(shotReaches({ x: 0, z: 0, target: null }, { x: 0, z: 4 }, 0.1, target)).toBeCloseTo(1, 5)
    expect(shotReaches({ x: 10, z: 0, target: null }, { x: 10, z: 4 }, 0.1, target)).toBeNull()
    expect(shotReaches({ x: 0, z: 0, target: null }, { x: 0, z: -4 }, 0.1, target)).toBeNull()
    // A homing shot from the side, closing on its target
    expect(shotReaches({ x: 20, z: -30, target: 2 }, { x: 24, z: -30 }, 0.1, target)).not.toBeNull()
  })

  /** Two karts on a straight towards −z, seat 1 behind seat 0, at the speeds given by time */
  const straight = (time: number, gap: number, behindSpeed: number): BroadcastMoment => ({
    time,
    karts: [
      { ...kart(0, -100 - 20 * time, 20), seat: 0, progress: 5 + time },
      { ...kart(1, -100 - 20 * time + gap, behindSpeed), seat: 1, progress: 5 + time - gap / 20 },
    ],
    laps: 3,
    gates: 40,
    hits: [],
  })
  const options: DirectorOptions = { cameras: [], reducedMotion: false }

  it('a hit to come in a replay: the target, from the side, before it lands', () => {
    let state = startDirector()
    const hit = { by: 0, target: 1, at: 20 }
    const seen: { time: number; seat: number | null; reason: string }[] = []
    for (let time = 10; time <= 21; time += 1 / 30) {
      const moment = { ...straight(time, 30, 20), hits: [hit] }
      const result = directorStep(state, moment, { ...options, foreseen: [] })
      state = result.state
      if (result.cut) seen.push({ time, seat: state.seat, reason: state.reason })
    }
    const cut = seen.find((one) => one.reason === 'incoming')
    expect(cut).toMatchObject({ seat: 1 })
    expect(cut!.time).toBeLessThanOrEqual(hit.at - PREDICT_EARLY)
    expect(cut!.time).toBeGreaterThanOrEqual(hit.at - 1.3)
  })

  it('a guess that does not come true is let go gently: the chaser keeps the screen a while', () => {
    let state = startDirector()
    let guessedAt: number | null = null
    let missedAt: number | null = null
    let leftAt: number | null = null
    for (let time = 10; time <= 30; time += 1 / 30) {
      // Seat 1 closes from 12 m at 6 m/s faster until 11 s, then drops back to the leader's speed
      const closing = time < 11.2
      const gap = closing ? 12 - (time - 10) * 6 : 12 - 1.2 * 6
      const result = directorStep(state, straight(time, gap, closing ? 26 : 20), options)
      if (guessedAt === null && result.state.predictions.length > 0) guessedAt = time
      if (missedAt === null && result.state.foresight.missed > 0) missedAt = time
      if (missedAt !== null && leftAt === null && result.cut && result.state.seat !== 1) leftAt = time
      state = result.state
    }
    expect(guessedAt).not.toBeNull()
    expect(missedAt).not.toBeNull()
    expect(missedAt!).toBeGreaterThan(guessedAt! + PREDICT_GRACE)
    expect(state.foresight).toMatchObject({ made: 1, came: 0, missed: 1 })
    // Not away at the moment it was let go: the chaser's say fades first
    if (leftAt !== null) expect(leftAt - missedAt!).toBeGreaterThan(RETRACT_SECONDS / 3)
  })
})
