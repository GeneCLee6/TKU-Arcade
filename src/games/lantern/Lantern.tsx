import styled, { css } from 'styled-components'
import { color, fontSize } from '../../styles/tokens.ts'

/** How a lantern looks: in a hand (`dark`, or `next` for your lowest) or on the avenue */
export type LanternLook = 'dark' | 'next' | 'lit' | 'early' | 'burned' | 'moon'

const SIZES = {
  sm: { width: 34, height: 40, font: fontSize.sm, cap: 12 },
  md: { width: 46, height: 56, font: fontSize.lg, cap: 16 },
  lg: { width: 92, height: 112, font: 44, cap: 32 },
} as const

export type LanternSize = keyof typeof SIZES

const LOOKS: Record<LanternLook, ReturnType<typeof css>> = {
  dark: css`
    color: ${color.text};
    background: ${color.sunken};
    border: 2px solid ${color.accent};
  `,
  next: css`
    color: ${color.onAccent};
    background: ${color.accent};
    border: 2px solid ${color.accent};
    box-shadow: 0 0 18px ${color.accent};
  `,
  lit: css`
    color: ${color.onAccent};
    background: ${color.accent};
    border: 2px solid ${color.accent};
  `,
  early: css`
    color: ${color.onAccent};
    background: ${color.danger};
    border: 2px solid ${color.danger};
  `,
  burned: css`
    color: ${color.muted};
    background: ${color.raised};
    border: 2px dashed ${color.danger};
    text-decoration: line-through;
  `,
  moon: css`
    color: ${color.text};
    background: ${color.raised};
    border: 2px dashed ${color.accent};
  `,
}

/**
 * A palace lantern with its number: a round paper body between two wooden caps, drawn in CSS from
 * the theme's colours (no asset). The number is the text, so it reads as a number to a screen reader.
 */
export const Lantern = styled.span<{ $look: LanternLook; $size?: LanternSize }>`
  position: relative;
  display: inline-grid;
  flex: none;
  place-items: center;
  width: ${(p) => SIZES[p.$size ?? 'md'].width}px;
  height: ${(p) => SIZES[p.$size ?? 'md'].height}px;
  border-radius: 46% / 40%;
  font-size: ${(p) => SIZES[p.$size ?? 'md'].font}px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  ${(p) => LOOKS[p.$look]}

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    width: ${(p) => SIZES[p.$size ?? 'md'].cap}px;
    height: 4px;
    background: ${color.muted};
    transform: translateX(-50%);
  }

  &::before {
    top: -5px;
  }

  &::after {
    bottom: -5px;
  }
`
