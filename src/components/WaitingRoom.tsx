import type { ReactNode } from 'react'
import styled from 'styled-components'
import type { OptionValues } from '../../shared/games/types.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../styles/tokens.ts'
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
  /** Below the setup in the right-hand column of a wide screen: the room's chat */
  aside?: ReactNode
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
  aside,
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
    // Two columns when wide: who is here and starting on the left, inviting and setting up on the right.
    // One on a phone, in the same order
    <Layout data-room-columns="">
      <Column>
      <Section>
        <Heading>{t('room.waiting.seats')}</Heading>
        <List>
          {seats.map((seat) => {
            const member = seated.find((other) => other.seat === seat)
            return member ? (
              <Row key={seat} $mark={seatColor(seat)}>
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

      {/* The start bar */}
      <StartBar>
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
      </StartBar>
      </Column>

      <Column>

      {/* Right after a new room, sharing it is the next thing to do: not three phone screens down */}
      <Invite roomId={roomId} code={view.room.code ?? null} />

      <GameSetup
        room={view.room}
        isHost={isHost}
        onSetGame={onSetGame}
        onSetOptions={onSetOptions}
      />

      {isHost && (
        <Actions>
          <DissolveButton onDissolve={onDissolve} />
        </Actions>
      )}
      {aside}
      </Column>
    </Layout>
  )
}

/** The room's number (four digits) to say aloud, else its id; the link and the QR code for phones */
function Invite({ roomId, code }: { roomId: string; code: string | null }) {
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
      <Code>
        <CodeLabel>{t(code !== null ? 'room.waiting.roomCode' : 'room.waiting.roomId')}</CodeLabel>
        {/* An id, not a word: no translating it, by a browser or the zh-TW walkthrough */}
        <CodeValue translate="no" data-testid="room-code">
          {code ?? roomId}
        </CodeValue>
        {code !== null && <CodeHint>{t('room.waiting.roomCodeHint')}</CodeHint>}
      </Code>
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
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: ${space.xl}px;

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }
`

const Column = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.xl}px;
`

const StartBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  padding: ${space.lg}px;
  background: ${color.sunken};
  box-shadow: inset 0 0 0 1px ${color.line};
`

// The room's id, big and mono, as people read it out to each other
const Code = styled.p`
  display: grid;
  margin: 0;
`

const CodeLabel = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const CodeValue = styled.span`
  ${monoType}
  font-size: ${fontSize.xxl}px;
  font-weight: 700;
  letter-spacing: 0.12em;
  overflow-wrap: anywhere;
`

const CodeHint = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const LinkText = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  user-select: all;
`
