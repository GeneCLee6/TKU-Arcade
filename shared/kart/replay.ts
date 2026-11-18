// e9-t10: a whole race, kept to be watched again (docs/KART-NETCODE.md §11). Every browser in the
// room already receives every kart's frames (its own it sends); the recorder keeps a tenth of a
// second of each, delta-coded, plus the items used and held, and the results. Nothing new goes over
// the network and the room keeps nothing: the replay lives in this browser until the next race.
//
// One kart's samples, one after another (little-endian):
//
//   0  u8   head: the frame's flags (net.ts: reset, drifting, boosting, skidding, finished, the
//           drift's way in bits 5–6) and ABSOLUTE in bit 7
//   absolute:  1 i32 tick   5 f32 x   9 f32 z   13 u8 body                      (14 bytes)
//   delta:     1 u8 ticks since the last   2 i16 dx   4 i16 dz, in centimetres  (6 bytes)
//   then:      i16 heading × 10 000, i16 vx × 100, i16 vz × 100, i8 steer × 100,
//              u8 finish-line crossings, u8 next gate                        (9 bytes)
//
// So 15 bytes a sample against the wire's 32, ten a second against twenty. A delta is taken from the
// position as decoded, not as sent, so rounding never adds up along a race.
//
// Pure: no DOM, no three.js. The browser's recorder and player (src/kart/watch/) use it.
import type { ItemId } from './items.ts'
import { FLAG_BOOSTING, FLAG_DRIFTING, FLAG_FINISHED, FLAG_RESET, FLAG_SKIDDING } from './net.ts'
import type { KartFrame } from './net.ts'
import { shotPosition, type KartShot, type ShotItem } from './shots.ts'
import { TEAM_BOOST_MS } from './team.ts'

/** Physics steps a second: a frame's tick counts these from GO */
export const TICKS_PER_SECOND = 60
/** A sample kept every this many ticks at most: ten a second */
export const REPLAY_EVERY_TICKS = 6
/** Frames from before GO are kept from this tick on: the karts on the grid */
export const REPLAY_FROM_TICK = -60
/** Past the last finish, the replay goes on this long */
export const REPLAY_TAIL_TICKS = 2 * TICKS_PER_SECOND

const ABSOLUTE = 0x80
const ABSOLUTE_BYTES = 14
const DELTA_BYTES = 6
const TAIL_BYTES = 9
const HEADING_SCALE = 10_000
const SPEED_SCALE = 100
const CM = 100
const I16 = 32_767

/** One kart at one moment of the replay */
export interface ReplaySample {
  readonly tick: number
  readonly x: number
  readonly z: number
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly steer: number
  readonly body: number
  readonly reset: boolean
  readonly drifting: boolean
  readonly boosting: boolean
  readonly skidding: boolean
  readonly finished: boolean
  readonly driftDirection: -1 | 0 | 1
  readonly crossings: number
  readonly nextGate: number
}

/** An item used, by race tick (the room's `events`, its server time turned into ticks from GO) */
export interface ReplayEvent {
  readonly tick: number
  readonly item: ItemId
  readonly by: number
  readonly targets: readonly number[]
  readonly blocked: readonly number[]
  /** A shot that hit (e9-t06b), kept since 2026-11-17 so a replay shows the hit; absent for a use */
  readonly hit?: boolean
}

/** From `tick` on, `seat` holds `item` (null: nothing) */
export interface HeldChange {
  readonly tick: number
  readonly seat: number
  readonly item: ItemId | null
}

export interface ReplayRacer {
  readonly seat: number
  readonly lapMs: readonly number[]
  readonly finishMs: number | null
  readonly out: boolean
  /** A team race: its side (0 red, 1 blue) */
  readonly team?: number
}

/**
 * A team race (2026-11-18, team.ts), kept so that a replay shows the blue boosts blue and the
 * teams' gauges: every blue boost fired (`tick` to `until`), and the gauges each time they moved
 */
export interface ReplayTeams {
  readonly burns: readonly { readonly seat: number; readonly tick: number; readonly until: number }[]
  readonly gauges: readonly { readonly tick: number; readonly gauge: readonly [number, number] }[]
}

