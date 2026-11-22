// e10-t07, e10-t08: a track spec as a short code for a link (`/kart?custom=<code>`), a save and a
// room's options: compact JSON in base64url. Codes come from anyone (a pasted link, the network), so
// `decodeSpec` takes nothing on trust: a size cap before anything is read, then every field checked,
// every number finite, in range and kept to a tenth. Pure; the browser and the Worker both have
// TextEncoder, btoa and atob.
import { CODE_PATTERN, MAX_CODE_CHARS } from './codeShape.ts'
import {
  BYPASS_FEATURES,
  LIMITS,
  PAD_PLACES,
  TRACK_THEMES,
  tenth,
  type Bypass,
  type PadPlace,
  type Piece,
  type TrackSpec,
  type TrackTheme,
} from './spec.ts'

export { CODE_PATTERN, MAX_CODE_CHARS }

/** The code's own version, its first field */
export const CODE_VERSION = 1
// 2026-11-17: slopes ('u') and jumps ('j') are new tuples; a code without them is exactly what it
// was, so every old code reads as before (and keeps its hash, its records and its ghost)
type PieceTuple =
  | readonly ['s', number, number, number, number]
  | readonly ['t', number, number, number, number, number]
  | readonly ['u', number, number, number, number, number]
  | readonly ['j', number, number, number]
  // 2026-11-22: a banked bend ('b', a turn and its lean) and a straight over or under ('o')
  | readonly ['b', number, number, number, number, number, number]
  | readonly ['o', number, number, number, number, number]

const padIndex = (pad: PadPlace) => PAD_PLACES.indexOf(pad)

function pieceTuple(piece: Piece): PieceTuple {
  const pad = padIndex(piece.pad)
  const boxes = piece.boxes ? 1 : 0
  switch (piece.kind) {
    case 'straight':
      return ['s', tenth(piece.length), tenth(piece.width), pad, boxes]
    case 'turn':
      return piece.bank
        ? [
            'b',
            tenth(piece.angle),
            tenth(piece.radius),
            tenth(piece.width),
            pad,
            boxes,
            tenth(piece.bank),
          ]
        : ['t', tenth(piece.angle), tenth(piece.radius), tenth(piece.width), pad, boxes]
    case 'overpass':
      return ['o', tenth(piece.length), tenth(piece.rise), tenth(piece.width), pad, boxes]
    case 'slope':
      return ['u', tenth(piece.length), tenth(piece.rise), tenth(piece.width), pad, boxes]
    case 'jump':
      return ['j', tenth(piece.length), tenth(piece.height), tenth(piece.width)]
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string | null {
  try {
    const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return null
  }
}

/** The name as kept: control characters out, spaces trimmed, at most LIMITS.maxName characters */
export function cleanName(name: string): string {
  const plain = Array.from(name)
    .filter((char) => {
      const code = char.codePointAt(0)!
      // Control characters, and the two line breaks JSON lets through
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f) && code !== 0x2028 && code !== 0x2029
    })
    .join('')
    .trim()
  return Array.from(plain).slice(0, LIMITS.maxName).join('').trim()
}

type BypassTuple =
  | readonly [number, number, number, number, number]
  | readonly [number, number, number, number, number, number]

// 2026-11-22: what stands on it, a sixth number (1 a jump, 2 a wall, 3 a slot) only when it has one
const bypassTuple = (bypass: Bypass): BypassTuple =>
  bypass.feature
    ? [
        bypass.from,
        bypass.to,
        bypass.side,
        tenth(bypass.offset),
        tenth(bypass.width),
        BYPASS_FEATURES.indexOf(bypass.feature) + 1,
      ]
    : [bypass.from, bypass.to, bypass.side, tenth(bypass.offset), tenth(bypass.width)]

/**
 * The pieces alone, as the code has them: what a track's records are kept by (`specHash`). With
 * bypasses (2026-11-20) those too; a layout without any keys exactly as it always did
 */
export const piecesKey = (pieces: readonly Piece[], bypasses?: readonly Bypass[]): string =>
  bypasses && bypasses.length > 0
    ? JSON.stringify([pieces.map(pieceTuple), bypasses.map(bypassTuple)])
    : JSON.stringify(pieces.map(pieceTuple))

export function encodeSpec(spec: TrackSpec): string {
  return toBase64Url(
    JSON.stringify({
      v: CODE_VERSION,
      n: cleanName(spec.name),
      t: spec.theme,
      p: spec.pieces.map(pieceTuple),
      ...(spec.bypasses && spec.bypasses.length > 0 ? { b: spec.bypasses.map(bypassTuple) } : {}),
    }),
  )
}

/** A whole number from `min` to `max`, or a number kept to a tenth in that range; else null */
function numberIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-6) return null
  const kept = tenth(value)
  return kept >= min && kept <= max ? kept : null
}

