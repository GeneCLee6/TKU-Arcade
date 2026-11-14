// e8-t03: what the tuning panel may change, the named presets, and reading and writing them as JSON.
// Pure, so that the checks run in Node: a preset shared as JSON is untrusted text, and nothing it
// says may reach the physics unless every number in it is in range.
import {
  INITIAL_KART,
  KART_TUNING,
  kartSlip,
  NO_INPUT,
  stepKart,
  type KartInput,
  type KartState,
  type KartTuning,
} from './physics.ts'

export type TuningKey = keyof typeof KART_TUNING

export const TUNING_GROUPS = ['speed', 'steering', 'drift', 'boost', 'technique', 'walls'] as const
export type TuningGroup = (typeof TUNING_GROUPS)[number]

/** How a number reads on the panel: its unit decides the words around it */
export type TuningUnit =
  | 'metresPerSecond'
  | 'metresPerSecondSquared'
  | 'perSecond'
  | 'radiansPerSecond'
  | 'degrees'
  | 'seconds'
  | 'pointsPerSecond'
  | 'points'
  | 'factor'
  | 'share'
  | 'count'

export interface TuningSpec {
  readonly group: TuningGroup
  readonly min: number
  readonly max: number
  /** The slider's step, in the unit shown */
  readonly step: number
  readonly unit: TuningUnit
}

const DEGREE = Math.PI / 180

/**
 * Every number the panel shows, in the order it shows them, with the range it allows. The ranges are
 * wide enough to feel the difference and narrow enough that the physics stays sane: at the highest
 * top speed and boost the car still moves under 3 m a step, which the walls handle (walls.ts checks
 * every 0.6 m of travel). Angles are stored in radians and shown in degrees: their min and max here
 * are degrees.
 */
