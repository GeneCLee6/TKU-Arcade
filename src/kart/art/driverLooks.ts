// 2026-11-23 (docs/KART-WORLD.md §3.1–3.2; owner: "each one's looks, clothes ... every one different"):
// what makes each driver themselves at a glance, as data (driverModel.ts, driverHelmets.ts and
// driverOutfits.ts draw it; a test reads it). A build of their own (height, shoulders, girth), a
// helmet of their own, one thing of their own besides it, and each outfit's cut. All ours, made in
// code: no driver is drawn after anyone's character.
import type { DriverId } from '../../../shared/kart/karts.ts'
import type { OutfitId } from '../../../shared/kart/outfits.ts'

/** A driver's build, each a factor of the standard driver's (1) */
export interface DriverBuild {
  /** The whole driver, scaled about the seat */
  readonly height: number
  /** Across the shoulders and the chest */
  readonly shoulders: number
  /** Front to back, and the limbs' thickness */
  readonly girth: number
}

/**
 * The helmet's cut: `blade` long and low with a fin down its crown (Spade); `bubble` round with a big
 * visor (Hartie); `facet` cut in flat faces, a narrow visor like a pair of glasses (Dee); `moto` big
 * and round with a peak and a long chin (Clover)
 */
export type HelmetStyle = 'blade' | 'bubble' | 'facet' | 'moto'

/**
 * One thing of their own besides the helmet: Spade's scarf, its two tails behind; Hartie's ponytail
 * out of the helmet's back, tied with a ribbon; Dee's headset over the helmet, a boom mic; Clover's
 * towel round the neck
 */
export type DriverFeature = 'scarf' | 'ponytail' | 'headset' | 'towel'

/** What a driver holds in their win (driverGestures.ts's `prop`): nothing, a calculator, a dumbbell */
export type DriverProp = 'none' | 'calculator' | 'dumbbell'

/**
 * How an outfit is cut. `suit` the race suit (harness, armour, knee pads); `coat` a long coat;
 * `hoodie` a hood and a front pocket; `vest` a vest of pockets over a long sleeve; `tracksuit` stripes
 * down the arms and legs; `varsity` a club jacket, its sleeves another colour, ribbed bands; `blazer`
 * lapels and a breast pocket; `jersey` a sports top with a big number on the front
 */
export type OutfitCut =
  'suit' | 'coat' | 'hoodie' | 'vest' | 'tracksuit' | 'varsity' | 'blazer' | 'jersey'

export interface DriverLook {
  readonly build: DriverBuild
  readonly helmet: HelmetStyle
  readonly feature: DriverFeature
  readonly prop: DriverProp
  /** Whether their win throws hearts (driverProps.ts) */
  readonly hearts: boolean
  readonly outfits: { readonly [O in OutfitId]: OutfitCut }
}

export const DRIVER_LOOKS: { readonly [D in DriverId]: DriverLook } = {
  // Tall and lean
  spade: {
    build: { height: 1.05, shoulders: 0.95, girth: 0.92 },
    helmet: 'blade',
    feature: 'scarf',
    prop: 'none',
    hearts: false,
    outfits: { race: 'suit', street: 'coat', campus: 'varsity' },
  },
  // Small and slight
  heart: {
    build: { height: 0.94, shoulders: 0.9, girth: 0.94 },
    helmet: 'bubble',
    feature: 'ponytail',
    prop: 'none',
    hearts: true,
    outfits: { race: 'suit', street: 'hoodie', campus: 'varsity' },
  },
  // Middling, narrow
  diamond: {
    build: { height: 1, shoulders: 0.96, girth: 0.96 },
    helmet: 'facet',
    feature: 'headset',
    prop: 'calculator',
    hearts: false,
    outfits: { race: 'suit', street: 'vest', campus: 'blazer' },
  },
  // Short of Spade, broad and solid
  club: {
    build: { height: 0.98, shoulders: 1.14, girth: 1.12 },
    helmet: 'moto',
    feature: 'towel',
    prop: 'dumbbell',
    hearts: false,
    outfits: { race: 'suit', street: 'tracksuit', campus: 'jersey' },
  },
}

/** The limits a build keeps to, so that every driver still sits in every kart and reaches its wheel */
export const BUILD_LIMITS = { min: 0.88, max: 1.16 } as const