function readPiece(value: unknown): Piece | null {
  if (!Array.isArray(value)) return null
  const extra = (pad: unknown, boxes: unknown) => {
    const place = typeof pad === 'number' && Number.isInteger(pad) ? PAD_PLACES[pad] : undefined
    if (place === undefined || (boxes !== 0 && boxes !== 1)) return null
    return { pad: place, boxes: boxes === 1 }
  }
  if (value[0] === 's' && value.length === 5) {
    const length = numberIn(value[1], LIMITS.minLength, LIMITS.maxLength)
    const width = numberIn(value[2], LIMITS.minWidth, LIMITS.maxWidth)
    const more = extra(value[3], value[4])
    if (length === null || width === null || !more) return null
    return { kind: 'straight', length, width, ...more }
  }
  if (value[0] === 't' && value.length === 6) {
    const angle = numberIn(value[1], -LIMITS.maxAngle, LIMITS.maxAngle)
    const radius = numberIn(value[2], LIMITS.minRadius, LIMITS.maxRadius)
    const width = numberIn(value[3], LIMITS.minWidth, LIMITS.maxWidth)
    const more = extra(value[4], value[5])
    if (angle === null || angle === 0 || radius === null || width === null || !more) return null
    return { kind: 'turn', angle, radius, width, ...more }
  }
  if (value[0] === 'u' && value.length === 6) {
    const length = numberIn(value[1], LIMITS.minSlope, LIMITS.maxLength)
    const rise = numberIn(value[2], -LIMITS.maxRise, LIMITS.maxRise)
    const width = numberIn(value[3], LIMITS.minWidth, LIMITS.maxWidth)
    const more = extra(value[4], value[5])
    if (length === null || rise === null || rise === 0 || width === null || !more) return null
    return { kind: 'slope', length, rise, width, ...more }
  }
  if (value[0] === 'b' && value.length === 7) {
    const angle = numberIn(value[1], -LIMITS.maxAngle, LIMITS.maxAngle)
    const radius = numberIn(value[2], LIMITS.minRadius, LIMITS.maxRadius)
    const width = numberIn(value[3], LIMITS.minWidth, LIMITS.maxWidth)
    const more = extra(value[4], value[5])
    const bank = numberIn(value[6], 0.1, LIMITS.maxBank)
    if (angle === null || angle === 0 || radius === null || width === null || !more || bank === null)
      return null
    return { kind: 'turn', angle, radius, width, ...more, bank }
  }
  if (value[0] === 'o' && value.length === 6) {
    const length = numberIn(value[1], LIMITS.minOverpass, LIMITS.maxOverpass)
    const rise = numberIn(value[2], -LIMITS.maxOverpassRise, LIMITS.maxOverpassRise)
    const width = numberIn(value[3], LIMITS.minWidth, LIMITS.maxWidth)
    const more = extra(value[4], value[5])
    if (length === null || rise === null || Math.abs(rise) < LIMITS.minOverpassRise) return null
    if (width === null || !more) return null
    return { kind: 'overpass', length, rise, width, ...more }
  }
  if (value[0] === 'j' && value.length === 4) {
    const length = numberIn(value[1], LIMITS.minJump, LIMITS.maxJump)
    const height = numberIn(value[2], LIMITS.minJumpHeight, LIMITS.maxJumpHeight)
    const width = numberIn(value[3], LIMITS.minWidth, LIMITS.maxWidth)
    if (length === null || height === null || width === null) return null
    return { kind: 'jump', length, height, width, pad: 'none', boxes: false }
  }
  return null
}

/**
 * The spec in a code, or null for anything that is not one: too long, not base64url, not JSON, a
 * field missing, out of range or not a number. Whether the pieces make a legal track is build.ts's
 */
export function decodeSpec(code: string): TrackSpec | null {
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS || !CODE_PATTERN.test(code)) {
    return null
  }
  const text = fromBase64Url(code)
  if (text === null) return null
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const { v, n, t, p, b } = json as Record<string, unknown>
  if (v !== CODE_VERSION || typeof n !== 'string' || typeof t !== 'string') return null
  if (!TRACK_THEMES.includes(t as TrackTheme)) return null
  if (!Array.isArray(p) || p.length < LIMITS.minPieces || p.length > LIMITS.maxPieces) return null
  const pieces: Piece[] = []
  for (const item of p) {
    const piece = readPiece(item)
    if (!piece) return null
    pieces.push(piece)
  }
  // Bypasses (2026-11-20): a whole number of pieces each end, inside the loop; checked as a road by build.ts
  let bypasses: Bypass[] | undefined
  if (b !== undefined) {
    if (!Array.isArray(b) || b.length < 1 || b.length > LIMITS.maxBypasses) return null
    bypasses = []
    for (const item of b) {
      const bypass = readBypass(item, pieces.length)
      if (!bypass) return null
      bypasses.push(bypass)
    }
  }
  return {
    name: cleanName(n),
    theme: t as TrackTheme,
    pieces,
    ...(bypasses ? { bypasses } : {}),
  }
}

function readBypass(value: unknown, pieces: number): Bypass | null {
  if (!Array.isArray(value) || (value.length !== 5 && value.length !== 6)) return null
  const [from, to, side, offset, width, kind] = value as unknown[]
  const feature =
    value.length === 6 && Number.isInteger(kind) ? BYPASS_FEATURES[(kind as number) - 1] : undefined
  if (value.length === 6 && !feature) return null
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null
  if ((from as number) < 0 || (to as number) < (from as number) || (to as number) >= pieces - 1) {
    return null
  }
  if (side !== -1 && side !== 1) return null
  const off = numberIn(offset, LIMITS.minBypassOffset, LIMITS.maxBypassOffset)
  const wide = numberIn(width, LIMITS.minBypassWidth, LIMITS.maxBypassWidth)
  if (off === null || wide === null) return null
  return {
    from: from as number,
    to: to as number,
    side,
    offset: off,
    width: wide,
    ...(feature ? { feature } : {}),
  }
}

/**
 * A short hash of the pieces (cyrb53, base 36): the same layout has the same one, whatever it is
 * called or drawn like, so its records and ghost follow it from link to link
 */
export function specHash(pieces: readonly Piece[], bypasses?: readonly Bypass[]): string {
  const text = piecesKey(pieces, bypasses)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index++) {
    const char = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ char, 2654435761)
    h2 = Math.imul(h2 ^ char, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
