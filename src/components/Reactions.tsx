import { useState } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { REACTION_COUNT } from '../../shared/protocol.ts'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { useReducedMotion } from '../lib/useMediaQuery.ts'
import { REACTION_FLOAT_MS, type FloatingReaction } from '../lib/reactions.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { VisuallyHidden } from './VisuallyHidden.ts'

/** What each reaction shows, by its number: the room only passes numbers on (e7-t11) */
const GLYPHS: readonly string[] = ['👏', '😂', '😮', '😱', '👍', '🔥']
if (GLYPHS.length !== REACTION_COUNT) throw new Error('one glyph for each reaction')

interface ReactionsProps {
  reactions: readonly FloatingReaction[]
  onReact(reaction: number): void
  nameOf(member: string): string
}

/**
 * Six quick reactions (e7-t11): a row of buttons, and everyone's floating up from the bottom of the
 * screen with their name. They say nothing, so they work while a game has the chat closed. Screen
 * readers hear each one once, politely; with reduced motion they fade in place instead of rising.
 */
export default function Reactions({ reactions, onReact, nameOf }: ReactionsProps) {
  const t = useT()
  const still = useReducedMotion()
  const label = (reaction: number) => t(`room.extra.react.${reaction}`)
  // Closed, it is one button beside "how to play": a row of six would cost a phone's board a line
  const [open, setOpen] = useState(false)
  return (
    <Holder
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <Toggle
        type="button"
        aria-expanded={open}
        aria-controls="room-reactions"
        aria-label={t('room.extra.react.bar')}
        title={t('room.extra.react.bar')}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{GLYPHS[0]}</span>
      </Toggle>
      <Bar id="room-reactions" role="group" aria-label={t('room.extra.react.bar')} hidden={!open}>
        {GLYPHS.map((glyph, reaction) => (
          <Pick
            key={glyph}
            type="button"
            aria-label={label(reaction)}
            title={label(reaction)}
            onClick={() => {
              onReact(reaction)
              setOpen(false)
            }}
          >
            <span aria-hidden="true">{glyph}</span>
          </Pick>
        ))}
      </Bar>
      <Sky aria-live="polite">
        {reactions.map((one) => (
          <Float key={one.id} $still={still} $lane={one.id % 5}>
            <Glyph aria-hidden="true">{GLYPHS[one.reaction]}</Glyph>
            <Who aria-hidden="true">{nameOf(one.member)}</Who>
            <VisuallyHidden>
              {t('room.extra.react.heard', {
                name: nameOf(one.member),
                reaction: label(one.reaction),
              })}
            </VisuallyHidden>
          </Float>
        ))}
      </Sky>
    </Holder>
  )
}

const Holder = styled.div`
  position: relative;
`

const Toggle = styled.button`
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: ${color.sunken};
  border: 1px solid ${color.border};
  font-size: ${fontSize.lg}px;
  line-height: 1;
  cursor: pointer;

  &[aria-expanded='true'] {
    border-color: ${color.accent};
  }
`

// Opens under the button, over the page, never pushing anything down
const Bar = styled.div`
  position: absolute;
  top: calc(100% + ${space.xs}px);
  right: 0;
  z-index: 15;
  display: grid;
  grid-template-columns: repeat(3, 44px);
  gap: ${space.xs}px;
  padding: ${space.xs}px;
  background: ${color.panel};
  box-shadow: 0 0 0 1px ${color.line};

  &[hidden] {
    display: none;
  }
`

const Pick = styled.button`
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: ${color.sunken};
  border: 1px solid ${color.border};
  font-size: ${fontSize.xl}px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${color.raised};
  }

  &:active {
    transform: scale(0.92);
  }
`

const rise = keyframes`
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.6);
  }

  15% {
    opacity: 1;
    transform: translateY(-20px) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateY(-260px) scale(1.1);
  }
`

const fade = keyframes`
  0%,
  100% {
    opacity: 0;
  }

  15%,
  70% {
    opacity: 1;
  }
`

// Over everything, catching no taps: the reactions only pass across the screen
const Sky = styled.div`
  position: fixed;
  right: 0;
  bottom: calc(96px + env(safe-area-inset-bottom));
  left: 0;
  z-index: 20;
  height: 0;
  pointer-events: none;
`

const Float = styled.div<{ $still: boolean; $lane: number }>`
  position: absolute;
  bottom: 0;
  left: ${(p) => 12 + p.$lane * 18}%;
  display: grid;
  justify-items: center;
  ${(p) => css`
    animation: ${p.$still ? fade : rise} ${REACTION_FLOAT_MS}ms ease-out forwards;
  `}
`

const Glyph = styled.span`
  font-size: 40px;
  line-height: 1;
`

const Who = styled.span`
  max-width: 120px;
  padding: 0 ${space.xs}px;
  overflow: hidden;
  color: ${color.text};
  background: ${color.panel};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`
