// 2026-11-23 (e11-t06): each tier's colour, for a badge's emblem and its panel's bar (tokens.ts only)
import { color } from '../styles/tokens.ts'

export const TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: color.brand,
  2: color.magenta,
  3: color.chipFace,
}
