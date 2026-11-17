// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.20) or a Grand Prix (§4.22). Each is its own lazy chunk, loaded only when
// one starts. A Grand Prix under way (and not left for the menu) opens again on a reload.
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

type Playing = { kind: 'bots'; setup: BotSetup } | { kind: 'cup'; run: CupRun } | null

function resumed(): Playing {
  const run = loadCupRun()
  if (!run || run.away) return null
  const next = resumeCup(run)
  saveCupRun(next)
  return { kind: 'cup', run: next }
}

export function KartPlay() {
  const t = useT()
  const [playing, setPlaying] = useState<Playing>(resumed)
  if (!playing) {
    return (
      <SpikePage
        play
        onBotRace={(setup) => setPlaying({ kind: 'bots', setup })}
        onCup={(run) => setPlaying({ kind: 'cup', run })}
      />
    )
  }
  return (
    <Suspense fallback={<Loading role="status">{t('kart.bots.loading')}</Loading>}>
      {playing.kind === 'bots' ? (
        <BotRaceView setup={playing.setup} onMenu={() => setPlaying(null)} />
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
