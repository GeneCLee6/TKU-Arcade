// #86 (2026-11-17): the item race's sounds for someone watching, live or in a replay. A racer hears
// only what happens to their own kart (hitFx.ts `cuesOf`); a watcher hears what happens around the
// kart being followed: each sound where it happens, softer the further it is from that kart, and
// the followed kart's own at full volume. A replay sounds only while it plays through an event's
// moment: never while the timeline is dragged or jumped, and at the fastest speed only what touches
// the followed kart, a few at most a frame. Pure: the views play what this decides (kartAudio.ts).
import { DRAWN_BEHIND_MS, type FxEvent, type ItemCue } from './hitFx.ts'

/** Full volume this close to the followed kart, m; nothing from this far off */
export const HEAR_NEAR_M = 20
export const HEAR_FAR_M = 150
/** Softer than this is not played */
export const QUIETEST = 0.05
/** A replay plays at most this many sounds a frame, loudest first */
export const REPLAY_CUES_PER_FRAME = 3
/** From this speed up a replay plays only the followed kart's sounds */
export const REPLAY_ONLY_FOLLOWED_FROM = 4

export interface HeardCue {
  readonly cue: ItemCue
  /** 0 to 1 */
  readonly volume: number
}

/** Where a kart is drawn now; nothing for one not drawn */
export type Where = (seat: number) => { readonly x: number; readonly z: number } | null | undefined

/** How loud a sound `distance` m from the followed kart is, 0 to 1: full nearby, fading out */
export function hearing(distance: number): number {
  if (!(distance >= 0)) return 0
  if (distance <= HEAR_NEAR_M) return 1
  if (distance >= HEAR_FAR_M) return 0
  const far = (distance - HEAR_NEAR_M) / (HEAR_FAR_M - HEAR_NEAR_M)
  return (1 - far) ** 2
}

/** The sounds someone watching `follow` hears of one event (none while following nobody) */
export function watchCuesOf(event: FxEvent, follow: number | null, where: Where): HeardCue[] {
  if (follow === null) return []
  const listener = where(follow)
  const heard: HeardCue[] = []
  const at = (seat: number, cue: ItemCue) => {
    if (seat === follow) {
      heard.push({ cue, volume: 1 })
      return
    }
    const there = where(seat)
    if (!listener || !there) return
    const volume = hearing(Math.hypot(there.x - listener.x, there.z - listener.z))
    if (volume >= QUIETEST) heard.push({ cue, volume })
  }
  if (event.hit) {
    const target = event.targets[0]
    if (target === undefined) return heard
    const stopped = event.blocked.includes(target)
    at(target, { kind: stopped ? 'pop' : 'hit' })
    // The followed kart's shot landed on someone: its thrower's ding
    if (!stopped && event.by === follow && target !== follow) {
      heard.push({ cue: { kind: 'landed' }, volume: 1 })
    }
    return heard
  }
  at(event.by, { kind: 'use', item: event.item })
  for (const seat of event.blocked) at(seat, { kind: 'pop' })
  return heard
}

/** Whether an event touches the followed kart: used by it, aimed at it, or hit it */
const touches = (event: FxEvent, follow: number | null): boolean =>
  follow !== null && (event.by === follow || event.targets.includes(follow))

/**
 * A replay frame's sounds: the events whose moment (`at`, ms from GO) the playhead played through
 * from `from` to `to`. `from` null: it did not play through (the first frame, paused, a drag or a
 * jump), so nothing. At `speed` REPLAY_ONLY_FOLLOWED_FROM and up only the followed kart's; at most
 * REPLAY_CUES_PER_FRAME, loudest first
 */
export function replayCues(
  events: readonly FxEvent[],
  from: number | null,
  to: number,
  speed: number,
  follow: number | null,
  where: Where,
): HeardCue[] {
  if (from === null || !(to > from)) return []
  const heard: HeardCue[] = []
  for (const event of events) {
    if (event.at <= from || event.at > to) continue
    if (speed >= REPLAY_ONLY_FOLLOWED_FROM && !touches(event, follow)) continue
    heard.push(...watchCuesOf(event, follow, where))
  }
  return heard.sort((a, b) => b.volume - a.volume).slice(0, REPLAY_CUES_PER_FRAME)
}

/**
 * A live watcher's ears: reads the room's events as they come, each once, and lets each sound when
 * its kart is drawn there (`behind` after it was heard of, as hitFx.ts `liveStart` shows the spin)
 */
export interface WatchEars {
  /** The events now in the room, at `now` (server clock): the sounds due now */
  read(
    events: readonly (FxEvent & { readonly n: number })[],
    now: number,
    follow: number | null,
    where: Where,
  ): HeardCue[]
}

export function createWatchEars(start: number, behind = DRAWN_BEHIND_MS): WatchEars {
  let next = start
  let waiting: { event: FxEvent; due: number }[] = []
  return {
    read(events, now, follow, where) {
      for (const event of events) {
        if (event.n < next) continue
        next = event.n + 1
        waiting.push({ event, due: Math.max(event.at, now + behind) })
      }
      const due = waiting.filter((one) => one.due <= now)
      waiting = waiting.filter((one) => one.due > now)
      return due.flatMap((one) => watchCuesOf(one.event, follow, where))
    },
  }
}
