import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import { rackValue } from '../../../shared/games/tiles/tiles.ts'
import type { TilesRoundResult, TilesView } from '../../../shared/games/tiles/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { sortRack } from './screenState.ts'
import { TileFace } from './Tile.tsx'

/** A finished round: who won it, every rack laid open, and the score it moved */
export function RoundScore({
  view,
  round,
  nameOf,
}: {
  view: TilesView
  round: TilesRoundResult
  nameOf(seat: SeatId): string
}) {
  const t = useT()
  return (
    <Section aria-labelledby="tiles-score-heading" data-testid="round-score">
      <Heading id="tiles-score-heading">{t('games.tiles.ui.scored.heading', { round: round.round })}</Heading>
      <Line>
        {round.out
          ? t('games.tiles.ui.scored.out', { name: nameOf(round.winners[0]) })
          : t('games.tiles.ui.scored.stuck')}
      </Line>
      <List>
        {view.players.map((seat, index) => {
          const name = nameOf(seat)
          const rack = round.racks[index] ?? []
          const delta = round.deltas[index] ?? 0
          return (
            <ScoreRow key={seat} $mark={seatColor(seat)} data-testid="score-row">
              <Avatar name={name} tint={seatColor(seat)} />
              <Name>{name}</Name>
              <Numbers>
                <span>{t('games.tiles.ui.scored.rack', { points: rackValue(rack) })}</span>
                <Delta $up={delta > 0}>{t('games.tiles.ui.scored.delta', { delta: delta > 0 ? `+${delta}` : delta })}</Delta>
                {view.totalRounds > 1 && <span>{t('games.tiles.ui.scored.total', { score: view.seats[index]?.score ?? 0 })}</span>}
              </Numbers>
              {rack.length > 0 && (
                <Rack>
                  {sortRack(rack, 'suit').map((tile) => (
                    <TileFace key={tile} tile={tile} />
                  ))}
                </Rack>
              )}
            </ScoreRow>
          )
        })}
      </List>
      {view.phase === 'scored' && <Small>{t('games.tiles.ui.scored.auto')}</Small>}
    </Section>
  )
}

const Line = styled.p`
  margin: 0;
  font-weight: 600;
`

const ScoreRow = styled(Row)`
  padding-block: ${space.sm}px;
`

const Name = styled.span`
  font-weight: 700;
`

const Numbers = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.md}px;
  margin-left: auto;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Delta = styled.span<{ $up: boolean }>`
  color: ${(p) => (p.$up ? color.success : color.text)};
  font-weight: 700;
`

const Rack = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex-basis: 100%;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
