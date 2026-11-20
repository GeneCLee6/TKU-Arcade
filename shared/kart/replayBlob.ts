// A replay as one array of bytes (docs/KART-NETCODE.md §11), and back. Out of replay.ts on 2026-11-20
// so that the room's first screen, which records but never packs a replay, does not carry the
// packing and the checks; only a replay's file (replayFile.ts) does.
import { ITEM_IDS, type ItemId } from './itemIds.ts'
import type { HeldChange, Replay, ReplayEvent, ReplayRacer, ReplayTeams } from './replay.ts'
import { isShot, type KartShot } from './shots.ts'

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

// 2026-11-20 (docs/KART-NETCODE.md §11.4): a replay may now come from a file or a link, so nothing
// in it is trusted: everything but the karts' samples (which decodeTape reads defensively) is
// checked field by field, with a limit on every list, and anything else makes the whole replay
// unreadable. What comes out has only the fields a replay has.

/** The most of anything a replay may hold */
export const REPLAY_LIMITS = {
  seats: 32,
  laps: 99,
  lapsKept: 100,
  /** Items used, items held, shots, a team race's boosts and gauges, each */
  list: 20_000,
  trackId: 8_000,
  /** The JSON of everything but the karts, bytes */
  meta: 4_000_000,
} as const

const TICK_LIMIT = 10_000_000
const isInt = (value: unknown, low: number, high: number): value is number =>
  Number.isInteger(value) && (value as number) >= low && (value as number) <= high
const isSeat = (value: unknown): value is number => isInt(value, 0, REPLAY_LIMITS.seats - 1)
const isTick = (value: unknown): value is number => isInt(value, -TICK_LIMIT, TICK_LIMIT)
const isMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= TICK_LIMIT * 100
const isItem = (value: unknown): value is ItemId =>
  typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value)
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const listOf = <T>(value: unknown, check: (one: unknown) => T | null, most: number): T[] | null => {
  if (!Array.isArray(value) || value.length > most) return null
  const out: T[] = []
  for (const one of value) {
    const checked = check(one)
    if (checked === null) return null
    out.push(checked)
  }
  return out
}
const seats = (value: unknown): number[] | null =>
  listOf(value, (one) => (isSeat(one) ? one : null), REPLAY_LIMITS.seats)

function checkRacer(value: unknown): ReplayRacer | null {
  if (!isObject(value) || !isSeat(value.seat) || typeof value.out !== 'boolean') return null
  const lapMs = listOf(value.lapMs, (one) => (isMs(one) ? one : null), REPLAY_LIMITS.lapsKept)
  if (!lapMs || !(value.finishMs === null || isMs(value.finishMs))) return null
  if (value.team !== undefined && !isInt(value.team, 0, 1)) return null
  return {
    seat: value.seat,
    lapMs,
    finishMs: value.finishMs,
    out: value.out,
    ...(value.team !== undefined ? { team: value.team } : {}),
  }
}

function checkEvent(value: unknown): ReplayEvent | null {
  if (!isObject(value) || !isTick(value.tick) || !isItem(value.item) || !isSeat(value.by)) return null
  const targets = seats(value.targets)
  const blocked = seats(value.blocked)
  if (!targets || !blocked) return null
  const kept = value.kept === undefined ? undefined : seats(value.kept)
  if (kept === null) return null
  if (value.hit !== undefined && typeof value.hit !== 'boolean') return null
  if (value.bounced !== undefined && typeof value.bounced !== 'boolean') return null
  if (value.ms !== undefined && !isInt(value.ms, 0, TICK_LIMIT)) return null
  return {
    tick: value.tick,
    item: value.item,
    by: value.by,
    targets,
    blocked,
    ...(value.hit !== undefined ? { hit: value.hit } : {}),
    ...(value.bounced !== undefined ? { bounced: value.bounced } : {}),
    ...(kept !== undefined ? { kept } : {}),
    ...(value.ms !== undefined ? { ms: value.ms } : {}),
  }
}

