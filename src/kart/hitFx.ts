// 2026-11-17 (owner, after e9-t06b and e10-t05): what a hit looks and sounds like. A kart stunned by
// a shot only slowed down before; now it spins round and hops where everyone can see it, stars burst
// where it was hit, and a shield that stopped a shot pops. Looks only: the kart's position, heading
// and physics are untouched (the spin is added to the drawn model, then unwound).
//
// Everything here is pure and works from the room's item events alone, so a racer, a spectator and
// a replay derive the same effects: live from `KartView.events` (server ms), a replay from its
// recorded events (ticks turned into ms). No three.js and no WebAudio here: Scene.ts and
// kartAudio.ts draw and play what this decides.
import type { ItemId } from '../../shared/kart/items.ts'
import { isShotItem, SHOT_TUNING, type ShotItem } from '../../shared/kart/shots.ts'

/** An item event as the room keeps it (KartItemEvent), or a replay's with its time in ms */
export interface FxEvent {
  readonly item: ItemId
  readonly by: number
  readonly targets: readonly number[]
  readonly blocked: readonly number[]
  /** When, ms: the server's clock live, ms from GO in a replay */
  readonly at: number
  /** A shot that hit (e9-t06b); a use otherwise */
  readonly hit?: boolean
}

/** What a kart shows: a spin and hop after a hit, or a bubble popping */
export type HitEffect =
  | {
      readonly kind: 'spin'
      readonly seat: number
      readonly at: number
      /** As long as the stun */
      readonly ms: number
      readonly item: ShotItem
    }
  | { readonly kind: 'pop'; readonly seat: number; readonly at: number }

/** A sound for this browser's racer: an item taken or used, a hit taken or landed, a bubble popped */
export type ItemCue =
  | { readonly kind: 'pickup' }
  | { readonly kind: 'use'; readonly item: ItemId }
  | { readonly kind: 'hit' }
  | { readonly kind: 'landed' }
  | { readonly kind: 'pop' }

/** The model's offset from where the physics has it: turned round, lifted, rolled */
export interface SpinPose {
  /** Radians added to the heading */
  readonly yaw: number
  /** Metres up */
  readonly lift: number
  /** Radians of roll */
  readonly roll: number
}

/** The id a scene gives this browser's own kart among the spins (Scene.ts `hits`) */
export const OWN_KART = -1

export const STILL_SPIN: SpinPose = { yaw: 0, lift: 0, roll: 0 }

/** Full turns a hit spins the kart through, by the end of the stun */
export const SPIN_TURNS = 2
/** How high the first hop goes, m, and how many hops in a stun */
export const HOP_HEIGHT = 0.9
const HOPS = 3
/** The roll's swing, radians */
const ROLL = 0.28
/** The camera's shake at the start of a hit, m; it dies away over the stun */
export const SHAKE = 0.32

/** The effects one event leaves on the karts */
export function effectsOf(event: FxEvent): HitEffect[] {
  if (event.hit) {
    const seat = event.targets[0]
    if (seat === undefined) return []
    if (event.blocked.includes(seat)) return [{ kind: 'pop', seat, at: event.at }]
    if (!isShotItem(event.item)) return []
    return [
      { kind: 'spin', seat, at: event.at, ms: SHOT_TUNING.stunMs[event.item], item: event.item },
    ]
  }
  // A headwind or a swap stopped by a bubble pops it too
  return event.blocked.map((seat) => ({ kind: 'pop', seat, at: event.at }) as const)
}

/** The sounds one event makes for the racer in `seat` (null: watching, no sounds) */
export function cuesOf(event: FxEvent, seat: number | null): ItemCue[] {
  if (seat === null) return []
  const cues: ItemCue[] = []
  if (event.hit) {
    const target = event.targets[0]
    if (target === undefined) return cues
    const stopped = event.blocked.includes(target)
    if (target === seat) cues.push({ kind: stopped ? 'pop' : 'hit' })
    else if (event.by === seat && !stopped) cues.push({ kind: 'landed' })
    return cues
  }
  if (event.by === seat) cues.push({ kind: 'use', item: event.item })
  if (event.blocked.includes(seat)) cues.push({ kind: 'pop' })
  return cues
}

/**
 * The spin `elapsed` ms into a stun `duration` ms long: fast at first and slowing, ending on a whole
 * number of turns so the model is back on its heading; a few hops dying away; a wobble of roll.
 * Still before it starts and after it ends
 */
export function spinPose(elapsed: number, duration: number): SpinPose {
  if (!(duration > 0) || elapsed < 0 || elapsed >= duration) return STILL_SPIN
  const p = elapsed / duration
  const left = 1 - p
  const eased = 1 - left * left * left
  return {
    yaw: SPIN_TURNS * 2 * Math.PI * eased,
    lift: HOP_HEIGHT * left * Math.abs(Math.sin(Math.PI * HOPS * p)),
    roll: ROLL * left * Math.sin(2 * Math.PI * HOPS * p),
  }
}

