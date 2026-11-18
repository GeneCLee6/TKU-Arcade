// 2026-11-18 (owner: "the karts and the boost's effects need designing again ... some karts change
// shape when they fire a boost"): what a boost looks like, as plain numbers, so that Node tests it.
// One system for every boost there is (docs/ARCHITECTURE.md, "Kart visuals"): the start boost, an
// instant boost, a full boost from the gauge (N2O) and a team boost are the same effect at four
// sizes and in four colours, and the bigger ones change the kart's shape while they run.
//
// How a caller asks for one: it says so in the kart's look (kartModel.ts's KartLook), with
// `boostFx(kind)`. A look that only says `boosting` (another racer's kart, a bot's, a replay's: the
// frame on the wire has one bit for it, and that stays) has its kind worked out here from how long
// the boost has run, so that everyone's kart changes shape without a change to the protocol.
// Our own design: no effect, shape or sound taken from any other game.
import { kartBoost } from '../styles/kartTokens.ts'

/**
 * What fired: `mini` an instant boost (a drift's release, a dash, a small start), `n2o` a full boost
 * from the gauge or a pad, `team` a team boost (the same, in blue), `start` a perfect start
 */
export type BoostKind = 'mini' | 'n2o' | 'team' | 'start'
export const BOOST_KINDS: readonly BoostKind[] = ['mini', 'n2o', 'team', 'start']

export interface BoostStyle {
  /** The flame's pale heart, its body, its tips, and the ribbon it leaves */
  readonly core: string
  readonly flame: string
  readonly tip: string
  readonly trail: string
  /** The flame's length and girth, as shares of a full boost's */
  readonly length: number
  readonly girth: number
  /** Whether the kart changes shape while it runs */
  readonly transforms: boolean
  /** Whether it leaves ribbons of light behind the thrusters and throws sparks all the while */
  readonly ribbons: boolean
  /** How hard it kicks when it fires, 0 to 1 (the same scale as feelFx.ts's BURST_POWER) */
  readonly power: number
  /** How wide the ring of light on the road gets, metres, and whether a ring stands up behind too */
  readonly ring: number
  readonly shockwave: boolean
}

export const BOOST_FX: Readonly<Record<BoostKind, BoostStyle>> = {
  mini: {
    ...kartBoost.mini,
    length: 0.45,
    girth: 0.75,
    transforms: false,
    ribbons: false,
    power: 0.45,
    ring: 2.4,
    shockwave: false,
  },
  n2o: {
    ...kartBoost.n2o,
    length: 1,
    girth: 1,
    transforms: true,
    ribbons: true,
    power: 0.8,
    ring: 4.6,
    shockwave: true,
  },
  team: {
    ...kartBoost.team,
    length: 1.15,
    girth: 1.1,
    transforms: true,
    ribbons: true,
    power: 0.9,
    ring: 5.4,
    shockwave: true,
  },
  start: {
    ...kartBoost.start,
    length: 0.9,
    girth: 0.95,
    transforms: true,
    ribbons: true,
    power: 1,
    ring: 5,
    shockwave: true,
  },
}

/** The part of a kart's look that says which boost runs: spread it into the look */
export interface BoostLook {
  readonly boosting: boolean
  readonly boostKind?: BoostKind
}

/**
 * The effects' API (ARCHITECTURE "Kart visuals"): the look of a kart with a boost of `kind` running,
 * or with none (`null`). `{ ...look, ...boostFx('team') }` is all a caller does; the flames, the
 * ribbons, the sparks, the rings, the kart's change of shape, the camera and the screen follow
 */
export const boostFx = (kind: BoostKind | null): BoostLook =>
  kind ? { boosting: true, boostKind: kind } : { boosting: false }

/**
 * Which boost a kart's own state says is running, the strongest first; null for none. `launch` is
 * what the start boost counts as: a perfect one `start`, a small one `mini`
 */