/** A recorded race: what the recorder hands over, and what encodeReplay packs */
export interface Replay {
  readonly track: string
  readonly laps: number
  readonly mode: 'items' | 'race'
  readonly racers: readonly ReplayRacer[]
  /** Each kart's samples, coded as above */
  readonly karts: readonly { readonly seat: number; readonly bytes: Uint8Array }[]
  readonly events: readonly ReplayEvent[]
  readonly held: readonly HeldChange[]
  /** The shots thrown (e9-t06b), their times in ms from GO; absent in a race without them */
  readonly shots?: readonly KartShot[]
  /** A team race only; absent in any other, and in a replay from before */
  readonly teams?: ReplayTeams
}

// ── Coding one kart's samples ────────────────────────────────────────────────────────────────

const wrapAngle = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const i16 = (value: number) => clamp(Math.round(value), -I16, I16)
const byte = (value: number) => clamp(Math.round(value), 0, 255)

function flagsOf(frame: KartFrame | ReplaySample): number {
  return (
    (frame.reset ? FLAG_RESET : 0) |
    (frame.drifting ? FLAG_DRIFTING : 0) |
    (frame.boosting ? FLAG_BOOSTING : 0) |
    (frame.skidding ? FLAG_SKIDDING : 0) |
    (frame.finished ? FLAG_FINISHED : 0) |
    ((frame.driftDirection === -1 ? 1 : frame.driftDirection === 1 ? 2 : 0) << 5)
  )
}

/** One kart's samples as they come: a growing buffer, thinned to REPLAY_EVERY_TICKS */
export interface KartTape {
  /** Keeps this frame if it is due (or a jump, or the finish); returns whether it did */
  add(frame: KartFrame): boolean
  /** The samples so far, coded */
  bytes(): Uint8Array
  /** Samples kept */
  readonly count: number
  /** The newest kept sample's tick; null before any */
  readonly lastTick: number | null
}

export function createKartTape(): KartTape {
  let buffer = new Uint8Array(1024)
  let length = 0
  let count = 0
  // The last sample as a reader will decode it: deltas are taken from here
  let last: { tick: number; x: number; z: number; finished: boolean } | null = null

  const room = (bytes: number) => {
    if (length + bytes <= buffer.length) return
    const bigger = new Uint8Array(Math.max(buffer.length * 2, length + bytes))
    bigger.set(buffer.subarray(0, length))
    buffer = bigger
  }

  return {
    add(frame) {
      if (frame.tick < REPLAY_FROM_TICK) return false
      if (last && frame.tick <= last.tick) return false
      const due =
        !last ||
        frame.reset ||
        frame.finished !== last.finished ||
        frame.tick - last.tick >= REPLAY_EVERY_TICKS
      if (!due) return false
      const dx = last ? Math.round((frame.x - last.x) * CM) : 0
      const dz = last ? Math.round((frame.z - last.z) * CM) : 0
      const dt = last ? frame.tick - last.tick : 0
      const absolute = !last || frame.reset || dt > 255 || Math.abs(dx) > I16 || Math.abs(dz) > I16
      room((absolute ? ABSOLUTE_BYTES : DELTA_BYTES) + TAIL_BYTES)
      const view = new DataView(buffer.buffer)
      view.setUint8(length, flagsOf(frame) | (absolute ? ABSOLUTE : 0))
      let x: number
      let z: number
      if (absolute) {
        view.setInt32(length + 1, frame.tick, true)
        view.setFloat32(length + 5, frame.x, true)
        view.setFloat32(length + 9, frame.z, true)
        view.setUint8(length + 13, byte(frame.body))
        x = Math.fround(frame.x)
        z = Math.fround(frame.z)
        length += ABSOLUTE_BYTES
      } else {
        view.setUint8(length + 1, dt)
        view.setInt16(length + 2, dx, true)
        view.setInt16(length + 4, dz, true)
        x = last!.x + dx / CM
        z = last!.z + dz / CM
        length += DELTA_BYTES
      }
      view.setInt16(length, i16(wrapAngle(frame.heading) * HEADING_SCALE), true)
      view.setInt16(length + 2, i16(frame.vx * SPEED_SCALE), true)
      view.setInt16(length + 4, i16(frame.vz * SPEED_SCALE), true)
      view.setInt8(length + 6, clamp(Math.round(frame.steer * 100), -100, 100))
      view.setUint8(length + 7, byte(frame.crossings))
      view.setUint8(length + 8, byte(frame.nextGate))
      length += TAIL_BYTES
      count++
      last = { tick: frame.tick, x, z, finished: frame.finished }
      return true
    },
    bytes: () => buffer.slice(0, length),
    get count() {
      return count
    },
    get lastTick() {
      return last?.tick ?? null
    },
  }
}

