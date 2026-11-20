// The guides of the tracks that have one (2026-11-19, guide.ts): the safe line, the line through
// the shortcuts and what that line asks of the hands. By track id; a track without one is driven
// by its road alone.
//
// 2026-11-20: a track with branches (shared/kart/branches.ts) has a second guide, for its route
// down every branch (`routeRoad`), by the route's own road points: src/kart/bots/routes.ts drives
// that route with it.
import type { TrackGuide } from './guide.ts'
import { LANES_GUIDE } from './lanes.ts'
import { WHARF_GUIDE, WHARF_ROUTE_GUIDE } from './wharf.ts'
import { WORKS_GUIDE, WORKS_ROUTE_GUIDE } from './works.ts'

const GUIDES: Readonly<Record<string, TrackGuide>> = {
  wharf: WHARF_GUIDE,
  lanes: LANES_GUIDE,
  works: WORKS_GUIDE,
}

const ROUTE_GUIDES: Readonly<Record<string, TrackGuide>> = {
  wharf: WHARF_ROUTE_GUIDE,
  works: WORKS_ROUTE_GUIDE,
}

export const trackGuide = (id: string): TrackGuide | undefined =>
  Object.hasOwn(GUIDES, id) ? GUIDES[id] : undefined

/** The guide of a track's route down every branch, if it has one */
export const routeGuide = (id: string): TrackGuide | undefined =>
  Object.hasOwn(ROUTE_GUIDES, id) ? ROUTE_GUIDES[id] : undefined
