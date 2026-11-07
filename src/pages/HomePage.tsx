import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LOBBY_GAMES } from '../../shared/games/catalog.ts'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { GameCard } from '../components/GameCard.tsx'
import { JoinRoomForm } from '../components/JoinRoomForm.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { PublicRooms } from '../components/PublicRooms.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useToast } from '../components/useToast.ts'
import { useT } from '../i18n/useT.ts'
import { readNickname } from '../lib/nickname.ts'
import { createRoom } from '../lib/rooms.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

/** The lobby: the games, a link box and the public rooms (e1-t02, e1-t09) */
export function HomePage() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const [nickname, setNickname] = useState(readNickname)
  // The nickname dialog is open; `gameId` is the "New room" waiting for it, null for a plain change
  const [asking, setAsking] = useState<{ gameId: string | null } | null>(null)
  const [creating, setCreating] = useState(false)
  // Off by default: nobody's room shows up in front of strangers unless they asked for that
  const [listPublicly, setListPublicly] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  // Whoever left the lobby meanwhile should not be carried off to the new room
  useEffect(() => () => inFlight.current?.abort(), [])

  const create = async (gameId: string) => {
    const controller = new AbortController()
    inFlight.current = controller
    setCreating(true)
    const id = await createRoom(gameId, listPublicly, controller.signal)
    if (controller.signal.aborted) return
    setCreating(false)
    if (id !== null) navigate(`/r/${id}`)
    else toast(t('lobby.newRoomFailed'), { tone: 'danger' })
  }

  const handleNewRoom = (gameId: string) => {
    if (nickname === null) setAsking({ gameId })
    else void create(gameId)
  }

  const handleNickname = (name: string) => {
    setNickname(name)
    if (asking?.gameId != null) void create(asking.gameId)
    setAsking(null)
  }

  return (
    <>
      <TopBar />
      <Main>
        <Intro>
          <Title>{APP_NAME}</Title>
          <Tagline>{t('home.tagline')}</Tagline>
          {nickname !== null && (
            <PlayingAs>
              <span>{t('lobby.playingAs', { name: nickname })}</span>
              <Button $variant="ghost" onClick={() => setAsking({ gameId: null })}>
                {t('lobby.changeNickname')}
              </Button>
            </PlayingAs>
          )}
        </Intro>
        <JoinRoomForm />
        {/* The games first: on a phone a list of rooms must not push "New room" off the screen */}
        <section>
          <SectionTitle>{t('lobby.games')}</SectionTitle>
          <PublicChoice>
            <PublicCheck
              type="checkbox"
              checked={listPublicly}
              onChange={(event) => setListPublicly(event.target.checked)}
            />
            <span>
              {t('lobby.publicRooms.choice')}
              <PublicHint>{t('lobby.publicRooms.choiceHint')}</PublicHint>
            </span>
          </PublicChoice>
          <Grid>
            {LOBBY_GAMES.map((game) => (
              <li key={game.id}>
                <GameCard
                  game={game}
                  disabled={creating}
                  onNewRoom={() => handleNewRoom(game.id)}
                />
              </li>
            ))}
          </Grid>
        </section>
        <PublicRooms />
      </Main>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t('nickname.dialogTitle')}
      >
        <NicknameForm onSubmit={handleNickname} />
      </Dialog>
    </>
  )
}

const Main = styled.main`
  display: grid;
  gap: ${space.xl}px;
  width: min(960px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px ${space.xxxl}px;

  /* So that the first game's "New room" is on a phone's first screen */
  @media (max-width: 480px) {
    gap: ${space.lg}px;
    padding-top: ${space.md}px;
  }
`

const Intro = styled.div`
  text-align: center;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xxl}px;

  @media (max-width: 480px) {
    font-size: ${fontSize.xl}px;
  }
`

const Tagline = styled.p`
  margin: ${space.xs}px 0 0;
  color: ${color.muted};
`

const PlayingAs = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: ${space.xs}px;
  margin: ${space.sm}px 0 0;
  overflow-wrap: anywhere;
`

const SectionTitle = styled.h2`
  margin: 0 0 ${space.md}px;
  font-size: ${fontSize.lg}px;
`

const PublicChoice = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${space.sm}px;
  min-height: 44px;
  margin-bottom: ${space.md}px;
  font-weight: 600;
  cursor: pointer;
`

const PublicCheck = styled.input`
  flex: none;
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
  accent-color: ${color.accent};
`

const PublicHint = styled.small`
  display: block;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 400;
`

// 280px columns in at most 960px: three at most on a desktop, one on a phone
const Grid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: ${space.lg}px;
  margin: 0;
  padding: 0;
  list-style: none;
`
