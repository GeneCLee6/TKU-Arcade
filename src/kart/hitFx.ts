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
import { isStunItem, SHOT_TUNING, type StunItem } from '../../shared/kart/shots.ts'

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
  /** 2026-11-20: a shot a mirror sent back (`by` the mirror's kart, `targets` the thrower) */
  readonly bounced?: boolean
}

/**
 * 2026-11-20: the other moments an item shows on a kart, each a burst of its own: a mirror turning a
 * shot back, fog closing round a kart, a skip landing, a rally's lift, static crackling on a kart
 */
export type FlashLook = 'bounce' | 'fog' | 'splash' | 'cheer' | 'static'

/** What a kart shows: a spin and hop after a hit, or a bubble popping */
export type HitEffect =
  | {
      readonly kind: 'spin'
      readonly seat: number
      readonly at: number
      /** As long as the stun */
      readonly ms: number
      readonly item: StunItem
    }
  | { readonly kind: 'pop'; readonly seat: number; readonly at: number }
  | { readonly kind: 'flash'; readonly look: FlashLook; readonly seat: number; readonly at: number }

/** A sound for this browser's racer: an item taken or used, a hit taken or landed, a bubble popped */
export type ItemCue =
  | { readonly kind: 'pickup' }
  | { readonly kind: 'use'; readonly item: ItemId }
  | { readonly kind: 'hit' }
  | { readonly kind: 'landed' }
  | { readonly kind: 'pop' }
  /** 2026-11-20: this racer's mirror sent a shot back; fog closed round it; static jammed it */
  | { readonly kind: 'bounce' }
  | { readonly kind: 'fogged' }
  | { readonly kind: 'jammed' }
  /** 2026-11-22: a boom ahead warned of or down (its bell), a container ahead about to slide (a horn) */
  | { readonly kind: 'bell' }
  | { readonly kind: 'horn' }

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
  const flash = (look: FlashLook, seat: number): HitEffect => ({
    kind: 'flash',
    look,
    seat,
    at: event.at,
  })
  if (event.hit) {
    const seat = event.targets[0]
    // 2026-11-20: a mirror flashes where it turned the shot back
    const bounce = event.bounced ? [flash('bounce', event.by)] : []
    if (seat === undefined) return bounce
    if (event.blocked.includes(seat)) return [...bounce, { kind: 'pop', seat, at: event.at }]
    if (event.item === 'fog') return [flash('fog', seat)]
    if (!isStunItem(event.item)) return bounce
    return [
      ...bounce,
      { kind: 'spin', seat, at: event.at, ms: SHOT_TUNING.stunMs[event.item], item: event.item },
    ]
  }
  // A headwind or a swap stopped by a bubble pops it too
  const effects: HitEffect[] = event.blocked.map(
    (seat) => ({ kind: 'pop', seat, at: event.at }) as const,
  )
  const reached = event.targets.filter((seat) => !event.blocked.includes(seat))
  // 2026-11-20: a skip lands with a splash, a rally lifts the whole team, static crackles
  if (event.item === 'skip') effects.push(flash('splash', event.by))
  if (event.item === 'rally') effects.push(...[event.by, ...reached].map((one) => flash('cheer', one)))
  if (event.item === 'jam') effects.push(...reached.map((one) => flash('static', one)))
  return effects
}

