import styled from 'styled-components'
import type { KartView } from '../../../shared/games/kart/types.ts'
import { isTeamId, pointsForPlace, TEAM_NAMES } from '../../../shared/kart/team.ts'
import { useT } from '../../i18n/useT.ts'
import { raceTime } from './raceTime.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'

/**
 * The race's standings as the server has judged them, in the order given: each kart's place, name,
 * and its time at the finish, its laps while racing, or that it dropped out (e9-t08)
 */
export function Standings({
  view,
  order,
  nameOf,
}: {
  view: KartView
  order: readonly number[]
  nameOf: (seat: number) => string
}) {
  const t = useT()
  // A team race (2026-11-18): each kart's side, and its points once it has finished
  const finished = view.racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
    .map((racer) => racer.seat)
  return (
    <List aria-label={t('games.kart.race.standings')} data-testid="kart-standings">
      {order.map((seat, index) => {
        const racer = view.racers.find((one) => one.seat === seat)
        if (!racer) return null
        const detail =
          racer.finishMs !== null
            ? raceTime(racer.finishMs)
            : racer.out
              ? t('games.kart.race.out')
              : t('games.kart.race.lap', {
                  lap: Math.min(racer.lapMs.length + 1, view.laps),
                  laps: view.laps,
                })
        const team = view.teams && isTeamId(racer.team) ? racer.team : null
        const placed = finished.indexOf(seat)
        return (
          <Row
            key={seat}
            $you={seat === view.you}
            data-seat={seat}
            data-team={team === null ? undefined : TEAM_NAMES[team]}
          >
            <Place>{index + 1}</Place>
            <Name>
              {team !== null && (
                <TeamMark
                  $team={team}
                  role="img"
                  aria-label={t(`games.kart.team.${TEAM_NAMES[team]}`)}
                />
              )}
              {nameOf(seat)}
              {seat === view.you && ` (${t('games.kart.race.you')})`}
            </Name>
            <Detail>
              {detail}
              {team !== null &&
                placed >= 0 &&
                ` · ${t('games.kart.team.points', { points: pointsForPlace(placed + 1) })}`}
            </Detail>
          </Row>
        )
      })}
    </List>
  )
}

const List = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li<{ $you: boolean }>`
  display: grid;
  grid-template-columns: 2ch minmax(0, 1fr) auto;
  gap: ${space.sm}px;
  align-items: baseline;
  color: ${(p) => (p.$you ? color.accent : color.text)};
  font-weight: ${(p) => (p.$you ? 700 : 400)};
`

const Place = styled.span`
  ${monoType}
  color: ${color.muted};
`

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TeamMark = styled.i<{ $team: 0 | 1 }>`
  display: inline-block;
  width: 0.7em;
  height: 0.7em;
  margin-right: ${space.xs}px;
  background: ${(p) => (p.$team === 0 ? color.teamRed : color.teamBlue)};
`

const Detail = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
`
