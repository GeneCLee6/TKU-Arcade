// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): the director at work inside a watch loop.
// Every frame the view hands it the race as it stands (live or replayed); it steps the director
// (shared/kart/broadcast.ts), keeps the timing (each kart's time at each gate, for the gaps), aims
// the camera (src/kart/broadcastShots.ts) and says which kart the loop follows. What the overlay
// shows (the standings with their gaps, the kart on screen, the captions) it keeps for the view to
// read a few times a second (`readout`), outside React's render.
import {
  directorStep,
  gapSeconds,
  notePassings,
  startDirector,
  type BroadcastHit,
  type BroadcastKart,
  type BroadcastShot,
  type ForeseenPass,
  type Caption,
  type CutReason,
  type DirectorState,
  type Foresight,
  type Passings,
  type ShotKind,
} from '../../../../shared/kart/broadcast.ts'
import { tracksideCameras, type TracksideCamera } from '../../../../shared/kart/broadcastCameras.ts'
import { raceProgress } from '../../../../shared/kart/race.ts'
import type { Track } from '../../../../shared/kart/track.ts'
import {
  easeHeading,
  glides,
  shotNow,
  shotPose,
  type CameraPose,
  type Glide,
} from '../../broadcastShots.ts'
import type { CameraShot } from '../../director.ts'

/** A kart as the view has it this frame */
export interface RunKart {
  readonly seat: number
  readonly x: number
  readonly z: number
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly airborne: boolean
  readonly crossings: number
  readonly nextGate: number
}

/** A racer's standing as the view has it (the room's, or the replay's at this moment) */
export interface RunRacer {
  readonly seat: number
  readonly finishMs: number | null
  readonly out: boolean
  readonly lapMs: readonly number[]
}

export interface RunInput {
  /** Seconds from GO */
  readonly time: number
  /** Seats in race order */
  readonly order: readonly number[]
  readonly karts: readonly RunKart[]
  readonly racers: readonly RunRacer[]
  readonly hits: readonly BroadcastHit[]
  /** 2026-11-23: the items in flight, for the hits foreseen (live; a replay knows its hits) */
  readonly shots?: readonly BroadcastShot[]
}

export interface StandingRow {
  readonly seat: number
  readonly place: number
  /** Seconds behind the kart ahead; null for the leader, or none known yet */
  readonly gap: number | null
  /** The lap it is on (1 to laps), or laps once home */
  readonly lap: number
  readonly finishMs: number | null
  readonly out: boolean
}

export interface ShownCaption {
  readonly id: number
  readonly caption: Caption
}

export interface BroadcastReadout {
  readonly seat: number | null
  readonly shot: ShotKind
  readonly reason: CutReason
  readonly cuts: number
  /** 2026-11-23: how the director's predictions have done */
  readonly foresight?: Foresight
  readonly rows: readonly StandingRow[]
  /** The kart on screen: its speed, km/h */
  readonly speed: number
  /** The caption up, if any (one at a time) */
  readonly captions: readonly ShownCaption[]
}

export interface BroadcastRun {
  /** One frame: whom the loop follows and the shot over its chase camera */
  step(input: RunInput, seconds: number, camera: () => CameraPose): {
    follow: number | null
    shot: CameraShot | null
  }
  readout(): BroadcastReadout
  /** A kart to favour (a highlight's); the next step cuts afresh */
  favour(seat: number | null): void
}

/** A caption stays up this long, seconds of wall time; another waiting replaces it after CAPTION_MIN */
export const CAPTION_SECONDS = 3
export const CAPTION_MIN = 1.5
/** A caption that has waited this long to go up is dropped: the moment has passed */
const CAPTION_WAIT = 5
/** Which goes up first when several wait */
const CAPTION_RANK: Readonly<Record<Caption['kind'], number>> = {
  finish: 0,
  overtake: 1,
  hit: 2,
  finalLap: 3,
  fastestLap: 4,
}

export interface RunOptions {
  readonly track: Track
  readonly laps: number
  readonly reducedMotion: boolean
  /** A replay's times at each gate, worked out whole beforehand; live, they are noted as it goes */
  readonly passings?: Passings
  /**
   * 2026-11-23, a replay: its overtakes to come (highlights.ts foreseePasses), and its `hits` hold
   * those to come: the director cuts to them a moment before instead of guessing
   */
  readonly foreseen?: readonly ForeseenPass[]
  /** For tests: the cameras, else the track's own */
  readonly cameras?: readonly TracksideCamera[]
}

