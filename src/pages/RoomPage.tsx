import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { getGame } from '../../shared/games/index.ts'
import { isRoomId } from '../../shared/room-id.ts'
import { Button } from '../components/Button.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import type { Translate } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { joinRoom, type JoinEnd, type JoinedRoom } from '../lib/joinRoom.ts'
import { readNickname } from '../lib/nickname.ts'
import { fetchRoomSummary, type RoomLookup } from '../lib/rooms.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

// Room entry, deliberately small: B2 replaces it with useRoom() and the real waiting room. The key
// gives each room its own state when the address changes without leaving this page.
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

type Session =
  | { phase: 'joining' }
  | { phase: 'joined'; joined: JoinedRoom }
  | { phase: 'ended'; end: JoinEnd }

function RoomSession({ id, name, title, members }: RoomSessionProps) {
  const t = useT()
  const [session, setSession] = useState<Session>({ phase: 'joining' })
  const [attempt, setAttempt] = useState(0)

  useEffect(
    () =>
      joinRoom(id, name, {
        onWelcome: (joined) => setSession({ phase: 'joined', joined }),
        onEnd: (end) => setSession({ phase: 'ended', end }),
      }),
    [id, name, attempt],
  )

  const retry = () => {
    setSession({ phase: 'joining' })
    setAttempt((count) => count + 1)
  }

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

  // The summary was read before this person joined, so only `welcome` has the right count
  const { joined } = session
  return (
    <>
      <RoomHeading title={title} members={joined.members} />
      <Lines role="status">
        <p>{t('room.joinedAs', { name: joined.name })}</p>
        <p>
          {joined.seat === null ? t('room.spectating') : t('room.seated', { seat: joined.seat + 1 })}
        </p>
      </Lines>
      <LobbyLink />
    </>
  )
}

// A room from a newer deployment can have a game this page does not know
function gameTitle(t: Translate, gameId: string): string {
  const game = getGame(gameId)
  return game ? t(`${game.meta.i18nKey}.name`) : t('room.genericTitle')
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

const Lines = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const BackLink = styled(Link)`
  justify-self: start;
  color: ${color.text};
`
