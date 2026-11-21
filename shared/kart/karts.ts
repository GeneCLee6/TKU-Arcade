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
//
// 2026-11-19 (owner: "more kinds of vehicle ... and motorbikes; be inventive"): seventeen vehicles
// of our own, in a system of our own (docs/KART-WORLD.md §4.3; no other game's vehicle names, shapes
// or tables). Three things say what a vehicle is:
// - its series (`KartSeries`), the character it is built for: all-round, launch, top speed, drift
//   or heavy. Each series has an entry, an advanced and an expert machine (the all-rounders two);
// - its tier, how demanding it is, as before;
// - its kind (`KartKind`): a hover kart, or a hover bike. A bike is a different machine to drive,
//   not a better one: narrower (it fits a gap a kart scrapes through, `radius`), light (a bump
//   throws it further, `mass`), it tips into a corner at once, its tail comes out and comes back
//   quicker and not as far, and a wall costs it more. All of it is numbers on the same physics
//   (`KIND_TRAITS`): classic.ts never asks what it is driving.
//
// The first six keep their ids, their numbers and their places in KART_IDS (best laps and ghosts
// are kept by kart, and a frame names its kart by its place).
//
// Numbers by vehicle, for whoever adds a technique (a jump's flick, a new boost): give the
// technique its number in KART_TUNING as usual and read it from the tuning the step is handed. A
// vehicle then scales it with a line in `KIND_TRAITS` (every bike) or in its own `traits` (one
// machine), and nothing in the technique's code knows about vehicles.
//
// 2026-11-20 (docs/ARCHITECTURE.md §4.48): a sixth series, built for the item race (`item`). Its
// machines spend points of the same budget on how they do with items instead of on driving
// (`ItemPoints`): more often a strong item, their own items lasting longer, a bubble that stops a
// second hit. So in a race without items they are simply a little slower everywhere: the trade is
// what they are for. The room reads these from the kart a frame names (rules.ts), as it reads the
// top speed.
import type { ItemPerks } from './items.ts'
import type { KartTuning } from './physics.ts'

export const KART_IDS = [
  'tide',
  'comet',
  'ray',
  'crab',
  'heron',
  'flyfish',
  // 2026-11-19: eight more karts ...
  'dolphin',
  'skipper',
  'shrimp',
  'marlin',
  'eel',
  'squid',
  'hermit',
  'whale',
  // ... and three bikes
  'swift',
  'hornet',
  'petrel',
  // 2026-11-20: the item series, three karts
  'pelican',
  'otter',
  'cormorant',
  // 2026-11-21: the first season's flagship (KART_SEASONS)
  'kite',
] as const
export type KartId = (typeof KART_IDS)[number]

export const DRIVER_IDS = ['spade', 'heart', 'diamond', 'club'] as const
export type DriverId = (typeof DRIVER_IDS)[number]

export const KART_TIERS = ['entry', 'advanced', 'expert', 'flagship'] as const
export type KartTier = (typeof KART_TIERS)[number]

/** What a vehicle is built for: the stat it buys, and what it pays with */
export const KART_SERIES = ['allround', 'sprint', 'speed', 'drift', 'heavy', 'item'] as const
export type KartSeries = (typeof KART_SERIES)[number]

/** A hover kart, or a hover bike (2026-11-19) */
export const KART_KINDS = ['kart', 'bike'] as const
export type KartKind = (typeof KART_KINDS)[number]

/**
 * Numbers of the tuning a vehicle multiplies, on top of its stats: any key of KART_TUNING, 1 when
 * left out. How a kind of vehicle (or one machine) drives differently without the physics knowing
 */
export type KartTraits = { readonly [K in keyof KartTuning]?: number }

/** The stats a kart is drawn with, each -2 to 2 points; 0 is the standard tuning */
export const KART_STATS = ['speed', 'acceleration', 'handling', 'charge', 'weight'] as const
export type KartStat = (typeof KART_STATS)[number]

/** The stats that share the budget: weight does not */
export const BUDGET_STATS = ['speed', 'acceleration', 'handling', 'charge'] as const

export const STAT_MIN = -2
export const STAT_MAX = 2

/**
 * What a machine of the item series (2026-11-20) spends of its budget on items, each point one point
 * of a stat: `luck` (0 to 2) makes the strong items likelier, `duration` (0 to 2) makes its own
 * timed items last a quarter longer a point, `shield` (0 or 1) lets its bubble stop one hit more
 */
