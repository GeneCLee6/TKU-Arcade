import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LOBBY_GAMES } from '../../shared/games/lobby.ts'
import { AccountControl } from '../components/AccountControl.tsx'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { GameCard } from '../components/GameCard.tsx'
import { InstallApp } from '../components/InstallApp.tsx'
import { JoinRoomForm } from '../components/JoinRoomForm.tsx'
import { isStandalone } from '../lib/installApp.ts'
import { NicknameForm } from '../components/NicknameForm.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useToast } from '../components/useToast.ts'
import { useT } from '../i18n/useT.ts'
import { useAccount } from '../lib/account.ts'
import { readNickname } from '../lib/nickname.ts'
import { createRoom, fetchPausedGames } from '../lib/rooms.ts'
import { useNavigate } from '../lib/useRouter.ts'
import { Link } from '../lib/router.tsx'
import type { QuickBots } from '../../shared/protocol.ts'
import { clippedFill, displayType, SLANT, slantClip } from '../styles/esports.ts'
import { color, font, fontSize, space } from '../styles/tokens.ts'

// The games that are not open yet (E3): their own chunk, strings included, so they cost the first load
// only this line

// The public rooms come from the network anyway: their code arrives with them, after the first paint,
// which keeps it out of every game's first screen too (2026-11-14, with e16)
const PublicRooms = lazy(() =>
  import('../components/PublicRooms.tsx').then(({ PublicRooms }) => ({ default: PublicRooms })),
)

// 2026-11-21: "Play the computer", after the first paint too: every game's first screen shares the
// lobby's entry chunk, so the lobby's own extras stay out of it
const QuickPlay = lazy(() => import('../components/QuickPlay.tsx'))

// 2026-11-23: the hero's arena, in the cards' pictures' chunk (only a wide screen shows it)
const HeroArena = lazy(() =>
  import('../components/GameArt.tsx').then(({ HeroArena }) => ({ default: HeroArena })),
)

