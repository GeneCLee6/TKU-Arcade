// e10-t07: a track made in the editor travels as a link, `/kart?custom=<code>` (the code is
// shared/kart/editor/codec.ts's). These read one back from an address or from whatever someone
// pasted: the whole link, the address without the site, or the code alone.
import { CODE_PATTERN, MAX_CODE_CHARS } from '../../../shared/kart/editor/codeShape.ts'

/** The query parameter a shared track rides in */
export const CUSTOM_PARAM = 'custom'

/** The address that opens the track in a time trial, on this site */
export function shareLink(code: string, origin = window.location.origin): string {
  return `${origin}/kart?${CUSTOM_PARAM}=${code}`
}

/** The code in a pasted link or code, or null when there is none to be read */
export function codeFromText(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (trimmed.length <= MAX_CODE_CHARS && CODE_PATTERN.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed, 'https://example.invalid')
    const code = url.searchParams.get(CUSTOM_PARAM)
    return code && code.length <= MAX_CODE_CHARS && CODE_PATTERN.test(code) ? code : null
  } catch {
    return null
  }
}

/** The code in this page's address, if it has one (malformed or not: the caller checks) */
export function codeInAddress(search = window.location.search): string | null {
  return new URLSearchParams(search).get(CUSTOM_PARAM)
}