export interface ItemPoints {
  readonly luck?: number
  readonly duration?: number
  readonly shield?: number
}

export interface KartSpec {
  readonly id: KartId
  readonly kind: KartKind
  readonly series: KartSeries
  readonly tier: KartTier
  readonly stats: { readonly [S in KartStat]: number }
  /** This machine's own multipliers, after its kind's */
  readonly traits?: KartTraits
  /** The item series only: what it spends on items */
  readonly items?: ItemPoints
  /** A season's flagship (2026-11-21): the season it leads (KART_SEASONS) */
  readonly season?: number
}

/** What every vehicle of a kind shares */
export interface KindSpec {
  /** The circle that walls and other vehicles push on, metres (walls.ts's KART_RADIUS for a kart) */
  readonly radius: number
  /** Its mass in a bump, times its weight stat's */
  readonly mass: number
  readonly traits: KartTraits
}

/** A kart's circle: the same number as walls.ts's KART_RADIUS (a test holds them together) */
export const KART_BODY_RADIUS = 1.2

/**
 * A bike against a kart (2026-11-19). What it gains: it is a third narrower, the steering follows
 * the stick at once (it tips in), the tail comes out sooner in a drift and the slide straightens
 * sooner after it, so the instant boost comes earlier out of a corner. What it pays: the drift is
 * shallower (and a clean exit is worth a little more of the gauge), sliding scrubs more
 * speed, turning hard without a drift scrubs much more (it rides on two narrow pads: it wants to be
 * drifted through a corner, not hauled round it), a wall hit takes more of its speed, and in a bump
 * it is the one thrown aside. The last but one is what keeps a bike from being the easy choice: a
 * driver who steers on grip alone, as a novice does, is no quicker on it. Measured, not
 * guessed: `npm run kart:feel -- --karts` drives every vehicle with the same hands, and the bikes
 * lap inside the karts' spread (docs/KART-FEEL.md §12).
 */
export const KIND_TRAITS: { readonly [K in KartKind]: KindSpec } = {
  kart: { radius: KART_BODY_RADIUS, mass: 1, traits: {} },
  bike: {
    radius: 0.85,
    mass: 0.8,
    traits: {
      steerResponse: 1.5,
      turnRate: 1.04,
      driftSlipIn: 0.72,
      driftSlip: 0.86,
      driftSlipSteer: 0.86,
      driftMaxSlip: 0.86,
      dashMinSlip: 0.86,
      driftRecoverRate: 1.4,
      driftScrub: 1.25,
      gaugeDashBonus: 1.12,
      gripScrub: 1.6,
      wallImpactLoss: 1.25,
      wallScrapeDrag: 1.3,
    },
  },
}

/**
 * What makes the first season's flagship what it is (2026-11-21, docs/KART-META.md §3), on top of
 * its stats (over the budget: top speed, acceleration and drift charge two points each). It is a
 * touch faster still on a straight (`topSpeed`, so its top speed is 3.5% over the standard, the
 * other vehicles' spread being 3%). And it is a handful: the steering follows the stick at once and
 * turns sharper (a hand that shakes, shakes the kart), a drift lets go of its slip slower (a drift
 * held too long swings on past the corner), and a wall takes far more of its speed and its gauge.
 * Measured, not guessed: the master driver is quickest in it on most tracks, by about 1.4%; a
 * novice is not (npm run kart:meta)
 */
