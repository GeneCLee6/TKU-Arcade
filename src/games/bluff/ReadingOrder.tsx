import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffView } from '../../../shared/games/bluff/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { Muted, Name, Pill } from './bluffParts.ts'
import './messages.ts'
import { readingStatus } from './screenState.ts'

/** Who reads in what order, who reads now, and a call-out when it is you */
export function ReadingOrder({ view, nameOf }: { view: BluffView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const now = view.phase === 'reading' ? view.order[view.reader] : undefined
  return (
    <Section aria-labelledby="bluff-order-heading" data-testid="reading-order">
      <Heading id="bluff-order-heading">{t('games.bluff.ui.order')}</Heading>
      {now !== undefined && now === view.you && (
        <YourTurn role="status">{t('games.bluff.ui.yourTurn')}</YourTurn>
      )}
      <List as="ol">
        {view.order.map((seat, index) => {
          const status = readingStatus(view, index)
          const name = nameOf(seat)
          return (
            <Line
              key={seat}
              $mark={seatColor(seat)}
              $done={status === 'done'}
              aria-current={status === 'now' ? 'step' : undefined}
            >
              <Place aria-hidden="true">{index + 1}</Place>
              <Avatar name={name} tint={seatColor(seat)} />
              <Name>
                {name}
                {seat === view.you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
              </Name>
              <Pill $on={status === 'now'}>{t(`games.bluff.ui.status.${status}`)}</Pill>
            </Line>
          )
        })}
      </List>
    </Section>
  )
}

const Line = styled(Row)<{ $done: boolean }>`
  opacity: ${(p) => (p.$done ? 0.6 : 1)};

  &[aria-current='step'] {
    background: ${color.raised};
    box-shadow:
      inset 4px 0 0 ${(p) => p.$mark},
      inset 0 0 0 2px ${color.accent};
  }
`

const Place = styled.span`
  ${monoType}
  min-width: 1.5em;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const YourTurn = styled.p`
  margin: 0;
  padding: ${space.md}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.xl}px;
  font-weight: 900;
  text-align: center;
`