/** The samples coded in these bytes, oldest first; stops at anything cut short */
export function decodeTape(bytes: Uint8Array): ReplaySample[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const samples: ReplaySample[] = []
  let at = 0
  let prev: ReplaySample | null = null
  while (at < bytes.byteLength) {
    const head = view.getUint8(at)
    const absolute = (head & ABSOLUTE) !== 0
    const size = (absolute ? ABSOLUTE_BYTES : DELTA_BYTES) + TAIL_BYTES
    if (at + size > bytes.byteLength || (!absolute && !prev)) break
    let tick: number
    let x: number
    let z: number
    let body: number
    if (absolute) {
      tick = view.getInt32(at + 1, true)
      x = view.getFloat32(at + 5, true)
      z = view.getFloat32(at + 9, true)
      body = view.getUint8(at + 13)
      at += ABSOLUTE_BYTES
    } else {
      tick = prev!.tick + view.getUint8(at + 1)
      x = prev!.x + view.getInt16(at + 2, true) / CM
      z = prev!.z + view.getInt16(at + 4, true) / CM
      body = prev!.body
      at += DELTA_BYTES
    }
    const way = (head >> 5) & 3
    const sample: ReplaySample = {
      tick,
      x,
      z,
      heading: view.getInt16(at, true) / HEADING_SCALE,
      vx: view.getInt16(at + 2, true) / SPEED_SCALE,
      vz: view.getInt16(at + 4, true) / SPEED_SCALE,
      steer: view.getInt8(at + 6) / 100,
      body,
      reset: (head & FLAG_RESET) !== 0,
      drifting: (head & FLAG_DRIFTING) !== 0,
      boosting: (head & FLAG_BOOSTING) !== 0,
      skidding: (head & FLAG_SKIDDING) !== 0,
      finished: (head & FLAG_FINISHED) !== 0,
      driftDirection: way === 1 ? -1 : way === 2 ? 1 : 0,
      crossings: view.getUint8(at + 7),
      nextGate: view.getUint8(at + 8),
    }
    at += TAIL_BYTES
    samples.push(sample)
    prev = sample
  }
  return samples
}

// ── Reading a kart at any moment ─────────────────────────────────────────────────────────────

