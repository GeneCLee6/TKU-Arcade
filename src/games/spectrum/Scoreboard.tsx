import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumView } from '../../../shared/games/spectrum/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { byScore, gains } from './screenState.ts'

/** Everyone's total, highest first, with what this round added once it is revealed */
export function Scoreboard({ view, nameOf }: { view: SpectrumView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const gained = gains(view)
  return (
    <Section aria-labelledby="spectrum-scores-heading">
      <Top>
        <Heading id="spectrum-scores-heading">{t('games.spectrum.ui.scores')}</Heading>
        <Round>{t('games.spectrum.ui.round', { round: view.round, rounds: view.totalRounds })}</Round>
      </Top>
      <List as="ol">
        {byScore(view).map((player) => {
          const name = nameOf(player.seat)
          const gain = gained.get(player.seat)
          return (
            <Row key={player.seat} $mark={seatColor(player.seat)}>
              <Avatar name={name} tint={seatColor(player.seat)} />
              <Name>
                {name}
                {player.seat === view.you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
                {player.seat === view.guesser && <Tag>{t('games.spectrum.ui.guesserTag')}</Tag>}
              </Name>
              <Score>
                <span aria-hidden="true">{player.score}</span>
                <VisuallyHidden>
                  {t('games.spectrum.ui.pointsLabel', { score: player.score })}
                </VisuallyHidden>
                {gain !== undefined && <Gain>{t('games.spectrum.ui.gain', { points: gain })}</Gain>}
              </Score>
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

const Round = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
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
  transform: skewX(${SLANT});
`

const Score = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: ${space.xs}px;
  ${displayType}
  font-size: ${fontSize.xl}px;
  font-variant-numeric: tabular-nums;
`

const Gain = styled.span`
  ${monoType}
  color: ${color.success};
  font-size: ${fontSize.sm}px;
  font-style: normal;
`
