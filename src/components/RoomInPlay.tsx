import type { ReactNode } from 'react'
import styled from 'styled-components'
import type { CoverableSeat, CoverMessage, RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { RoomTimer } from '../lib/roomConnection.ts'
import { color, fontSize, seatColor, space } from '../styles/tokens.ts'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { Countdown } from './Countdown.tsx'
import { FreeSeatRow } from './FreeSeatRow.tsx'
import { DissolveButton, HostEndedActions } from './HostControls.tsx'
import { MemberEntry } from './MemberEntry.tsx'
import {
  Actions,
  Heading,
  List,
  Muted,
  Row,
  SeatNumber,
  Section,
  seatedMembers,
} from './roomParts.ts'

export interface RoomInPlayProps {
  view: RoomView
  you: string
  timers: readonly RoomTimer[]
  onSit(seat: number | null): void
  onCover(seat: number, how: CoverMessage['how']): void
  onKick(memberId: string): void
  onTransfer(memberId: string): void
  onDissolve(): void
  onReopen(): void
  onRematch(): void
  /** What the game has to say about this member: the line under their name */
  seatDetail?(member: RoomMember): ReactNode
  /** The seat whose move it is: marked in words and with an outline */
  turnSeat?: number | null
  /** Avatars take the seat's colour, matching the game's pieces */
  seatTint?: boolean
  /** The game's screen says what is going on, so "in progress" would only repeat it */
  hidePlaying?: boolean
  /** The countdown and the stuck seats are on show elsewhere, as a drawer would hide them */
  urgentElsewhere?: boolean
  /** The result panel says the game has ended and holds what the host does next */
  resultElsewhere?: boolean
}

/**
 * The room while it is not `waiting`, the side panel of the game's screen: who is here and, for the
 * host, what can be done next
 */
export function RoomInPlay({
  view,
  you,
  timers,
  onSit,
  onCover,
  onKick,
  onTransfer,
  onDissolve,
  onReopen,
  onRematch,
  seatDetail,
  turnSeat,
  seatTint,
  hidePlaying,
  urgentElsewhere,
  resultElsewhere,
}: RoomInPlayProps) {
  const t = useT()
  const { status, minPlayers } = view.room
  const members = Object.values(view.members)
  const seated = seatedMembers(view)
  const spectators = members.filter((member) => member.seat === null)
  const me = view.members[you]
  const isHost = me?.host === true
  const freeSeats = Array.from({ length: view.room.maxSeats }, (_, seat) => seat).filter(
    (seat) => !seated.some((member) => member.seat === seat),
  )

  return (
    <Layout>
      {!(hidePlaying && status === 'playing') && !(resultElsewhere && status === 'ended') && (
        <StatusLine playing={status === 'playing'} isHost={isHost} />
      )}
      {status === 'playing' && !hidePlaying && me?.seat === null && (
        <Muted>{t('room.spectating')}</Muted>
      )}

      {!urgentElsewhere && timers.map((timer) => <Countdown key={timer.id} timer={timer} />)}

      {!urgentElsewhere && status === 'playing' && view.coverable.length > 0 && (
        <CoverSection
          seated={seated}
          coverable={view.coverable}
          isHost={isHost}
          onCover={onCover}
        />
      )}

      <Section>
        <Heading>{t('room.members')}</Heading>
        <List>
          {[...seated, ...spectators].map((member) => {
            const hasTurn = member.seat !== null && member.seat === turnSeat
            const detail = seatDetail?.(member)
            return (
              <MemberRow key={member.id} $turn={hasTurn}>
                <Avatar
                  name={member.name}
                  tint={seatTint && member.seat !== null ? seatColor(member.seat) : undefined}
                />
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
                {hasTurn && <TurnMark>{t('room.turnBadge')}</TurnMark>}
                {detail && <SeatDetail>{detail}</SeatDetail>}
              </MemberRow>
            )
          })}
        </List>
      </Section>

      {status === 'ended' && me?.seat === null && (
        <Section>
          <Heading>{t('room.ended.freeSeats')}</Heading>
          {freeSeats.length > 0 ? (
            <List>
              {freeSeats.map((seat) => (
                <FreeSeatRow key={seat} seat={seat} onSit={onSit} />
              ))}
            </List>
          ) : (
            <Muted>{t('room.ended.noFreeSeat')}</Muted>
          )}
        </Section>
      )}

      {status === 'ended' && me && me.seat !== null && (
        <Actions>
          <Button $variant="ghost" onClick={() => onSit(null)}>
            {t('room.waiting.standUp')}
          </Button>
        </Actions>
      )}

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

      {isHost && status === 'ended' && !resultElsewhere && (
        <HostEndedActions
          seated={seated.length}
          minPlayers={minPlayers}
          onRematch={onRematch}
          onReopen={onReopen}
          onDissolve={onDissolve}
        />
      )}
    </Layout>
  )
}

interface CoverSectionProps {
  seated: RoomMember[]
  coverable: CoverableSeat[]
  isHost: boolean
  onCover: RoomInPlayProps['onCover']
}

/** The seats a game is stuck on: the host keeps it moving, everyone else hears why it stopped */
export function CoverSection({ seated, coverable, isHost, onCover }: CoverSectionProps) {
  const t = useT()
  if (!isHost) return <Muted>{t('room.cover.waitForHost')}</Muted>
  return (
    <Section>
      <Heading>{t('room.cover.heading')}</Heading>
      <List>
        {coverable.map(({ seat, skip, proxy }) => {
          // Nobody holds a seat whose player was kicked
          const name = seated.find((member) => member.seat === seat)?.name
          const number = seat + 1
          return (
            <CoverRow key={seat}>
              <span>
                {name === undefined
                  ? t('room.cover.seatEmpty', { seat: number })
                  : t('room.cover.seatHeld', { seat: number, name })}
              </span>
              {skip || proxy ? (
                <Actions>
                  {skip && (
                    <Button
                      $variant="secondary"
                      aria-label={t('room.cover.skipNamed', { seat: number })}
                      onClick={() => onCover(seat, 'skip')}
                    >
                      {t('room.cover.skip')}
                    </Button>
                  )}
                  {proxy && (
                    <Button
                      $variant="secondary"
                      aria-label={t('room.cover.proxyNamed', { seat: number })}
                      onClick={() => onCover(seat, 'proxy')}
                    >
                      {t('room.cover.proxy')}
                    </Button>
                  )}
                </Actions>
              ) : (
                <Muted>{t('room.cover.cannotContinue')}</Muted>
              )}
            </CoverRow>
          )
        })}
      </List>
    </Section>
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

const CoverRow = styled(Row)`
  overflow-wrap: anywhere;
`

// The outline and the word say whose move it is, so neither rests on a colour
const MemberRow = styled(Row)<{ $turn: boolean }>`
  outline: ${(p) => (p.$turn ? `2px solid ${color.text}` : 'none')};
  outline-offset: -1px;
`

const TurnMark = styled.span`
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const SeatDetail = styled.span`
  flex-basis: 100%;
  min-width: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`