export function createBroadcastRun(options: RunOptions): BroadcastRun {
  const { track, laps } = options
  const cameras = options.cameras ?? tracksideCameras(track)
  const noted = new Map<number, number[]>()
  const passings: Passings = options.passings ?? noted
  let state: DirectorState = startDirector()
  let favoured: number | null = null
  let glide: Glide | null = null
  let heading: number | null = null
  let wall = 0
  let nextId = 1
  let queue: { id: number; caption: Caption; at: number }[] = []
  let up: { id: number; caption: Caption; at: number } | null = null
  let rows: StandingRow[] = []
  let speed = 0

  return {
    step(input, seconds, camera) {
      wall += seconds
      const racerOf = new Map(input.racers.map((racer) => [racer.seat, racer]))
      const kartOf = new Map(input.karts.map((kart) => [kart.seat, kart]))
      const karts: BroadcastKart[] = []
      for (const seat of input.order) {
        const kart = kartOf.get(seat)
        const racer = racerOf.get(seat)
        if (!kart || !racer) continue
        karts.push({
          seat,
          x: kart.x,
          z: kart.z,
          heading: kart.heading,
          speed: kart.vx * Math.sin(kart.heading) - kart.vz * Math.cos(kart.heading),
          progress:
            kart.nextGate >= track.gates.length
              ? 0
              : raceProgress(track, kart.crossings, kart.nextGate, kart.x, kart.z),
          airborne: kart.airborne,
          finishMs: racer.finishMs,
          out: racer.out,
          lapMs: racer.lapMs,
        })
      }
      if (!options.passings) {
        // A step back in time (never live; a replay brings its own) would make nonsense of them
        notePassings(noted, input.time, karts)
      }
      const before = state
      const result = directorStep(
        state,
        {
          time: input.time,
          karts,
          laps,
          gates: track.gates.length,
          hits: input.hits,
          ...(input.shots ? { shots: input.shots } : {}),
        },
        {
          cameras,
          reducedMotion: options.reducedMotion,
          favour: favoured,
          ...(options.foreseen ? { foreseen: options.foreseen } : {}),
        },
      )
      state = result.state
      // Captions one at a time: the one up stays CAPTION_MIN at least, the most important waiting
      // goes next, and one kept waiting too long is dropped
      for (const caption of result.captions) queue.push({ id: nextId++, caption, at: wall })
      queue = queue
        .filter((one) => wall - one.at < CAPTION_WAIT)
        .sort((a, b) => CAPTION_RANK[a.caption.kind] - CAPTION_RANK[b.caption.kind] || a.id - b.id)
      if (up && wall - up.at >= CAPTION_SECONDS) up = null
      if (queue.length > 0 && (!up || wall - up.at >= CAPTION_MIN)) {
        const next = queue.shift()!
        up = { ...next, at: wall }
      }
      const kart = karts.find((one) => one.seat === state.seat)
      if (result.cut && kart) {
        const from = before.seat === null ? null : camera()
        glide = glides(from, kart, options.reducedMotion) && from ? { from, at: wall } : null
        heading = kart.heading
      }
      // The standings, with their gaps
      rows = karts.map((one, i) => {
        const ahead = karts[i - 1]
        return {
          seat: one.seat,
          place: i + 1,
          gap: ahead ? gapSeconds(passings, ahead, one) : null,
          lap: one.finishMs !== null ? laps : Math.min(laps, one.lapMs.length + 1),
          finishMs: one.finishMs,
          out: one.out,
        }
      })
      // Racers with no kart drawn yet still have a line
      for (const seat of input.order) {
        if (rows.some((row) => row.seat === seat)) continue
        const racer = racerOf.get(seat)
        if (!racer) continue
        rows.push({ seat, place: rows.length + 1, gap: null, lap: 1, finishMs: racer.finishMs, out: racer.out })
      }
      speed = kart ? Math.round(Math.abs(kart.speed) * 3.6) : 0
      if (!kart) return { follow: state.seat, shot: null }
      heading = easeHeading(heading ?? kart.heading, kart.heading, seconds)
      const want = shotPose(state.shot, { x: kart.x, z: kart.z, heading }, cameras, state.reason === 'finish')
      return { follow: state.seat, shot: shotNow(want, glide, wall) }
    },
    readout: () => ({
      seat: state.seat,
      foresight: state.foresight,
      shot: state.shot,
      reason: state.reason,
      cuts: state.cuts,
      rows,
      speed,
      captions: up ? [{ id: up.id, caption: up.caption }] : [],
    }),
    favour(seat) {
      favoured = seat
      state = { ...startDirector(), cuts: state.cuts, turn: state.turn }
    },
  }
}
