import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { PalaceView } from '../../../shared/games/palace/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { CardBack, RoleCard } from './RoleCard.tsx'

/**
 * Every seat at court: silver, how many backers are still face down (as card backs) and the ones
 * already lost (face up). In a response window it marks who is still deciding and who passed.
 */
export function Court({ view, nameOf }: { view: PalaceView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const phase = view.phase
  const tagOf = (seat: SeatId): string | null => {
    if (phase.kind === 'over') return null
    if (phase.kind === 'respond' && phase.eligible.includes(seat)) {
      return t(phase.passed.includes(seat) ? 'games.palace.ui.passedTag' : 'games.palace.ui.thinkingTag')
    }
    if (phase.kind === 'lose' && phase.seat === seat) return t('games.palace.ui.thinkingTag')
    if (seat === view.turn) return t('games.palace.ui.turnTag')
    return null
  }

  return (
    <Panel aria-labelledby="palace-court-heading" data-testid="court">
      <Top>
        <Heading id="palace-court-heading">{t('games.palace.ui.court')}</Heading>
        <Deck>{t('games.palace.ui.deck', { count: view.deckSize })}</Deck>
      </Top>
      <List>
        {view.players.map((player) => {
          const name = nameOf(player.seat)
          const tag = tagOf(player.seat)
          return (
            <Line key={player.seat} $mark={seatColor(player.seat)} $out={player.out} data-seat={player.seat}>
              <Avatar name={name} tint={seatColor(player.seat)} />
              <Who>
                <Name>
                  {name}
                  {player.seat === view.you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
                </Name>
                <Facts>
                  <Silver data-testid={`silver-${player.seat}`}>{t('games.palace.ui.silver', { count: player.silver })}</Silver>
                  {player.out ? (
                    <span>{t('games.palace.ui.out')}</span>
                  ) : (
                    <span>{t('games.palace.ui.backers', { count: player.hiddenCount })}</span>
                  )}
                </Facts>
              </Who>
              <Cards>
                {Array.from({ length: player.hiddenCount }, (_, index) => (
                  <CardBack key={`back-${index}`} />
                ))}
                {player.lost.map((role, index) => (
                  <RoleCard key={`lost-${index}`} role={role} size="sm" lost />
                ))}
              </Cards>
              {tag !== null && (
                <Tag $live={phase.kind !== 'choose'}>
                  <span>{tag}</span>
                </Tag>
              )}
            </Line>
          )
        })}
      </List>
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Deck = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Line = styled(Row)<{ $out: boolean }>`
  flex-wrap: nowrap;
  ${(p) => (p.$out ? `text-decoration: line-through;` : '')}
`

const Who = styled.div`
  flex: 1;
  min-width: 0;
`

const Name = styled.span`
  display: block;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Muted = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

const Facts = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 0 ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Silver = styled.span`
  ${monoType}
  color: ${color.text};
  font-weight: 700;
`

const Cards = styled.span`
  display: flex;
  flex: none;
  gap: 3px;
`

const Tag = styled.span<{ $live: boolean }>`
  flex: none;
  padding: 0 ${space.sm}px;
  color: ${(p) => (p.$live ? color.text : color.onAccent)};
  background: ${(p) => (p.$live ? color.raised : color.accent)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`