/** The camera's shake `elapsed` ms into a stun: a jitter that dies away; none outside it */
export function shakeOffset(elapsed: number, duration: number): { x: number; y: number } {
  if (!(duration > 0) || elapsed < 0 || elapsed >= duration) return { x: 0, y: 0 }
  const fade = (1 - elapsed / duration) ** 2
  return {
    x: SHAKE * fade * Math.sin(elapsed * 0.071),
    y: SHAKE * 0.6 * fade * Math.sin(elapsed * 0.093 + 1.3),
  }
}

/** Each kart's spin at `now`: the newest hit wins */
export function spinsAt(effects: readonly HitEffect[], now: number): Map<number, SpinPose> {
  const spins = new Map<number, SpinPose>()
  const from = new Map<number, number>()
  for (const effect of effects) {
    if (effect.kind !== 'spin') continue
    const elapsed = now - effect.at
    if (elapsed < 0 || elapsed >= effect.ms) continue
    if ((from.get(effect.seat) ?? -Infinity) > effect.at) continue
    from.set(effect.seat, effect.at)
    spins.set(effect.seat, spinPose(elapsed, effect.ms))
  }
  return spins
}

/** The shake for `seat`'s camera at `now`, from its newest hit still going */
export function shakeAt(
  effects: readonly HitEffect[],
  seat: number,
  now: number,
): { x: number; y: number } {
  let newest: HitEffect | null = null
  for (const effect of effects) {
    if (effect.kind !== 'spin' || effect.seat !== seat) continue
    if (now < effect.at || now >= effect.at + effect.ms) continue
    if (!newest || effect.at > newest.at) newest = effect
  }
  return newest && newest.kind === 'spin'
    ? shakeOffset(now - newest.at, newest.ms)
    : { x: 0, y: 0 }
}

/** The effects that began after `from` and by `to`: a replay playing forward bursts these */
export const crossed = (effects: readonly HitEffect[], from: number, to: number): HitEffect[] =>
  effects.filter((effect) => effect.at > from && effect.at <= to)

/** Effects no longer showing at `now` (a pop lasts a moment), dropped from a live list */
export const stillShowing = (effects: readonly HitEffect[], now: number): HitEffect[] =>
  effects.filter((effect) => now - effect.at < (effect.kind === 'spin' ? effect.ms : 0) + 1_000)

/**
 * A live race's effects (a racer or a spectator): reads the room's events as they come, each once,
 * and keeps the effects still showing. `start` is the first event number not yet seen
 */
export interface HitFeed {
  /** The events now in the room; returns what began with the ones new since the last call */
  read(events: readonly (FxEvent & { readonly n: number })[], now: number): {
    effects: HitEffect[]
    cues: ItemCue[]
  }
  /** The effects still showing */
  readonly effects: readonly HitEffect[]
}

export function createHitFeed(seat: number | null, start: number): HitFeed {
  let next = start
  let kept: HitEffect[] = []
  return {
    read(events, now) {
      const effects: HitEffect[] = []
      const cues: ItemCue[] = []
      for (const event of events) {
        if (event.n < next) continue
        next = event.n + 1
        effects.push(...effectsOf(event))
        cues.push(...cuesOf(event, seat))
      }
      kept = stillShowing([...kept, ...effects], now)
      return { effects, cues }
    },
    get effects() {
      return kept
    },
  }
}

/** A burst of particles to start this frame, at a kart: sparkles for a hit, shards for a pop */
export interface HitBurst {
  readonly kind: 'star' | 'pop'
  readonly x: number
  readonly z: number
}

/**
 * One frame's looks: the spins of `showing` at `now` (this browser's kart, `own`, as OWN_KART), a
 * burst for each of `started` at the kart it is on (`where`; a kart not drawn gets none), and the
 * shake of `own`'s camera
 */
export function hitFrameOf(
  showing: readonly HitEffect[],
  started: readonly HitEffect[],
  now: number,
  where: (seat: number) => { readonly x: number; readonly z: number } | null | undefined,
  own: number | null = null,
): { spins: Map<number, SpinPose>; bursts: HitBurst[]; shake: { x: number; y: number } } {
  const spins = new Map<number, SpinPose>()
  for (const [seat, spin] of spinsAt(showing, now)) spins.set(seat === own ? OWN_KART : seat, spin)
  const bursts: HitBurst[] = []
  for (const effect of started) {
    const at = where(effect.seat)
    if (at) bursts.push({ kind: effect.kind === 'spin' ? 'star' : 'pop', x: at.x, z: at.z })
  }
  return { spins, bursts, shake: own === null ? { x: 0, y: 0 } : shakeAt(showing, own, now) }
}
