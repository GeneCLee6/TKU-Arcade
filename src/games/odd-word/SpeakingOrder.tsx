import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { OddWordView } from '../../../shared/games/odd-word/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'

/** Who describes in what order on the call; the first runs the round */
export function SpeakingOrder({ view, nameOf }: { view: OddWordView; nameOf(seat: SeatId): string }) {
  const t = useT()
  return (
    <Section aria-labelledby="odd-order-heading" data-testid="speaking-order">
      <Top>
        <Heading id="odd-order-heading">{t('games.odd-word.ui.order')}</Heading>
        <Direction>{t(`games.odd-word.ui.direction.${view.direction}`)}</Direction>
      </Top>
      <List as="ol">
        {view.order.map((seat, index) => {
          const name = nameOf(seat)
          return (
            <Line key={seat} $mark={seatColor(seat)} $first={index === 0}>
              <Place aria-hidden="true">{index + 1}</Place>
              <Avatar name={name} tint={seatColor(seat)} />
              <Name>
                {name}
                {seat === view.you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
              </Name>
              {index === 0 && seat === view.host && (
                <Tag>
                  <span>{t('games.odd-word.ui.first')}</span>
                </Tag>
              )}
              {index !== 0 && seat === view.host && (
                <Tag>
                  <span>{t('games.odd-word.ui.hostLabel')}</span>
                </Tag>
              )}
            </Line>
          )
        })}
      </List>
    </Section>
  )
}

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Direction = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Line = styled(Row)<{ $first: boolean }>`
  background: ${(p) => (p.$first ? color.raised : 'transparent')};
`

const Place = styled.span`
  ${monoType}
  min-width: 1.5em;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Muted = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

const Tag = styled.span`
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`
