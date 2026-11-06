import styled from 'styled-components'
import type { CoverableSeat, CoverMessage, RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { RoomTimer } from '../lib/roomConnection.ts'
import { space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { Countdown } from './Countdown.tsx'
import { FreeSeatRow } from './FreeSeatRow.tsx'
import { DissolveButton, SeatedGateButton } from './HostControls.tsx'
import { MemberEntry } from './MemberEntry.tsx'
import { Actions, Heading, List, Muted, Row, SeatNumber, Section } from './roomParts.ts'

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
}

/** The room while it is not `waiting`: who is here and, for the host, what can be done next */
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
}: RoomInPlayProps) {
  const t = useT()
  const { status, minPlayers } = view.room
  const members = Object.values(view.members)
  const seated = members
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const spectators = members.filter((member) => member.seat === null)
  const me = view.members[you]
  const isHost = me?.host === true
  const freeSeats = Array.from({ length: view.room.maxSeats }, (_, seat) => seat).filter(
    (seat) => !seated.some((member) => member.seat === seat),
  )

  return (
    <Layout>
      <StatusLine playing={status === 'playing'} isHost={isHost} />
      {status === 'playing' && me?.seat === null && <Muted>{t('room.spectating')}</Muted>}

      {timers.map((timer) => (
        <Countdown key={timer.id} timer={timer} />
      ))}

      {status === 'playing' && view.coverable.length > 0 && (
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

interface CoverSectionProps {
  seated: RoomMember[]
  coverable: CoverableSeat[]
  isHost: boolean
  onCover: RoomInPlayProps['onCover']
}

/** The seats a game is stuck on: the host keeps it moving, everyone else hears why it stopped */
function CoverSection({ seated, coverable, isHost, onCover }: CoverSectionProps) {
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
