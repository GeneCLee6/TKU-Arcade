// 2026-11-20 (§4.43): a place number that has just changed, as the race's HUD shows it (RaceShow.tsx)
import { css, keyframes } from 'styled-components'
import { color } from '../../styles/tokens.ts'

const bumpIn = keyframes`
  0% { transform: scale(1.7); }
  60% { transform: scale(0.92); }
  100% { transform: scale(1); }
`

/** A place number that has just changed: bumped in, coloured by which way it went for a moment */
export const placeBump = (up: boolean) => css`
  display: inline-block;
  color: ${up ? color.success : color.danger};
  animation: ${bumpIn} 420ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
  transition: color 0.6s;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
