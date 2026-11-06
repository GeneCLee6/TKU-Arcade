import styled from 'styled-components'
import type { RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { RoomTimer } from '../lib/roomConnection.ts'
import { space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { Countdown } from './Countdown.tsx'
import { DissolveButton, SeatedGateButton } from './HostControls.tsx'
import { MemberEntry } from './MemberEntry.tsx'
import { Actions, Heading, List, Row, SeatNumber, Section } from './roomParts.ts'

export interface RoomInPlayProps {
  view: RoomView
  you: string
  timers: readonly RoomTimer[]
  onKick(memberId: string): void
  onTransfer(memberId: string): void
  onDissolve(): void
  onReopen(): void
  onRematch(): void
}

/** The room while it is not `waiting`: who is here and, for the host, what can be done next */
export function RoomInPlay({
  view,
  you,
  timers,
  onKick,
  onTransfer,
  onDissolve,
  onReopen,
  onRematch,
}: RoomInPlayProps) {
  const t = useT()
  const { status, minPlayers } = view.room
  const members = Object.values(view.members)
  const seated = members
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const spectators = members.filter((member) => member.seat === null)
  const isHost = view.members[you]?.host === true

  return (
    <Layout>
      <StatusLine playing={status === 'playing'} isHost={isHost} />

      {timers.map((timer) => (
        <Countdown key={timer.id} timer={timer} />
      ))}

      <Section>
        <Heading>{t('room.members')}</Heading>
        <List>
          {[...seated, ...spectators].map((member) => (
            <Row key={member.id}>
              {member.seat !== null && (
                <SeatNumber>{t('room.waiting.seat', { seat: member.seat + 1 })}</SeatNumber>
              )}
              <MemberEntry
                member={member}
                isYou={member.id === you}
                viewerIsHost={isHost}
                onKick={onKick}
                onTransfer={onTransfer}
              />
            </Row>
          ))}
        </List>
      </Section>

      {isHost && status === 'playing' && (
        <Actions>
          <ConfirmButton
            variant="secondary"
            label={t('room.host.endGame')}
            title={t('room.host.endGameTitle')}
            body={t('room.host.endGameBody')}
            onConfirm={onReopen}
          />
          <DissolveButton onDissolve={onDissolve} />
        </Actions>
      )}

      {isHost && status === 'ended' && (
        <Section>
          <SeatedGateButton
            label={t('room.host.rematch')}
            seated={seated.length}
            minPlayers={minPlayers}
            onClick={onRematch}
          />
          <Actions>
            <Button $variant="secondary" onClick={onReopen}>
              {t('room.host.reopen')}
            </Button>
            <DissolveButton onDissolve={onDissolve} />
          </Actions>
        </Section>
      )}
    </Layout>
  )
}

function StatusLine({ playing, isHost }: { playing: boolean; isHost: boolean }) {
  const t = useT()
  if (playing) return <p role="status">{t('room.inProgress')}</p>
  return <p role="status">{isHost ? t('room.ended.host') : t('room.ended.waitForHost')}</p>
}

const Layout = styled.div`
  display: grid;
  gap: ${space.xl}px;
`
