// The guides of the tracks that have one (2026-11-19, guide.ts): the safe line, the line through
// the shortcuts and what that line asks of the hands. By track id; a track without one is driven
// by its road alone.
//
// 2026-11-20: a track with branches (shared/kart/branches.ts) has a second guide, for its route
// down every branch (`routeRoad`), by the route's own road points: src/kart/bots/routes.ts drives
// that route with it.
import { BREAKWATER_GUIDE, BREAKWATER_ROUTE_GUIDE } from './breakwater.ts'
import { NEEDLE_GUIDE } from './challenge.ts'
import { DANHAI_GUIDE, DANHAI_ROUTE_GUIDE } from './danhai.ts'
import type { TrackGuide } from './guide.ts'
import { HARBOUR_GUIDE } from './harbour.ts'
import { LANES_GUIDE } from './lanes.ts'
import { OLDSTREET_GUIDE, OLDSTREET_ROUTE_GUIDE } from './oldstreet.ts'
import { WHARF_GUIDE, WHARF_ROUTE_GUIDE } from './wharf.ts'
import { WORKS_GUIDE, WORKS_ROUTE_GUIDE } from './works.ts'
import { ZHUWEI_GUIDE, ZHUWEI_ROUTE_GUIDE } from './zhuwei.ts'

const GUIDES: Readonly<Record<string, TrackGuide>> = {
  // 2026-11-22: the drift jump into hairpin 2 (harbour.ts)
  harbour: HARBOUR_GUIDE,
  wharf: WHARF_GUIDE,
  lanes: LANES_GUIDE,
  // 2026-11-23 (#150): the drift jump over the old street home's step (oldstreet.ts)
  oldstreet: OLDSTREET_GUIDE,
  works: WORKS_GUIDE,
  zhuwei: ZHUWEI_GUIDE,
  // 2026-11-23: the high-platform track (breakwater.ts), and the night market's roofs (danhai.ts)
  breakwater: BREAKWATER_GUIDE,
  danhai: DANHAI_GUIDE,
  // 2026-11-21: the challenge mode's Needle Lane (challenge.ts): both lines through its slots
  'ch-needle': NEEDLE_GUIDE,
}

const ROUTE_GUIDES: Readonly<Record<string, TrackGuide>> = {
  // 2026-11-22: the lantern alley's doorway (oldstreet.ts)
  oldstreet: OLDSTREET_ROUTE_GUIDE,
  wharf: WHARF_ROUTE_GUIDE,
  works: WORKS_ROUTE_GUIDE,
  zhuwei: ZHUWEI_ROUTE_GUIDE,
  breakwater: BREAKWATER_ROUTE_GUIDE,
  danhai: DANHAI_ROUTE_GUIDE,
}

export const trackGuide = (id: string): TrackGuide | undefined =>
  Object.hasOwn(GUIDES, id) ? GUIDES[id] : undefined

/** The guide of a track's route down every branch, if it has one */
export const routeGuide = (id: string): TrackGuide | undefined =>
  Object.hasOwn(ROUTE_GUIDES, id) ? ROUTE_GUIDES[id] : undefined
