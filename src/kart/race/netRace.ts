// e9-t01, e9-t03, e9-t09: this browser's side of a race in a room (docs/KART-NETCODE.md). It keeps
// the room's clock (pings, shortest round trip wins), sends this kart's frame every third physics
// step, takes in everyone else's, and hands the race loop what it asks for (`SpikeNet`): the
// countdown to the room's GO, the other karts to draw and to bump into, and their name tags.
import {
  clockOffset,
  encodeFrame,
  readRelayed,
  SEND_EVERY_STEPS,
  type ClockSample,
  type KartFrame,
} from '../../../shared/kart/net.ts'
import {
  kartBoosting,
  kartSkidding,
  kartSlip,
  type KartInput,
} from '../../../shared/kart/physics.ts'
import { gridSpot, raceProgress } from '../../../shared/kart/race.ts'
import type { Trial } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import type { KartRacer } from '../../../shared/games/kart/types.ts'
import { CLOCK_ANSWER_BYTES, CLOCK_FRAME, CLOCK_PING_BYTES } from '../../../shared/protocol.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { KART_BODIES, type KartBody } from '../bodies.ts'
import type { OtherKart, ScreenPoint } from '../Scene.ts'
import type { SpikeNet } from '../spikeLoop.ts'
import { createRemotes, type RemotePose } from './remotes.ts'

/** Clock pings: a quick few at first, then one every PING_EVERY_MS */
const FIRST_PINGS = 5
const FIRST_PING_GAP_MS = 250
const PING_EVERY_MS = 2_000
/** Clock answers kept: the best of the recent ones wins */
const KEEP_SAMPLES = 10
/** A round trip slower than this, or no answer for this long, is an unstable connection */
export const SLOW_RTT_MS = 300
const SILENT_MS = 5_000
/** A connection is called unstable once it has looked so for this long */
const UNSTABLE_AFTER_MS = 1_500
/** Name tags float this high over a kart, metres */
const TAG_HEIGHT = 2.4

export interface NameTag {
  readonly seat: number
  readonly at: ScreenPoint
}

export interface RaceNetStatus {
  /** The last clock ping's round trip, ms; null before the first answer */
  readonly rtt: number | null
  /** The connection looks unstable: slow pings, silent pings, or karts gone quiet */
  readonly unstable: boolean
}

export interface RaceNet {
  readonly net: SpikeNet
  /** Where each other kart's name tag goes, every frame */
  onTags(listener: (tags: readonly NameTag[]) => void): void
  status(): RaceNetStatus
  /**
   * Seats in race order: finished first by the server's times, then those racing by how far round
   * they are (this kart by its own count, the others by their newest frames), then those out
   */
  order(racers: readonly KartRacer[]): number[]
  stop(): void
}

export interface RaceNetOptions {
  readonly realtime: RoomRealtime
  readonly track: Track
  readonly seat: number
  /** This kart's place in the race's list: its place on the grid */
  readonly slot: number
  readonly body: KartBody
  /** The room's GO, by the server's clock (ms since the epoch); null until set */
  readonly goAt: () => number | null
  /** Laps in this race: the room's, not the track's own */
  readonly laps: number
}

/** What tests can read */
export interface RaceDebug {
  seat: number
  offset: number | null
  rtt: number | null
  sent: number
  received: number
  /** Other karts with a recent frame */
  others: number
  countdown: number | null
  /** Whether this browser has counted down to the room's GO (a countdown was seen above zero) */
  counted: boolean
  /** This kart's own count: finish line crossings and the next gate */
  crossings: number
  nextGate: number
}

declare global {
  interface Window {
    __kartRace?: RaceDebug
  }
}

