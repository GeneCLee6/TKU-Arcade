// 2026-11-20 (docs/KART-NETCODE.md §11.4): a replay kept as a file (`.tkureplay`) or, when it is
// small enough, a link. No account and no server: the file is the replay this browser recorded
// (replay.ts's encodeReplay), with what it takes to play it anywhere else: the track's revision (a
// track whose road has changed since will not line up), the racers' names, and who saved it.
//
//   0  'TKUR'
//   4  u8  the file's version (FILE_VERSION)
//   5  u8  flags: bit 0, the rest is deflated (deflate-raw)
//   6  the rest: u32 length of the header's JSON, the header, then the replay's own bytes
//
// 2026-11-23 (docs/KART-NETCODE.md §11.4): the header may also say what each racer's driver wore
// (`outfits`): a frame's body byte has no room for it. Left out (a file saved before then), or an
// outfit this page does not know, the race suit is drawn. The file's version stays 1: a page from
// before reads the header's fields it knows and leaves the rest.
//
// Reading one trusts nothing: the size is limited before and while it is inflated, the header is
// checked field by field, and the replay itself by decodeReplay. Pure apart from the browser's (and
// Node's) CompressionStream.
import { isOutfitId, type OutfitId } from './outfits.ts'
import type { Replay } from './replay.ts'
import { decodeReplay, encodeReplay, REPLAY_LIMITS, REPLAY_MAGIC, REPLAY_VERSION } from './replayBlob.ts'

export const REPLAY_FILE_EXTENSION = '.tkureplay'
export const REPLAY_FILE_TYPE = 'application/x-tkureplay'
const MAGIC = [0x54, 0x4b, 0x55, 0x52] // TKUR
export const FILE_VERSION = 1
const DEFLATED = 1
const HEAD = 6

/** The most a file may be, as stored and once inflated, bytes */
export const MAX_FILE_BYTES = 2_000_000
export const MAX_INFLATED_BYTES = 8_000_000
/** A replay small enough for a link: its file at most this many bytes (about 4 kB in the address) */
export const LINK_MAX_BYTES = 3_000
/** Where a link opens, and the key in its hash */
export const REPLAY_PATH = '/kart/replay'
const LINK_KEY = 'r'
const NAME_LENGTH = 40
const HEADER_BYTES = 16_000

/** What a file carries besides the replay */
export interface ReplayFileInfo {
  /** The track's revision when it was recorded (track.ts's `revision`, 1 when left out) */
  readonly revision: number
  /** The racers' names, by seat */
  readonly names: readonly { readonly seat: number; readonly name: string }[]
  /** The seat of whoever saved it, if they raced */
  readonly you: number | null
  /** When it was saved, ms since 1970 */
  readonly savedAt: number
  /** 2026-11-23: what each racer's driver wore, by seat (the race suit left out); none in older files */
  readonly outfits?: readonly { readonly seat: number; readonly outfit: OutfitId }[]
}

export interface ReplayFile extends ReplayFileInfo {
  readonly replay: Replay
}

/** Why a file could not be read */
export type ReplayFileProblem = 'notReplay' | 'version' | 'tooBig' | 'broken'

export type ReplayFileResult =
  | { readonly ok: true; readonly file: ReplayFile }
  | { readonly ok: false; readonly problem: ReplayFileProblem }

/** A name as it may be shown: no control characters, trimmed and cut short */
// eslint-disable-next-line no-control-regex
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, NAME_LENGTH)

function checkInfo(value: unknown): ReplayFileInfo | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const info = value as Record<string, unknown>
  const { revision, names, you, savedAt } = info
  if (!Number.isInteger(revision) || (revision as number) < 1 || (revision as number) > 999) return null
  if (!(you === null || (Number.isInteger(you) && (you as number) >= 0 && (you as number) < REPLAY_LIMITS.seats)))
    return null
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
  if (!Array.isArray(names) || names.length > REPLAY_LIMITS.seats) return null
  const kept: { seat: number; name: string }[] = []
  for (const one of names as unknown[]) {
    if (typeof one !== 'object' || one === null) return null
    const { seat, name } = one as Record<string, unknown>
    if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= REPLAY_LIMITS.seats) return null
    if (typeof name !== 'string' || name.length > NAME_LENGTH * 4) return null
    kept.push({ seat: seat as number, name: cleanName(name) })
  }
  const outfits = checkOutfits(info.outfits)
  return {
    revision: revision as number,
    names: kept,
    you: you as number | null,
    savedAt,
    ...(outfits.length > 0 ? { outfits } : {}),
  }
}

/**
 * The outfits a header names, those that make sense: a seat once each, an outfit this page knows.
 * Anything else is left out rather than the file refused (it only changes what a driver wears)
 */
function checkOutfits(value: unknown): { seat: number; outfit: OutfitId }[] {
  if (!Array.isArray(value)) return []
  const kept: { seat: number; outfit: OutfitId }[] = []
  for (const one of value.slice(0, REPLAY_LIMITS.seats) as unknown[]) {
    if (typeof one !== 'object' || one === null) continue
    const { seat, outfit } = one as Record<string, unknown>
    if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= REPLAY_LIMITS.seats) continue
    if (!isOutfitId(outfit) || kept.some((other) => other.seat === seat)) continue
    kept.push({ seat: seat as number, outfit })
  }
  return kept
}

