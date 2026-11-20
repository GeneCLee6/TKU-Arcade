// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.20) or a Grand Prix (§4.24). Each is its own lazy chunk, loaded only when
// one starts. A Grand Prix under way (and not left for the menu) opens again on a reload. 2026-11-20
// (§4.50): and the driving school.
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

type Playing =
  | { kind: 'bots'; setup: BotSetup }
  | { kind: 'cup'; run: CupRun }
  | { kind: 'school' }
  | null

function resumed(): Playing {
  // /kart?school (or ?school=<lesson>) opens the driving school
  if (new URLSearchParams(window.location.search).has('school')) return { kind: 'school' }
  const run = loadCupRun()
  if (!run || run.away) return null
  const next = resumeCup(run)
  saveCupRun(next)
  return { kind: 'cup', run: next }
}

export function KartPlay() {
  const t = useT()
  const [playing, setPlaying] = useState<Playing>(resumed)
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
  if (!playing) {
    return (
      <SpikePage
        play
        onBotRace={(setup) => setPlaying({ kind: 'bots', setup })}
        onCup={(run) => setPlaying({ kind: 'cup', run })}
        onSchool={openSchool}
      />
    )
  }
  return (
    <Suspense fallback={<Loading role="status">
          {t(playing.kind === 'school' ? 'kart.school.loading' : 'kart.bots.loading')}
        </Loading>}>
      {playing.kind === 'bots' ? (
        <BotRaceView setup={playing.setup} onMenu={() => setPlaying(null)} />
      ) : playing.kind === 'school' ? (
        <SchoolView onExit={leaveSchool} />
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
