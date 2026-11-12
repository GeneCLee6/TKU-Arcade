import styled, { css, keyframes } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumAnswererView } from '../../../shared/games/spectrum/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'

interface AnswerProgressProps {
  answerers: readonly SpectrumAnswererView[]
  you: SeatId | null
  nameOf(seat: SeatId): string
}

/** Who has answered so far, and never what: the view holds no one else's answer until they lock */
export function AnswerProgress({ answerers, you, nameOf }: AnswerProgressProps) {
  const t = useT()
  const done = answerers.filter((answerer) => answerer.status !== 'thinking').length
  return (
    <Section aria-labelledby="spectrum-progress-heading">
      <Top>
        <Heading id="spectrum-progress-heading">{t('games.spectrum.ui.progress')}</Heading>
        <Count>{t('games.spectrum.ui.progressCount', { done, total: answerers.length })}</Count>
      </Top>
      <List>
        {answerers.map((answerer) => {
          const name = nameOf(answerer.seat)
          return (
            <Row key={answerer.seat} $mark={seatColor(answerer.seat)}>
              <Avatar name={name} tint={seatColor(answerer.seat)} />
              <Name>
                {name}
                {answerer.seat === you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
              </Name>
              <Pill $status={answerer.status}>
                <Dot $status={answerer.status} aria-hidden="true" />
                {t(`games.spectrum.ui.status.${answerer.status}`)}
              </Pill>
            </Row>
          )
        })}
      </List>
    </Section>
  )
}

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Count = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
`

const Muted = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

const blink = keyframes`
  50% {
    opacity: 0.2;
  }
`

const statusColor = {
  thinking: color.muted,
  answered: color.success,
  out: color.warning,
} as const

const Pill = styled.span<{ $status: keyof typeof statusColor }>`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  color: ${(p) => statusColor[p.$status]};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Dot = styled.span<{ $status: keyof typeof statusColor }>`
  width: 8px;
  height: 8px;
  background: currentColor;
  transform: skewX(${SLANT});
  ${(p) =>
    p.$status === 'thinking' &&
    css`
      animation: ${blink} 1.2s steps(2) infinite;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