/** The lobby: the games, a link box and the public rooms (e1-t02, e1-t09) */
export function HomePage() {
  const t = useT()
  // Opened as the installed app: joining by number is what it is for, so that comes first
  const [app] = useState(isStandalone)
  const navigate = useNavigate()
  const toast = useToast()
  const [guestName, setNickname] = useState(readNickname)
  // Signed in (e1-t13): the account's name, fixed; the room takes it from the session anyway
  const account = useAccount()?.account ?? null
  const nickname = account?.name ?? guestName
  // The nickname dialog is open; `gameId` is the "New room" waiting for it (with `bots` for a game
  // against the computer), null for a plain change
  const [asking, setAsking] = useState<{ gameId: string | null; bots?: QuickBots } | null>(null)
  const [creating, setCreating] = useState(false)
  // Off by default: nobody's room shows up in front of strangers unless they asked for that
  const [listPublicly, setListPublicly] = useState(false)
  const inFlight = useRef<AbortController | null>(null)
  // The games the owner has paused (e12-t11): their cards say so, and New room is off
  const [paused, setPaused] = useState<readonly string[]>([])

  // Whoever left the lobby meanwhile should not be carried off to the new room
  useEffect(() => () => inFlight.current?.abort(), [])


  useEffect(() => {
    const controller = new AbortController()
    // Added to, not replaced: a refusal may have marked one meanwhile
    void fetchPausedGames(controller.signal).then((games) =>
      setPaused((known) => [...new Set([...known, ...games])]),
    )
    return () => controller.abort()
  }, [])

  const create = async (gameId: string, bots?: QuickBots) => {
    const controller = new AbortController()
    inFlight.current = controller
    setCreating(true)
    const id = await createRoom(gameId, listPublicly, controller.signal, bots)
    if (controller.signal.aborted) return
    setCreating(false)
    if (id === 'paused') {
      setPaused((games) => [...games, gameId])
      toast(t('lobby.paused'), { tone: 'danger' })
    } else if (id === 'rate_limited') toast(t('lobby.tooManyRooms'), { tone: 'danger' })
    else if (id !== null) navigate(`/r/${id}`)
    else toast(t('lobby.newRoomFailed'), { tone: 'danger' })
  }

  const handleNewRoom = (gameId: string, bots?: QuickBots) => {
    if (nickname === null) setAsking({ gameId, bots })
    else void create(gameId, bots)
  }

  const handleNickname = (name: string) => {
    setNickname(name)
    if (asking?.gameId != null) void create(asking.gameId, asking.bots)
    setAsking(null)
  }

  const profile = (
    <Link to="/me" data-testid="profile-link">
      {t('lobby.profile')}
    </Link>
  )

  return (
    <>
      <TopBar />
      <Main>
        {app && (
          <AppJoin aria-labelledby="app-join-title">
            <SectionTitle id="app-join-title">{t('lobby.join.appTitle')}</SectionTitle>
            <JoinRoomForm prominent />
          </AppJoin>
        )}
        <Hero>
          <Intro>
            <Eyebrow>
              <span>{t('home.eyebrow')}</span>
            </Eyebrow>
            <Title>{APP_NAME}</Title>
            <Tagline>{t('home.tagline')}</Tagline>
            {/* Signed in (e1-t13): the fixed name and sign-out, where a guest's nickname would be */}
            {/* e11-t06: "My profile" (achievements and stats) beside who is playing; for someone
                new it comes at the end, where it does not push the first game down on a phone */}
            {(account !== null || nickname !== null) && (
              <PlayingAs>
                {account !== null ? (
                  <>
                    <span>{t('account.playingAs', { name: account.name })}</span>
                    <AccountControl />
                  </>
                ) : (
                  <>
                    <span>{t('lobby.playingAs', { name: nickname ?? '' })}</span>
                    <Button $variant="ghost" $size="sm" onClick={() => setAsking({ gameId: null })}>
                      {t('lobby.changeNickname')}
                    </Button>
                  </>
                )}
                {profile}
              </PlayingAs>
            )}
            {!app && <JoinRoomForm />}
            <InstallApp />
          </Intro>
          <HeroArt />
        </Hero>
        {/* 2026-11-23 (QA sweep): "Play the computer" is three dozen buttons since every game with
            computer players is in it; from the keyboard, a way past them to the games (WCAG 2.4.1).
            Out of sight until it has the focus */}
        <SkipLink
          href="#lobby-games"
          onClick={(event) => {
            event.preventDefault()
            document.getElementById('lobby-games')?.focus()
          }}
        >
          {t('lobby.skipToGames')}
        </SkipLink>
        <Suspense>
          <QuickPlay disabled={creating} paused={paused} onPlay={handleNewRoom} />
        </Suspense>
        {/* The games first: on a phone a list of rooms must not push "New room" off the screen */}
        <GamesSection id="lobby-games" tabIndex={-1} aria-labelledby="lobby-games-title">
          <SectionTitle id="lobby-games-title">{t('lobby.games')}</SectionTitle>
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
            {LOBBY_GAMES.map((game, index) => (
              <li key={game.id}>
                <GameCard
                  game={game}
                  index={index}
                  disabled={creating}
                  paused={paused.includes(game.id)}
                  onNewRoom={() => handleNewRoom(game.id)}
                />
              </li>
            ))}
          </Grid>
        </GamesSection>
        <Suspense>
          <PublicRooms />
        </Suspense>
        {/* Signing in (e1-t13) is optional, so it comes last: not in the top bar, which stays one
            row on a 360 px phone, and not above the games, which must start on a phone's first
            screen. Nothing at all while sign-in is not configured */}
        {account === null && (
          <SignInRow>
            {nickname === null && profile}
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

/** The hero's picture on a wide screen: the games' arena (GameArt.tsx). Only for the eye */
function HeroArt() {
  const t = useT()
  return (
    <Art aria-hidden="true">
      <Suspense>
        <HeroArena glyph={t('home.heroGlyph')} />
      </Suspense>
    </Art>
  )
}

// So that the first game's "New room" is on a phone's first screen
const Main = styled.main`
  display: grid;
  gap: ${space.xl}px;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: ${space.lg}px ${space.lg}px ${space.xxxl}px;

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

  @media (max-width: 480px) {
    & > form {
      margin-top: ${space.xs}px;
    }
  }
`

// A slanted magenta tag
// A phone needs the height for the first game
const Eyebrow = styled.p`
  ${clippedFill(slantClip(10), color.magenta)}
  margin: 0;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.sm}px;

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

// The title says enough on a phone, whose first screen is for the first game (2026-11-23)
const Tagline = styled.p`
  margin: 0;
  max-width: 34em;
  color: ${color.muted};
  font-size: ${fontSize.lg}px;

  @media (max-width: 480px) {
    display: none;
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

// Hidden on a phone, where the games must start on the first screen
const Art = styled.div`
  width: min(100%, 400px);
  aspect-ratio: 1;
  justify-self: center;

  @media (max-width: 899px) {
    display: none;
  }
`

const SignInRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${space.md}px;

  &:empty {
    display: none;
  }
`

// A broadcast heading (2026-11-23): a slanted bar in the hue, the title, a hairline to the edge
const SkipLink = styled.a`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;

  &:focus {
    position: static;
    width: auto;
    height: auto;
    clip-path: none;
    justify-self: start;
    color: ${color.accent};
  }
`

/** The skip link's target: focused by script only, no ring of its own around the whole list */
const GamesSection = styled.section`
  &&:focus,
  &&:focus-visible {
    outline: none;
  }
`

const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  margin: 0 0 ${space.md}px;
  ${displayType}
  font-size: ${fontSize.xl}px;

  &::before,
  &::after {
    content: '';
    flex: none;
    width: ${space.sm}px;
    height: 0.9em;
    background: ${color.accent};
    transform: skewX(${SLANT});
  }

  &::after {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, ${color.accent}, transparent);
    transform: none;
  }

  @media (max-width: 480px) {
    margin-bottom: ${space.sm}px;
  }
`

const PublicChoice = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${space.sm}px;
  min-height: 44px;
  margin-bottom: ${space.md}px;
  font-weight: 700;
  cursor: pointer;

  /* A phone says who can see the room once it is ticked: the first game's New room needs the
     height (2026-11-23) */
  @media (max-width: 480px) {
    margin-bottom: ${space.sm}px;

    &:not(:has(input:checked)) small {
      display: none;
    }
  }
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

// The installed app's join box, above everything else on the page
const AppJoin = styled.section`
  display: grid;
  min-width: 0;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
`
