import { useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { clippedFill, displayType, slantClip } from '../../styles/esports.ts'
import { color, space } from '../../styles/tokens.ts'
import { mix } from './tableKit.ts'

export interface CaptionProps {
  /** A new value throws a new caption; null, or the value it mounted with, throws none */
  id: string | null
  /** Words the screen already shows elsewhere: the caption only repeats them, for the eye */
  text: string
  /** Magenta for what went wrong or is all at stake; the game's hue otherwise */
  tone?: 'accent' | 'magenta'
}

/** How long a caption stays over the table */
const SHOW_MS = 2000

/**
 * The caption itself (src/lib/lateParts.ts loads it late). It slams in oversized and tilted with a magenta and a
 * hue edge split off its words, a light sweeps across it, and it fades. With reduced motion it simply
 * shows and goes. Only for the eye: the words are what the screen says already, so the caption is
 * hidden from screen readers and its text is drawn by CSS, never in the page's text (a test or a
 * reader finding the words twice).
 */
export function EventCaption({ id, text, tone = 'accent' }: CaptionProps) {
  const seen = useRef(id)
  const [shown, setShown] = useState<{ id: string; text: string; tone: string } | null>(null)

  useEffect(() => {
    if (id === null || id === seen.current) return undefined
    seen.current = id
    setShown({ id, text, tone })
    const timer = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(timer)
    // The words go with the event that threw them, not with a later re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (shown === null) return null
  return (
    <Overlay aria-hidden="true" data-caption="">
      <Words key={shown.id} data-text={shown.text} $magenta={shown.tone === 'magenta'}>
        <Streak />
      </Words>
    </Overlay>
  )
}

const slam = keyframes`
  0% {
    opacity: 0;
    transform: scale(1.7) rotate(-7deg);
  }

  12% {
    opacity: 1;
    transform: scale(0.96) rotate(0);
  }

  18%, 86% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(1) translateX(${space.xl}px);
  }
`

const streak = keyframes`
  0%, 10% {
    transform: translateX(-160%) skewX(-20deg);
  }

  45%, 100% {
    transform: translateX(360%) skewX(-20deg);
  }
`

const Overlay = styled.div`
  position: fixed;
  inset: 22vh 0 auto;
  z-index: 30;
  display: flex;
  justify-content: center;
  padding: 0 ${space.lg}px;
  pointer-events: none;
`

const Words = styled.div<{ $magenta: boolean }>`
  ${(p) => clippedFill(slantClip(18), p.$magenta ? color.magenta : color.accent)}
  max-width: min(100%, 880px);
  padding: ${space.xs}px ${space.xxl}px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: ${color.onAccent};
  ${displayType}
  font-size: clamp(20px, 3.6vw, 40px);
  text-transform: uppercase;
  text-align: center;
  text-shadow:
    -3px 0 0 ${(p) => mix(p.$magenta ? color.accent : color.magenta, 70)},
    3px 0 0 ${mix(color.text, 25)};
  filter: drop-shadow(0 0 ${space.xl}px ${(p) => mix(p.$magenta ? color.magenta : color.accent, 55)});
  animation: ${slam} ${SHOW_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1) both;

  &::after {
    content: attr(data-text);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// The light that sweeps across the caption; not there with reduced motion
const Streak = styled.span`
  position: absolute;
  inset: 0 auto 0 0;
  width: 30%;
  background: linear-gradient(90deg, transparent, ${mix(color.onFelt, 45)}, transparent);
  animation: ${streak} ${SHOW_MS}ms ease-out both;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`