function checkHeld(value: unknown): HeldChange | null {
  if (!isObject(value) || !isTick(value.tick) || !isSeat(value.seat)) return null
  if (!(value.item === null || isItem(value.item))) return null
  return { tick: value.tick, seat: value.seat, item: value.item }
}

function checkShot(value: unknown): KartShot | null {
  if (!isShot(value) || !isSeat(value.by) || !(value.target === null || isSeat(value.target))) return null
  const { n, item, by, at, x, z, vx, vz, until, target, struck } = value
  if (struck !== undefined && struck.length > REPLAY_LIMITS.seats) return null
  return { n, item, by, at, x, z, vx, vz, until, target, ...(struck ? { struck: [...struck] } : {}) }
}

function checkTeams(value: unknown): ReplayTeams | null {
  if (!isObject(value)) return null
  const burns = listOf(
    value.burns,
    (one) =>
      isObject(one) && isSeat(one.seat) && isTick(one.tick) && isTick(one.until)
        ? { seat: one.seat, tick: one.tick, until: one.until }
        : null,
    REPLAY_LIMITS.list,
  )
  const gauges = listOf(
    value.gauges,
    (one) => {
      if (!isObject(one) || !isTick(one.tick) || !Array.isArray(one.gauge) || one.gauge.length !== 2)
        return null
      const [red, blue] = one.gauge as unknown[]
      return isMs(red) && isMs(blue) ? { tick: one.tick, gauge: [red, blue] as const } : null
    },
    REPLAY_LIMITS.list,
  )
  return burns && gauges ? { burns, gauges } : null
}

/** Everything of a replay but its karts, checked; null for anything that is not one */
export function checkReplayMeta(value: unknown): Omit<Replay, 'karts'> | null {
  if (!isObject(value)) return null
  const { track, laps, mode } = value
  if (typeof track !== 'string' || track.length === 0 || track.length > REPLAY_LIMITS.trackId)
    return null
  if (!isInt(laps, 1, REPLAY_LIMITS.laps) || (mode !== 'items' && mode !== 'race')) return null
  const racers = listOf(value.racers, checkRacer, REPLAY_LIMITS.seats)
  const events = listOf(value.events, checkEvent, REPLAY_LIMITS.list)
  const held = listOf(value.held, checkHeld, REPLAY_LIMITS.list)
  if (!racers || !events || !held) return null
  const shots = value.shots === undefined ? undefined : listOf(value.shots, checkShot, REPLAY_LIMITS.list)
  const teams = value.teams === undefined ? undefined : checkTeams(value.teams)
  if (shots === null || teams === null) return null
  return {
    track,
    laps,
    mode,
    racers,
    events,
    held,
    ...(shots ? { shots } : {}),
    ...(teams ? { teams } : {}),
  }
}

/** The replay in these bytes, or null for anything else (checked: see checkReplayMeta) */
export function decodeReplay(bytes: Uint8Array): Replay | null {
  if (bytes.byteLength < 6 || bytes[0] !== REPLAY_MAGIC || bytes[1] !== REPLAY_VERSION) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const metaLength = view.getUint32(2, true)
  if (metaLength > REPLAY_LIMITS.meta || 6 + metaLength > bytes.byteLength) return null
  let meta: Omit<Replay, 'karts'> | null
  try {
    meta = checkReplayMeta(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.subarray(6, 6 + metaLength))))
  } catch {
    return null
  }
  if (!meta) return null
  const karts: { seat: number; bytes: Uint8Array }[] = []
  const seen = new Set<number>()
  let at = 6 + metaLength
  while (at + 5 <= bytes.byteLength) {
    const seat = view.getUint8(at)
    const length = view.getUint32(at + 1, true)
    if (!isSeat(seat) || seen.has(seat) || at + 5 + length > bytes.byteLength) return null
    seen.add(seat)
    karts.push({ seat, bytes: bytes.slice(at + 5, at + 5 + length) })
    at += 5 + length
  }
  // Nothing left over that is not a kart
  if (at !== bytes.byteLength) return null
  return { ...meta, karts }
}

