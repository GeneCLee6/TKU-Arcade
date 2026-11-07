import styled, { css } from 'styled-components'
import { color, fontSize, radius, space } from '../styles/tokens.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface ButtonStyleProps {
  $variant?: ButtonVariant
  $size?: ButtonSize
}

const variants = {
  primary: css`
    background: ${color.accent};
    color: ${color.onAccent};
    border-color: ${color.accent};
  `,
  secondary: css`
    background: ${color.surface};
    color: ${color.text};
    border-color: ${color.border};
  `,
  ghost: css`
    background: transparent;
    color: ${color.text};
    border-color: transparent;
  `,
  danger: css`
    background: transparent;
    color: ${color.danger};
    border-color: ${color.danger};
  `,
}

const sizes = {
  sm: css`
    min-height: 32px;
    padding: 0 ${space.md}px;
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
    padding: 0 ${space.lg}px;
    font-size: ${fontSize.md}px;
  `,
}

// type defaults to "button" so that a button inside a form never submits it by accident
export const Button = styled.button.attrs<ButtonStyleProps>((p) => ({
  type: p.type ?? 'button',
}))<ButtonStyleProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${space.sm}px;
  border: 1px solid transparent;
  border-radius: ${radius.component}px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  ${(p) => variants[p.$variant ?? 'primary']}
  ${(p) => sizes[p.$size ?? 'md']}

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
