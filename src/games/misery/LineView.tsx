import { Fragment } from 'react'
import styled from 'styled-components'
import type { MiseryCard } from '../../../shared/games/misery/types.ts'
import { useT } from '../../i18n/useT.ts'
import { SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { CardFace } from './MiseryCardFace.tsx'
import './messages.ts'
import { gapText } from './screenState.ts'

export interface LineViewProps {
  cards: readonly MiseryCard[]
  /** The gaps can be pressed: this is your line and the card on the table is yours to place */
  onPick?: (gap: number) => void
  /** A press is on its way: the gaps wait */
  waiting?: boolean
  /** The card that just came in, to mark */
  freshId?: number | null
}

/**
 * A line, least miserable at the top: a column, so that it reads the same on a phone as on a wide
 * screen. When it is your go, a slot between every two cards (and at both ends) takes the card.
 */
export function LineView({ cards, onPick, waiting, freshId }: LineViewProps) {
  const t = useT()
  const gap = (at: number) => {
    if (onPick === undefined) return null
    const label = gapText(cards, at)
    return (
      <li>
        <Slot
          type="button"
          disabled={waiting}
          onClick={() => onPick(at)}
          data-testid={`gap-${at}`}
        >
          <span>{t(label.key, label.params)}</span>
        </Slot>
      </li>
    )
  }

  return (
    <Column>
      <End>{t('games.misery.ui.least')}</End>
      <Cards>
        {gap(0)}
        {cards.map((card, at) => (
          <Fragment key={card.id}>
            <li>
              <CardFace card={card} fresh={card.id === freshId} />
            </li>
            {gap(at + 1)}
          </Fragment>
        ))}
      </Cards>
      <End>{t('games.misery.ui.most')}</End>
    </Column>
  )
}

const Column = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const Cards = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const End = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

// A slot is an item of its own between the two cards it splits
const Slot = styled.button`
  display: block;
  width: 100%;
  min-height: 40px;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.accent};
  background: transparent;
  border: 2px dashed ${color.accent};
  font: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: 800;
  cursor: pointer;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }

  &:hover:not(:disabled),
  &:focus-visible {
    color: ${color.onAccent};
    background: ${color.accent};
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`
