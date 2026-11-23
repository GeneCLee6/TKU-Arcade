// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.20) or a Grand Prix (§4.24). Each is its own lazy chunk, loaded only when
// one starts. A Grand Prix under way (and not left for the menu) opens again on a reload. 2026-11-20
// (§4.50): and the driving school; 2026-11-21 (§4.60): and the challenges; 2026-11-23 (§4.81): and
// the leaderboard, whose rows' ghosts the time trial races.
import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import { SpikePage } from '../SpikePage.tsx'
import { resumeCup, type CupRun } from '../cup/cupRun.ts'
import { loadCupRun, saveCupRun } from '../cup/store.ts'
import type { BotSetup } from './setup.ts'
import type { BoardChase } from '../board/chase.ts'

const BotRaceView = lazy(() => import('./BotRaceView.tsx'))
const CupView = lazy(() => import('../cup/CupView.tsx'))
// 2026-11-20 (§4.50): the driving school, its own chunk too
const SchoolView = lazy(() => import('../school/SchoolView.tsx'))
// 2026-11-21 (§4.60): the challenge mode, its own chunk as well
const ChallengeView = lazy(() => import('../challenge/ChallengeView.tsx'))
// 2026-11-23 (§4.81): the leaderboard, its own chunk
const BoardView = lazy(() => import('../board/BoardView.tsx'))

type Playing =
  | { kind: 'bots'; setup: BotSetup }
  | { kind: 'cup'; run: CupRun }
  | { kind: 'school' }
  | { kind: 'challenge' }
  | { kind: 'board' }
  | null

function resumed(): Playing {
  // /kart?school (or ?school=<lesson>) opens the driving school
  if (new URLSearchParams(window.location.search).has('school')) return { kind: 'school' }
  // /kart?challenge (or ?challenge=<mission>) opens the challenge mode
  if (new URLSearchParams(window.location.search).has('challenge')) return { kind: 'challenge' }
  // /kart?board (or ?board=<track>) opens the leaderboard
  if (new URLSearchParams(window.location.search).has('board')) return { kind: 'board' }
  const run = loadCupRun()
  if (!run || run.away) return null
  const next = resumeCup(run)
  saveCupRun(next)
  return { kind: 'cup', run: next }
}

/**
 * /kart?bots (2026-11-21, the lobby's "Play the computer"): the menu opens on the race against the
 * computer's settings. Read once and taken off the address, so that closing the panel and reloading
 * comes back to the plain menu
 */
function botsAsked(): boolean {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('bots')) return false
  url.searchParams.delete('bots')
  window.history.replaceState(null, '', url)
  return true
}

export function KartPlay() {
  const t = useT()
  const [playing, setPlaying] = useState<Playing>(resumed)
  const [openBots] = useState(botsAsked)
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
                  : 'kart.bots.loading',
          )}
        </Loading>}>
      {playing.kind === 'bots' ? (
        <BotRaceView setup={playing.setup} onMenu={() => setPlaying(null)} />
      ) : playing.kind === 'school' ? (
        <SchoolView onExit={leaveSchool} />
      ) : playing.kind === 'challenge' ? (
        <ChallengeView onExit={leaveChallenge} />
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
