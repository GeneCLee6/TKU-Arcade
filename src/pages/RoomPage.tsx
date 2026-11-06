import { createElement, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { isRoomId } from '../../shared/room-id.ts'
import { Button } from '../components/Button.tsx'
import { GameLayout, RoomChatPanel, type RoomParts } from '../components/GameLayout.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { WaitingRoom } from '../components/WaitingRoom.tsx'
import { gameScreen } from '../games/screens.ts'
import { useT } from '../i18n/useT.ts'
import { ChatDraft } from '../lib/chatState.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { readNickname } from '../lib/nickname.ts'
import { fetchRoomSummary, type RoomLookup } from '../lib/rooms.ts'
import { useRoom } from '../lib/useRoom.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'

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
  const [name, setName] = useState(readNickname)

  useEffect(() => {
    const controller = new AbortController()
    void fetchRoomSummary(id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setLookup(result)
    })
    return () => controller.abort()
  }, [id, attempt])

  if (lookup === null) return <p role="status">{t('common.loading')}</p>
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
        <RoomHeading title={title} members={lookup.summary.members} />
        <NicknameForm onSubmit={setName} />
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
  const Screen = gameScreen(view.room.gameId)
  return (
    <>
      {/* Always in the page: screen readers only announce changes in a region they already know */}
      <ConnectionStatus aria-live="polite">
        {session.reconnecting && <ReconnectBanner>{t('room.reconnecting')}</ReconnectBanner>}
      </ConnectionStatus>
      <RoomHeading
        title={gameTitle(t, view.room.gameId)}
        members={Object.keys(view.members).length}
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
          />
          <RoomChatPanel room={parts} />
        </>
      ) : view.game && Screen ? (
        // While its code loads the room is already all there, chat included
        <Suspense
          fallback={
            <GameLayout room={parts}>
              <p role="status">{t('common.loading')}</p>
            </GameLayout>
          }
        >
          {createElement(Screen, { room: parts, game: view.game })}
        </Suspense>
      ) : (
        <GameLayout room={parts} />
      )}
      <LobbyLink />
    </>
  )
}

function RoomHeading({ title, members }: { title: string; members: number }) {
  const t = useT()
  return (
    <HeadingRow>
      <Title>{title}</Title>
      <Muted>{t('room.memberCount', { count: members })}</Muted>
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

  /* A game needs the width its board can use, and on a phone every pixel of it */
  &:has([data-wide-room]) {
    width: min(1280px, 100%);
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
  border-radius: ${radius.component}px;
`

const HeadingRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: ${space.md}px;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const Muted = styled.p`
  color: ${color.muted};
`

const BackLink = styled(Link)`
  justify-self: start;
  color: ${color.text};
`
