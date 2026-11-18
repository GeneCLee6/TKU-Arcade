// 2026-11-18: the sides of a team race, in the waiting room (shared/kart/team.ts; its own lazy
// chunk, loaded only for a kart room set to a team race). Everyone seated is shown on the side the
// race will put them on: their own choice, or the smaller team for those who made none, split by
// the very function the room uses when the race starts. Each member picks their own side; the host
// can move anyone, computer karts too, and take every choice back so that the split is even again.
import styled from 'styled-components'
import { kartTeamMessages } from '../../../shared/games/kart/i18n.team.ts'
import { assignTeams, isTeamId, TEAM_NAMES, type TeamId } from '../../../shared/kart/team.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { Heading, Muted, Section } from '../../components/roomParts.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { memberName } from '../../lib/memberName.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { teamColor } from './teamColor.ts'

registerMessages(kartTeamMessages)

export interface RoomTeamsProps {
  members: Record<string, RoomMember>
  you: string
  /** A side for this member, or for `member` from the host; null leaves it to the room */
  onSetTeam(team: 0 | 1 | null, member?: string): void
}

export default function RoomTeams({ members, you, onSetTeam }: RoomTeamsProps) {
  const t = useT()
  const seated = Object.values(members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const isHost = members[you]?.host === true
  // As the room will split them: it numbers the seats from 0 in this order when the race starts
  const sides = assignTeams(
    seated.map((member, id) => (isTeamId(member.team) ? { id, team: member.team } : { id })),
  )
  const red = sides.filter((side) => side === 0).length
  const blue = sides.length - red
  const chosen = seated.some((member) => member.team !== undefined)

  return (
    <Section data-testid="kart-room-teams">
      <Heading>{t('games.kart.team.title')}</Heading>
      <Muted>{t('games.kart.team.hint')}</Muted>
      <Rows>
        {seated.map((member, index) => {
          const side = sides[index]!
          const name = memberName(member, 'kart')
          const mine = member.id === you
          const set = (team: TeamId) => onSetTeam(team, mine ? undefined : member.id)
          return (
            <li key={member.id} data-member={member.id} data-team={TEAM_NAMES[side]}>
              <Chip $team={side}>{t(`games.kart.team.${TEAM_NAMES[side]}`)}</Chip>
              <Name>{name}</Name>
              {member.team === undefined && <Auto>{t('games.kart.team.auto')}</Auto>}
              {(mine || isHost) && (
                <Picks>
                  {([0, 1] as const).map((team) => (
                    <Button
                      key={team}
                      type="button"
                      $variant={member.team === team ? 'primary' : 'secondary'}
                      $size="sm"
                      aria-pressed={member.team === team}
                      aria-label={t('games.kart.team.put', {
                        name,
                        team: t(`games.kart.team.${TEAM_NAMES[team]}`),
                      })}
                      onClick={() => set(team)}
                      data-testid={`kart-team-${TEAM_NAMES[team]}`}
                    >
                      {t(`games.kart.team.${TEAM_NAMES[team]}`)}
                    </Button>
                  ))}
                </Picks>
              )}
            </li>
          )
        })}
      </Rows>
      <Foot>
        <Sizes data-testid="kart-team-sizes">{t('games.kart.team.sizes', { red, blue })}</Sizes>
        {isHost && (
          <Button
            type="button"
            $variant="secondary"
            $size="sm"
            disabled={!chosen}
            onClick={() => {
              // Every choice taken back: the room splits the seats evenly again
              for (const member of seated) {
                if (member.team !== undefined) {
                  onSetTeam(null, member.id === you ? undefined : member.id)
                }
              }
            }}
            data-testid="kart-team-balance"
          >
            {t('games.kart.team.balance')}
          </Button>
        )}
      </Foot>
      <Muted>
        {t('games.kart.team.scoring', { count: Math.max(1, Math.min(red, blue)) })}
        {isHost && ` ${t('games.kart.team.hostHint')}`}
      </Muted>
    </Section>
  )
}

const Rows = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${space.sm}px;
    min-height: 36px;
  }
`

const Chip = styled.span<{ $team: TeamId }>`
  flex: none;
  min-width: 3.5em;
  padding: 2px ${space.sm}px;
  color: ${color.onSeat};
  background: ${({ $team }) => teamColor($team)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-align: center;
`

const Name = styled.span`
  font-weight: 600;
  overflow-wrap: anywhere;
`

const Auto = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Picks = styled.span`
  display: inline-flex;
  gap: ${space.xs}px;
  margin-left: auto;
`

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Sizes = styled.span`
  font-weight: 700;
`