export const TUNING_SPECS: { readonly [K in TuningKey]: TuningSpec } = {
  topSpeed: { group: 'speed', min: 15, max: 80, step: 0.5, unit: 'metresPerSecond' },
  acceleration: { group: 'speed', min: 4, max: 50, step: 0.5, unit: 'metresPerSecondSquared' },
  braking: { group: 'speed', min: 5, max: 80, step: 1, unit: 'metresPerSecondSquared' },
  coastDrag: { group: 'speed', min: 0, max: 15, step: 0.5, unit: 'metresPerSecondSquared' },
  reverseSpeed: { group: 'speed', min: 2, max: 15, step: 0.5, unit: 'metresPerSecond' },

  turnRate: { group: 'steering', min: 0.5, max: 5, step: 0.05, unit: 'radiansPerSecond' },
  turnLossAtTopSpeed: { group: 'steering', min: 0, max: 0.9, step: 0.05, unit: 'share' },
  fullTurnSpeed: { group: 'steering', min: 1, max: 15, step: 0.5, unit: 'metresPerSecond' },
  grip: { group: 'steering', min: 1, max: 30, step: 0.5, unit: 'perSecond' },

  driftTurnRate: { group: 'drift', min: 0.3, max: 4, step: 0.05, unit: 'radiansPerSecond' },
  driftSteerRate: { group: 'drift', min: 0, max: 2, step: 0.05, unit: 'radiansPerSecond' },
  driftAlign: { group: 'drift', min: 0.5, max: 10, step: 0.1, unit: 'perSecond' },
  driftMaxSlip: { group: 'drift', min: 10, max: 70, step: 1, unit: 'degrees' },
  driftScrub: { group: 'drift', min: 0, max: 120, step: 1, unit: 'metresPerSecondSquared' },
  driftRecovery: { group: 'drift', min: 0.05, max: 1.5, step: 0.05, unit: 'seconds' },
  driftGaugeSlip: { group: 'drift', min: 10, max: 70, step: 1, unit: 'degrees' },
  driftMinSpeed: { group: 'drift', min: 2, max: 20, step: 0.5, unit: 'metresPerSecond' },
  driftExitSpeed: { group: 'drift', min: 1, max: 15, step: 0.5, unit: 'metresPerSecond' },

  gaugeFillRate: { group: 'boost', min: 5, max: 150, step: 1, unit: 'pointsPerSecond' },
  gaugeDriftBonus: { group: 'boost', min: 0, max: 50, step: 1, unit: 'points' },
  boostGaugeShare: { group: 'boost', min: 0, max: 1, step: 0.05, unit: 'share' },
  maxStoredBoosts: { group: 'boost', min: 1, max: 3, step: 1, unit: 'count' },
  boostDuration: { group: 'boost', min: 0.2, max: 6, step: 0.05, unit: 'seconds' },
  boostTopSpeedFactor: { group: 'boost', min: 1, max: 2, step: 0.01, unit: 'factor' },
  boostAcceleration: { group: 'boost', min: 0, max: 120, step: 1, unit: 'metresPerSecondSquared' },
  overSpeedDrag: { group: 'boost', min: 0, max: 30, step: 0.5, unit: 'metresPerSecondSquared' },
  boostStackSeconds: { group: 'boost', min: 0, max: 4, step: 0.05, unit: 'seconds' },
  boostStackFactor: { group: 'boost', min: 1, max: 2.2, step: 0.01, unit: 'factor' },
  boostMaxSeconds: { group: 'boost', min: 1, max: 12, step: 0.25, unit: 'seconds' },
  padBoostSeconds: { group: 'boost', min: 0, max: 4, step: 0.05, unit: 'seconds' },

  startWindow: { group: 'technique', min: 0.05, max: 1, step: 0.05, unit: 'seconds' },
  startBoostDuration: { group: 'technique', min: 0, max: 4, step: 0.05, unit: 'seconds' },
  startStallSeconds: { group: 'technique', min: 0, max: 2, step: 0.05, unit: 'seconds' },
  releaseWindow: { group: 'technique', min: 0.05, max: 1, step: 0.05, unit: 'seconds' },
  chainDuration: { group: 'technique', min: 0, max: 3, step: 0.05, unit: 'seconds' },
  miniTopSpeedFactor: { group: 'technique', min: 1, max: 2, step: 0.01, unit: 'factor' },
  miniAcceleration: {
    group: 'technique',
    min: 0,
    max: 120,
    step: 1,
    unit: 'metresPerSecondSquared',
  },
  chainGrace: { group: 'technique', min: 0, max: 1.5, step: 0.05, unit: 'seconds' },
  chainMinDrift: { group: 'technique', min: 0, max: 1.5, step: 0.05, unit: 'seconds' },
  slideBoostDrain: { group: 'technique', min: 0.1, max: 1, step: 0.05, unit: 'factor' },
  slideScrub: { group: 'technique', min: 0, max: 1, step: 0.05, unit: 'share' },
  chainSpeedStep: { group: 'technique', min: 0, max: 0.1, step: 0.01, unit: 'share' },
  chainSpeedLinks: { group: 'technique', min: 0, max: 10, step: 1, unit: 'count' },
  doubleWindow: { group: 'technique', min: 0, max: 1.5, step: 0.05, unit: 'seconds' },
  catchGrip: { group: 'technique', min: 1, max: 6, step: 0.1, unit: 'factor' },
  catchSeconds: { group: 'technique', min: 0, max: 1, step: 0.05, unit: 'seconds' },

  wallBounce: { group: 'walls', min: 0, max: 1, step: 0.05, unit: 'share' },
  wallImpactLoss: { group: 'walls', min: 0, max: 1, step: 0.05, unit: 'share' },
  wallScrapeDrag: { group: 'walls', min: 0, max: 30, step: 0.5, unit: 'metresPerSecondSquared' },
  wallBreakSpeed: { group: 'walls', min: 0, max: 20, step: 0.5, unit: 'metresPerSecond' },
}

export const TUNING_KEYS = Object.keys(TUNING_SPECS) as TuningKey[]

