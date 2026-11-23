// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): a race's highlights, picked from its replay
// once it is over. Every overtake that stuck, every hit, every long flight off a jump, the winner's
// crossing and the closest finish are found, each scored; the best three to five that do not overlap
// are kept, in the order they happened, each a few seconds either side of its moment. The results
// offer them ("Watch highlights"), played with the broadcast's director favouring each one's kart.
//
// Pure: the replay's own data (shared/kart/replay.ts) and the track, nothing else; tested in
// tests/kart/highlights.test.ts.
import { CONFIRM_SECONDS, type ForeseenPass, type Passings } from './broadcast.ts'
import { gatesPassed } from './race.ts'
import type { Track } from './track.ts'
import { msToTicks, sampleAt, TICKS_PER_SECOND, type ReplayReel } from './replay.ts'
import { watchOrder } from './watch.ts'

export type HighlightKind = 'overtake' | 'hit' | 'jump' | 'battle' | 'finish' | 'photoFinish'

export interface Highlight {
  readonly kind: HighlightKind
  /** The kart it is about */
  readonly seat: number
  /** The other one: the kart passed, the thrower, the one beaten to the line */
  readonly other: number | null
  /** Its moment, and the clip around it, in replay ticks */
  readonly at: number
  readonly from: number
  readonly to: number
  readonly score: number
}

/** At most and (where the race has them) at least this many */
export const MAX_HIGHLIGHTS = 5
export const MIN_HIGHLIGHTS = 3
/** A clip starts this long before its moment and ends this long after, seconds */
export const LEAD_SECONDS = 3.5
export const TAIL_SECONDS = 2.5
/** Places are read this often, ticks (a quarter of a second) */
const STEP = TICKS_PER_SECOND / 4
/** An overtake counts when the new order holds this long, seconds */
const STICK_SECONDS = 1
/** The race's first seconds shuffle the places */
const SETTLE_SECONDS = 4
/** A flight this long or longer, seconds */
const FLIGHT_SECONDS = 0.5
/** A finish this close (seconds between two karts) is a photo finish */
export const PHOTO_SECONDS = 1.2
/** Two karts this near for this long make a fight worth showing, when there is little else */
const BATTLE_METRES = 8
const BATTLE_SECONDS = 2

/** The places at `tick`: a finish counts from its moment on */
export function replayOrderAt(
  track: Pick<Track, 'gates'>,
  reel: ReplayReel,
  tick: number,
): number[] {
  return watchOrder(
    track,
    reel.replay.racers.map((racer) => ({
      seat: racer.seat,
      finishMs:
        racer.finishMs !== null && msToTicks(racer.finishMs) <= tick ? racer.finishMs : null,
      out: racer.out && tick >= (reel.samples.get(racer.seat)?.at(-1)?.tick ?? 0),
    })),
    (seat) => {
      const samples = reel.samples.get(seat)
      return samples ? sampleAt(samples, tick) : null
    },
  )
}

/**
 * Each kart's time (seconds from GO) at each gate of the race, from its samples: the broadcast's gaps
 * in a replay, worked out once, so that they are right wherever the replay is sought to
 */
export function replayPassings(track: Pick<Track, 'gates'>, reel: ReplayReel): Passings {
  const passings = new Map<number, number[]>()
  for (const [seat, samples] of reel.samples) {
    const times: number[] = []
    for (const sample of samples) {
      if (sample.nextGate >= track.gates.length) continue
      const passed = gatesPassed(sample.crossings, sample.nextGate, track.gates.length)
      while (times.length <= passed) times.push(Math.max(0, sample.tick) / TICKS_PER_SECOND)
    }
    passings.set(seat, times)
  }
  return passings
}

/** The places are read this often to foresee the passes, ticks (a watch page's frame at 30 a second) */
const FORESEE_STEP = 2
/** The same two swapping back within this long is not a pass (the director's rule) */
const FORESEE_ECHO_SECONDS = 4

/**
 * Every overtake of the replay as the broadcast's director confirms one (a swap of neighbouring
 * places that holds CONFIRM_SECONDS, not the same two straight back, neither home), at the moment of
 * the swap: the future a director watching the replay knows (2026-11-23, broadcast.ts `foreseen`)
 */
