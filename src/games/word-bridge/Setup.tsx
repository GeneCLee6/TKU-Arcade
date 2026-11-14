import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { WbAction, WbTeam, WbView } from '../../../shared/games/word-bridge/types.ts'
import { Button } from '../../components/Button.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

interface SetupProps {
  view: WbView
  legal: readonly WbAction[]
  nameOf(seat: SeatId): string
  disabled: boolean
  send(action: WbAction): void
}

const TEAM_COLOR: Record<WbTeam, string> = { ns: color.seat1, ew: color.seat0 }

/** Before the deal: pick partnerships and callers (team game), or the two key holders (co-op) */
export function Setup({ view, legal, nameOf, disabled, send }: SetupProps) {
  const t = useT()
  const can = (match: (action: WbAction) => boolean) => legal.find(match)

  if (view.mode === 'duo') {
    return (
      <Section aria-labelledby="wb-setup" data-testid="wb-setup">
        <Heading id="wb-setup">{t('games.word-bridge.ui.setupDuo')}</Heading>
        <Body>{t('games.word-bridge.ui.setupDuoHelp')}</Body>
        <List>
          {([0, 1] as const).map((side) => {
            const hold = can((action) => action.type === 'hold' && action.side === side)
            return (
              <Row key={side} $mark={color.seat2}>
                <Name>{t('games.word-bridge.ui.side', { side: side === 0 ? 'A' : 'B' })}</Name>
                <span>{nameOf(view.holders[side])}</span>
                {hold && (
                  <Button $size="sm" $variant="secondary" disabled={disabled} onClick={() => send(hold)}>
                    {t('games.word-bridge.ui.holdThis')}
                  </Button>
                )}
              </Row>
            )
          })}
        </List>
        {can((action) => action.type === 'begin') && (
          <Button disabled={disabled} onClick={() => send({ type: 'begin' })}>
            {t('games.word-bridge.ui.begin')}
          </Button>
        )}
      </Section>
    )
  }

  const ready = can((action) => action.type === 'begin')
  return (
    <Section aria-labelledby="wb-setup" data-testid="wb-setup">
      <Heading id="wb-setup">{t('games.word-bridge.ui.setupTeams')}</Heading>
      <Body>{t('games.word-bridge.ui.setupTeamsHelp')}</Body>
      <Teams>
        {(['ns', 'ew'] as const).map((team) => {
          const join = can((action) => action.type === 'join' && action.team === team)
          return (
            <TeamBox key={team} data-testid={`team-${team}`} $color={TEAM_COLOR[team]}>
              <TeamName>{t(`games.word-bridge.ui.team.${team}`)}</TeamName>
              <List>
                {view.teams[team].map((seat) => (
                  <Row key={seat} $mark={TEAM_COLOR[team]}>
                    <span>{nameOf(seat)}</span>
                    {view.givers[team] === seat && <Badge>{t('games.word-bridge.ui.giver')}</Badge>}
                    {seat === view.you && <Badge>{t('games.word-bridge.ui.you')}</Badge>}
                  </Row>
                ))}
              </List>
              {join && (
                <Button $size="sm" $variant="secondary" disabled={disabled} onClick={() => send(join)}>
                  {t(`games.word-bridge.ui.join.${team}`)}
                </Button>
              )}
            </TeamBox>
          )
        })}
      </Teams>
      <Buttons>
        {can((action) => action.type === 'give') && (
          <Button $variant="secondary" disabled={disabled} onClick={() => send({ type: 'give' })}>
            {t('games.word-bridge.ui.beGiver')}
          </Button>
        )}
        {can((action) => action.type === 'shuffle') && (
          <Button $variant="secondary" disabled={disabled} onClick={() => send({ type: 'shuffle' })}>
            {t('games.word-bridge.ui.shuffle')}
          </Button>
        )}
        {ready && (
          <Button disabled={disabled} onClick={() => send({ type: 'begin' })}>
            {t('games.word-bridge.ui.begin')}
          </Button>
        )}
      </Buttons>
      {!ready && view.you !== null && <Body role="status">{t('games.word-bridge.ui.teamsShort')}</Body>}
    </Section>
  )
}

const Body = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Teams = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${space.md}px;
`

const TeamBox = styled.div<{ $color: string }>`
  display: grid;
  align-content: start;
  gap: ${space.sm}px;
  padding: ${space.sm}px;
  border-top: 4px solid ${(p) => p.$color};
  background: ${color.sunken};
`

const TeamName = styled.h3`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Name = styled.span`
  font-weight: 700;
`

const Badge = styled.span`
  padding: 0 ${space.xs}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`
