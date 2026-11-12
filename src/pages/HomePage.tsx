import { useEffect, useRef, useState } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LOBBY_GAMES } from '../../shared/games/catalog.ts'
import { AccountControl } from '../components/AccountControl.tsx'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { GameCard } from '../components/GameCard.tsx'
import { JoinRoomForm } from '../components/JoinRoomForm.tsx'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { PublicRooms } from '../components/PublicRooms.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useToast } from '../components/useToast.ts'
import { useT } from '../i18n/useT.ts'
import { useAccount } from '../lib/account.ts'
import { readNickname } from '../lib/nickname.ts'
import { createRoom } from '../lib/rooms.ts'
import { useNavigate } from '../lib/useRouter.ts'
import { clippedFill, displayType, slantClip } from '../styles/esports.ts'
import { color, font, fontSize, space } from '../styles/tokens.ts'

/** The lobby: the games, a link box and the public rooms (e1-t02, e1-t09) */
export function HomePage() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const [guestName, setNickname] = useState(readNickname)
  // Signed in (e1-t13): the account's name, fixed; the room takes it from the session anyway
  const account = useAccount()?.account ?? null
  const nickname = account?.name ?? guestName
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
        <Hero>
          <Intro>
            <Eyebrow>
              <span>{t('home.eyebrow')}</span>
            </Eyebrow>
            <Title>{APP_NAME}</Title>
            <Tagline>{t('home.tagline')}</Tagline>
            {/* Signed in (e1-t13): the fixed name and sign-out, where a guest's nickname would be */}
            {account !== null ? (
              <PlayingAs>
                <span>{t('account.playingAs', { name: account.name })}</span>
                <AccountControl />
              </PlayingAs>
            ) : (
              nickname !== null && (
                <PlayingAs>
                  <span>{t('lobby.playingAs', { name: nickname })}</span>
                  <Button $variant="ghost" $size="sm" onClick={() => setAsking({ gameId: null })}>
                    {t('lobby.changeNickname')}
                  </Button>
                </PlayingAs>
              )
            )}
            <JoinRoomForm />
          </Intro>
          <HeroArt />
        </Hero>
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
        {/* Signing in (e1-t13) is optional, so it comes last: not in the top bar, which stays one
            row on a 360 px phone, and not above the games, which must start on a phone's first
            screen. Nothing at all while sign-in is not configured */}
        {account === null && (
          <SignInRow>
            <AccountControl />
          </SignInRow>
        )}
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

/** The hero's picture: tiles in the games' and the site's colours. Only for the eye */
function HeroArt() {
  const t = useT()
  return (
    <Art aria-hidden="true">
      <Tile $at="a">{t('games.promotion.glyph.de')}</Tile>
      <Tile $at="b" />
      <Tile $at="c" />
      <Tile $at="d" />
    </Art>
  )
}

const Main = styled.main`
  display: grid;
  gap: ${space.xl}px;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: ${space.lg}px ${space.lg}px ${space.xxxl}px;

  /* So that the first game's "New room" is on a phone's first screen */
  @media (max-width: 480px) {
    gap: ${space.lg}px;
    padding-top: ${space.md}px;
  }
`

const Hero = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: ${space.xl}px;

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    padding: ${space.xl}px 0;
  }
`

const Intro = styled.div`
  display: grid;
  justify-items: start;
  gap: ${space.sm}px;

  & > form {
    justify-self: stretch;
    max-width: 560px;
    margin-top: ${space.md}px;
  }
`

// A slanted magenta tag
const Eyebrow = styled.p`
  ${clippedFill(slantClip(10), color.magenta)}
  margin: 0;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.sm}px;

  /* A phone needs the height for the first game */
  @media (max-width: 480px) {
    display: none;
  }
`

const Title = styled.h1`
  margin: 0;
  font-family: ${font.display};
  font-size: clamp(${fontSize.xxl}px, 8vw, 96px);
  font-style: italic;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
  text-shadow: 0 0 ${space.xxl}px color-mix(in srgb, ${color.brand} 45%, transparent);
`

const Tagline = styled.p`
  margin: 0;
  max-width: 34em;
  color: ${color.muted};
  font-size: ${fontSize.lg}px;

  @media (max-width: 480px) {
    font-size: ${fontSize.md}px;
  }
`

const PlayingAs = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  margin: 0;
  overflow-wrap: anywhere;
`

const float = keyframes`
  50% {
    translate: 0 -${space.sm}px;
  }
`

// Hidden on a phone, where the games must start on the first screen
const Art = styled.div`
  position: relative;
  min-height: 320px;

  @media (max-width: 899px) {
    display: none;
  }
`

const tiles = {
  a: css`
    left: 8%;
    top: 6%;
    width: 140px;
    height: 140px;
    background: ${color.gamePromotion};
    color: ${color.onAccent};
    font-family: ${font.displayZh};
    font-size: 80px;
    font-weight: 900;
    rotate: -10deg;
    clip-path: ${slantClip(18)};
  `,
  b: css`
    right: 6%;
    top: 0;
    width: 110px;
    height: 150px;
    background: linear-gradient(160deg, ${color.brand}, transparent 120%);
    rotate: 9deg;
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
    animation-delay: -2s;
  `,
  c: css`
    left: 30%;
    bottom: 4%;
    width: 220px;
    height: 110px;
    background: linear-gradient(120deg, ${color.brand}, ${color.magenta});
    clip-path: ${slantClip(28)};
    animation-delay: -4s;
  `,
  d: css`
    right: 12%;
    bottom: 18%;
    width: 72px;
    height: 72px;
    background: ${color.magenta};
    rotate: 45deg;
    animation-delay: -3s;
  `,
}

const Tile = styled.span<{ $at: keyof typeof tiles }>`
  position: absolute;
  display: grid;
  place-items: center;
  line-height: 1;
  animation: ${float} 6s ease-in-out infinite;
  ${(p) => tiles[p.$at]}
`

const SignInRow = styled.div`
  display: flex;
  justify-content: center;

  &:empty {
    display: none;
  }
`

const SectionTitle = styled.h2`
  margin: 0 0 ${space.md}px;
  ${displayType}
  font-size: ${fontSize.xl}px;
`

const PublicChoice = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${space.sm}px;
  min-height: 44px;
  margin-bottom: ${space.md}px;
  font-weight: 700;
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

// 280px columns: three at most on a desktop, one on a phone
const Grid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: ${space.lg}px;
  margin: 0;
  padding: 0;
  list-style: none;
`
