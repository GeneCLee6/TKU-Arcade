// A kart's team boosts in the browser that drives it (2026-11-18, a team race; team.ts,
// docs/KART-NETCODE.md §17). The room hands them out and counts them; the kart fires one in its own
// physics at once (no round trip) and tells the room. This keeps the two in step: after every step
// it says whether one was just fired (to be sent) and sets how many the kart may fire next, which is
// what the room says it holds less those fired here that the room has not counted yet. Used by a
// player's race (src/kart/race/netRace.ts) and by the computer karts (src/kart/bots/botRace.ts)
// alike. Pure.
import type { KartState } from './physics.ts'
import { teamBoostsLeft } from './team.ts'

/** What the room says of the kart (KartRacer's team fields) */
export interface TeamHolding {
  readonly teamBoosts?: number
  readonly teamUsed?: number
}

export interface TeamRider {
  /** After a step of the race: the kart as it goes on, and whether it has just fired a team boost */
  step(kart: KartState, racer: TeamHolding | undefined): { kart: KartState; fired: boolean }
}

/** A fire the room has not counted after this many steps (5 s) never reached it: forgotten */
const GIVE_UP_STEPS = 300

export function createTeamRider(racer?: TeamHolding): TeamRider {
  // Fired so far, started from the room's count: a page that comes back mid-race has fired those
  let fired = racer?.teamUsed ?? 0
  let burning = 0
  let waited = 0
  return {
    step(kart, holding) {
      const seconds = kart.teamSeconds ?? 0
      const justFired = seconds > burning
      burning = seconds
      const used = holding?.teamUsed ?? 0
      if (justFired) {
        fired++
        waited = 0
      } else if (fired > used) {
        if (++waited >= GIVE_UP_STEPS) fired = used
      }
      if (used > fired) fired = used
      const left = teamBoostsLeft(holding?.teamBoosts ?? 0, used, fired)
      const same = kart.teamBoosts === left && kart.teamSeconds !== undefined
      return {
        kart: same ? kart : { ...kart, teamBoosts: left, teamSeconds: seconds },
        fired: justFired,
      }
    },
  }
}
