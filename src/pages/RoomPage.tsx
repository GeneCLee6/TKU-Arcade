import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { isRoomId } from '../../shared/room-id.ts'
import { Button } from '../components/Button.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { RoomInPlay } from '../components/RoomInPlay.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { WaitingRoom } from '../components/WaitingRoom.tsx'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { readNickname } from '../lib/nickname.ts'
import { fetchRoomSummary, type RoomLookup } from '../lib/rooms.ts'
import { useRoom } from '../lib/useRoom.ts'
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
  return (
    <>
      <RoomHeading
        title={gameTitle(t, view.room.gameId)}
        members={Object.keys(view.members).length}
      />
      {view.room.status === 'waiting' ? (
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
      ) : (
        <RoomInPlay
          view={view}
          you={you}
          timers={room.timers}
          onKick={room.kick}
          onTransfer={room.transfer}
          onDissolve={room.dissolve}
          onReopen={room.reopen}
          onRematch={room.rematch}
        />
      )}
      <LobbyLink />
    </>
  )
}

function RoomHeading({ title, members }: { title: string; members: number }) {
  const t = useT()
  return (
    <div>
      <Title>{title}</Title>
      <Muted>{t('room.memberCount', { count: members })}</Muted>
    </div>
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
