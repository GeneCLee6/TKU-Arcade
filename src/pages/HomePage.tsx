import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LOBBY_GAMES } from '../../shared/games/index.ts'
import { Dialog } from '../components/Dialog.tsx'
import { GameCard } from '../components/GameCard.tsx'
import { JoinRoomForm } from '../components/JoinRoomForm.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useToast } from '../components/useToast.ts'
import { useT } from '../i18n/useT.ts'
import { readNickname } from '../lib/nickname.ts'
import { createRoom } from '../lib/rooms.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

/** The lobby (e1-t02); the list of public rooms comes with e1-t09 */
export function HomePage() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  // The game whose "New room" is waiting for a nickname
  const [asking, setAsking] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  // Whoever left the lobby meanwhile should not be carried off to the new room
  useEffect(() => () => inFlight.current?.abort(), [])

  const create = async (gameId: string) => {
    const controller = new AbortController()
    inFlight.current = controller
    setCreating(true)
    const id = await createRoom(gameId, controller.signal)
    if (controller.signal.aborted) return
    setCreating(false)
    if (id !== null) navigate(`/r/${id}`)
    else toast(t('lobby.newRoomFailed'), { tone: 'danger' })
  }

  const handleNewRoom = (gameId: string) => {
    if (readNickname() === null) setAsking(gameId)
    else void create(gameId)
  }

  const handleNickname = () => {
    if (asking !== null) void create(asking)
    setAsking(null)
  }

  return (
    <>
      <TopBar />
      <Main>
        <Intro>
          <Title>{APP_NAME}</Title>
          <Tagline>{t('home.tagline')}</Tagline>
        </Intro>
        <JoinRoomForm />
        <section>
          <SectionTitle>{t('lobby.games')}</SectionTitle>
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
`

const Intro = styled.div`
  text-align: center;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xxl}px;
`

const Tagline = styled.p`
  margin: ${space.xs}px 0 0;
  color: ${color.muted};
`

const SectionTitle = styled.h2`
  margin: 0 0 ${space.md}px;
  font-size: ${fontSize.lg}px;
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