export const FLAGSHIP_TRAITS: KartTraits = {
  topSpeed: 1.015,
  steerResponse: 2.2,
  turnRate: 1.08,
  driftRecoverRate: 0.8,
  wallImpactLoss: 1.6,
  wallScrapeDrag: 1.5,
  wallGaugeKeep: 0.4,
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
 * The seventeen. The first six are the karts of e10-t05, as they were. By series, entry to expert:
 * all-round `tide`, `dolphin`; launch `comet`, `skipper`, `shrimp`; top speed `marlin`, `ray`,
 * `heron`; drift `eel`, `squid`, `flyfish`; heavy `hermit`, `crab`, `whale`. The bikes: `swift`
 * (launch), `hornet` (top speed), `petrel` (drift). Each spends a budget of zero; no two alike.
 */
export const KARTS: readonly KartSpec[] = [
  {
    id: 'tide',
    kind: 'kart',
    series: 'allround',
    tier: 'entry',
    stats: { speed: 0, acceleration: 0, handling: 0, charge: 0, weight: 0 },
  },
  {
    id: 'comet',
    kind: 'kart',
    series: 'sprint',
    tier: 'entry',
    stats: { speed: -1, acceleration: 2, handling: 1, charge: -2, weight: -1 },
  },
  {
    id: 'ray',
    kind: 'kart',
    series: 'speed',
    tier: 'advanced',
    stats: { speed: 1, acceleration: -1, handling: 1, charge: -1, weight: 0 },
  },
  {
    id: 'crab',
    kind: 'kart',
    series: 'heavy',
    tier: 'advanced',
    stats: { speed: 0, acceleration: -2, handling: 1, charge: 1, weight: 2 },
  },
  {
    id: 'heron',
    kind: 'kart',
    series: 'speed',
    tier: 'expert',
    stats: { speed: 2, acceleration: -1, handling: -2, charge: 1, weight: -1 },
  },
  {
    id: 'flyfish',
    kind: 'kart',
    series: 'drift',
    tier: 'expert',
    stats: { speed: -1, acceleration: 0, handling: -1, charge: 2, weight: 0 },
  },
  // The all-rounder that leans towards the straight
  {
    id: 'dolphin',
    kind: 'kart',
    series: 'allround',
    tier: 'advanced',
    stats: { speed: 1, acceleration: 0, handling: 0, charge: -1, weight: 0 },
  },
  // Off the line like the comet, and loose where the comet is sharp
  {
    id: 'skipper',
    kind: 'kart',
    series: 'sprint',
    tier: 'advanced',
    stats: { speed: -1, acceleration: 2, handling: -1, charge: 0, weight: -1 },
  },
  // All punch, and a handful: the standard top speed, the hardest to place
  {
    id: 'shrimp',
    kind: 'kart',
    series: 'sprint',
    tier: 'expert',
    stats: { speed: 0, acceleration: 2, handling: -2, charge: 0, weight: -1 },
  },
  // A first taste of top speed, paid for only in the corners
  {
    id: 'marlin',
    kind: 'kart',
    series: 'speed',
    tier: 'entry',
    stats: { speed: 1, acceleration: 0, handling: -1, charge: 0, weight: 0 },
  },
  // A first drift charger: slow to pull away, nothing else to learn
  {
    id: 'eel',
    kind: 'kart',
    series: 'drift',
    tier: 'entry',
    stats: { speed: 0, acceleration: -1, handling: 0, charge: 1, weight: 0 },
  },
  // Charges like the flying fish and pulls away better; the loosest kart there is
  {
    id: 'squid',
    kind: 'kart',
    series: 'drift',
    tier: 'advanced',
    stats: { speed: -1, acceleration: 1, handling: -2, charge: 2, weight: -1 },
  },
  // Heavy enough to hold a line in a crowd, and easy to place
  {
    id: 'hermit',
    kind: 'kart',
    series: 'heavy',
    tier: 'entry',
    stats: { speed: 0, acceleration: -1, handling: 1, charge: 0, weight: 1 },
  },
  // The heaviest: fast once it is rolling and a fast charger, the slowest of all to get there
  {
    id: 'whale',
    kind: 'kart',
    series: 'heavy',
    tier: 'expert',
    stats: { speed: 1, acceleration: -2, handling: -1, charge: 2, weight: 2 },
  },
  // The bikes (KIND_TRAITS): all light
  {
    id: 'swift',
    kind: 'bike',
    series: 'sprint',
    tier: 'entry',
    stats: { speed: 0, acceleration: 1, handling: 0, charge: -1, weight: -1 },
  },
  {
    id: 'hornet',
    kind: 'bike',
    series: 'speed',
    tier: 'advanced',
    stats: { speed: 1, acceleration: 0, handling: 1, charge: -2, weight: -1 },
  },
  {
    id: 'petrel',
    kind: 'bike',
    series: 'drift',
    tier: 'expert',
    stats: { speed: 0, acceleration: -1, handling: -1, charge: 2, weight: -2 },
  },
  // 2026-11-20, the item series: a point of the budget a point of items. The pelican's bubble
  // stops two hits, and it pays in the gauge; big and easy to place
  {
    id: 'pelican',
    kind: 'kart',
    series: 'item',
    tier: 'entry',
    stats: { speed: 0, acceleration: 0, handling: 1, charge: -2, weight: 1 },
    items: { shield: 1 },
  },
  // Finds the strong items a little more often, and its own last longer; light and loose
  {
    id: 'otter',
    kind: 'kart',
    series: 'item',
    tier: 'advanced',
    stats: { speed: 0, acceleration: 1, handling: -1, charge: -2, weight: -1 },
    items: { luck: 1, duration: 1 },
  },
  // The most luck there is, and a bubble that stops two; a little behind at everything to drive
  {
    id: 'cormorant',
    kind: 'kart',
    series: 'item',
    tier: 'expert',
    stats: { speed: 0, acceleration: -1, handling: -1, charge: -1, weight: 0 },
    items: { luck: 2, shield: 1 },
  },
  // 2026-11-21, the first season's flagship (KART_SEASONS): over the budget on purpose, and a
  // handful to drive
  {
    id: 'kite',
    kind: 'kart',
    series: 'speed',
    tier: 'flagship',
    season: 1,
    stats: { speed: 2, acceleration: 2, handling: 0, charge: 2, weight: 0 },
    traits: FLAGSHIP_TRAITS,
  },
]

// ── Seasons (2026-11-21, docs/KART-WORLD.md §4.4) ──────────────────────────────────────────────

/**
 * A season and its flagship: one machine over the budget, the quickest there is in exact hands (by
 * a little) and the hardest to drive. When the next season begins (its entry added here and
 * CURRENT_SEASON raised), the old flagship rejoins the others: its tier, its stats and its traits
 * become the `retired` ones, back within the budget like everyone's. Only the data: no clock moves
 * a season on, a release does. Unlocking waits for accounts (F1): every flagship is open for now
 */
export interface KartSeason {
  readonly season: number
  readonly flagship: KartId
  /** What it becomes once its season is over */
  readonly retired: {
    readonly tier: Exclude<KartTier, 'flagship'>
    readonly stats: KartSpec['stats']
    readonly traits?: KartTraits
  }
}

export const KART_SEASONS: readonly KartSeason[] = [
  {
    season: 1,
    flagship: 'kite',
    // Back within the budget: still a top-speed machine, still sharp, no longer over the points
    retired: {
      tier: 'expert',
      stats: { speed: 2, acceleration: 1, handling: -2, charge: -1, weight: -1 },
      traits: { steerResponse: 1.3, wallImpactLoss: 1.2 },
    },
  },
]

/** The season now: its flagship is the one over the budget */
export const CURRENT_SEASON = 1

/**
 * A machine as it stands in season `now`: a flagship of an earlier season in its retired form, any
 * other as it is
 */
export function inSeason(spec: KartSpec, now: number = CURRENT_SEASON): KartSpec {
  if (spec.season === undefined || spec.season >= now) return spec
  const season = KART_SEASONS.find((one) => one.season === spec.season)
  if (!season) return spec
  const { season: _over, ...rest } = spec
  return {
    ...rest,
    tier: season.retired.tier,
    stats: season.retired.stats,
    ...(season.retired.traits ? { traits: season.retired.traits } : {}),
  }
}

/** The flagship of season `now`, if it has one */
export const seasonFlagship = (now: number = CURRENT_SEASON): KartId | undefined =>
  KART_SEASONS.find((one) => one.season === now)?.flagship

/** Whether a machine is the flagship of season `now` */
export const isFlagship = (id: KartId, now: number = CURRENT_SEASON): boolean =>
  seasonFlagship(now) === id

export const DEFAULT_KART: KartId = 'tide'
export const DEFAULT_DRIVER: DriverId = 'spade'

/**
 * Each driver's racing number (2026-11-18): on their back, on whatever kart they drive, and beside
 * their name in the garage. Looks only
 */
export const DRIVER_NUMBERS: { readonly [D in DriverId]: string } = {
  spade: '11',
  heart: '23',
  diamond: '47',
  club: '88',
}

export const isKartId = (value: unknown): value is KartId =>
  KART_IDS.some((id) => id === value)

export const isDriverId = (value: unknown): value is DriverId =>
  DRIVER_IDS.some((id) => id === value)

/** A machine as it stands this season (`inSeason`) */
export function kartSpec(id: KartId): KartSpec {
  return inSeason(KARTS.find((kart) => kart.id === id) ?? KARTS[0]!)
}

/** A vehicle's kind: a kart or a bike */
export const kartKind = (id: KartId): KartKind => kartSpec(id).kind

/** The circle walls and other vehicles push on, metres: a bike's is smaller */
export const kartRadius = (id: KartId): number => KIND_TRAITS[kartSpec(id).kind].radius

/** The share a stat's points make of the standard number: 1 for 0 points */
export const statFactor = (stat: KartStat, points: number): number =>
  1 + STAT_STEP[stat] * points

function scaled(tuning: KartTuning, traits: KartTraits | undefined): KartTuning {
  if (!traits) return tuning
  const next: { [key: string]: number | undefined } = { ...tuning }
  for (const [key, factor] of Object.entries(traits)) {
    const base = next[key]
    if (typeof base === 'number' && typeof factor === 'number') next[key] = base * factor
  }
  return next as unknown as KartTuning
}

/**
 * The tuning this kart drives with, from `base` (the standard tuning, or the tuning panel's). Speed
 * is the top speed (boosts are factors of it, so they follow); acceleration the throttle's push;
 * handling the turn rate with grip and in a drift, and how much steering moves the drift; charge
 * how fast a drift fills the gauge. Then its kind's multipliers and its own (`KartTraits`), and its
 * circle when that is not a kart's (`bodyRadius`, which walls.ts reads)
 */
export function applyKart(base: KartTuning, id: KartId): KartTuning {
  const spec = kartSpec(id)
  const { stats } = spec
  const kind = KIND_TRAITS[spec.kind]
  const speed = statFactor('speed', stats.speed)
  const acceleration = statFactor('acceleration', stats.acceleration)
  const handling = statFactor('handling', stats.handling)
  const charge = statFactor('charge', stats.charge)
  const tuned = scaled(
    scaled(
      {
        ...base,
        topSpeed: base.topSpeed * speed,
        acceleration: base.acceleration * acceleration,
        turnRate: base.turnRate * handling,
        driftTurnRate: base.driftTurnRate * handling,
        driftSteerRate: base.driftSteerRate * handling,
        gaugeFillRate: base.gaugeFillRate * charge,
      },
      kind.traits,
    ),
    spec.traits,
  )
  // 2026-11-21: and its mass, when it is not the standard kart's, for the slopes (terrain.ts)
  const mass = kartMass(id)
  const weighed = mass === 1 ? tuned : { ...tuned, mass }
  return kind.radius === KART_BODY_RADIUS ? weighed : { ...weighed, bodyRadius: kind.radius }
}

/** The item points a machine spends (2026-11-20): 0 for every machine outside the item series */
export function itemPointsOf(id: KartId): number {
  const items = kartSpec(id).items
  return (items?.luck ?? 0) + (items?.duration ?? 0) + (items?.shield ?? 0)
}

/** A quarter longer per point of `duration` */
export const DURATION_STEP = 0.25

/** What a machine's item points do (items.ts reads them): nothing for a machine without any */
export function itemPerksOf(id: KartId): ItemPerks {
  const items = kartSpec(id).items
  return {
    luck: items?.luck ?? 0,
    duration: 1 + DURATION_STEP * (items?.duration ?? 0),
    shieldHits: 1 + (items?.shield ?? 0),
  }
}

/** A kart's mass in a bump, the standard kart's being 1: its weight stat, times its kind's */
export function kartMass(id: KartId): number {
  const spec = kartSpec(id)
  return statFactor('weight', spec.stats.weight) * KIND_TRAITS[spec.kind].mass
}

// ── On the wire ──────────────────────────────────────────────────────────────────────────────

/**
 * The kart and driver in one byte, for a frame (net.ts). 2026-11-19: five bits of kart (up to 32)
 * and three of driver (up to 8), laid out so that every byte sent before reads as it did: the
 * kart's low four bits in bits 0–3, the driver in bits 4–6, the kart's fifth bit in bit 7. Before,
 * it was four bits each, and no kart or driver then had a number that reached bits 6 or 7. A page
 * from before that is still open sees a kart past the sixteenth as one of the first (a look only;
 * the room judges by this table), until it reloads
 */
export const LOADOUT_KARTS = 32
export const LOADOUT_DRIVERS = 8

export function loadoutByte(kart: KartId, driver: DriverId): number {
  const kartIndex = Math.max(0, KART_IDS.indexOf(kart)) % LOADOUT_KARTS
  const driverIndex = Math.max(0, DRIVER_IDS.indexOf(driver)) % LOADOUT_DRIVERS
  return (kartIndex & 0x0f) | (driverIndex << 4) | ((kartIndex & 0x10) << 3)
}

/** The kart and driver a frame's byte names; anything unknown is the default */
export function loadoutOfByte(byte: number): { kart: KartId; driver: DriverId } {
  return {
    kart: KART_IDS[(byte & 0x0f) | ((byte >> 3) & 0x10)] ?? DEFAULT_KART,
    driver: DRIVER_IDS[(byte >> 4) & 0x07] ?? DEFAULT_DRIVER,
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
