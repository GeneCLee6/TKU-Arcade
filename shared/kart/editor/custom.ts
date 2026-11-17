// e10-t08: a track from the editor in a race. A room's `track` is `custom:<code>` (codec.ts), and
// whoever needs the track (the Worker judging laps, every browser drawing it) rebuilds it from the
// code with the same pure functions, so all agree on the gates. Nothing in a code is trusted: it is
// decoded with its size capped, built, checked as the editor checks (build.ts), and the result
// checked once more as any track file is (`parseTrack`). A code that fails any of it is no track.
import { parseTrack, type Track } from '../track.ts'
import { buildSpec, type Problem } from './build.ts'
import { decodeSpec, MAX_CODE_CHARS } from './codec.ts'
import type { TrackSpec } from './spec.ts'

/** A race's `track` for a custom track starts with this, the code after it */
export const CUSTOM_PREFIX = 'custom:'

export const isCustomId = (id: string): boolean => id.startsWith(CUSTOM_PREFIX)

export type CustomResult =
  | { readonly ok: true; readonly track: Track; readonly spec: TrackSpec; readonly length: number }
  | { readonly ok: false; readonly reason: 'code' | 'track'; readonly problems: readonly Problem[] }

/** Tracks built lately, by code: building one checks every pair of road points */
const known = new Map<string, CustomResult>()
const KEEP = 16

function build(code: string): CustomResult {
  const spec = decodeSpec(code)
  if (!spec) return { ok: false, reason: 'code', problems: [] }
  const built = buildSpec(spec)
  if (built.problems.length > 0) return { ok: false, reason: 'track', problems: built.problems }
  const parsed = parseTrack(built.track)
  if ('problems' in parsed) return { ok: false, reason: 'track', problems: [] }
  return { ok: true, track: parsed.track, spec, length: built.length }
}

/** The track in a code, checked; or why it is none */
export function customTrack(code: string): CustomResult {
  // Far too long to be one: refused before it is read or kept
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) {
    return { ok: false, reason: 'code', problems: [] }
  }
  const cached = known.get(code)
  if (cached) return cached
  const result = build(code)
  if (known.size >= KEEP) known.delete(known.keys().next().value!)
  known.set(code, result)
  return result
}

/** Whether a code is a legal track: the room's check on a host's choice (rules.ts) */
export const isTrackCode = (code: string): boolean => customTrack(code).ok
