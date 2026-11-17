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
}

export type Piece = Straight | Turn

export interface TrackSpec {
  /** What its maker called it; may be empty (the page then says "untitled") */
  readonly name: string
  readonly theme: TrackTheme
  readonly pieces: readonly Piece[]
}

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
  more: Partial<PieceBase> = {},
): Turn => ({ kind: 'turn', angle, radius, width, pad: 'none', boxes: false, ...more })

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
