import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { MiseryView } from '../../../shared/games/misery/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { LineView } from './LineView.tsx'
import { IndexBadge } from './MiseryCardFace.tsx'
import './messages.ts'
import { lineOf } from './screenState.ts'

/**
 * Everyone's line but yours (or everyone's, once the game is over): one row each, the indexes as
 * chips, opening to the whole line. The guesser's row opens by itself, so that the table can follow
 * the call
 */
export function AllLines({ view, nameOf, final }: { view: MiseryView; nameOf(seat: SeatId): string; final: boolean }) {
  const t = useT()
  const seats = final ? view.players : view.players.filter((seat) => seat !== view.you)
  if (seats.length === 0) return null
  return (
    <Panel aria-labelledby="misery-lines-heading" data-testid="all-lines">
      <Heading id="misery-lines-heading">{t(final ? 'games.misery.ui.finalLines' : 'games.misery.ui.lines')}</Heading>
      {seats.map((seat) => {
        const cards = lineOf(view, seat)
        const name = nameOf(seat)
        const live = view.phase === 'guess' && seat === view.guesser
        return (
          <Row key={seat} open={final || live} $live={live}>
            <Summary>
              <Avatar name={name} tint={seatColor(seat)} />
              <Name>{name}</Name>
              <Count>{t('games.misery.ui.count', { count: cards.length, target: view.target })}</Count>
              <Chips aria-hidden="true">
                {cards.map((card) => (
                  <IndexBadge key={card.id} index={card.index} size="sm" />
                ))}
              </Chips>
            </Summary>
            <Inside>
              <LineView cards={cards} />
            </Inside>
          </Row>
        )
      })}
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
`

const Heading = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Row = styled.details<{ $live: boolean }>`
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => (p.$live ? color.accent : 'transparent')};
`

const Summary = styled.summary`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  cursor: pointer;
`

const Name = styled.span`
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Count = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Chips = styled.span`
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Inside = styled.div`
  padding: 0 ${space.md}px ${space.md}px;
`
