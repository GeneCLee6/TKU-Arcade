import { createElement, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import type { RoomStatus } from '../../shared/protocol.ts'
import { isRoomId } from '../../shared/room-id.ts'
import { AccountControl } from '../components/AccountControl.tsx'
import { AppShell } from '../components/AppShell.tsx'
import { LateChatPanel as ChatPanel, LateConnectionBanner as ConnectionBanner } from '../components/LateParts.tsx'
import { Button } from '../components/Button.tsx'
import { GameLayout, RoomChatPanel, type RoomParts } from '../components/GameLayout.tsx'
import { HowToPlay } from '../components/HowToPlay.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { gameScreen } from '../games/screens.ts'
import type { RulesEdition } from '../lib/rulesDoc.ts'
import { loadGameDetails, useGameDetails } from '../i18n/gameDetails.ts'
import { useT } from '../i18n/useT.ts'
import { ChatDraft, unreadCount } from '../lib/chatState.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { useAccount } from '../lib/account.ts'
import { readNickname } from '../lib/nickname.ts'
import { keepRoomPassword } from '../lib/roomPassword.ts'
import { fetchRoomSummary, type RoomLookup } from '../lib/rooms.ts'
import { Link } from '../lib/router.tsx'
import { useCompact } from '../lib/useMediaQuery.ts'
import { useRoom } from '../lib/useRoom.ts'
import { memberName, withBotNames } from '../lib/memberName.ts'
import { useParams } from '../lib/useRouter.ts'
import { clippedFill, displayType, monoType, SLANT, slantClip } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { RoomWatch } from '../achievements/RoomWatch.tsx'

// e7-t11: its own chunk, with its strings
const Reactions = lazy(() => import('../components/Reactions.tsx'))

// Only a room that has not started shows it: a game's first screen does not wait for the seats and
// the options form (every new game's lobby strings come out of the same 150 kB)
const WaitingRoom = lazy(() =>
  import('../components/WaitingRoom.tsx').then(({ WaitingRoom }) => ({ default: WaitingRoom })),
)

// 2026-11-22: full screen (src/lib/fullscreen.ts), its button and words a small chunk of their own
const FullscreenButton = lazy(() => import('../components/FullscreenButton.tsx'))

// e1-t16: only a room with a password, and only for someone new, ever needs it
const PasswordForm = lazy(() => import('../components/PasswordForm.tsx'))

const ReplayPage = lazy(() =>
  import('./ReplayPage.tsx').then(({ ReplayPage }) => ({ default: ReplayPage })),
)

/** `/r/<id>/replay` (e2-t09), loaded after this chunk: see src/App.tsx */
export function ReplayEntry() {
  const t = useT()
  return (
    <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
      <ReplayPage />
    </Suspense>
  )
}

// The key gives each room its own state when the address changes without leaving this page
export function RoomPage() {
  const { id = '' } = useParams()
  return (
    <>
      <AppShell />
      <TopBar />
      <Main>{isRoomId(id) ? <RoomEntry key={id} id={id} /> : <NotFound />}</Main>
    </>
  )
}

function RoomEntry({ id }: { id: string }) {
  const t = useT()
  const [lookup, setLookup] = useState<RoomLookup | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [guestName, setName] = useState(readNickname)
  // Signed in (e1-t13): the account's name, never asked for. Wait for /api/me before joining, so a
  // signed-in person is not asked for a nickname first
  const accountState = useAccount()
  const name = accountState?.account?.name ?? guestName

  useEffect(() => {
    const controller = new AbortController()
    void fetchRoomSummary(id, controller.signal).then((result) => {
      // The game's options and room strings start loading now, while the room is joined
      if (result.status === 'found') void loadGameDetails(result.summary.gameId)
      if (!controller.signal.aborted) setLookup(result)
    })
    return () => controller.abort()
  }, [id, attempt])

  if (lookup === null || accountState === null) return <p role="status">{t('common.loading')}</p>
  if (lookup.status === 'notFound') return <NotFound />
  if (lookup.status === 'failed') {
    const retry = () => {
      setLookup(null)
      setAttempt((count) => count + 1)
    }
    return <Problem message={t('room.loadFailed')} action={<RetryButton onClick={retry} />} />
  }

  const title = gameTitle(t, lookup.summary.gameId)
  if (name === null) {
    return (
      <>
        <RoomHeading
          title={title}
          members={lookup.summary.members}
          gameId={lookup.summary.gameId}
        />
        <NicknameForm onSubmit={setName} />
        {/* Or sign in instead, and come back to this room (e1-t13); nothing when not configured */}
        <SignInInstead>
          <AccountControl />
        </SignInInstead>
      </>
    )
  }
  return <RoomSession id={id} name={name} title={title} members={lookup.summary.members} />
}

interface RoomSessionProps {
  id: string
  name: string
  title: string
  members: number
}

function RoomSession({ id, name, title, members }: RoomSessionProps) {
  const t = useT()
  const room = useRoom(id, name)
  const { session, retry } = room
  // Here, not in the panel: what someone was writing outlives a connection problem and the retry
  const [chatDraft] = useState(() => new ChatDraft())
  const compact = useCompact()
  // The room waits for its game's room strings (results, errors, the options form) the first time;
  // a host's later pick of another game shows the room as it is while the new one's arrive
  const details = useGameDetails(session.phase === 'joined' ? session.view.room.gameId : null)
  const [detailsShown, setDetailsShown] = useState(false)
  if (details !== undefined && !detailsShown) setDetailsShown(true)

  if (session.phase === 'ended') {
    switch (session.end) {
      case 'notFound':
        return <NotFound />
      case 'versionMismatch':
        return (
          <Problem
            message={t('room.versionMismatch')}
            action={<Button onClick={() => window.location.reload()}>{t('room.reload')}</Button>}
          />
        )
      case 'full':
        return <Problem message={t('room.full')} />
      case 'tooManyConnections':
        return (
          <Problem message={t('room.tooManyConnections')} action={<RetryButton onClick={retry} />} />
        )
      case 'replaced':
        return <Problem message={t('room.replaced')} />
      case 'kicked':
        return <Problem message={t('room.kicked')} />
      case 'dissolved':
        return <Problem message={t('room.dissolved')} />
      case 'left':
        return <Problem message={t('room.left')} />
      case 'connectionLost':
        return (
          <Problem message={t('room.connectionLost')} action={<RetryButton onClick={retry} />} />
        )
      case 'disconnected':
        return <Problem message={t('room.disconnected')} action={<RetryButton onClick={retry} />} />
    }
  }

  if (session.phase === 'password') {
    return (
      <>
        <RoomHeading title={title} members={members} />
        <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
          <PasswordForm
            wrong={session.wrong}
            held={session.held === true}
            onSubmit={(password) => {
              keepRoomPassword(id, password)
              retry()
            }}
          />
        </Suspense>
      </>
    )
  }

  if (session.phase === 'joining' || (details === undefined && !detailsShown)) {
    return (
      <>
        <RoomHeading title={title} members={members} />
        <p role="status">{t('room.joining')}</p>
      </>
    )
  }

  // From here on the room itself says: the summary was read before this person joined
  const { view, you } = session
  const parts: RoomParts = {
    // Computer members by the names people read (the screens show `member.name` as it is)
    view: withBotNames(view),
    you,
    timers: room.timers,
    onSit: room.sit,
    onCover: room.cover,
    onKick: room.kick,
    onTransfer: room.transfer,
    onDissolve: room.dissolve,
    onReopen: room.reopen,
    onRematch: room.rematch,
    act: room.act,
    realtime: room.realtime,
    onSetLook: room.setLook,
    actFor: room.actFor,
    onLeave: room.leave,
    chat: {
      messages: room.chat,
      locked: view.game?.chatLocked ?? false,
      onSend: room.sendChat,
      draftStore: chatDraft,
    },
  }
  const Screen = gameScreen(view.room.gameId, view.game?.view)
  // 2026-11-22: the race room's waiting room covers the screen, its chat behind a button of its own
  const kartLobby = view.room.status === 'waiting' && view.room.gameId === 'kart'
  return (
    <>
      {/* Always in the page: screen readers only announce changes in a region they already know */}
      <ConnectionStatus aria-live="polite" data-inert-keep="">
        <ConnectionBanner reconnecting={session.reconnecting} onTryNow={room.reconnectNow} />
      </ConnectionStatus>
      <RoomHeading
        back={<LobbyLink onLeave={room.leave} compact />}
        title={gameTitle(t, view.room.gameId)}
        members={Object.keys(view.members).length}
        gameId={view.room.gameId}
        status={view.room.status}
        edition={view.room.options.edition === 'full' ? 'full' : 'simple'}
        extra={
          <Suspense>
            <Reactions
              reactions={room.reactions}
              onReact={room.react}
              nameOf={(member) => {
                const one = view.members[member]
                return one ? memberName(one, view.room.gameId) : ''
              }}
            />
          </Suspense>
        }
      />
      {view.room.status === 'waiting' ? (
        <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
          <WaitingRoom
            roomId={id}
            view={view}
            you={you}
            onSit={room.sit}
            onReady={room.setReady}
            onStart={room.start}
            onKick={room.kick}
            onTransfer={room.transfer}
            onDissolve={room.dissolve}
            onSetGame={room.setGame}
            onSetOptions={room.setOptions}
            onSetPublic={room.setPublic}
            onSetPassword={room.setPassword}
            onSetLook={room.setLook}
            onAddBot={room.addBot}
            onSetTeam={room.setTeam}
            aside={!compact && !kartLobby && <RoomChatPanel room={parts} />}
            chat={
              kartLobby
                ? {
                    panel: <ChatPanel {...parts.chat} you={you} />,
                    messages: parts.chat.messages,
                    unreadCount,
                  }
                : undefined
            }
            onLeave={room.leave}
            // On a phone the chat, the invitation and the setup are a sheet, its bar under the seats
            phoneDock={
              compact && !kartLobby
                ? (panels) => <RoomChatPanel room={parts} panels={panels} />
                : undefined
            }
          />
        </Suspense>
      ) : view.game && Screen ? (
        // While its code loads the room is already all there, chat included
        <Suspense
          fallback={
            <GameLayout room={parts} resultHeld>
              <p role="status">{t('common.loading')}</p>
            </GameLayout>
          }
        >
          {createElement(Screen, { room: parts, game: view.game })}
        </Suspense>
      ) : (
        <GameLayout room={parts} />
      )}
      {/* e11-t06: a game's end, to the achievements */}
      <RoomWatch view={view} you={you} />
    </>
  )
}

function RoomHeading({
  back,
  title,
  members,
  gameId,
  edition,
  extra,
  status,
}: {
  /** 2026-11-23 (app shell): the way out, at the start of the bar as a game's exit button */
  back?: ReactNode
  title: string
  members: number
  gameId?: string
  /** Which rules "how to play" opens, for a game with two editions */
  edition?: RulesEdition
  /** Beside "how to play": the reactions (e7-t11), so that they take no row of their own */
  extra?: ReactNode
  /** Once in the room: waiting, live or final, on a ticker beside the title (2026-11-23) */
  status?: RoomStatus
}) {
  const t = useT()
  return (
    // The game's hue spreads to the whole page from here (GlobalStyle)
    <HeadingRow data-game={gameId}>
      {back}
      <Title>{title}</Title>
      {status !== undefined && (
        <StatusTag $live={status === 'playing'} data-status={status}>
          {t(`room.status.${status}`)}
        </StatusTag>
      )}
      <MemberCount>{t('room.memberCount', { count: members })}</MemberCount>
      {gameId !== undefined && (
        <HeadingAction>
          {extra}
          {/* 2026-11-23 (QA sweep): not while Promotion is played, whose board has its own full
              screen (the board and the roll, #29): two buttons called "Full screen" that do
              different things */}
          {!(gameId === 'promotion' && status === 'playing') && (
            <Suspense>
              <FullscreenButton iconOnly />
            </Suspense>
          )}
          <HowToPlay gameId={gameId} edition={edition} />
        </HeadingAction>
      )}
    </HeadingRow>
  )
}

function NotFound() {
  const t = useT()
  return (
    <>
      <Title>{t('room.notFound')}</Title>
      <Muted>{t('room.notFoundHint')}</Muted>
      <LobbyLink />
    </>
  )
}

function Problem({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <>
      <p role="alert">{message}</p>
      {action && <div>{action}</div>}
      <LobbyLink />
    </>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return <Button onClick={onClick}>{t('room.retry')}</Button>
}

/** `onLeave`: from inside a room, which is left on purpose on the way (shared/protocol.ts 17.) */
function LobbyLink({ onLeave, compact }: { onLeave?: () => void; compact?: boolean }) {
  const t = useT()
  return (
    <BackLink to="/" onClick={onLeave} $compact={compact}>
      {t('room.backToLobby')}
    </BackLink>
  )
}


// The app shell (AppShell.tsx): the rest of the screen under the top bar, a column. The room's body
// (a game's layout, the waiting room) takes what the bars above it leave and shares it out to its own
// scrolling panels. Anything else (a nickname to give, a problem) scrolls here, never the page
// The waiting room's two columns; a wide screen gives the seats its width (2026-11-23)
// A game needs the width its board can use, and on a phone every pixel of it
// A board that fits itself to the screen (the promotion board, e3-t10) can use all of a big one
const Main = styled.main`
  display: grid;
  gap: ${space.lg}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;

  & p {
    margin: 0;
  }

  &:has([data-room-columns]) {
    width: min(1120px, 100%);

    @media (min-width: 1280px) {
      width: min(1440px, 100%);
    }
  }

  &:has([data-wide-room]) {
    width: min(1280px, 100%);
  }

  &:has([data-fit-screen]) {
    width: min(2200px, 100%);
  }

  @media (max-width: 899px) {
    &:has([data-wide-room]) {
      padding: ${space.md}px ${space.sm}px ${space.sm}px;
    }
  }

  :root[data-app-shell] & {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: ${space.sm}px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: ${space.sm}px max(${space.lg}px, env(safe-area-inset-right))
      max(${space.sm}px, env(safe-area-inset-bottom)) max(${space.lg}px, env(safe-area-inset-left));

    & > * {
      flex: none;
    }

    & > [data-room-body] {
      flex: 1 1 0;
      min-height: 0;
    }

    &:has([data-room-body]) {
      overflow: hidden;
    }

    @media (max-width: 899px) {
      padding: ${space.xs}px max(${space.sm}px, env(safe-area-inset-right))
        max(${space.xs}px, env(safe-area-inset-bottom)) max(${space.sm}px, env(safe-area-inset-left));
    }
  }
`

// Stuck to the top, since the room can be longer than a phone's screen. Empty, it takes up no room:
// the negative margin cancels the gap of the grid it is in.
// Over the race room's waiting room too (z-index 9, KartLobby.tsx); the race (20) covers it
const ConnectionStatus = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;

  &:empty {
    margin-bottom: -${space.lg}px;

    :root[data-app-shell] & {
      margin-bottom: -${space.sm}px;
    }
  }
`

// A broadcast bar (2026-11-23): the hue down from the left, hairlines above and below. In the app
// shell a game's bar, as low as it can be, on one line where the screen is short
const HeadingRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.md}px;
  padding: ${space.sm}px 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, ${color.accent} 14%, transparent),
    transparent 60%
  );
  box-shadow:
    inset 0 1px 0 ${color.line},
    inset 0 -1px 0 ${color.line};

  :root[data-app-shell] & {
    padding: ${space.xs}px 0;

    @media (max-height: 560px) {
      flex-wrap: nowrap;

      & > h1 {
        min-width: 0;
        font-size: ${fontSize.lg}px;
      }
    }
  }
`

const pulse = keyframes`
  50% {
    opacity: 0.3;
  }
`

// Waiting, live or final: a slanted tag; live is magenta with a beating dot
const StatusTag = styled.p<{ $live: boolean }>`
  ${(p) => clippedFill(slantClip(8), p.$live ? color.magenta : color.accent)}
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;

  &::after {
    content: '';
    display: ${(p) => (p.$live ? 'block' : 'none')};
    order: -1;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: ${pulse} 1.2s steps(2) infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }
`

const HeadingAction = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  margin-left: auto;
`

// The game's name, in its hue, after a slanted bar
const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xxl}px;
  overflow-wrap: anywhere;

  &::before {
    content: '';
    flex: none;
    width: ${space.md}px;
    height: 0.9em;
    background: ${color.accent};
    box-shadow: 0 0 ${space.lg}px ${color.accent};
    transform: skewX(${SLANT});
  }

  @media (max-width: 480px) {
    font-size: ${fontSize.xl}px;
  }
`

// A slanted tag. Not on a phone's room, whose members are a button away in the dock
const MemberCount = styled.p`
  @media (max-width: 899px) {
    :root[data-app-shell] & {
      display: none;
    }
  }

  ${clippedFill(slantClip(8), color.raised)}
  ${monoType}
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Muted = styled.p`
  color: ${color.muted};
`

// In a phone's room bar the arrow alone, named all the same (the words are only too small to see)
const BackLink = styled(Link)<{ $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 44px;
  color: ${color.text};
  ${(p) => (p.$compact ? `padding: 0 ${space.sm}px; white-space: nowrap; &::before { content: '‹'; content: '‹' / ''; margin-right: ${space.xs}px; }` : '')}

  @media (max-width: 899px) {
    :root[data-app-shell] && {
      justify-content: center;
      min-width: 44px;
      font-size: 0;

      &::before {
        margin: 0;
        font-size: ${fontSize.xl}px;
      }
    }
  }
`

const SignInInstead = styled.div`
  margin-top: ${space.sm}px;

  &:empty {
    display: none;
  }
`
