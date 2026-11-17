// /kart (e8-t14): the time trial, and from its menu a race against the computer (owner 2026-11-17;
// docs/ARCHITECTURE.md §4.19). The race is its own lazy chunk, loaded only when one starts.
import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import { SpikePage } from '../SpikePage.tsx'
import type { BotSetup } from './setup.ts'

const BotRaceView = lazy(() => import('./BotRaceView.tsx'))

export function KartPlay() {
  const t = useT()
  const [race, setRace] = useState<BotSetup | null>(null)
  if (!race) return <SpikePage play onBotRace={setRace} />
  return (
    <Suspense fallback={<Loading role="status">{t('kart.bots.loading')}</Loading>}>
      <BotRaceView setup={race} onMenu={() => setRace(null)} />
    </Suspense>
  )
}

const Loading = styled.p`
  margin: 0;
  padding: ${space.lg}px;
`