export function foreseePasses(track: Pick<Track, 'gates'>, reel: ReplayReel): ForeseenPass[] {
  const found: ForeseenPass[] = []
  if (reel.samples.size === 0) return found
  const finishTick = (seat: number) => {
    const ms = reel.replay.racers.find((racer) => racer.seat === seat)?.finishMs
    return ms === null || ms === undefined ? Infinity : msToTicks(ms)
  }
  let previous: number[] | null = null
  let pending: ForeseenPass[] = []
  for (let tick = Math.max(reel.start, 0); tick <= reel.end; tick += FORESEE_STEP) {
    const time = tick / TICKS_PER_SECOND
    const order = replayOrderAt(track, reel, tick)
    if (previous && time >= SETTLE_SECONDS) {
      for (let i = 0; i + 1 < order.length; i++) {
        const seat = order[i]!
        const behind = order[i + 1]!
        if (finishTick(seat) <= tick || finishTick(behind) <= tick) continue
        const was = previous.indexOf(seat)
        const wasBehind = previous.indexOf(behind)
        if (was < 0 || wasBehind < 0 || was < wasBehind) continue
        const undone = pending.findIndex((one) => one.seat === behind && one.other === seat)
        const echo = found.some(
          (one) => one.seat === behind && one.other === seat && time - one.at < FORESEE_ECHO_SECONDS,
        )
        if (undone >= 0) pending.splice(undone, 1)
        else if (!echo) pending.push({ seat, other: behind, at: time })
      }
    }
    pending = pending.filter((one) => {
      if (time - one.at < CONFIRM_SECONDS) return true
      const place = order.indexOf(one.seat)
      if (place >= 0 && place < order.indexOf(one.other) && finishTick(one.seat) > tick) found.push(one)
      return false
    })
    previous = order
  }
  return found
}