/** The file's contents before deflating: header and replay */
export function packReplayFile(replay: Replay, info: ReplayFileInfo): Uint8Array {
  const header = new TextEncoder().encode(
    JSON.stringify({
      revision: info.revision,
      names: info.names.map(({ seat, name }) => ({ seat, name: cleanName(name) })),
      you: info.you,
      savedAt: info.savedAt,
      ...(info.outfits && info.outfits.length > 0
        ? { outfits: info.outfits.map(({ seat, outfit }) => ({ seat, outfit })) }
        : {}),
    }),
  )
  const blob = encodeReplay(replay)
  const body = new Uint8Array(4 + header.length + blob.length)
  new DataView(body.buffer).setUint32(0, header.length, true)
  body.set(header, 4)
  body.set(blob, 4 + header.length)
  return body
}

/** The header and replay in an inflated body */
export function unpackReplayFile(body: Uint8Array): ReplayFileResult {
  if (body.byteLength < 4) return { ok: false, problem: 'broken' }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const headerLength = view.getUint32(0, true)
  if (headerLength > HEADER_BYTES || 4 + headerLength > body.byteLength) return { ok: false, problem: 'broken' }
  let info: ReplayFileInfo | null
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      body.subarray(4, 4 + headerLength),
    )
    info = checkInfo(JSON.parse(text))
  } catch {
    return { ok: false, problem: 'broken' }
  }
  if (!info) return { ok: false, problem: 'broken' }
  const blob = body.subarray(4 + headerLength)
  if (blob[0] === REPLAY_MAGIC && blob[1] !== undefined && blob[1] > REPLAY_VERSION)
    return { ok: false, problem: 'version' }
  const replay = decodeReplay(blob)
  if (!replay) return { ok: false, problem: 'broken' }
  // The names are of the racers in it, and whoever saved it raced in it or is nobody
  const racing = new Set(replay.racers.map((racer) => racer.seat))
  const outfits = info.outfits?.filter((one) => racing.has(one.seat)) ?? []
  return {
    ok: true,
    file: {
      revision: info.revision,
      savedAt: info.savedAt,
      ...(outfits.length > 0 ? { outfits } : {}),
      names: info.names.filter((one) => racing.has(one.seat)),
      you: info.you !== null && racing.has(info.you) ? info.you : null,
      replay,
    },
  }
}

async function throughStream(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  most: number,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => undefined)
  void writer.close().catch(() => undefined)
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    // Past the limit, stopped at once: a small file that inflates without end is not read through
    if (total > most) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/** The whole file, deflated */
export async function writeReplayFile(replay: Replay, info: ReplayFileInfo): Promise<Uint8Array> {
  const body = packReplayFile(replay, info)
  const deflated = await throughStream(body, new CompressionStream('deflate-raw'), Infinity)
  const file = new Uint8Array(HEAD + deflated!.byteLength)
  file.set(MAGIC, 0)
  file[4] = FILE_VERSION
  file[5] = DEFLATED
  file.set(deflated!, HEAD)
  return file
}

/** A file's bytes read, or why not */
export async function readReplayFile(bytes: Uint8Array): Promise<ReplayFileResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, problem: 'tooBig' }
  if (bytes.byteLength < HEAD || MAGIC.some((byte, index) => bytes[index] !== byte))
    return { ok: false, problem: 'notReplay' }
  if (bytes[4] !== FILE_VERSION) return { ok: false, problem: 'version' }
  const flags = bytes[5]!
  if ((flags & ~DEFLATED) !== 0) return { ok: false, problem: 'broken' }
  const rest = bytes.subarray(HEAD)
  let body: Uint8Array | null
  if (flags & DEFLATED) {
    try {
      body = await throughStream(rest, new DecompressionStream('deflate-raw'), MAX_INFLATED_BYTES)
    } catch {
      return { ok: false, problem: 'broken' }
    }
    if (!body) return { ok: false, problem: 'tooBig' }
  } else body = rest
  return unpackReplayFile(body)
}

// ── A link ─────────────────────────────────────────────────────────────────────────────────────

const toBase64Url = (bytes: Uint8Array): string => {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/** A link that opens this file's replay, or null when the file is too big for one */
export function replayLink(origin: string, file: Uint8Array): string | null {
  if (file.byteLength > LINK_MAX_BYTES) return null
  return `${origin}${REPLAY_PATH}#${LINK_KEY}=${toBase64Url(file)}`
}

/** The file's bytes in a link's hash (`#r=…`); null when there are none or they are too many */
export function linkedReplay(hash: string): Uint8Array | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const text = params.get(LINK_KEY)
  if (!text || text.length > Math.ceil((LINK_MAX_BYTES * 4) / 3) + 4) return null
  return fromBase64Url(text)
}