/** The sounds one event makes for the racer in `seat` (null: watching, no sounds) */
export function cuesOf(event: FxEvent, seat: number | null): ItemCue[] {
  if (seat === null) return []
  const cues: ItemCue[] = []
  if (event.hit) {
    // 2026-11-20: this racer's mirror sent it back
    if (event.bounced && event.by === seat) cues.push({ kind: 'bounce' })
    const target = event.targets[0]
    if (target === undefined) return cues
    const stopped = event.blocked.includes(target)
    if (event.item === 'fog') {
      if (target === seat) cues.push({ kind: 'fogged' })
      return cues
    }
    if (target === seat) cues.push({ kind: stopped ? 'pop' : 'hit' })
    else if (event.by === seat && !stopped) cues.push({ kind: 'landed' })
    return cues
  }
  if (event.by === seat) cues.push({ kind: 'use', item: event.item })
  if (event.blocked.includes(seat)) cues.push({ kind: 'pop' })
  else if (event.by !== seat && event.targets.includes(seat)) {
    // 2026-11-20: a team-mate's rally is heard; static on this kart crackles
    if (event.item === 'rally') cues.push({ kind: 'use', item: 'rally' })
    if (event.item === 'jam') cues.push({ kind: 'jammed' })
  }
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

// ── Live: when an effect starts (#86, 2026-11-17) ─────────────────────────────────────────────

/**
 * How far behind its newest frame another kart is drawn, ms (race/remotes.ts's INTERP_DELAY): a hit
 * on it is shown that much after this browser hears of it, when the drawn kart gets there
 */
export const DRAWN_BEHIND_MS = 100

/**
 * When a live browser starts showing an effect of an event at `at` (server clock) that it first read
 * at `seenAt`. The room's patch comes about half a round trip after the hit, so starting at `at`
 * would skip the start of the spin: its own kart starts at once, from the beginning; another kart
 * once it is drawn where it was hit (`behind` later). Never before the event itself
 */
export function liveStart(
  at: number,
  seenAt: number,
  seat: number,
  own: number | null,
  behind = DRAWN_BEHIND_MS,
): number {
  return Math.max(at, seat === own ? seenAt : seenAt + behind)
}

/** A hit this browser foresaw on its own kart before the room said so (netRace.ts) */
export interface Foreseen {
  readonly item: StunItem
  /** When, by the server's clock */
  readonly at: number
}

/** How far the room's hit may be from the one foreseen and still be the same, ms */
export const FORESEEN_EARLY_MS = 300
export const FORESEEN_LATE_MS = 1_500

/**
 * The foreseen hit (index into `foreseen`) that the room's hit `event` on `own` confirms, or -1: the
 * same item, the room's time a little after (it judges the kart's frame when it arrives)
 */
export function confirmsForeseen(
  event: FxEvent,
  own: number | null,
  foreseen: readonly Foreseen[],
): number {
  if (!event.hit || own === null || event.targets[0] !== own) return -1
  return foreseen.findIndex(
    (one) =>
      one.item === event.item &&
      event.at - one.at >= -FORESEEN_EARLY_MS &&
      event.at - one.at <= FORESEEN_LATE_MS,
  )
}

/**
 * A live race's effects (a racer or a spectator): reads the room's events as they come, each once,
 * and keeps the effects still showing. `start` is the first event number not yet seen
 */
export interface HitFeed {
  /**
   * The events now in the room, read at `now` (server clock). Returns the effects that start by
   * `now` (a burst each) and the sounds of the events new since the last call
   */
  read(events: readonly (FxEvent & { readonly n: number })[], now: number): {
    effects: HitEffect[]
    cues: ItemCue[]
  }
  /**
   * This browser's own kart was hit by `item` at `at` before the room said so (#86): it spins now,
   * the hit sounds on the next read, and the room's hit, when it comes, does not start it again
   */
  foresee(item: StunItem, at: number): void
  /** The effects showing or about to */
  readonly effects: readonly HitEffect[]
}

export function createHitFeed(
  seat: number | null,
  start: number,
  behind = DRAWN_BEHIND_MS,
): HitFeed {
  let next = start
  let kept: HitEffect[] = []
  /** Effects whose burst has not started yet */
  let waiting: HitEffect[] = []
  let foreseen: Foreseen[] = []
  let queued: ItemCue[] = []
  const add = (effect: HitEffect) => {
    kept.push(effect)
    waiting.push(effect)
  }
  return {
    read(events, now) {
      const cues: ItemCue[] = queued
      queued = []
      for (const event of events) {
        if (event.n < next) continue
        next = event.n + 1
        const confirmed = confirmsForeseen(event, seat, foreseen)
        if (confirmed >= 0) {
          // Already spinning, and already heard: a shield up after all still pops
          foreseen = foreseen.filter((_, i) => i !== confirmed)
          for (const effect of effectsOf(event)) {
            if (effect.kind === 'pop') add({ ...effect, at: now })
          }
          continue
        }
        for (const effect of effectsOf(event)) {
          add({ ...effect, at: liveStart(effect.at, now, effect.seat, seat, behind) })
        }
        cues.push(...cuesOf(event, seat))
      }
      foreseen = foreseen.filter((one) => now - one.at <= FORESEEN_LATE_MS)
      kept = stillShowing(kept, now)
      const effects = waiting.filter((effect) => effect.at <= now)
      waiting = waiting.filter((effect) => effect.at > now)
      return { effects, cues }
    },
    foresee(item, at) {
      if (seat === null) return
      foreseen.push({ item, at })
      add({ kind: 'spin', seat, at, ms: SHOT_TUNING.stunMs[item], item })
      queued.push({ kind: 'hit' })
    },
    get effects() {
      return kept
    },
  }
}

/** A burst of particles to start this frame, at a kart: sparkles for a hit, shards for a pop */
export interface HitBurst {
  readonly kind: 'star' | 'pop' | FlashLook
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
    if (!at) continue
    const kind = effect.kind === 'spin' ? 'star' : effect.kind === 'pop' ? 'pop' : effect.look
    bursts.push({ kind, x: at.x, z: at.z })
  }
  return { spins, bursts, shake: own === null ? { x: 0, y: 0 } : shakeAt(showing, own, now) }
}
