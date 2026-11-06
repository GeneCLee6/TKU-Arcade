import { useId } from 'react'
import styled from 'styled-components'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, radius, space, type ColorName } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { QrCode } from './QrCode.tsx'
import { useToast } from './useToast.ts'

export interface WaitingRoomProps {
  roomId: string
  view: RoomView
  you: string
  onSit(seat: number | null): void
  onReady(ready: boolean): void
  onStart(): void
}

export function WaitingRoom({ roomId, view, you, onSit, onReady, onStart }: WaitingRoomProps) {
  const t = useT()
  const members = Object.values(view.members)
  const me = view.members[you]
  const seated = members.filter((member) => member.seat !== null)
  const spectators = members.filter((member) => member.seat === null)
  const seats = Array.from({ length: view.room.maxSeats }, (_, seat) => seat)

  return (
    <Layout>
      <Section>
        <Heading>{t('room.waiting.seats')}</Heading>
        <List>
          {seats.map((seat) => {
            const member = seated.find((other) => other.seat === seat)
            return (
              <Row key={seat}>
                <SeatNumber>{t('room.waiting.seat', { seat: seat + 1 })}</SeatNumber>
                {member ? (
                  <MemberLine member={member} isYou={member.id === you} />
                ) : (
                  <>
                    <Muted>{t('room.waiting.empty')}</Muted>
                    <SitButton
                      $variant="secondary"
                      $size="sm"
                      aria-label={t('room.waiting.sitIn', { seat: seat + 1 })}
                      onClick={() => onSit(seat)}
                    >
                      {t('room.waiting.sit')}
                    </SitButton>
                  </>
                )}
              </Row>
            )
          })}
        </List>
      </Section>

      {spectators.length > 0 && (
        <Section>
          <Heading>{t('room.waiting.spectators')}</Heading>
          <List>
            {spectators.map((member) => (
              <Row key={member.id}>
                <MemberLine member={member} isYou={member.id === you} />
              </Row>
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

      {me?.host ? (
        <StartControl seated={seated.length} minPlayers={view.room.minPlayers} onStart={onStart} />
      ) : (
        <Muted>{t('room.waiting.waitForHost')}</Muted>
      )}

      <Invite roomId={roomId} />
    </Layout>
  )
}

interface StartControlProps {
  seated: number
  minPlayers: number
  onStart(): void
}

function StartControl({ seated, minPlayers, onStart }: StartControlProps) {
  const t = useT()
  const hintId = useId()
  const enough = seated >= minPlayers
  return (
    <Section>
      <Button disabled={!enough} aria-describedby={enough ? undefined : hintId} onClick={onStart}>
        {t('room.waiting.start')}
      </Button>
      {!enough && <Muted id={hintId}>{t('room.waiting.needPlayers', { count: minPlayers })}</Muted>}
    </Section>
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

function MemberLine({ member, isYou }: { member: RoomMember; isYou: boolean }) {
  const t = useT()
  return (
    <>
      <Name>{member.name}</Name>
      <Badges>
        {member.host && <Badge $tone="accent">{t('room.waiting.badge.host')}</Badge>}
        {isYou && <Badge $tone="text">{t('room.waiting.badge.you')}</Badge>}
        {member.ready && <Badge $tone="success">{t('room.waiting.badge.ready')}</Badge>}
        {!member.online && <Badge $tone="muted">{t('room.waiting.badge.offline')}</Badge>}
      </Badges>
    </>
  )
}

const Layout = styled.div`
  display: grid;
  gap: ${space.xl}px;
`

const Section = styled.section`
  display: grid;
  gap: ${space.sm}px;
`

const Heading = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const List = styled.ul`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  padding: ${space.xs}px ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
`

const SeatNumber = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// A long name without spaces must wrap, not push the row past a 320px screen
const Name = styled.span`
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
`

const Badges = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Badge = styled.span<{ $tone: ColorName }>`
  padding: 0 ${space.sm}px;
  color: ${(p) => color[p.$tone]};
  border: 1px solid currentColor;
  border-radius: ${radius.component}px;
  font-size: ${fontSize.sm}px;
`

const SitButton = styled(Button)`
  margin-left: auto;
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const LinkText = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
  user-select: all;
`
