// e10-t07 (AC-10.5): a track made in the editor (/kart/editor), as pieces laid end to end: straights
// and bends, each with its road width, and on it a boost pad or a row of item boxes. The pieces are
// what is saved, shared in a link and sent to a room; the road, the gates, the grid and everything
// else a race needs are worked out from them (layout.ts, build.ts), the same way in the browser and
// in the Worker. Pure.
//
// Coordinates as in track.ts: metres, x to the right, z towards the viewer, heading 0 faces -z and
// grows clockwise. A track starts at the origin facing heading 0; the start line is there.

import { TRACK_THEME_NAMES, type TrackThemeName } from '../track.ts'

/** The light and sky a track is drawn in: the ones the hand-made tracks use (kartTokens.ts) */
export const TRACK_THEMES = TRACK_THEME_NAMES
export type TrackTheme = TrackThemeName

/** Where on a piece its boost pad lies, across the road; `none` for no pad */
export const PAD_PLACES = ['none', 'left', 'middle', 'right'] as const
export type PadPlace = (typeof PAD_PLACES)[number]

interface PieceBase {
  /** Kerb to kerb at the piece's end, metres; it blends in from the piece before */
  readonly width: number
  readonly pad: PadPlace
  /** A row of item boxes across the road at the piece's middle */
  readonly boxes: boolean
}

export interface Straight extends PieceBase {
  readonly kind: 'straight'
  /** Metres */
  readonly length: number
}

export interface Turn extends PieceBase {
  readonly kind: 'turn'
  /** Degrees; positive turns right (clockwise), negative left */
  readonly angle: number
  /** Of the centre line, metres */
  readonly radius: number
  /**
   * How far the road leans into the bend, degrees (2026-11-22, levels.ts): its outside raised,
   * eased in and out at the ends. Left out (every older code): level
   */
  readonly bank?: number
}

/**
 * A straight that climbs or falls (2026-11-17, terrain.ts): `rise` metres over its length, eased in
 * and out so the road bends smoothly into and out of the slope
 */
export interface Slope extends PieceBase {
  readonly kind: 'slope'
  readonly length: number
  /** Metres; positive climbs, negative falls */
  readonly rise: number
}

/**
 * A straight with a jump (2026-11-17, terrain.ts): a ramp RAMP_LENGTH metres long up to its lip,
 * `height` metres high, then the road on at the height it had, for the rest of `length` to land on.
 * No boost pad or item boxes on it: a car flies over them
 */
export interface Jump extends PieceBase {
  readonly kind: 'jump'
  readonly length: number
  /** The lip's height over the road, metres */
  readonly height: number
}

/**
 * A straight over or under (2026-11-22, levels.ts): the road climbs `rise` metres over its first
 * third (a viaduct) or falls that far (an underpass, `rise` below zero), holds it through its middle
 * third and comes back over its last. Another stretch of road may cross it there, under or over
 */
export interface Overpass extends PieceBase {
  readonly kind: 'overpass'
  readonly length: number
  readonly rise: number
}

export type Piece = Straight | Turn | Slope | Jump | Overpass

/** The jump ramp's length, from the road to its lip, metres */
export const RAMP_LENGTH = 14

/**
 * A bypass (2026-11-20, shared/kart/branches.ts): a road of its own beside the main road, from where
 * piece `from` begins to where piece `to` ends, `offset` metres to one side of the middle (eased
 * out and back in over BYPASS_EASE metres at each end), `width` wide
 */
export interface Bypass {
  readonly from: number
  readonly to: number
  /** -1 left of the road, 1 right */
  readonly side: -1 | 1
  readonly offset: number
  readonly width: number
  /**
   * What stands on it (2026-11-22, #113): a jump in its middle, a wall that leaves only the first
   * few metres of its mouth open, or a wall across it with a slot. Left out: nothing
   */
  readonly feature?: BypassFeature
}