export function createRaceNet(options: RaceNetOptions): RaceNet {
  const { realtime, track, seat } = options
  const remotes = createRemotes()
  const samples: ClockSample[] = []
  let offset: number | null = null
  let lastRtt: number | null = null
  let lastAnswerAt = performance.now()
  let badSince: number | null = null
  let steps = 0
  let seq = 0
  let poses: RemotePose[] = []
  let tagListener: ((tags: readonly NameTag[]) => void) | null = null
  let own = { crossings: 0, nextGate: 0, x: 0, z: 0 }
  const body = Math.max(0, KART_BODIES.indexOf(options.body))
  const debug: RaceDebug = {
    seat,
    offset: null,
    rtt: null,
    sent: 0,
    received: 0,
    others: 0,
    countdown: null,
    counted: false,
    crossings: 0,
    nextGate: 0,
  }
  window.__kartRace = debug

  const pingClock = () => {
    const ping = new Uint8Array(CLOCK_PING_BYTES)
    ping[0] = CLOCK_FRAME
    new DataView(ping.buffer).setFloat64(1, performance.now(), true)
    realtime.send(ping)
  }
  const stopListening = realtime.listen((data) => {
    if (data.byteLength === CLOCK_ANSWER_BYTES && data[0] === CLOCK_FRAME) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const sample: ClockSample = {
        sent: view.getFloat64(1, true),
        received: performance.now(),
        server: view.getFloat64(CLOCK_PING_BYTES, true),
      }
      lastAnswerAt = sample.received
      lastRtt = sample.received - sample.sent
      debug.rtt = lastRtt
      samples.push(sample)
      if (samples.length > KEEP_SAMPLES) samples.shift()
      offset = clockOffset(samples)
      debug.offset = offset
      return
    }
    const relayed = readRelayed(data)
    if (!relayed || relayed.seat === seat) return
    debug.received++
    remotes.add(relayed.seat, relayed.frame, performance.now() / 1000)
  })
  const timers: ReturnType<typeof setTimeout>[] = []
  for (let i = 0; i < FIRST_PINGS; i++) {
    timers.push(setTimeout(() => pingClock(), i * FIRST_PING_GAP_MS))
  }
  const pinger = setInterval(() => pingClock(), PING_EVERY_MS)

  const serverNow = () => (offset === null ? null : performance.now() + offset)

  const send = (trial: Trial, input: KartInput, reset: boolean) => {
    const kart = trial.run.kart
    const frame: KartFrame = {
      tick: trial.phase === 'countdown' ? -Math.round(trial.countdown * 60) : trial.steps,
      x: kart.x,
      z: kart.z,
      heading: kart.heading,
      vx: kart.vx,
      vz: kart.vz,
      reset,
      drifting: kart.drifting,
      boosting: kartBoosting(kart),
      skidding: kartSkidding(kart),
      finished: trial.phase === 'finished',
      driftDirection:
        kart.driftDirection ||
        (kartSkidding(kart) ? (-Math.sign(kartSlip(kart)) as -1 | 0 | 1) : 0),
      steer: input.steer,
      body,
      crossings: trial.run.crossings,
      nextGate: trial.run.nextGate,
      seq: seq++,
    }
    if (realtime.send(encodeFrame(frame))) debug.sent++
  }

  const net: SpikeNet = {
    start: gridSpot(track, options.slot),
    laps: options.laps,
    countdown() {
      const goAt = options.goAt()
      const now = serverNow()
      const left = goAt === null || now === null ? null : (goAt - now) / 1000
      debug.countdown = left
      if (left !== null && left > 0) debug.counted = true
      return left
    },
    afterStep(trial, input, reset) {
      steps++
      own = {
        crossings: trial.run.crossings,
        nextGate: trial.run.nextGate,
        x: trial.run.kart.x,
        z: trial.run.kart.z,
      }
      debug.crossings = own.crossings
      debug.nextGate = own.nextGate
      if (reset || steps % SEND_EVERY_STEPS === 0) send(trial, input, reset)
    },
    bumpers: () => poses.filter((pose) => !pose.stale),
    others() {
      poses = remotes.poses(performance.now() / 1000)
      debug.others = poses.filter((pose) => !pose.stale).length
      return poses.map((pose): OtherKart => ({
        id: pose.seat,
        x: pose.x,
        z: pose.z,
        heading: pose.heading,
        body: KART_BODIES[pose.frame.body] ?? 'tide',
        look: {
          speed: pose.vx * Math.sin(pose.heading) - pose.vz * Math.cos(pose.heading),
          steer: pose.frame.steer,
          drift: pose.frame.driftDirection,
          boosting: pose.frame.boosting,
        },
      }))
    },
    drawn(scene) {
      if (!tagListener) return
      const points = scene.project(poses.map((pose) => [pose.x, TAG_HEIGHT, pose.z] as const))
      tagListener(poses.map((pose, index) => ({ seat: pose.seat, at: points[index] ?? null })))
    },
  }

  return {
    net,
    onTags(listener) {
      tagListener = listener
    },
    status() {
      const now = performance.now()
      const silent = now - lastAnswerAt > SILENT_MS
      const slow = lastRtt !== null && lastRtt > SLOW_RTT_MS
      const quiet = poses.some((pose) => pose.stale)
      // Only once it has lasted: one late ping or one gap in someone's frames is not worth a warning
      if (!(silent || slow || quiet)) badSince = null
      else badSince ??= now
      return { rtt: lastRtt, unstable: badSince !== null && now - badSince >= UNSTABLE_AFTER_MS }
    },
    order(racers) {
      const count = track.gates.length
      const latest = remotes.latest()
      const progress = (racer: KartRacer): number => {
        if (racer.seat === seat)
          return raceProgress(track, own.crossings, own.nextGate, own.x, own.z)
        const frame = latest.get(racer.seat)
        if (!frame || frame.nextGate >= count) return racer.lapMs.length * count
        return raceProgress(track, frame.crossings, frame.nextGate, frame.x, frame.z)
      }
      const finished = racers
        .filter((racer) => racer.finishMs !== null)
        .sort((a, b) => (a.finishMs as number) - (b.finishMs as number))
      const racing = racers
        .filter((racer) => racer.finishMs === null && !racer.out)
        .map((racer) => ({ racer, at: progress(racer) }))
        .sort((a, b) => b.at - a.at)
        .map(({ racer }) => racer)
      const out = racers.filter((racer) => racer.finishMs === null && racer.out)
      return [...finished, ...racing, ...out].map((racer) => racer.seat)
    },
    stop() {
      stopListening()
      for (const timer of timers) clearTimeout(timer)
      clearInterval(pinger)
      tagListener = null
    },
  }
}
