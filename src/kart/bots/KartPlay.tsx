// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.20) or a Grand Prix (§4.24). Each is its own lazy chunk, loaded only when
// one starts. A Grand Prix under way (and not left for the menu) opens again on a reload. 2026-11-20
// (§4.50): and the driving school; 2026-11-21 (§4.60): and the challenges; 2026-11-23 (§4.81): and
// the leaderboard, whose rows' ghosts the time trial races; 2026-11-23 (§4.83): and the online races.
import { lazy, Suspense, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import { SpikePage } from '../SpikePage.tsx'
import { resumeCup, type CupRun } from '../cup/cupRun.ts'
import { loadCupRun, saveCupRun } from '../cup/store.ts'
import type { BotSetup } from './setup.ts'
import type { BoardChase } from '../board/chase.ts'
import { useKartAudioUnlock } from '../audio/unlock.ts'

const BotRaceView = lazy(() => import('./BotRaceView.tsx'))
const CupView = lazy(() => import('../cup/CupView.tsx'))
// 2026-11-20 (§4.50): the driving school, its own chunk too
const SchoolView = lazy(() => import('../school/SchoolView.tsx'))
// 2026-11-21 (§4.60): the challenge mode, its own chunk as well
const ChallengeView = lazy(() => import('../challenge/ChallengeView.tsx'))
// 2026-11-23 (§4.81): the leaderboard, its own chunk
const BoardView = lazy(() => import('../board/BoardView.tsx'))
// 2026-11-23 (§4.83): the online races (the race rooms, quick join), its own chunk
const OnlineView = lazy(() => import('../online/OnlineView.tsx'))

type Playing =
  | { kind: 'bots'; setup: BotSetup }
  | { kind: 'cup'; run: CupRun }
  | { kind: 'school' }
  | { kind: 'challenge' }
  | { kind: 'board' }
  | { kind: 'online' }
  | null

function resumed(): Playing {
  // /kart?school (or ?school=<lesson>) opens the driving school
  if (new URLSearchParams(window.location.search).has('school')) return { kind: 'school' }
  // /kart?challenge (or ?challenge=<mission>) opens the challenge mode
  if (new URLSearchParams(window.location.search).has('challenge')) return { kind: 'challenge' }
  // /kart?board (or ?board=<track>) opens the leaderboard
  if (new URLSearchParams(window.location.search).has('board')) return { kind: 'board' }
  // /kart?online opens the online races
  if (new URLSearchParams(window.location.search).has('online')) return { kind: 'online' }
  const run = loadCupRun()
  if (!run || run.away) return null
  const next = resumeCup(run)
  saveCupRun(next)
  return { kind: 'cup', run: next }
}

/**
 * /kart?bots (2026-11-21, the lobby's "Play the computer"): the menu opens on the race against the
 * computer's settings. Read once and taken off the address, so that closing the panel and reloading
 * comes back to the plain menu. 2026-11-23 (QA sweep): only read during render; the address is
 * changed once the page is on screen. A first render that suspends (a lazy chunk still coming) is
 * thrown away and run again, state initialisers too: taking `bots` off in the initialiser lost it
 * for that second run, and the panel now and then did not open
 */
function useBotsAsked(): boolean {
  const [asked] = useState(() => new URL(window.location.href).searchParams.has('bots'))
  useEffect(() => {
    if (!asked) return
    const url = new URL(window.location.href)
    url.searchParams.delete('bots')
    window.history.replaceState(null, '', url)
  }, [asked])
  return asked
}

export function KartPlay() {
  const t = useT()
  // 2026-11-23 (audio/unlock.ts): every click on /kart's menus wakes the kart's sound, so that a race
  // started from them has it from its first frame
  useKartAudioUnlock()
  const [playing, setPlaying] = useState<Playing>(resumed)
  const openBots = useBotsAsked()
  // The school is in the address, so that a reload stays in it
  const openSchool = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('school', '')
    window.history.replaceState(null, '', url)
    setPlaying({ kind: 'school' })
  }
  const leaveSchool = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('school')
    window.history.replaceState(null, '', url)
    setPlaying(null)
  }
  // The challenge mode is in the address too
  const openChallenge = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('challenge', '')
    window.history.replaceState(null, '', url)
    setPlaying({ kind: 'challenge' })
  }
  const leaveChallenge = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('challenge')
    window.history.replaceState(null, '', url)
    setPlaying(null)
  }
  // The leaderboard is in the address too, with the track it shows
  const [chase, setChase] = useState<BoardChase | null>(null)
  const openBoard = (track?: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('board', track ?? '')
    window.history.replaceState(null, '', url)
    setPlaying({ kind: 'board' })
  }
  /** Back to the time trial, on `track` when given, with a board row's ghost when given */
  const leaveBoard = (track?: string, ghost: BoardChase | null = null) => {
    const url = new URL(window.location.href)
    url.searchParams.delete('board')
    if (track) url.searchParams.set('track', track)
    window.history.replaceState(null, '', url)
    setChase(ghost)
    setPlaying(null)
  }
  // The online races are in the address too
  const openOnline = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('online', '')
    window.history.replaceState(null, '', url)
    setPlaying({ kind: 'online' })
  }
  const leaveOnline = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('online')
    window.history.replaceState(null, '', url)
    setPlaying(null)
  }
  if (!playing) {
    return (
      <SpikePage
        play
        openBots={openBots}
        onBotRace={(setup) => setPlaying({ kind: 'bots', setup })}
        onCup={(run) => setPlaying({ kind: 'cup', run })}
        onSchool={openSchool}
        onChallenge={openChallenge}
        onBoard={openBoard}
        onOnline={openOnline}
        chase={chase}
        onStopChase={() => setChase(null)}
      />
    )
  }
  return (
    <Suspense fallback={<Loading role="status">
          {t(
            playing.kind === 'school'
              ? 'kart.school.loading'
              : playing.kind === 'challenge'
                ? 'kart.challenge.loading'
                : playing.kind === 'board'
                  ? 'kart.board.opening'
                  : playing.kind === 'online'
                    ? 'kart.online.opening'
                    : 'kart.bots.loading',
          )}
        </Loading>}>
      {playing.kind === 'bots' ? (
        <BotRaceView setup={playing.setup} onMenu={() => setPlaying(null)} />
      ) : playing.kind === 'school' ? (
        <SchoolView onExit={leaveSchool} />
      ) : playing.kind === 'challenge' ? (
        <ChallengeView onExit={leaveChallenge} />
      ) : playing.kind === 'online' ? (
        <OnlineView onExit={leaveOnline} />
      ) : playing.kind === 'board' ? (
        <BoardView
          onExit={() => leaveBoard()}
          onDrive={(track) => leaveBoard(track)}
          onChase={(one) => leaveBoard(one.track, one)}
        />
      ) : (
        <CupView run={playing.run} onMenu={() => setPlaying(null)} />
      )}
    </Suspense>
  )
}

const Loading = styled.p`
  margin: 0;
  padding: ${space.lg}px;
`
