// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.20) or a Grand Prix (§4.24). Each is its own lazy chunk, loaded only when
// one starts. A Grand Prix under way (and not left for the menu) opens again on a reload. 2026-11-20
// (§4.50): and the driving school; 2026-11-21 (§4.59): and the challenges.
import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import { SpikePage } from '../SpikePage.tsx'
import { resumeCup, type CupRun } from '../cup/cupRun.ts'
import { loadCupRun, saveCupRun } from '../cup/store.ts'
import type { BotSetup } from './setup.ts'

const BotRaceView = lazy(() => import('./BotRaceView.tsx'))
const CupView = lazy(() => import('../cup/CupView.tsx'))
// 2026-11-20 (§4.50): the driving school, its own chunk too
const SchoolView = lazy(() => import('../school/SchoolView.tsx'))
// 2026-11-21 (§4.59): the challenge mode, its own chunk as well
const ChallengeView = lazy(() => import('../challenge/ChallengeView.tsx'))

type Playing =
  | { kind: 'bots'; setup: BotSetup }
  | { kind: 'cup'; run: CupRun }
  | { kind: 'school' }
  | { kind: 'challenge' }
  | null

function resumed(): Playing {
  // /kart?school (or ?school=<lesson>) opens the driving school
  if (new URLSearchParams(window.location.search).has('school')) return { kind: 'school' }
  // /kart?challenge (or ?challenge=<mission>) opens the challenge mode
  if (new URLSearchParams(window.location.search).has('challenge')) return { kind: 'challenge' }
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
  if (!playing) {
    return (
      <SpikePage
        play
        openBots={openBots}
        onBotRace={(setup) => setPlaying({ kind: 'bots', setup })}
        onCup={(run) => setPlaying({ kind: 'cup', run })}
        onSchool={openSchool}
        onChallenge={openChallenge}
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
                : 'kart.bots.loading',
          )}
        </Loading>}>
      {playing.kind === 'bots' ? (
        <BotRaceView setup={playing.setup} onMenu={() => setPlaying(null)} />
      ) : playing.kind === 'school' ? (
        <SchoolView onExit={leaveSchool} />
      ) : playing.kind === 'challenge' ? (
        <ChallengeView onExit={leaveChallenge} />
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
