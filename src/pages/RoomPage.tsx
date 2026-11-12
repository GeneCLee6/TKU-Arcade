import { createElement, Suspense, useEffect, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { isRoomId } from '../../shared/room-id.ts'
import { AccountControl } from '../components/AccountControl.tsx'
import { Button } from '../components/Button.tsx'
import { GameLayout, RoomChatPanel, type RoomParts } from '../components/GameLayout.tsx'
import { HowToPlay } from '../components/HowToPlay.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { WaitingRoom } from '../components/WaitingRoom.tsx'
import { gameScreen } from '../games/screens.ts'
import type { RulesEdition } from '../lib/rulesDoc.ts'
import { useT } from '../i18n/useT.ts'
import { ChatDraft } from '../lib/chatState.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { useAccount } from '../lib/account.ts'
import { readNickname } from '../lib/nickname.ts'
import { fetchRoomSummary, type RoomLookup } from '../lib/rooms.ts'
import { Link } from '../lib/router.tsx'
import { useCompact } from '../lib/useMediaQuery.ts'
import { useRoom } from '../lib/useRoom.ts'
import { useParams } from '../lib/useRouter.ts'
import { clippedFill, displayType, monoType, SLANT, slantClip } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

// The key gives each room its own state when the address changes without leaving this page
export function RoomPage() {
  const { id = '' } = useParams()
  return (
    <>
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
      case 'replaced':
        return <Problem message={t('room.replaced')} />
      case 'kicked':
        return <Problem message={t('room.kicked')} />
      case 'dissolved':
        return <Problem message={t('room.dissolved')} />
      case 'connectionLost':
        return (
          <Problem message={t('room.connectionLost')} action={<RetryButton onClick={retry} />} />
        )
      case 'disconnected':
        return <Problem message={t('room.disconnected')} action={<RetryButton onClick={retry} />} />
    }
  }

  if (session.phase === 'joining') {
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
    view,
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
    chat: {
      messages: room.chat,
      locked: view.game?.chatLocked ?? false,
      onSend: room.sendChat,
      draftStore: chatDraft,
    },
  }
  const Screen = gameScreen(view.room.gameId, view.game?.view)
  return (
    <>
      {/* Always in the page: screen readers only announce changes in a region they already know */}
      <ConnectionStatus aria-live="polite">
        {session.reconnecting && <ReconnectBanner>{t('room.reconnecting')}</ReconnectBanner>}
      </ConnectionStatus>
      <RoomHeading
        title={gameTitle(t, view.room.gameId)}
        members={Object.keys(view.members).length}
        gameId={view.room.gameId}
        edition={view.room.options.edition === 'full' ? 'full' : 'simple'}
      />
      {view.room.status === 'waiting' ? (
        <>
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
            aside={!compact && <RoomChatPanel room={parts} />}
          />
          {/* On a phone the chat is a drawer, its bar stuck to the bottom of the whole page */}
          {compact && <RoomChatPanel room={parts} />}
        </>
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
      {/* A result carries its own, where it can be seen without passing the board */}
      {!(view.room.status === 'ended' && view.game?.result) && <LobbyLink />}
    </>
  )
}

function RoomHeading({
  title,
  members,
  gameId,
  edition,
}: {
  title: string
  members: number
  gameId?: string
  /** Which rules "how to play" opens, for a game with two editions */
  edition?: RulesEdition
}) {
  const t = useT()
  return (
    // The game's hue spreads to the whole page from here (GlobalStyle)
    <HeadingRow data-game={gameId}>
      <Title>{title}</Title>
      <MemberCount>{t('room.memberCount', { count: members })}</MemberCount>
      {gameId !== undefined && (
        <HeadingAction>
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

function LobbyLink() {
  const t = useT()
  return <BackLink to="/">{t('room.backToLobby')}</BackLink>
}

const Main = styled.main`
  display: grid;
  gap: ${space.lg}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;

  & p {
    margin: 0;
  }

  /* The waiting room's two columns */
  &:has([data-room-columns]) {
    width: min(1120px, 100%);
  }

  /* A game needs the width its board can use, and on a phone every pixel of it */
  &:has([data-wide-room]) {
    width: min(1280px, 100%);
  }

  /* A board that fits itself to the screen (the promotion board, e3-t10) can use all of a big one */
  &:has([data-fit-screen]) {
    width: min(2200px, 100%);
  }

  @media (max-width: 899px) {
    &:has([data-wide-room]) {
      padding: ${space.md}px ${space.sm}px ${space.sm}px;
    }
  }
`

// Stuck to the top, since the room can be longer than a phone's screen. Empty, it takes up no room:
// the negative margin cancels the gap of the grid it is in.
const ConnectionStatus = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;

  &:empty {
    margin-bottom: -${space.lg}px;
  }
`

const ReconnectBanner = styled.p`
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-left: ${space.xs}px solid ${color.warning};
`

const HeadingRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.md}px;
`

const HeadingAction = styled.div`
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

// A slanted tag
const MemberCount = styled.p`
  ${clippedFill(slantClip(8), color.raised)}
  ${monoType}
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Muted = styled.p`
  color: ${color.muted};
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 44px;
  color: ${color.text};
`

const SignInInstead = styled.div`
  margin-top: ${space.sm}px;

  &:empty {
    display: none;
  }
`
