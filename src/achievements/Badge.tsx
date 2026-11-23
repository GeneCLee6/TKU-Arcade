// 2026-11-23 (e11-t06, docs/DESIGN.md §3.8): an achievement's emblem, drawn here (no image to host): a
// cut hexagon in its tier's colour, the category's mark inside. Locked, it is grey; hidden and locked,
// a question mark. Only for the eye: the name beside it says what it is.
import styled from 'styled-components'
import { color } from '../styles/tokens.ts'
import type { Category } from './rules.ts'
import { TIER_COLORS } from './tiers.ts'

/** A cut hexagon, 0 to 64 */
const HEX = 'M32 2 L58 17 L58 47 L32 62 L6 47 L6 17 Z'
const INNER = 'M32 9 L52 20.5 L52 43.5 L32 55 L12 43.5 L12 20.5 Z'

/** Each category's mark: a speed chevron, a card's diamond, the arcade's star */
const MARKS: Record<Category, string> = {
  kart: 'M18 22 L30 32 L18 42 L23 42 L35 32 L23 22 Z M30 22 L42 32 L30 42 L35 42 L47 32 L35 22 Z',
  board: 'M32 18 L44 32 L32 46 L20 32 Z',
  platform:
    'M32 17 L36 27.5 L47 28 L38.5 35 L41.5 46 L32 39.5 L22.5 46 L25.5 35 L17 28 L28 27.5 Z',
}

export function BadgeEmblem({
  category,
  tier,
  unlocked,
  hidden,
  size = 56,
}: {
  category: Category
  tier: 1 | 2 | 3
  unlocked: boolean
  hidden: boolean
  size?: number
}) {
  const fill = unlocked ? TIER_COLORS[tier] : color.raised
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" $on={unlocked}>
      <path d={HEX} fill={fill} />
      <path d={INNER} fill="none" stroke={unlocked ? color.surface : color.border} strokeWidth="2" opacity="0.6" />
      {hidden && !unlocked ? (
        <text x="32" y="42" textAnchor="middle" fontSize="26" fontWeight="900" fill={color.muted}>
          ?
        </text>
      ) : (
        <path d={MARKS[category]} fill={unlocked ? color.surface : color.muted} />
      )}
      {/* The tier's pips under the mark */}
      {[0, 1, 2].slice(0, tier).map((pip) => (
        <rect
          key={pip}
          x={32 - tier * 3.5 + pip * 7}
          y="50"
          width="5"
          height="2.5"
          fill={unlocked ? color.surface : color.border}
        />
      ))}
    </Svg>
  )
}

const Svg = styled.svg<{ $on: boolean }>`
  flex: none;
  filter: ${({ $on }) => ($on ? `drop-shadow(0 0 8px color-mix(in srgb, ${color.accent} 45%, transparent))` : 'none')};
`
