// 2026-11-21 (docs/ARCHITECTURE.md §4.52): the loading screen before a race, as a broadcast's "up
// next" card (ui/broadcast.ts): the track's name, a tip for a technique, and a bar of how much of the
// race (kartLoad.ts) is here. When the network lets it down: a way to try again, and to reload.
// It covers whatever it is put in (the race's stage), so that nothing half-built shows.
import { useState } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { KART_LOAD_MESSAGES } from '../../../shared/kart/i18n.load.ts'
import type { Bindings } from '../../../shared/kart/input.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { TIPS } from '../school/coach.ts'
import { controlLabels, useInputDevice } from '../school/controls.ts'
import { KeyText } from '../school/KeyText.tsx'
import { broadcastSolid, digits, ticker } from '../ui/broadcast.ts'
import type { LoadProgress } from './kartLoad.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

registerMessages(KART_LOAD_MESSAGES)

export interface KartLoadingProps {
  t: KartT
  /** The track's name; null for none (the test yard) */
  track: string | null
  progress: LoadProgress
  failed: boolean
  onRetry: () => void
  /** A race to drive (not one to watch): a tip, in this player's keys */
  bindings?: Bindings
  touch?: boolean
  /** A line under the bar: in a room, how many are on the grid already */
  note?: string | null
}

export function KartLoading({
  t,
  track,
  progress,
  failed,
  onRetry,
  bindings,
  touch = false,
  note,
}: KartLoadingProps) {
  const percent = Math.floor((100 * progress.done) / Math.max(1, progress.total))
  // One tip a loading screen, picked when it shows
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]!)
  return (
    <Cover data-testid="kart-loading" data-failed={failed || undefined} data-percent={percent}>
      <Card>
        <Eyebrow>{t('kart.load.next')}</Eyebrow>
        {track && <Track>{track}</Track>}
        {bindings && <Tip t={t} tip={tip} bindings={bindings} touch={touch} />}
        {failed ? (
          <Failed role="alert">
            <p>{t('kart.load.failed')}</p>
            <Actions>
              <Button onClick={onRetry} data-testid="kart-loading-retry">
                {t('kart.load.retry')}
              </Button>
              <Button $variant="secondary" onClick={() => window.location.reload()}>
                {t('kart.load.reload')}
              </Button>
            </Actions>
          </Failed>
        ) : (
          <>
            <Bar
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t('kart.load.progress', { percent })}
            >
              <Fill style={{ transform: `scaleX(${percent / 100})` }} />
            </Bar>
            <Percent role="status">{t('kart.load.progress', { percent })}</Percent>
          </>
        )}
        {note && <Percent data-testid="kart-loading-note">{note}</Percent>}
      </Card>
    </Cover>
  )
}

function Tip({
  t,
  tip,
  bindings,
  touch,
}: {
  t: KartT
  tip: (typeof TIPS)[number]
  bindings: Bindings
  touch: boolean
}) {
  const device = useInputDevice(touch)
  return (
    <TipLine data-tip={tip}>
      <TipTag>{t('kart.school.tip')}</TipTag>
      <span>
        <KeyText t={t} id={`kart.school.tip.${tip}`} labels={controlLabels(device, bindings, t)} />
      </span>
    </TipLine>
  )
}

const Cover = styled.div`
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: ${space.lg}px;
  background: ${color.bg};
`

const Card = styled.section`
  ${broadcastSolid}
  display: grid;
  gap: ${space.md}px;
  width: min(520px, 100%);
  padding: ${space.xl}px;
`

const Eyebrow = styled.span`
  ${ticker(color.accent)}
  justify-self: start;
  padding: 2px ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const Track = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xxl}px;
  line-height: 1.1;
`

const TipLine = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.sm}px;
  margin: 0;
  color: ${color.muted};
`

const TipTag = styled.span`
  ${ticker(color.sunken)}
  padding: 0 ${space.sm}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Bar = styled.div`
  height: 8px;
  overflow: hidden;
  background: ${color.sunken};
`

const Fill = styled.div`
  height: 100%;
  background: ${color.accent};
  transform-origin: left;
  transition: transform 200ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Percent = styled.p`
  ${digits}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Failed = styled.div`
  display: grid;
  gap: ${space.md}px;

  p {
    margin: 0;
    color: ${color.danger};
  }
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`
