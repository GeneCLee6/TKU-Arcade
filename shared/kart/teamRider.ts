// A kart's blue boosts in the browser that drives it (2026-11-18, a team race; team.ts,
// docs/KART-NETCODE.md §17). Every kart fills its own gauge and holds its own charges (red). When
// its team's gauge fills, the charges it holds at that moment turn blue; a kart holding none gets
// nothing. The room says when the gauge filled and how many blue ones a kart may hold at most; the
// kart, which alone knows how many charges it holds, turns that many blue, tells the room when that
// is fewer (`keep`), fires one in its own physics at once (no round trip) and tells the room
// (`fired`). This keeps the two in step. Used by a player's race (src/kart/race/netRace.ts), the
// computer karts (src/kart/bots/botRace.ts) and the load test's alike. Pure.
import type { KartState } from './physics.ts'
import { teamBoostsLeft } from './team.ts'

/** What the room says of the kart (KartRacer's team fields) */
export interface TeamHolding {
  readonly teamBoosts?: number
  readonly teamUsed?: number
}

export interface TeamStep {
  /** The kart as it goes on: `teamBoosts` is how many of the charges it holds are blue */
  readonly kart: KartState
  /** It has just fired a blue one: to be sent */
  readonly fired: boolean
  /**
   * It holds fewer blue ones than the room thinks (it had fewer charges when the gauge filled, or
   * lost one): this many, to be sent, with the fill it answers. Null when there is nothing to say
   */
  readonly keep: { readonly held: number; readonly fill: number } | null
}

export interface TeamRider {
  /**
   * After a step of the race: the kart, what the room says of it, and how often its team's gauge
   * has filled (KartTeamState.fills)
   */
  step(kart: KartState, racer: TeamHolding | undefined, fills: number): TeamStep
}

/** A fire the room has not counted after this many steps (5 s) never reached it: forgotten */
const GIVE_UP_STEPS = 300

export function createTeamRider(racer?: TeamHolding, fills = 0): TeamRider {
  // Fired so far, started from the room's count: a page that comes back mid-race has fired those
  let fired = racer?.teamUsed ?? 0
  let burning = 0
  let waited = 0
  // The fill last seen
  let fill = fills
  /** The most blue ones the kart can hold since that fill: the charges it held then, less those fired */
  let cap = Infinity
  /** What the room was last told, for this fill */
  let told: number | null = null
  return {
    step(kart, holding, fillsNow) {
      const seconds = kart.teamSeconds ?? 0
      const justFired = seconds > burning
      burning = seconds
      const used = holding?.teamUsed ?? 0
      if (justFired) {
        fired++
        waited = 0
        if (cap !== Infinity) cap = Math.max(0, cap - 1)
      } else if (fired > used) {
        if (++waited >= GIVE_UP_STEPS) fired = used
      }
      if (used > fired) fired = used
      if (fillsNow !== fill) {
        // The gauge filled: the charges held now are the ones that turn blue
        fill = fillsNow
        cap = Infinity
        told = null
      }
      const left = teamBoostsLeft(holding?.teamBoosts ?? 0, used, fired)
      // A blue one is a charge: never more than the kart holds (one lost to a crash is lost)
      cap = Math.min(cap, kart.storedBoosts)
      const blue = Math.min(left, cap)
      let keep: TeamStep['keep'] = null
      if (blue < left && told !== blue) {
        told = blue
        keep = { held: blue, fill }
      }
      const same = kart.teamBoosts === blue && kart.teamSeconds !== undefined
      return {
        kart: same ? kart : { ...kart, teamBoosts: blue, teamSeconds: seconds },
        fired: justFired,
        keep,
      }
    },
  }
}
