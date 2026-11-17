// e10-t05a, e10-t05b: the six karts and four drivers (docs/PRD/e10-kart-content-progression.md,
// AC-10.3). Every name here is a working name until the owner settles KART-WORLD.md (e10-t01); the
// ids stay when the names change.
//
// A kart's numbers are small changes to whatever tuning the physics runs with (physics.ts), made
// from points: each kart spends a budget of zero across speed, acceleration, handling and drift
// charge, so that every kart pays for what it is good at (a trade-off, not a ladder), and weight
// stands apart (it only matters when karts bump). The tiers say how demanding a kart is to drive,
// not how strong it is: an entry kart forgives, a top-tier kart is quicker somewhere and harder
// somewhere else. Drivers are looks only: any driver sits in any kart (its seat is the mount).
//
// Balance, and why the top speeds are so close: the top speed decides who wins a straight, and on
// these tracks most of a lap is flat out, so 1% of top speed is roughly 0.3 s a lap at the experts'
// 26–34 s laps. The spread is held to 3% (59.4 to 61.2 m/s), under the PRD's ±5%, so that a lap's
// difference stays well under the gap between a clean and a messy lap: the driving decides, the
// kart only flavours it. Acceleration, handling and drift charge move further (±8–10%), since a
// player can work round each of them. Pure: the Worker reads it to judge frames (race.ts).
import type { KartTuning } from './physics.ts'

export const KART_IDS = ['tide', 'comet', 'ray', 'crab', 'heron', 'flyfish'] as const
export type KartId = (typeof KART_IDS)[number]

export const DRIVER_IDS = ['spade', 'heart', 'diamond', 'club'] as const
export type DriverId = (typeof DRIVER_IDS)[number]

export type KartTier = 'entry' | 'advanced' | 'expert'

/** The stats a kart is drawn with, each -2 to 2 points; 0 is the standard tuning */
export const KART_STATS = ['speed', 'acceleration', 'handling', 'charge', 'weight'] as const
export type KartStat = (typeof KART_STATS)[number]

/** The stats that share the budget: weight does not */
export const BUDGET_STATS = ['speed', 'acceleration', 'handling', 'charge'] as const

export const STAT_MIN = -2
export const STAT_MAX = 2

export interface KartSpec {
  readonly id: KartId
  readonly tier: KartTier
  readonly stats: { readonly [S in KartStat]: number }
}

/**
 * What one point of a stat changes, as a share of the standard number. Speed 1% (so ±2 points is
 * ±2%), acceleration and handling 4%, drift charge 5%, weight 8% of the mass in a bump
 */
export const STAT_STEP: { readonly [S in KartStat]: number } = {
  speed: 0.01,
  acceleration: 0.04,
  handling: 0.04,
  charge: 0.05,
  weight: 0.08,
}

/**
 * Two of each tier (the PRD's entry, advanced and top tiers). In order: the one that is middling at
 * everything; the light, quick-off-the-line one; the planted, fast one that charges slowly; the
 * heavy one that charges fast but pulls away slowly; the fastest, twitchy and light; the drift
 * charger that pays in top speed and handling.
 */
export const KARTS: readonly KartSpec[] = [
  {
    id: 'tide',
    tier: 'entry',
    stats: { speed: 0, acceleration: 0, handling: 0, charge: 0, weight: 0 },
  },
  {
    id: 'comet',
    tier: 'entry',
    stats: { speed: -1, acceleration: 2, handling: 1, charge: -2, weight: -1 },
  },
  {
    id: 'ray',
    tier: 'advanced',
    stats: { speed: 1, acceleration: -1, handling: 1, charge: -1, weight: 0 },
  },
  {
    id: 'crab',
    tier: 'advanced',
    stats: { speed: 0, acceleration: -2, handling: 1, charge: 1, weight: 2 },
  },
  {
    id: 'heron',
    tier: 'expert',
    stats: { speed: 2, acceleration: -1, handling: -2, charge: 1, weight: -1 },
  },
  {
    id: 'flyfish',
    tier: 'expert',
    stats: { speed: -1, acceleration: 0, handling: -1, charge: 2, weight: 0 },
  },
]

export const DEFAULT_KART: KartId = 'tide'
export const DEFAULT_DRIVER: DriverId = 'spade'

export const isKartId = (value: unknown): value is KartId =>
  KART_IDS.some((id) => id === value)

export const isDriverId = (value: unknown): value is DriverId =>
  DRIVER_IDS.some((id) => id === value)

export function kartSpec(id: KartId): KartSpec {
  return KARTS.find((kart) => kart.id === id) ?? KARTS[0]!
}

/** The share a stat's points make of the standard number: 1 for 0 points */
export const statFactor = (stat: KartStat, points: number): number =>
  1 + STAT_STEP[stat] * points

/**
 * The tuning this kart drives with, from `base` (the standard tuning, or the tuning panel's). Speed
 * is the top speed (boosts are factors of it, so they follow); acceleration the throttle's push;
 * handling the turn rate with grip and in a drift, and how much steering moves the drift; charge
 * how fast a drift fills the gauge
 */
export function applyKart(base: KartTuning, id: KartId): KartTuning {
  const { stats } = kartSpec(id)
  const speed = statFactor('speed', stats.speed)
  const acceleration = statFactor('acceleration', stats.acceleration)
  const handling = statFactor('handling', stats.handling)
  const charge = statFactor('charge', stats.charge)
  return {
    ...base,
    topSpeed: base.topSpeed * speed,
    acceleration: base.acceleration * acceleration,
    turnRate: base.turnRate * handling,
    driftTurnRate: base.driftTurnRate * handling,
    driftSteerRate: base.driftSteerRate * handling,
    gaugeFillRate: base.gaugeFillRate * charge,
  }
}

/** A kart's mass in a bump, the standard kart's being 1 */
export const kartMass = (id: KartId): number => statFactor('weight', kartSpec(id).stats.weight)

// ── On the wire ──────────────────────────────────────────────────────────────────────────────

/** The kart and driver in one byte, for a frame (net.ts): the kart in the low four bits */
export function loadoutByte(kart: KartId, driver: DriverId): number {
  const kartIndex = Math.max(0, KART_IDS.indexOf(kart)) & 0x0f
  const driverIndex = Math.max(0, DRIVER_IDS.indexOf(driver)) & 0x0f
  return kartIndex | (driverIndex << 4)
}

/** The kart and driver a frame's byte names; anything unknown is the default */
export function loadoutOfByte(byte: number): { kart: KartId; driver: DriverId } {
  return {
    kart: KART_IDS[byte & 0x0f] ?? DEFAULT_KART,
    driver: DRIVER_IDS[(byte >> 4) & 0x0f] ?? DEFAULT_DRIVER,
  }
}

/** The kart and driver as a room member's `look` (shared/protocol.ts): `kart.driver` */
export const lookOf = (kart: KartId, driver: DriverId): string => `${kart}.${driver}`

/** A member's `look` read back, or null for one that is not a kart's (or none) */
export function parseLook(
  look: string | undefined | null,
): { kart: KartId; driver: DriverId } | null {
  if (!look) return null
  const [kart, driver] = look.split('.')
  return isKartId(kart) && isDriverId(driver) ? { kart, driver } : null
}