/** The index of the last sample at or before `tick`, -1 if all are after it */
export function sampleIndex(samples: readonly ReplaySample[], tick: number): number {
  let low = 0
  let high = samples.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (samples[mid]!.tick <= tick) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/**
 * Where the kart is at `tick` (fractions allowed): between the two samples around it, the heading
 * the short way round; before the first sample at the first, after the last at the last. A sample
 * that is a jump (a reset) is never drawn towards: the kart stays put until it, then is there.
 */
export function sampleAt(samples: readonly ReplaySample[], tick: number): ReplaySample | null {
  if (samples.length === 0) return null
  const index = sampleIndex(samples, tick)
  if (index < 0) return samples[0]!
  const a = samples[index]!
  const b = samples[index + 1]
  if (!b || b.reset) return a
  const share = clamp((tick - a.tick) / (b.tick - a.tick), 0, 1)
  const near = share < 0.5 ? a : b
  return {
    ...near,
    tick,
    x: a.x + (b.x - a.x) * share,
    z: a.z + (b.z - a.z) * share,
    heading: wrapAngle(a.heading + wrapAngle(b.heading - a.heading) * share),
    vx: a.vx + (b.vx - a.vx) * share,
    vz: a.vz + (b.vz - a.vz) * share,
    steer: a.steer + (b.steer - a.steer) * share,
    reset: false,
  }
}

// ── The race around the karts ────────────────────────────────────────────────────────────────

/** A race time in ms as ticks from GO */
export const msToTicks = (ms: number): number => (ms * TICKS_PER_SECOND) / 1000

/** Laps `racer` had finished by `tick` */
export function lapsAt(racer: Pick<ReplayRacer, 'lapMs'>, tick: number): number {
  let total = 0
  let laps = 0
  for (const lap of racer.lapMs) {
    total += lap
    if (msToTicks(total) > tick) break
    laps++
  }
  return laps
}

/** What `seat` holds at `tick` */
export function heldAt(held: readonly HeldChange[], seat: number, tick: number): ItemId | null {
  let item: ItemId | null = null
  for (const change of held) {
    if (change.tick > tick) break
    if (change.seat === seat) item = change.item
  }
  return item
}

/** The seats with a shield up at `tick`: raised by a shield used, gone after `shieldTicks` or a block */
export function shieldsAt(
  events: readonly ReplayEvent[],
  tick: number,
  shieldTicks: number,
): number[] {
  const until = new Map<number, number>()
  for (const event of events) {
    if (event.tick > tick) break
    for (const seat of event.blocked) until.delete(seat)
    if (event.item === 'shield') until.set(event.by, event.tick + shieldTicks)
  }
  return [...until].filter(([, end]) => end > tick).map(([seat]) => seat)
}

/** The karts whose blue boost burns at `tick` (a team race) */
export function teamBurnsAt(teams: ReplayTeams | undefined, tick: number): Set<number> {
  const seats = new Set<number>()
  for (const burn of teams?.burns ?? []) {
    if (burn.tick <= tick && tick < burn.until) seats.add(burn.seat)
  }
  return seats
}

/** The teams' gauges at `tick` (a team race); null in any other race */
export function teamGaugesAt(
  teams: ReplayTeams | undefined,
  tick: number,
): readonly [number, number] | null {
  if (!teams) return null
  let gauge: readonly [number, number] = [0, 0]
  for (const one of teams.gauges) {
    if (one.tick > tick) break
    gauge = one.gauge
  }
  return gauge
}

// ── Recording ────────────────────────────────────────────────────────────────────────────────

/** The parts of the room's view the recorder reads (shared/games/kart/types.ts's KartView) */
export interface RecordedView {
  readonly track: string
  readonly laps: number
  readonly mode: 'items' | 'race'
  readonly goAt: number | null
  readonly racers: readonly {
    readonly seat: number
    readonly item?: ItemId | null
    readonly lapMs: readonly number[]
    readonly finishMs: number | null
    readonly out: boolean
    /** A team race: its side, and until when (the server's clock) its last blue boost burns */
    readonly team?: number
    readonly teamUntil?: number
  }[]
  /** A team race: the teams' gauges */
  readonly teams?: { readonly gauge: readonly [number, number] }
  readonly events: readonly {
    readonly n: number
    readonly item: ItemId
    readonly by: number
    readonly targets: readonly number[]
    readonly blocked: readonly number[]
    readonly at: number
    readonly hit?: boolean
  }[]
  /** The shots on the road (e9-t06b) */
  readonly shots?: readonly KartShot[]
}

export interface ReplayRecorder {
  /** A kart's frame, its own or relayed */
  frame(seat: number, frame: KartFrame): void
  /** The room's view changed: items used and held, laps and the finish */
  view(view: RecordedView): void
  /** The newest tick any kart has sent: "now" in the race, as near as this browser knows */
  readonly now: number | null
  /** Whether there is anything to watch */
  hasFrames(): boolean
  /** The race so far */
  replay(): Replay
}

export function createReplayRecorder(first: RecordedView): ReplayRecorder {
  const tapes = new Map<number, KartTape>()
  const events: ReplayEvent[] = []
  const held: HeldChange[] = []
  const holding = new Map<number, ItemId | null>()
  let latest = first
  let nextEvent = -1
  let now: number | null = null
  // Shots by number, times from GO; one gone from the view before its time hit something then
  const shots = new Map<number, KartShot>()
  // A team race: the blue boosts fired (each kart's `teamUntil` as it moves on) and the gauges
  const burns: { seat: number; tick: number; until: number }[] = []
  const burnUntil = new Map<number, number>()
  const gauges: { tick: number; gauge: readonly [number, number] }[] = []

  const recorder: ReplayRecorder = {
    frame(seat, frame) {
      let tape = tapes.get(seat)
      if (!tape) {
        tape = createKartTape()
        tapes.set(seat, tape)
      }
      tape.add(frame)
      if (frame.tick >= REPLAY_FROM_TICK && (now === null || frame.tick > now)) now = frame.tick
    },
    view(view) {
      latest = view
      const goAt = view.goAt
      // Items used: each once, by the server's time from GO. Those from before this browser came are
      // not known in full (the room keeps the last few), so the first view only marks where to start
      if (nextEvent < 0) {
        nextEvent = view.events.reduce((most, event) => Math.max(most, event.n + 1), 0)
      } else if (goAt !== null) {
        for (const event of view.events) {
          if (event.n < nextEvent) continue
          nextEvent = event.n + 1
          events.push({
            tick: Math.round(msToTicks(event.at - goAt)),
            item: event.item,
            by: event.by,
            targets: [...event.targets],
            blocked: [...event.blocked],
            ...(event.hit ? { hit: true } : {}),
          })
        }
      }
      // Shots: each once; one that left the room's list early ended there (a hit or a block)
      if (goAt !== null) {
        const live = new Set<number>()
        for (const shot of view.shots ?? []) {
          live.add(shot.n)
          if (!shots.has(shot.n))
            shots.set(shot.n, { ...shot, at: shot.at - goAt, until: shot.until - goAt })
        }
        const nowMs = now === null ? null : (now * 1000) / TICKS_PER_SECOND
        for (const [n, shot] of shots) {
          if (live.has(n) || nowMs === null || nowMs >= shot.until || nowMs < shot.at) continue
          shots.set(n, { ...shot, until: nowMs })
        }
      }
      if (view.teams) {
        for (const racer of view.racers) {
          const until = racer.teamUntil ?? 0
          const seen = burnUntil.get(racer.seat)
          burnUntil.set(racer.seat, until)
          // The first view only marks where each stands (as the items used do)
          if (seen === undefined || until === seen || until <= 0 || goAt === null) continue
          burns.push({
            seat: racer.seat,
            tick: Math.round(msToTicks(until - TEAM_BOOST_MS - goAt)),
            until: Math.round(msToTicks(until - goAt)),
          })
        }
        const last = gauges.at(-1)?.gauge
        const [red, blue] = view.teams.gauge
        if (!last || last[0] !== red || last[1] !== blue) {
          gauges.push({ tick: Math.max(0, now ?? 0), gauge: [red, blue] })
        }
      }
      // Items held: the room does not say when one was taken, so "now" is as near as it gets
      for (const racer of view.racers) {
        const item = racer.item ?? null
        if (holding.has(racer.seat) && holding.get(racer.seat) === item) continue
        holding.set(racer.seat, item)
        held.push({ tick: Math.max(0, now ?? 0), seat: racer.seat, item })
      }
    },
    get now() {
      return now
    },
    hasFrames: () => [...tapes.values()].some((tape) => tape.count > 0),
    replay() {
      return {
        track: latest.track,
        laps: latest.laps,
        mode: latest.mode,
        racers: latest.racers.map((racer) => ({
          seat: racer.seat,
          lapMs: [...racer.lapMs],
          finishMs: racer.finishMs,
          out: racer.out,
          ...(racer.team !== undefined ? { team: racer.team } : {}),
        })),
        karts: [...tapes].map(([seat, tape]) => ({ seat, bytes: tape.bytes() })),
        events: [...events],
        held: [...held].sort((a, b) => a.tick - b.tick),
        ...(shots.size > 0 ? { shots: [...shots.values()] } : {}),
        ...(latest.teams ? { teams: { burns: [...burns], gauges: [...gauges] } } : {}),
      }
    },
  }
  recorder.view(first)
  return recorder
}

/**
 * The shots on the road at `tick` (e9-t06b), where each is; a cloud flies at its target's kart as
 * the replay has it (`kartAt`)
 */
export function shotsAt(
  shots: readonly KartShot[] | undefined,
  tick: number,
  kartAt: (seat: number) => { readonly x: number; readonly z: number } | null,
): { n: number; item: ShotItem; x: number; z: number }[] {
  const ms = (tick * 1000) / TICKS_PER_SECOND
  return (shots ?? [])
    .filter((shot) => ms >= shot.at && ms <= shot.until)
    .map((shot) => ({
      n: shot.n,
      item: shot.item,
      ...shotPosition(shot, ms, shot.target === null ? null : kartAt(shot.target)),
    }))
}

// ── One blob: for a file, a message or R2 later ──────────────────────────────────────────────

/** First byte of a packed replay; the version follows */
export const REPLAY_MAGIC = 0x52
export const REPLAY_VERSION = 1

/**
 * A replay as one array of bytes: magic, version, the JSON of everything but the karts (u32 length
 * first), then each kart: u8 seat, u32 length, its samples
 */
export function encodeReplay(replay: Replay): Uint8Array {
  const { karts, ...rest } = replay
  const meta = new TextEncoder().encode(JSON.stringify(rest))
  const size = 2 + 4 + meta.length + karts.reduce((sum, kart) => sum + 5 + kart.bytes.length, 0)
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  bytes[0] = REPLAY_MAGIC
  bytes[1] = REPLAY_VERSION
  view.setUint32(2, meta.length, true)
  bytes.set(meta, 6)
  let at = 6 + meta.length
  for (const kart of karts) {
    view.setUint8(at, kart.seat)
    view.setUint32(at + 1, kart.bytes.length, true)
    bytes.set(kart.bytes, at + 5)
    at += 5 + kart.bytes.length
  }
  return bytes
}

/** The replay in these bytes, or null for anything else */
export function decodeReplay(bytes: Uint8Array): Replay | null {
  if (bytes.byteLength < 6 || bytes[0] !== REPLAY_MAGIC || bytes[1] !== REPLAY_VERSION) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const metaLength = view.getUint32(2, true)
  if (6 + metaLength > bytes.byteLength) return null
  let meta: Omit<Replay, 'karts'>
  try {
    meta = JSON.parse(new TextDecoder().decode(bytes.subarray(6, 6 + metaLength)))
  } catch {
    return null
  }
  const karts: { seat: number; bytes: Uint8Array }[] = []
  let at = 6 + metaLength
  while (at + 5 <= bytes.byteLength) {
    const length = view.getUint32(at + 1, true)
    if (at + 5 + length > bytes.byteLength) return null
    karts.push({ seat: view.getUint8(at), bytes: bytes.slice(at + 5, at + 5 + length) })
    at += 5 + length
  }
  return { ...meta, karts }
}

// ── Playing it back ──────────────────────────────────────────────────────────────────────────

/** A replay ready to play: each kart's samples decoded, and where the timeline starts and ends */
export interface ReplayReel {
  readonly replay: Replay
  readonly samples: ReadonlyMap<number, readonly ReplaySample[]>
  /** GO, or the first sample of a replay that starts later (recorded by someone who came late) */
  readonly start: number
  /** The last finish and a little more, or the last sample if someone never finished */
  readonly end: number
}

export function openReplay(replay: Replay): ReplayReel {
  const samples = new Map<number, ReplaySample[]>()
  let first = Infinity
  let last = -Infinity
  for (const kart of replay.karts) {
    const decoded = decodeTape(kart.bytes)
    if (decoded.length === 0) continue
    samples.set(kart.seat, decoded)
    first = Math.min(first, decoded[0]!.tick)
    last = Math.max(last, decoded[decoded.length - 1]!.tick)
  }
  if (samples.size === 0) return { replay, samples, start: 0, end: 0 }
  const start = Math.max(0, first)
  const finishes = replay.racers.map((racer) => racer.finishMs)
  const everyoneFinished = finishes.length > 0 && finishes.every((ms) => ms !== null)
  const lastFinish = Math.max(0, ...finishes.map((ms) => (ms === null ? 0 : msToTicks(ms))))
  const end = everyoneFinished ? Math.min(last, lastFinish + REPLAY_TAIL_TICKS) : last
  return { replay, samples, start, end: Math.max(start, end) }
}

/** Playback speeds offered, slowest first */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const

export interface Playhead {
  /** Ticks from GO (fractions allowed) */
  readonly tick: number
  readonly playing: boolean
  readonly speed: number
}

/** The playhead after `seconds` of wall time; it stops at the end */
export function advancePlayhead(
  head: Playhead,
  seconds: number,
  reel: Pick<ReplayReel, 'start' | 'end'>,
): Playhead {
  if (!head.playing) return head
  const tick = head.tick + seconds * TICKS_PER_SECOND * head.speed
  return tick >= reel.end ? { ...head, tick: reel.end, playing: false } : { ...head, tick }
}

/** The playhead moved to `tick`, kept on the timeline */
export const seekPlayhead = (
  head: Playhead,
  tick: number,
  reel: Pick<ReplayReel, 'start' | 'end'>,
): Playhead => ({ ...head, tick: clamp(tick, reel.start, reel.end) })

/** Play or pause; playing at the end starts over */
export function togglePlayhead(head: Playhead, reel: Pick<ReplayReel, 'start' | 'end'>): Playhead {
  if (head.playing) return { ...head, playing: false }
  return { ...head, playing: true, tick: head.tick >= reel.end ? reel.start : head.tick }
}

/** The next speed up (step 1) or down (-1), stopping at either end */
export function stepSpeed(speed: number, step: 1 | -1): number {
  const index = REPLAY_SPEEDS.findIndex((one) => one === speed)
  const next = clamp((index < 0 ? 1 : index) + step, 0, REPLAY_SPEEDS.length - 1)
  return REPLAY_SPEEDS[next]!
}