/** A stored value as the panel shows it: degrees for an angle, without the rounding error of radians */
export const shownValue = (key: TuningKey, value: number): number =>
  TUNING_SPECS[key].unit === 'degrees' ? Math.round((value / DEGREE) * 1e9) / 1e9 : value

/** A value from the panel as the physics stores it, rounded to the slider's step */
export function storedValue(key: TuningKey, shown: number): number {
  const { step, unit } = TUNING_SPECS[key]
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  const rounded = Number((Math.round(shown / step) * step).toFixed(decimals))
  return unit === 'degrees' ? rounded * DEGREE : rounded
}

/** Whether `value` may go into `key`: a finite number in range, a whole one for a count */
export function validValue(key: TuningKey, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const { min, max, unit } = TUNING_SPECS[key]
  if (unit === 'count' && !Number.isInteger(value)) return false
  const shown = shownValue(key, value)
  // Degrees come back from radians with rounding error on the very ends
  return shown >= min - 1e-9 && shown <= max + 1e-9
}

export const PRESET_IDS = ['standard', 'planted', 'loose'] as const
export type PresetId = (typeof PRESET_IDS)[number]

/**
 * Three starting points, all original. `standard` is J2's numbers (plus J3's walls), retuned
 * 2026-11-14 (faster, longer boosts, the techniques, then the drift as a real slide). `planted`
 * keeps more grip in a drift and slides at a narrower angle, scrubbing off less speed, so it is
 * easier. `loose` slides wider and longer and scrubs off more, with a shorter release window, so it
 * is harder. None is a signed-off feel (AC-8.8).
 */
export const PRESETS: { readonly [P in PresetId]: KartTuning } = {
  standard: KART_TUNING,
  planted: {
    ...KART_TUNING,
    turnRate: 2.7,
    grip: 16,
    driftTurnRate: 1.8,
    driftSteerRate: 0.8,
    driftAlign: 3.6,
    driftMaxSlip: 42 * DEGREE,
    driftScrub: 30,
    driftRecovery: 0.25,
    gaugeFillRate: 55,
    chainGrace: 0.4,
    releaseWindow: 0.35,
    wallImpactLoss: 0.4,
  },
  loose: {
    ...KART_TUNING,
    turnRate: 2.3,
    grip: 6,
    driftTurnRate: 1.6,
    driftSteerRate: 0.9,
    driftAlign: 1.6,
    driftMaxSlip: 66 * DEGREE,
    driftScrub: 52,
    driftRecovery: 0.55,
    gaugeFillRate: 60,
    boostDuration: 2.8,
    chainGrace: 0.65,
    releaseWindow: 0.25,
    chainDuration: 0.6,
    wallImpactLoss: 0.6,
  },
}

/** The preset these numbers are, or undefined when they have been changed from every preset */
export function presetOf(tuning: KartTuning): PresetId | undefined {
  return PRESET_IDS.find((id) => TUNING_KEYS.every((key) => PRESETS[id][key] === tuning[key]))
}

/** What exported JSON says it is, so that a file of something else is not taken for a preset */
export const TUNING_KIND = 'tku-arcade.kart.tuning'
export const TUNING_VERSION = 1

/** Longer than any real preset by far: a pasted novel is not read */
export const MAX_TUNING_TEXT = 20_000

export function serializeTuning(tuning: KartTuning): string {
  const values = Object.fromEntries(TUNING_KEYS.map((key) => [key, tuning[key]]))
  return JSON.stringify({ kind: TUNING_KIND, version: TUNING_VERSION, tuning: values }, null, 2)
}

export type TuningError =
  /** Not JSON at all, or too long to be a preset */
  | { readonly reason: 'notJson' }
  /** JSON, but not a preset: not an object, another kind, a newer version, or no known numbers */
  | { readonly reason: 'notTuning' }
  /** A number that is missing its type or out of range */
  | { readonly reason: 'badValue'; readonly key: TuningKey }