/** What a bypass may have on it (2026-11-22) */
export const BYPASS_FEATURES = ['jump', 'wall', 'slot'] as const
export type BypassFeature = (typeof BYPASS_FEATURES)[number]

export interface TrackSpec {
  /** What its maker called it; may be empty (the page then says "untitled") */
  readonly name: string
  readonly theme: TrackTheme
  readonly pieces: readonly Piece[]
  /** Bypasses (2026-11-20); left out when there are none, as every older code has them */
  readonly bypasses?: readonly Bypass[]
}

/** A bypass eases out from the road and back in over this many metres at each end */
export const BYPASS_EASE = 70

/** The limits a piece and a track are held to: the editor's controls and the checks use the same */
export const LIMITS = {
  /** The owner's rule: room for eight karts side by side, and then some */
  minWidth: 28,
  maxWidth: 60,
  minLength: 1,
  maxLength: 400,
  minRadius: 15,
  maxRadius: 400,
  /** Degrees either way */
  maxAngle: 360,
  minPieces: 3,
  maxPieces: 60,
  /** Of the whole loop, metres */
  minTrack: 300,
  maxTrack: 6000,
  /** Characters of the name */
  maxName: 24,
  // Slopes and jumps (2026-11-17)
  minSlope: 30,
  /** Metres either way, of one slope */
  maxRise: 24,
  /** A slope rises at most this much for each metre of its length on average (eased: 1.5 times at its steepest) */
  maxGrade: 0.12,
  /** The road never goes higher or lower than this from the start line, metres */
  maxHeight: 40,
  minJump: 50,
  maxJump: 200,
  minJumpHeight: 1,
  maxJumpHeight: 4,
  // Bypasses (2026-11-20)
  maxBypasses: 3,
  minBypassOffset: 20,
  maxBypassOffset: 90,
  minBypassWidth: 10,
  maxBypassWidth: 30,
  // Banked bends and roads over roads (2026-11-22, levels.ts)
  /** Degrees a bend leans at the most */
  maxBank: 15,
  minOverpass: 180,
  maxOverpass: 400,
  /** Metres up or down, either way */
  minOverpassRise: 3.5,
  maxOverpassRise: 9,
} as const

/** Rounds to the tenth that every number in a spec is kept to */
export const tenth = (value: number): number => Math.round(value * 10) / 10

export const straight = (length: number, width = 36, more: Partial<PieceBase> = {}): Straight => ({
  kind: 'straight',
  length,
  width,
  pad: 'none',
  boxes: false,
  ...more,
})

export const turn = (
  angle: number,
  radius: number,
  width = 36,
  more: Partial<PieceBase> & { bank?: number } = {},
): Turn => ({ kind: 'turn', angle, radius, width, pad: 'none', boxes: false, ...more })

export const slope = (
  length: number,
  rise: number,
  width = 36,
  more: Partial<PieceBase> = {},
): Slope => ({ kind: 'slope', length, rise, width, pad: 'none', boxes: false, ...more })

/** A straight over (rise above zero) or under (below) another stretch of road (2026-11-22) */
export const overpass = (
  length = 220,
  rise = 4.5,
  width = 36,
  more: Partial<PieceBase> = {},
): Overpass => ({ kind: 'overpass', length, rise, width, pad: 'none', boxes: false, ...more })

export const jump = (length = 80, height = 2.5, width = 36): Jump => ({
  kind: 'jump',
  length,
  height,
  width,
  pad: 'none',
  boxes: false,
})

/** A new track: a plain loop that is already legal, to change from */
export const starterSpec = (): TrackSpec => ({
  name: '',
  theme: 'day',
  pieces: [
    straight(120, 36, { boxes: true }),
    turn(90, 60),
    straight(80),
    turn(90, 60),
    straight(240, 36, { pad: 'left' }),
    turn(90, 60),
    straight(80),
    turn(90, 60),
    straight(120),
  ],
})
