import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffView } from '../../../shared/games/bluff/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { Count, Muted, Name, Tag, Top } from './bluffParts.ts'
import './messages.ts'
import { RoleTag } from './RoundReveal.tsx'
import { byScore, gains, revealedRole, signed } from './screenState.ts'

/** Everyone's total, highest first; once revealed, each one's role and what this round changed */
export function Scoreboard({ view, nameOf }: { view: BluffView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const gained = gains(view)
  const shown = view.honest !== null
  return (
    <Section aria-labelledby="bluff-scores-heading" data-testid="scoreboard">
      <Top>
        <Heading id="bluff-scores-heading">{t('games.bluff.ui.scores')}</Heading>
        <Count>{t('games.bluff.ui.round', { round: view.round, rounds: view.totalRounds })}</Count>
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
                {shown ? (
                  <RoleTag role={revealedRole(view, player.seat)} />
                ) : (
                  player.seat === view.judge && (
                    <Tag>
                      <span>{t('games.bluff.ui.tag.judge')}</span>
                    </Tag>
                  )
                )}
              </Name>
              <Score>
                <span aria-hidden="true">{player.score}</span>
                <VisuallyHidden>{t('games.bluff.ui.pointsLabel', { score: player.score })}</VisuallyHidden>
                {gain !== undefined && <Gain $up={gain > 0}>{signed(gain)}</Gain>}
              </Score>
            </Row>
          )
        })}
      </List>
    </Section>
  )
}

const Score = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: ${space.xs}px;
  ${displayType}
  font-size: ${fontSize.xl}px;
  font-variant-numeric: tabular-nums;
`

const Gain = styled.span<{ $up: boolean }>`
  ${monoType}
  color: ${(p) => (p.$up ? color.success : color.danger)};
  font-size: ${fontSize.sm}px;
  font-style: normal;
`