export function boostKindOf(
  state: { boostSeconds: number; miniSeconds: number; launchSeconds?: number },
  launch: BoostKind = 'start',
): BoostKind | null {
  if (state.boostSeconds > 0) return 'n2o'
  if ((state.launchSeconds ?? 0) > 0) return launch
  if (state.miniSeconds > 0) return 'mini'
  return null
}

/**
 * A boost that only says it runs (the wire's one bit) counts as an instant boost until it has run
 * this long, then as a full one: an instant boost lasts 0.5 to 0.7 s, a full boost about 3 s
 */
export const DERIVE_FULL_SECONDS = 0.75
/** The change of shape takes this long to open, and this long to close */
export const MORPH_IN_SECONDS = 0.25
export const MORPH_OUT_SECONDS = 0.3

export interface BoostReading {
  /** The boost running, or null */
  readonly kind: BoostKind | null
  /** The last boost that ran: its colours while the flames die away */
  readonly last: BoostKind
  /** 0 to 1: how far the kart's shape has changed (linear; morphEase shapes it) */
  readonly morph: number
  /** 0 to 1: how far the flames are lit, coming up fast and dying away */
  readonly heat: number
  /** Counts boosts fired (and a boost growing into a full one): the burst, the rings */
  readonly fired: number
  /** How hard the last of those kicked, 0 to 1 */
  readonly power: number
  /** Seconds since the last one fired */
  readonly age: number
}

export const NO_BOOST: BoostReading = {
  kind: null,
  last: 'mini',
  morph: 0,
  heat: 0,
  fired: 0,
  power: 0,
  age: Infinity,
}

/** What the reader needs of a look (KartLook has it) */
export interface BoostInput extends BoostLook {
  /** Counts boosts fired, where the caller knows (this browser's own kart) */
  readonly bursts?: number
  readonly burstPower?: number
}

interface ReaderMemory extends BoostReading {
  readonly held: number
  readonly bursts: number
}

/**
 * One frame of reading a kart's boost from its look, `seconds` long. Pure: give it back what it
 * returned. A look with `bursts` (this browser's own kart) fires when that count goes up; one
 * without fires when the boost starts and again when it grows into a full one
 */
export function readBoost(
  before: BoostReading,
  look: BoostInput,
  seconds: number,
): BoostReading {
  const memory = before as Partial<ReaderMemory>
  const held = look.boosting ? (memory.held ?? 0) + seconds : 0
  const kind: BoostKind | null = !look.boosting
    ? null
    : (look.boostKind ?? (held >= DERIVE_FULL_SECONDS ? 'n2o' : 'mini'))
  let { fired, power } = before
  let age = before.age + seconds
  const bursts = look.bursts ?? memory.bursts ?? 0
  if (look.bursts !== undefined) {
    if (look.bursts > (memory.bursts ?? look.bursts)) {
      fired++
      power = look.burstPower ?? (kind ? BOOST_FX[kind].power : 0.6)
      age = 0
    }
  } else if (kind && kind !== before.kind) {
    // Started, or grown from an instant boost into a full one
    const grew = before.kind === null || BOOST_FX[kind].power > BOOST_FX[before.kind].power
    if (grew) {
      fired++
      power = BOOST_FX[kind].power
      age = 0
    }
  }
  const open = kind !== null && BOOST_FX[kind].transforms
  const morph = open
    ? Math.min(1, before.morph + seconds / MORPH_IN_SECONDS)
    : Math.max(0, before.morph - seconds / MORPH_OUT_SECONDS)
  const heat = kind
    ? Math.min(1, before.heat + seconds / 0.08)
    : Math.max(0, before.heat - seconds / 0.22)
  const reading: ReaderMemory = {
    kind,
    last: kind ?? before.last,
    morph,
    heat,
    fired,
    power,
    age,
    held,
    bursts,
  }
  return reading
}

/** The change of shape's ease: slow out of the closed shape, a small overshoot into the open one */
export function morphEase(morph: number): number {
  const t = Math.max(0, Math.min(1, morph))
  const s = 1.4
  const u = t - 1
  return Math.max(0, 1 + u * u * ((s + 1) * u + s))
}
