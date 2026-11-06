import styled from 'styled-components'
import type { OptionValues } from '../../shared/games/types.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FreeSeatRow } from './FreeSeatRow.tsx'
import { DissolveButton, GameSetup, SeatedGateButton } from './HostControls.tsx'
import { MemberEntry } from './MemberEntry.tsx'
import { QrCode } from './QrCode.tsx'
import { Actions, Heading, List, Muted, Row, SeatNumber, Section } from './roomParts.ts'
import { useToast } from './useToast.ts'

export interface WaitingRoomProps {
  roomId: string
  view: RoomView
  you: string
  onSit(seat: number | null): void
  onReady(ready: boolean): void
  onStart(): void
  onKick(memberId: string): void
  onTransfer(memberId: string): void
  onDissolve(): void
  onSetGame(gameId: string): void
  onSetOptions(options: OptionValues): void
}

export function WaitingRoom({
  roomId,
  view,
  you,
  onSit,
  onReady,
  onStart,
  onKick,
  onTransfer,
  onDissolve,
  onSetGame,
  onSetOptions,
}: WaitingRoomProps) {
  const t = useT()
  const members = Object.values(view.members)
  const me = view.members[you]
  const seated = members.filter((member) => member.seat !== null)
  const spectators = members.filter((member) => member.seat === null)
  const seats = Array.from({ length: view.room.maxSeats }, (_, seat) => seat)
  const isHost = me?.host === true

  const entry = (member: RoomMember) => (
    <MemberEntry
      key={member.id}
      member={member}
      isYou={member.id === you}
      viewerIsHost={isHost}
      onKick={onKick}
      onTransfer={onTransfer}
    />
  )

  return (
    <Layout>
      <Section>
        <Heading>{t('room.waiting.seats')}</Heading>
        <List>
          {seats.map((seat) => {
            const member = seated.find((other) => other.seat === seat)
            return member ? (
              <Row key={seat}>
                <SeatNumber>{t('room.waiting.seat', { seat: seat + 1 })}</SeatNumber>
                {entry(member)}
              </Row>
            ) : (
              <FreeSeatRow key={seat} seat={seat} onSit={onSit} />
            )
          })}
        </List>
      </Section>

      {spectators.length > 0 && (
        <Section>
          <Heading>{t('room.waiting.spectators')}</Heading>
          <List>
            {spectators.map((member) => (
              <Row key={member.id}>{entry(member)}</Row>
            ))}
          </List>
        </Section>
      )}

      {me?.seat === null && <Muted>{t('room.waiting.pickSeat')}</Muted>}
      {me && me.seat !== null && (
        <Actions>
          <Button $variant="secondary" onClick={() => onReady(!me.ready)}>
            {me.ready ? t('room.waiting.cancelReady') : t('room.waiting.ready')}
          </Button>
          <Button $variant="ghost" onClick={() => onSit(null)}>
            {t('room.waiting.standUp')}
          </Button>
        </Actions>
      )}

      {isHost ? (
        <SeatedGateButton
          label={t('room.waiting.start')}
          seated={seated.length}
          minPlayers={view.room.minPlayers}
          onClick={onStart}
        />
      ) : (
        <Muted>{t('room.waiting.waitForHost')}</Muted>
      )}

      <GameSetup
        room={view.room}
        isHost={isHost}
        onSetGame={onSetGame}
        onSetOptions={onSetOptions}
      />

      <Invite roomId={roomId} />

      {isHost && (
        <Actions>
          <DissolveButton onDissolve={onDissolve} />
        </Actions>
      )}
    </Layout>
  )
}

function Invite({ roomId }: { roomId: string }) {
  const t = useT()
  const toast = useToast()
  const link = `${window.location.origin}/r/${roomId}`

  const copy = async () => {
    // A missing clipboard (an insecure page, an old browser) throws here too
    try {
      await navigator.clipboard.writeText(link)
      toast(t('room.waiting.copied'), { tone: 'success' })
    } catch {
      toast(t('room.waiting.copyFailed'), { tone: 'warning' })
    }
  }

  return (
    <Section>
      <Heading>{t('room.waiting.invite')}</Heading>
      <LinkText>{link}</LinkText>
      <Actions>
        <Button $variant="secondary" onClick={() => void copy()}>
          {t('room.waiting.copyLink')}
        </Button>
      </Actions>
      <QrCode text={link} label={t('room.waiting.qrLabel')} />
    </Section>
  )
}

const Layout = styled.div`
  display: grid;
  gap: ${space.xl}px;
`

const LinkText = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
  user-select: all;
`
