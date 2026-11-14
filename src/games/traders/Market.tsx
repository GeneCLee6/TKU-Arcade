import styled from 'styled-components'
import type { TradersView } from '../../../shared/games/traders/types.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { tradersPieces as piece } from '../../styles/tradersTokens.ts'
import './messages.ts'
import { CardFace, PatronTile } from './pieces.tsx'
import { useCardLabel } from './useCardLabel.ts'
import type { Selection } from './screenState.ts'

type Props = {
  view: TradersView
  selection: Selection
  /** Your turn, in the play phase: cards and decks can be picked */
  active: boolean
  onSelect(selection: Selection): void
}

/** The patrons on display, then the three tiers, dearest on top, each a deck and four cards */
export function Market({ view, selection, active, onSelect }: Props) {
  const t = useT()
  const label = useCardLabel()
  return (
    <>
      <Section aria-labelledby="traders-patrons">
        <Heading id="traders-patrons">{t('games.traders.ui.patrons')}</Heading>
        <Help>{t('games.traders.ui.patronHelp')}</Help>
        <Patrons role="list">
          {view.patrons.map((patron) => (
            <PatronTile key={patron.id} patron={patron} />
          ))}
        </Patrons>
      </Section>
      <Section aria-labelledby="traders-market" data-testid="market">
        <Heading id="traders-market">{t('games.traders.ui.market')}</Heading>
        {[3, 2, 1].map((tier) => {
          const row = view.market[tier - 1]
          const left = view.decks[tier - 1]
          const deckPicked = selection.kind === 'deck' && selection.tier === tier
          return (
            <Row key={tier}>
              <Deck
                type="button"
                disabled={!active || left === 0}
                aria-pressed={deckPicked}
                aria-label={t('games.traders.ui.deck', { tier: t(`games.traders.tier.${tier}`), count: left })}
                $picked={deckPicked}
                onClick={() => onSelect(deckPicked ? { kind: 'none' } : { kind: 'deck', tier })}
              >
                <DeckPips aria-hidden="true">{'•'.repeat(tier)}</DeckPips>
                <DeckCount aria-hidden="true">{left}</DeckCount>
              </Deck>
              {row.map((card, slot) =>
                card === null ? (
                  <Empty key={`empty-${slot}`}>{t('games.traders.ui.emptySlot')}</Empty>
                ) : (
                  <Slot
                    key={card.id}
                    type="button"
                    data-testid={`card-${card.id}`}
                    disabled={!active}
                    aria-pressed={selection.kind === 'card' && selection.id === card.id}
                    $picked={selection.kind === 'card' && selection.id === card.id}
                    onClick={() =>
                      onSelect(selection.kind === 'card' && selection.id === card.id ? { kind: 'none' } : { kind: 'card', id: card.id })
                    }
                  >
                    <VisuallyHidden>{label(card)}</VisuallyHidden>
                    <CardFace card={card} compact />
                  </Slot>
                ),
              )}
            </Row>
          )
        })}
      </Section>
    </>
  )
}

export const Section = styled.section`
  display: grid;
  gap: ${space.sm}px;
  min-width: 0;
`

export const Heading = styled.h2`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

export const Help = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.35;
`

const Patrons = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: ${space.xs}px;
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 36px repeat(4, minmax(0, 1fr));
  gap: ${space.xs}px;
  align-items: stretch;
`

/** A card you can press: the face fills it, and a picked one gets the game's hue around it */
export const Slot = styled.button<{ $picked: boolean }>`
  display: block;
  min-width: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 7px;
  box-shadow: ${(p) => (p.$picked ? `0 0 0 3px ${color.accent}` : 'none')};
  transform: ${(p) => (p.$picked ? 'translateY(-3px)' : 'none')};
  transition: transform 0.12s;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Deck = styled.button<{ $picked: boolean }>`
  display: grid;
  place-content: center;
  gap: 2px;
  padding: 0;
  color: ${piece.paper};
  background: repeating-linear-gradient(45deg, ${piece.inkMuted} 0 5px, ${piece.ink} 5px 10px);
  border: 0;
  border-radius: 6px;
  box-shadow: ${(p) => (p.$picked ? `0 0 0 3px ${color.accent}` : `inset 0 0 0 1px ${piece.paperEdge}`)};
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: ${(p) => (p.$picked ? 1 : 0.85)};
  }
`

const DeckPips = styled.span`
  font-size: 10px;
  line-height: 1;
  text-align: center;
`

const DeckCount = styled.span`
  padding: 1px 3px;
  color: ${piece.ink};
  background: ${piece.paper};
  border-radius: 3px;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
`

const Empty = styled.span`
  display: grid;
  place-items: center;
  min-height: 96px;
  color: ${color.muted};
  border: 1px dashed ${color.border};
  border-radius: 6px;
  font-size: 11px;
  text-align: center;
`
