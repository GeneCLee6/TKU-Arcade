import styled, { keyframes } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumAnswererView } from '../../../shared/games/spectrum/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { useT } from '../../i18n/useT.ts'
import { clippedFill, cornerClip, displayType, slantClip } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import type { GuessPicks } from './screenState.ts'

interface AnswerCardsProps {
  answerers: readonly SpectrumAnswererView[]
  nameOf(seat: SeatId): string
  you: SeatId | null
  /** The guesser's picks so far; null for everyone who only watches */
  picks: GuessPicks | null
  onPick?(end: 'max' | 'min', seat: SeatId): void
  disabled?: boolean
}

/**
 * Every answer once they are locked, one card each. For the guesser in the largest-and-smallest
 * mode, each card has its two buttons; everyone else sees the same cards with no buttons.
 */
export function AnswerCards({ answerers, nameOf, you, picks, onPick, disabled }: AnswerCardsProps) {
  const t = useT()
  return (
    <Grid aria-label={t('games.spectrum.ui.answers')}>
      {answerers.map((answerer, index) => {
        const name = nameOf(answerer.seat)
        const out = answerer.status === 'out' || answerer.text === null
        const isMax = picks?.max === answerer.seat
        const isMin = picks?.min === answerer.seat
        return (
          <Card
            key={answerer.seat}
            $mark={isMax ? 'max' : isMin ? 'min' : null}
            $out={out}
            style={{ animationDelay: `${index * 80}ms` }}
            data-testid={`answer-${answerer.seat}`}
          >
            <Who>
              <Avatar name={name} tint={seatColor(answerer.seat)} />
              <span>
                {name}
                {answerer.seat === you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
              </span>
            </Who>
            <Text $out={out}>{out ? t('games.spectrum.ui.noAnswer') : answerer.text}</Text>
            {picks && onPick && !out && (
              <Picks>
                <PickButton
                  type="button"
                  $end="min"
                  aria-pressed={isMin}
                  aria-label={t('games.spectrum.ui.pickMin', { name })}
                  disabled={disabled}
                  onClick={() => onPick('min', answerer.seat)}
                >
                  {t('games.spectrum.ui.smallest')}
                </PickButton>
                <PickButton
                  type="button"
                  $end="max"
                  aria-pressed={isMax}
                  aria-label={t('games.spectrum.ui.pickMax', { name })}
                  disabled={disabled}
                  onClick={() => onPick('max', answerer.seat)}
                >
                  {t('games.spectrum.ui.largest')}
                </PickButton>
              </Picks>
            )}
          </Card>
        )
      })}
    </Grid>
  )
}

const deal = keyframes`
  from {
    transform: translateY(16px);
    opacity: 0;
  }
`

const Grid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  gap: ${space.md}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

// The largest is magenta and the smallest the game's hue, as the two ends of the scale are; the word
// on the pressed button says the same for anyone who does not see the colour
const Card = styled.li<{ $mark: 'max' | 'min' | null; $out: boolean }>`
  ${clippedFill(cornerClip(14), color.panel)}
  display: grid;
  align-content: start;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  animation: ${deal} 0.4s cubic-bezier(0.2, 0.9, 0.2, 1) backwards;

  &::before {
    box-shadow: inset 0 0 0 ${(p) => (p.$mark ? 2 : 1)}px
      ${(p) => (p.$mark === 'max' ? color.magenta : p.$mark === 'min' ? color.accent : color.line)};
  }

  opacity: ${(p) => (p.$out ? 0.7 : 1)};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Who = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Muted = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

const Text = styled.p<{ $out: boolean }>`
  margin: 0;
  ${displayType}
  font-size: ${(p) => (p.$out ? fontSize.md : fontSize.xl)}px;
  font-style: ${(p) => (p.$out ? 'normal' : undefined)};
  color: ${(p) => (p.$out ? color.muted : color.text)};
  line-height: 1.25;
  overflow-wrap: anywhere;
`

const Picks = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${space.sm}px;
`

const PickButton = styled.button<{ $end: 'max' | 'min' }>`
  ${clippedFill(slantClip(10), color.raised)}
  min-height: 44px;
  padding: 0 ${space.sm}px;
  color: ${color.text};
  background: transparent;
  border: 0;
  ${displayType}
  font-size: ${fontSize.sm}px;
  cursor: pointer;

  &[aria-pressed='true'] {
    color: ${color.onAccent};
  }

  &[aria-pressed='true']::before {
    background: ${(p) => (p.$end === 'max' ? color.magenta : color.accent)};
  }

  &:hover:not(:disabled)::before {
    background: ${color.raisedHover};
  }

  &[aria-pressed='true']:hover:not(:disabled)::before {
    background: ${(p) => (p.$end === 'max' ? color.magenta : color.accent)};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