export type TuningParse =
  | {
      readonly ok: true
      readonly tuning: KartTuning
      /** Numbers the text did not give, which keep the fallback's value */
      readonly missing: readonly TuningKey[]
      /** Names in the text that are not numbers the physics knows, which are ignored */
      readonly ignored: readonly string[]
    }
  | { readonly ok: false; readonly error: TuningError }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads exported JSON (or just its `tuning` object). Every number given must be valid or nothing is
 * taken: a half-applied preset would be worse than none. Numbers not given keep `fallback`'s value,
 * so a preset from before a new number existed still loads.
 */
export function parseTuning(text: string, fallback: KartTuning = KART_TUNING): TuningParse {
  if (text.length > MAX_TUNING_TEXT) return { ok: false, error: { reason: 'notJson' } }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: { reason: 'notJson' } }
  }
  if (!isRecord(data)) return { ok: false, error: { reason: 'notTuning' } }
  let values: Record<string, unknown> = data
  if ('kind' in data || 'tuning' in data) {
    if (data.kind !== TUNING_KIND || !isRecord(data.tuning)) {
      return { ok: false, error: { reason: 'notTuning' } }
    }
    if (data.version !== undefined && data.version !== TUNING_VERSION) {
      return { ok: false, error: { reason: 'notTuning' } }
    }
    values = data.tuning
  }
  const known = new Set<string>(TUNING_KEYS)
  const given = TUNING_KEYS.filter((key) => Object.hasOwn(values, key))
  if (given.length === 0) return { ok: false, error: { reason: 'notTuning' } }
  const tuning = { ...fallback } as Record<TuningKey, number>
  for (const key of given) {
    const value = values[key]
    if (!validValue(key, value)) return { ok: false, error: { reason: 'badValue', key } }
    tuning[key] = value
  }
  return {
    ok: true,
    tuning,
    missing: TUNING_KEYS.filter((key) => !given.includes(key)),
    ignored: Object.keys(values).filter((name) => !known.has(name)),
  }
}

/** What the page stores: the numbers, and the preset they started from */
export interface StoredTuning {
  readonly tuning: KartTuning
  /** undefined when the numbers have been changed by hand */
  readonly preset: PresetId | undefined
}

/** Reads what the page stored; anything broken gives the standard preset */
export function parseStoredTuning(stored: string | null): StoredTuning {
  if (stored === null) return { tuning: KART_TUNING, preset: 'standard' }
  const parsed = parseTuning(stored)
  if (!parsed.ok) return { tuning: KART_TUNING, preset: 'standard' }
  return { tuning: parsed.tuning, preset: presetOf(parsed.tuning) }
}

const DRIFT_ENTRY_STEPS = 6
const SETTLE_STEPS = 180

/**
 * The slip angle a drift settles at with these numbers, in whole degrees, steering into the drift,
 * centred and out of it: what "drift angle" means on the panel. Measured by running the physics (the
 * angle comes from several numbers at once), from top speed, three seconds into a right-hand drift.
 * 0 when the drift does not last that long.
 */
export function steadySlips(tuning: KartTuning): { into: number; centred: number; out: number } {
  let start: KartState = INITIAL_KART
  const throttle: KartInput = { ...NO_INPUT, throttle: true }
  for (let step = 0; step < 240; step++) start = stepKart(start, throttle, tuning)
  const measure = (steer: number): number => {
    let state = start
    for (let step = 0; step < DRIFT_ENTRY_STEPS; step++) {
      state = stepKart(state, { ...throttle, steer: 1, drift: true }, tuning)
    }
    for (let step = 0; step < SETTLE_STEPS; step++) {
      state = stepKart(state, { ...throttle, steer, drift: true }, tuning)
    }
    return state.drifting ? Math.round(Math.abs(kartSlip(state)) / DEGREE) : 0
  }
  return { into: measure(1), centred: measure(0), out: measure(-1) }
}
