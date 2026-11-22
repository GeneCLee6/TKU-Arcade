import { lazy, Suspense, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import { getGameCard } from '../../shared/games/lobby.ts'
import type { OptionValues } from '../../shared/games/types.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { LobbyChat } from '../kart/lobby/KartLobby.tsx'
import { memberName } from '../lib/memberName.ts'
import { clippedFill, cornerClip, displayType, monoType, slantClip } from '../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Avatar } from './Avatar.tsx'
import { GameSetup } from './GameSetup.tsx'
import { DissolveButton, SeatedGateButton } from './HostControls.tsx'
import { MemberEntry } from './MemberEntry.tsx'
import { QrCode } from './QrCode.tsx'
import { Actions, Heading, List, Muted, Row, Section } from './roomParts.ts'
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
  /** e1-t16: the host sets or takes away the room's password */
  onSetPassword?(password: string | null): void
  /** 2026-11-22: the host lists the room in the lobby or takes it off (shared/protocol.ts 19.) */
  onSetPublic?(value: boolean): void
  /** e10-t05: a member's cosmetic choice for the others to see (the kart room's kart and driver) */
  onSetLook?(look: string | null): void
  /** 2026-11-17: the host adds a computer member (the kart room's computer karts) */
  onAddBot?(level: string, look?: string): void
  /** 2026-11-18: a side in the kart room's team race, one's own or (the host) anyone's */
  onSetTeam?(team: 0 | 1 | null, member?: string): void
  /** Below the setup in the right-hand column of a wide screen: the room's chat */
  aside?: ReactNode
  /** 2026-11-22: the race room's waiting room covers the screen and keeps its chat behind a button */
  chat?: LobbyChat
  /** 2026-11-22: leaving the room on purpose, from the race room's waiting room (shared/protocol.ts 17.) */
  onLeave?(): void
}

// e1-t16: its own chunk, with its strings
const RoomPasswordSetting = lazy(() => import('./RoomPasswordSetting.tsx'))
// 2026-11-21: the race room's own waiting room (place cards, Ready, the track; its garage, computer
// karts and teams inside it), its own chunk, only in a kart room (src/kart/lobby/KartLobby.tsx)
const KartLobby = lazy(() => import('../kart/lobby/KartLobby.tsx'))
// 2026-11-20: computer players for a game the room plays them in (GameMeta.computer), its own chunk
const TableBots = lazy(() => import('./TableBots.tsx'))

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
  onSetPassword,
  onSetPublic,
  onSetLook,
  onAddBot,
  onSetTeam,
  aside,
  chat,
  onLeave,
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
      gameId={view.room.gameId}
    />
  )

  // Sharing the room: its number, link and QR code, whether it is listed, its password
  const invite = (
    <Invite roomId={roomId} code={view.room.code ?? null}>
      <Visibility
        isPublic={view.room.public === true}
        locked={view.room.password !== undefined}
        onSet={isHost ? onSetPublic : undefined}
      />
      {(isHost || view.room.password !== undefined) && (
        <Suspense>
          <RoomPasswordSetting
            password={view.room.password ?? null}
            onSet={isHost ? onSetPassword : undefined}
          />
        </Suspense>
      )}
    </Invite>
  )
  // The game and its options; the host's way to end the room
  const setup = (
    <>
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
    </>
  )
  // The right-hand column: the same in every room
  const side = (
    <>
      {/* Right after a new room, sharing it is the next thing to do: not three phone screens down */}
      {invite}
      {setup}
      {aside}
    </>
  )

  if (view.room.gameId === 'kart' && onSetLook && onAddBot && onSetTeam) {
    return (
      <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
        <KartLobby
          view={view}
          you={you}
          onSit={onSit}
          onReady={onReady}
          onStart={onStart}
          onKick={onKick}
          onTransfer={onTransfer}
          onSetLook={onSetLook}
          onAddBot={onAddBot}
          onSetTeam={onSetTeam}
          invite={invite}
          setup={setup}
          chat={chat}
          onLeave={onLeave}
        />
      </Suspense>
    )
  }

  return (
    // Two columns when wide: who is here and starting on the left, inviting and setting up on the right.
    // One on a phone, in the same order
    <Layout data-room-columns="">
      <Column>
        <Section>
          <Heading>{t('room.waiting.seats')}</Heading>
          {/* 2026-11-23: a card per seat, a player's name plate; free seats wait in the same grid */}
          <SeatGrid>
            {seats.map((seat) => {
              const member = seated.find((other) => other.seat === seat)
              if (!member) {
                return (
                  <SeatCard key={seat} $tint={seatColor(seat)} $state="free">
                    <SeatTag>{t('room.waiting.seat', { seat: seat + 1 })}</SeatTag>
                    <FreeMark aria-hidden="true" />
                    <Muted>{t('room.waiting.empty')}</Muted>
                    <Button
                      $variant="secondary"
                      $size="sm"
                      aria-label={t('room.waiting.sitIn', { seat: seat + 1 })}
                      onClick={() => onSit(seat)}
                    >
                      {t('room.waiting.sit')}
                    </Button>
                  </SeatCard>
                )
              }
              const state: SeatState =
                member.ready || member.bot ? 'ready' : member.host ? 'host' : 'seated'
              return (
                <SeatCard
                  key={seat}
                  $tint={seatColor(seat)}
                  $state={state}
                  $away={!member.online && !member.bot}
                  data-you={member.id === you ? '' : undefined}
                >
                  <SeatTag>{t('room.waiting.seat', { seat: seat + 1 })}</SeatTag>
                  <Avatar
                    name={memberName(member, view.room.gameId)}
                    tint={seatColor(seat)}
                    size={56}
                  />
                  <Plate>{entry(member)}</Plate>
                </SeatCard>
              )
            })}
          </SeatGrid>
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

        {getGameCard(view.room.gameId)?.meta.computer && isHost && onAddBot && (
          <Suspense>
            <TableBots free={view.room.maxSeats - seated.length} onAdd={onAddBot} />
          </Suspense>
        )}
      </Column>

      <Column>{side}</Column>
    </Layout>
  )
}

