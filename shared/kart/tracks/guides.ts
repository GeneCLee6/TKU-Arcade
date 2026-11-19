// The guides of the tracks that have one (2026-11-19, guide.ts): the safe line, the line through
// the shortcuts and what that line asks of the hands. By track id; a track without one is driven
// by its road alone.
import type { TrackGuide } from './guide.ts'
import { WHARF_GUIDE } from './wharf.ts'

const GUIDES: Readonly<Record<string, TrackGuide>> = {
  wharf: WHARF_GUIDE,
}

export const trackGuide = (id: string): TrackGuide | undefined =>
  Object.hasOwn(GUIDES, id) ? GUIDES[id] : undefined
