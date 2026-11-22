// The parts of a lobby card: GameCard's, and those of the Coming soon cards (ComingSoon.tsx, gone
// since the kart opened on 2026-11-14). A file of its own so that the lazy Coming soon chunk imported nothing else of GameCard: importing GameCard itself
// made the bundler split rulesDoc out of the first load into a chunk of its own, about 0.5 kB more
// on every first screen (E3)
import styled from 'styled-components'
import { cornerClip, displayType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Card } from './Card.tsx'

// The game's hue becomes the accent inside: its strip, its monogram, its "New room"
export const Body = styled(Card)<{ $hue: string }>`
  --color-accent: ${(p) => p.$hue};
  display: flex;
  flex-direction: column;
  gap: ${space.md}px;
  height: 100%;
  transition: translate 0.2s;

  &::before {
    transition: box-shadow 0.2s;
  }

  /* The hue down from the top edge, on the same cut shape as the glass */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      180deg,
      ${color.accent} 0 3px,
      color-mix(in srgb, ${color.accent} 14%, transparent) 3px,
      transparent 60%
    );
    clip-path: ${cornerClip(16)};
    pointer-events: none;
  }

  /* Lifted, a neon edge in the game's hue, and the cover leans in (2026-11-23) */
  &:hover,
  &:focus-within {
    translate: 0 -${space.xs}px;
  }

  &:hover::before,
  &:focus-within::before {
    box-shadow:
      inset 0 0 0 1px ${color.accent},
      inset 0 0 ${space.xl}px color-mix(in srgb, ${color.accent} 30%, transparent);
  }

  &:hover svg {
    transform: scale(1.05) translateX(-${space.xs}px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:focus-within {
      translate: none;
    }

    &:hover svg {
      transform: none;
    }
  }

  & > button {
    margin-top: auto;
  }

  @media (max-width: 480px) {
    gap: ${space.sm}px;
    padding: ${space.lg}px;
  }
`

/** The card's broadcast cover (2026-11-23): GameCover, drawn in the game's hue, full bleed at the top */
export const Cover = styled.div`
  display: grid;
  place-items: center;
  height: 112px;
  margin: -${space.xl}px -${space.xl}px 0;
  overflow: hidden;
  color: ${color.accent};
  clip-path: ${cornerClip(16)};

  & > svg {
    transition: transform 0.3s;
  }

  @media (max-width: 480px) {
    height: 88px;
    margin: -${space.lg}px -${space.lg}px 0;
  }
`

export const Heading = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

// Stands in for the illustrations of a later batch: a hexagon in the game's hue
export const Monogram = styled.span`
  display: grid;
  place-items: center;
  flex: none;
  width: ${space.xxxl}px;
  height: ${space.xxxl}px;
  background: ${color.accent};
  color: ${color.onAccent};
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  ${displayType}
  font-size: ${fontSize.xl}px;
`

export const Name = styled.h3`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xl}px;
`

export const Summary = styled.p`
  margin: 0;
  color: ${color.muted};
`