/** The room's number (four digits) to say aloud, else its id; the link and the QR code for phones */
function Invite({
  roomId,
  code,
  children,
}: {
  roomId: string
  code: string | null
  children?: ReactNode
}) {
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
      {children}
    </Section>
  )
}

/** Public or not, for everyone to see; the host's to change (shared/protocol.ts 19.) */
function Visibility({
  isPublic,
  locked,
  onSet,
}: {
  isPublic: boolean
  locked: boolean
  onSet?: (value: boolean) => void
}) {
  const t = useT()
  const text = !isPublic
    ? t('room.visibility.private')
    : locked
      ? t('room.visibility.publicLocked')
      : t('room.visibility.public')
  return (
    <VisibilityRow data-testid="room-visibility">
      <CodeHint>{text}</CodeHint>
      {onSet && (
        <Button $variant="ghost" $size="sm" onClick={() => onSet(!isPublic)}>
          {t(isPublic ? 'room.visibility.makePrivate' : 'room.visibility.makePublic')}
        </Button>
      )}
    </VisibilityRow>
  )
}

const VisibilityRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
`

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: ${space.xl}px;

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }

  /*
   * A wide screen fills one page (2026-11-23): the seats and the start bar on the left; the
   * invitation beside the game's setup and the chat, two columns on the right
   */
  @media (min-width: 1280px) {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1.65fr);

    & > :last-child {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;

      & > :first-child {
        grid-row: span 4;
      }
    }
  }
`

// Two to a row on a phone, as many as fit on a wide screen
const SeatGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(136px, 100%), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 599px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

type SeatState = 'free' | 'seated' | 'host' | 'ready'

const seatEdge = (state: SeatState) =>
  state === 'ready'
    ? `inset 0 0 0 2px ${color.success}, inset 0 0 ${space.xl}px color-mix(in srgb, ${color.success} 22%, transparent)`
    : state === 'host'
      ? `inset 0 0 0 2px ${color.accent}`
      : state === 'free'
        ? `inset 0 0 0 1px ${color.border}`
        : `inset 0 0 0 1px ${color.line}`

const settle = keyframes`
  from {
    opacity: 0;
    translate: 0 ${space.sm}px;
  }
`

/**
 * A seat as a player card (2026-11-23): the seat's number on a slanted tag, a big hexagon avatar in
 * the seat's colour, the name plate with its badges. Ready (and a computer player) is a green frame
 * and glow, the host the hue's frame; each also says so in words (MemberEntry's badges)
 */
const SeatCard = styled.li<{ $tint: string; $state: SeatState; $away?: boolean }>`
  ${(p) => clippedFill(cornerClip(14), p.$state === 'free' ? 'transparent' : color.sunken)}
  display: grid;
  justify-items: center;
  align-content: start;
  gap: ${space.sm}px;
  min-height: 176px;
  padding: ${space.xxl}px ${space.md}px ${space.md}px;
  text-align: center;
  animation: ${settle} 0.3s ease-out both;

  &::before {
    box-shadow: ${(p) => seatEdge(p.$state)};
    ${(p) =>
      p.$state === 'free'
        ? `background: repeating-linear-gradient(-76deg, ${color.raised} 0 6px, transparent 6px 14px);`
        : ''}
  }

  /* The seat's colour along the top */
  &::after {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: ${(p) => p.$tint};
    opacity: ${(p) => (p.$state === 'free' ? 0.4 : 1)};
  }

  & > [aria-hidden='true'] {
    opacity: ${(p) => (p.$away ? 0.45 : 1)};
  }

  /* A phone: a row each, the avatar beside the name plate, so that six seats fit a screen or two */
  @media (max-width: 599px) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: 0;
    padding: ${space.sm}px ${space.md}px ${space.md}px;
    text-align: start;

    & > span:first-child {
      position: static;
      flex-basis: 100%;
      justify-self: start;
      margin-right: auto;
    }

    & > [aria-hidden='true'] {
      width: 40px !important;
      height: 40px !important;
    }

    & > div,
    & > p {
      flex: 1;
      justify-items: start;
    }

    & > div > span {
      justify-content: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const SeatTag = styled.span`
  ${clippedFill(slantClip(8), color.raised)}
  position: absolute;
  top: ${space.sm}px;
  left: ${space.sm}px;
  padding: 0 ${space.md}px;
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// An empty seat's place for an avatar: a hexagon's outline
const FreeMark = styled.span`
  width: 56px;
  height: 56px;
  background: ${color.border};
  clip-path: polygon(
    25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%,
    5% 50%, 28% 94%, 72% 94%, 95% 50%, 72% 6%, 28% 6%, 5% 50%, 0 50%
  );
`

// The name plate: name, badges, the host's controls, centred under the avatar
const Plate = styled.div`
  display: grid;
  justify-items: center;
  gap: ${space.xs}px;
  width: 100%;
  min-width: 0;

  & > span:first-child {
    ${displayType}
    font-size: ${fontSize.lg}px;
  }

  & > span {
    justify-content: center;
    margin-left: 0;
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
  background: linear-gradient(
    90deg,
    color-mix(in srgb, ${color.accent} 12%, ${color.sunken}),
    ${color.sunken}
  );
  box-shadow:
    inset 0 2px 0 ${color.accent},
    inset 0 0 0 1px ${color.line};
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
