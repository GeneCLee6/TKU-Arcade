import type { ReactNode } from 'react'
import styled from 'styled-components'
import type { CoverMessage, RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { RoomTimer } from '../lib/roomConnection.ts'
import { memberName } from '../lib/memberName.ts'
import { color, fontSize, seatColor, space } from '../styles/tokens.ts'
import { turnRingChunk } from '../lib/lateParts.ts'
import { clippedFill, displayType, slantClip } from '../styles/esports.ts'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { Countdown } from './Countdown.tsx'
import { FreeSeatRow } from './FreeSeatRow.tsx'
import { LateCoverSection } from './LateParts.tsx'
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

  // The ring round whoever is to move loads after the first paint (src/lib/lateParts.ts)
  const TurnRing = turnRingChunk.use()
  const avatar = (member: RoomMember) => (
    <Avatar
      name={memberName(member, view.room.gameId)}
      tint={seatTint && member.seat !== null ? seatColor(member.seat) : undefined}
    />
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
        <LateCoverSection
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
              <MemberRow
                key={member.id}
                $turn={hasTurn}
                style={member.seat === null ? undefined : { ['--seat' as string]: seatColor(member.seat) }}
              >
                {hasTurn && TurnRing ? (
                  <TurnRing timer={timers[0]}>{avatar(member)}</TurnRing>
                ) : (
                  avatar(member)
                )}
                {member.seat !== null && (
                  <SeatNumber>{t('room.waiting.seat', { seat: member.seat + 1 })}</SeatNumber>
                )}
                <MemberEntry
                  member={member}
                  isYou={member.id === you}
                  viewerIsHost={isHost}
                  onKick={onKick}
                  onTransfer={onTransfer}
                  gameId={view.room.gameId}
                  playing={status === 'playing'}
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

function StatusLine({ playing, isHost }: { playing: boolean; isHost: boolean }) {
  const t = useT()
  if (playing) return <p role="status">{t('room.inProgress')}</p>
  return <p role="status">{isHost ? t('room.ended.host') : t('room.ended.waitForHost')}</p>
}

const Layout = styled.div`
  display: grid;
  gap: ${space.xl}px;
`

// A nameplate (docs/DESIGN.md §3.9): the seat's colour down the left edge. The outline and the word
// say whose move it is, so neither rests on a colour
const MemberRow = styled(Row)<{ $turn: boolean }>`
  background: linear-gradient(90deg, color-mix(in srgb, var(--seat, transparent) 22%, ${color.sunken}), ${color.sunken} 65%);
  box-shadow: inset 4px 0 0 var(--seat, ${color.line})
    ${(p) => (p.$turn ? `, 0 0 ${space.lg}px color-mix(in srgb, ${color.accent} 40%, transparent)` : '')};
  outline: ${(p) => (p.$turn ? `2px solid ${color.accent}` : 'none')};
  outline-offset: -2px;
`

// A slanted tag in the game's hue, as on a broadcast (docs/DESIGN.md §3.9)
const TurnMark = styled.span`
  ${clippedFill(slantClip(6), color.accent)}
  margin-left: auto;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: 12px;
  text-transform: uppercase;
`

const SeatDetail = styled.span`
  flex-basis: 100%;
  min-width: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`
