import styled, { css, keyframes } from 'styled-components'
import { clippedFill, displayType, slantClip } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface ButtonStyleProps {
  $variant?: ButtonVariant
  $size?: ButtonSize
}

// A light sweeping across the primary button now and then
const sheen = keyframes`
  0%, 60% {
    transform: translateX(-130%);
  }

  100% {
    transform: translateX(130%);
  }
`

// The fill is the slanted ::before (esports.ts), so the button's own focus ring is never clipped
const variants = {
  primary: css`
    color: ${color.onAccent};

    &::before {
      background: ${color.accent};
    }

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: linear-gradient(
        100deg,
        transparent 32%,
        color-mix(in srgb, ${color.surface} 55%, transparent) 50%,
        transparent 68%
      );
      pointer-events: none;
      animation: ${sheen} 3.6s ease-in-out infinite;
    }

    &:disabled::after {
      display: none;
    }

    /* Still, not just shortened: GlobalStyle's reduced-motion rule alone would sweep it once */
    @media (prefers-reduced-motion: reduce) {
      &::after {
        display: none;
      }
    }
  `,
  secondary: css`
    color: ${color.text};

    &::before {
      background: ${color.raised};
      box-shadow: inset 0 0 0 1px ${color.border};
    }

    &:hover:not(:disabled)::before {
      background: ${color.raisedHover};
    }
  `,
  ghost: css`
    color: ${color.text};

    &:hover:not(:disabled)::before {
      background: ${color.raised};
    }
  `,
  danger: css`
    color: ${color.danger};

    &::before {
      background: color-mix(in srgb, ${color.danger} 12%, transparent);
      box-shadow: inset 0 0 0 1px ${color.danger};
    }

    &:hover:not(:disabled)::before {
      background: color-mix(in srgb, ${color.danger} 22%, transparent);
    }
  `,
}

const sizes = {
  sm: css`
    min-height: 32px;
    padding: 0 ${space.lg}px;
    font-size: ${fontSize.sm}px;

    /* Small to the eye, not to a finger */
    @media (pointer: coarse) {
      min-width: 44px;
      min-height: 44px;
    }
  `,
  // 44px: a comfortable touch target on a phone
  md: css`
    min-height: 44px;
    padding: 0 ${space.xl}px;
    font-size: ${fontSize.md}px;
  `,
}

/**
 * Slanted, with a cut at two corners. Primary is filled with the current hue (the brand's, or a game's)
 * and has a sheen; secondary a quiet fill; ghost only a hover; danger the danger colour.
 * type defaults to "button" so that a button inside a form never submits it by accident.
 */
export const Button = styled.button.attrs<ButtonStyleProps>((p) => ({
  type: p.type ?? 'button',
}))<ButtonStyleProps>`
  ${clippedFill(slantClip(12), 'transparent')}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${space.sm}px;
  overflow: hidden;
  background: transparent;
  border: 0;
  ${displayType}
  line-height: 1.1;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s;
  ${(p) => variants[p.$variant ?? 'primary']}
  ${(p) => sizes[p.$size ?? 'md']}

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
