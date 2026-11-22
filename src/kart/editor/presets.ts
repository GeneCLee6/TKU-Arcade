// e10-t07: the editor's piece library. Each button adds one piece or a few (an S-bend is two), all of
// them ordinary pieces that can be changed afterwards; the road keeps the width it had.
import {
  jump,
  overpass,
  slope,
  straight,
  turn,
  type Piece,
} from '../../../shared/kart/editor/spec.ts'
import type { KartEditorKey } from '../../../shared/kart/i18n.editor.ts'

export interface Preset {
  readonly id: string
  readonly label: KartEditorKey
  /** The pieces, given the width of the road where they go in */
  make(width: number): Piece[]
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'straightShort',
    label: 'kart.editor.preset.straightShort',
    make: (w) => [straight(60, w)],
  },
  { id: 'straightLong', label: 'kart.editor.preset.straightLong', make: (w) => [straight(180, w)] },
  { id: 'gentleLeft', label: 'kart.editor.preset.gentleLeft', make: (w) => [turn(-45, 120, w)] },
  { id: 'gentleRight', label: 'kart.editor.preset.gentleRight', make: (w) => [turn(45, 120, w)] },
  { id: 'left', label: 'kart.editor.preset.left', make: (w) => [turn(-90, 60, w)] },
  { id: 'right', label: 'kart.editor.preset.right', make: (w) => [turn(90, 60, w)] },
  {
    id: 'sharpLeft',
    label: 'kart.editor.preset.sharpLeft',
    make: (w) => [turn(-120, Math.max(36, w / 2 + 8), w)],
  },
  {
    id: 'sharpRight',
    label: 'kart.editor.preset.sharpRight',
    make: (w) => [turn(120, Math.max(36, w / 2 + 8), w)],
  },
  {
    id: 'hairpinLeft',
    label: 'kart.editor.preset.hairpinLeft',
    make: (w) => [turn(-180, Math.max(40, w / 2 + 10), w)],
  },
  {
    id: 'hairpinRight',
    label: 'kart.editor.preset.hairpinRight',
    make: (w) => [turn(180, Math.max(40, w / 2 + 10), w)],
  },
  {
    id: 'sLeft',
    label: 'kart.editor.preset.sLeft',
    make: (w) => [turn(-45, 80, w), turn(45, 80, w)],
  },
  {
    id: 'sRight',
    label: 'kart.editor.preset.sRight',
    make: (w) => [turn(45, 80, w), turn(-45, 80, w)],
  },
  { id: 'narrow', label: 'kart.editor.preset.narrow', make: () => [straight(100, 28)] },
  { id: 'wide', label: 'kart.editor.preset.wide', make: () => [straight(100, 52)] },
  {
    id: 'boost',
    label: 'kart.editor.preset.boost',
    make: (w) => [straight(80, w, { pad: 'middle' })],
  },
  {
    id: 'boxes',
    label: 'kart.editor.preset.boxes',
    make: (w) => [straight(60, w, { boxes: true })],
  },
  // 2026-11-17: slopes and jumps (shared/kart/terrain.ts). A climb wants a fall somewhere after it
  { id: 'uphill', label: 'kart.editor.preset.uphill', make: (w) => [slope(100, 8, w)] },
  { id: 'downhill', label: 'kart.editor.preset.downhill', make: (w) => [slope(100, -8, w)] },
  { id: 'jump', label: 'kart.editor.preset.jump', make: (w) => [jump(80, 2.5, w)] },
  // 2026-11-22 (shared/kart/levels.ts): a road over a road, and bends that lean into themselves.
  // A viaduct wants an underpass (or a flat road) to cross it at its middle
  { id: 'overpass', label: 'kart.editor.preset.overpass', make: (w) => [overpass(220, 4.5, w)] },
  { id: 'underpass', label: 'kart.editor.preset.underpass', make: (w) => [overpass(220, -4.5, w)] },
  {
    id: 'bankedLeft',
    label: 'kart.editor.preset.bankedLeft',
    make: (w) => [turn(-90, 70, w, { bank: 10 })],
  },
  {
    id: 'bankedRight',
    label: 'kart.editor.preset.bankedRight',
    make: (w) => [turn(90, 70, w, { bank: 10 })],
  },
]
