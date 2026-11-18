// The blue boost's numbers (2026-11-18, owner: "a team race can have a blue N2O that burns longer and
// faster"; then "in a team race everyone still collects their own N2O, and there is a red one and a
// blue one": shared/kart/team.ts, docs/ARCHITECTURE.md §4.31 and §4.34). A blue boost is a charge of
// the kart's own that its team's full gauge has turned blue. On their own, with no imports, so that
// the physics (physics.ts, classic.ts) can read them without a circle. Not on the tuning panel: a
// blue boost is the same for everyone in the race.

export const TEAM_BOOST = {
  /** How long a team boost burns, seconds: half as long again as a boost from the gauge (2.9 s) */
  seconds: 4.35,
  /** It lets the car go this much over its top speed (a boost from the gauge: 1.28) ... */
  topSpeedFactor: 1.36,
  /** ... and multiplies the pull of the engine by this (a boost from the gauge: 1.5) */
  accelFactor: 1.65,
  /** Blue boosts a kart can hold at once: as many as it can hold charges (maxStoredBoosts) */
  maxHeld: 2,
} as const