/** Every moment worth showing, unscored by overlap: the candidates */
export function highlightMoments(track: Pick<Track, 'gates'>, reel: ReplayReel): Highlight[] {
  const found: Highlight[] = []
  const { replay } = reel
  const clip = (kind: HighlightKind, seat: number, other: number | null, at: number, score: number) => {
    const lead = kind === 'finish' || kind === 'photoFinish' ? LEAD_SECONDS + 0.5 : LEAD_SECONDS
    found.push({
      kind,
      seat,
      other,
      at,
      from: Math.max(reel.start, at - lead * TICKS_PER_SECOND),
      to: Math.min(reel.end, at + TAIL_SECONDS * TICKS_PER_SECOND),
      score,
    })
  }
  if (reel.samples.size === 0) return found
  const finishTick = (seat: number) => {
    const ms = replay.racers.find((racer) => racer.seat === seat)?.finishMs
    return ms === null || ms === undefined ? Infinity : msToTicks(ms)
  }
  const lastLapFrom = (() => {
    // Roughly: the leader's last lap starts when it has done laps − 1 of them
    const winner = [...replay.racers]
      .filter((racer) => racer.finishMs !== null)
      .sort((a, b) => (a.finishMs as number) - (b.finishMs as number))[0]
    if (!winner || replay.laps < 2) return Infinity
    const done = winner.lapMs.slice(0, replay.laps - 1).reduce((sum, ms) => sum + ms, 0)
    return msToTicks(done)
  })()

  // Overtakes: a pair that swaps and stays swapped, neither home yet
  const stick = STICK_SECONDS * TICKS_PER_SECOND
  let previous: number[] | null = null
  const orders: { tick: number; order: number[] }[] = []
  for (let tick = Math.max(reel.start, 0); tick <= reel.end; tick += STEP) {
    orders.push({ tick, order: replayOrderAt(track, reel, tick) })
  }
  const placeIn = (order: readonly number[], seat: number) => order.indexOf(seat)
  for (const { tick, order } of orders) {
    if (previous && tick >= SETTLE_SECONDS * TICKS_PER_SECOND) {
      for (let i = 0; i + 1 < order.length; i++) {
        const seat = order[i]!
        const other = order[i + 1]!
        const was = placeIn(previous, seat)
        const wasOther = placeIn(previous, other)
        if (was < 0 || wasOther < 0 || was < wasOther) continue
        if (finishTick(seat) <= tick || finishTick(other) <= tick) continue
        // Still ahead a moment later
        const later = orders.find((one) => one.tick >= tick + stick) ?? orders[orders.length - 1]
        if (!later || placeIn(later.order, seat) > placeIn(later.order, other)) continue
        // And not undone and redone a moment ago (the same pair swapping back and forth)
        const echo = found.some(
          (one) =>
            one.kind === 'overtake' &&
            ((one.seat === seat && one.other === other) || (one.seat === other && one.other === seat)) &&
            tick - one.at < 3 * TICKS_PER_SECOND,
        )
        if (echo) continue
        const forLead = i === 0
        clip('overtake', seat, other, tick, 50 + (forLead ? 20 : 0) + (tick >= lastLapFrom ? 10 : 0))
      }
    }
    previous = order
  }

  // Hits: an item that landed on someone
  for (const event of replay.events) {
    if (!event.hit || event.targets.length === 0) continue
    const target = event.targets[0]!
    const leaderHit = orders.find((one) => one.tick >= event.tick)?.order[0] === target
    clip('hit', target, event.by, event.tick, 45 + (leaderHit ? 15 : 0))
  }

  // Flights off a jump: where the replay knows when a kart was in the air
  if (replay.airborne) {
    for (const [seat, samples] of reel.samples) {
      let up: number | null = null
      for (const sample of samples) {
        if (sample.airborne && up === null) up = sample.tick
        if (!sample.airborne && up !== null) {
          const seconds = (sample.tick - up) / TICKS_PER_SECOND
          if (seconds >= FLIGHT_SECONDS) clip('jump', seat, null, up, 25 + Math.min(20, seconds * 12))
          up = null
        }
      }
    }
  }

  // The finish: the winner's crossing, and the closest two home
  const home = replay.racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
  let photo: { seat: number; other: number; gap: number; at: number } | null = null
  for (let i = 0; i + 1 < home.length; i++) {
    const gap = ((home[i + 1]!.finishMs as number) - (home[i]!.finishMs as number)) / 1000
    if (gap <= PHOTO_SECONDS && (!photo || gap < photo.gap)) {
      // About the one that held on; the clip runs on to the other's crossing
      photo = { seat: home[i]!.seat, other: home[i + 1]!.seat, gap, at: msToTicks(home[i + 1]!.finishMs as number) }
    }
  }
  const winner = home[0]
  if (photo && winner && photo.seat === winner.seat) {
    // The winner's own crossing is the photo finish
    clip('photoFinish', winner.seat, photo.other, photo.at, 95 - photo.gap * 20)
  } else {
    if (winner) clip('finish', winner.seat, null, msToTicks(winner.finishMs as number), 70)
    if (photo) clip('photoFinish', photo.seat, photo.other, photo.at, 85 - photo.gap * 20)
  }

  // Fights: two karts this near for a while (only shown when there is little else)
  const battleTicks = BATTLE_SECONDS * TICKS_PER_SECOND
  const near = new Map<string, number>()
  for (const { tick, order } of orders) {
    if (tick < SETTLE_SECONDS * TICKS_PER_SECOND) continue
    const now = new Set<string>()
    for (let i = 0; i + 1 < order.length; i++) {
      const a = order[i]!
      const b = order[i + 1]!
      if (finishTick(a) <= tick || finishTick(b) <= tick) continue
      const sa = reel.samples.get(a)
      const sb = reel.samples.get(b)
      const pa = sa ? sampleAt(sa, tick) : null
      const pb = sb ? sampleAt(sb, tick) : null
      if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.z - pb.z) > BATTLE_METRES) continue
      const key = `${b}:${a}`
      now.add(key)
      const since = near.get(key) ?? tick
      near.set(key, since)
      if (tick - since === battleTicks) clip('battle', b, a, tick, 15 + (i === 0 ? 5 : 0))
    }
    for (const key of [...near.keys()]) if (!now.has(key)) near.delete(key)
  }
  return found
}

/**
 * The race's highlights: the best moments that do not overlap, MAX_HIGHLIGHTS at most, in the order
 * they happened. The finish (or the photo finish) is always one where there was one
 */
export function pickHighlights(track: Pick<Track, 'gates'>, reel: ReplayReel): Highlight[] {
  const moments = highlightMoments(track, reel).sort(
    (a, b) => b.score - a.score || a.at - b.at || a.seat - b.seat,
  )
  const chosen: Highlight[] = []
  const margin = TICKS_PER_SECOND
  const clear = (one: Highlight) =>
    chosen.every((other) => one.to + margin <= other.from || other.to + margin <= one.from)
  const finish = moments.find((one) => one.kind === 'finish' || one.kind === 'photoFinish')
  if (finish) chosen.push(finish)
  for (const one of moments) {
    if (chosen.length >= MAX_HIGHLIGHTS) break
    if (one === finish || one.kind === 'battle') continue
    if (clear(one)) chosen.push(one)
  }
  // A quiet race: the fights fill it up to MIN_HIGHLIGHTS
  for (const one of moments) {
    if (chosen.length >= MIN_HIGHLIGHTS) break
    if (one.kind === 'battle' && clear(one)) chosen.push(one)
  }
  return chosen.sort((a, b) => a.at - b.at)
}
