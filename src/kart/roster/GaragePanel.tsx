// e10-t05: /kart's garage, a panel over the track like the tuning panel: the kart and driver to race
// with, and the kart's stats. Escape closes it.
import { lazy, Suspense, useEffect, useId, useRef } from 'react'
import styled from 'styled-components'
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import { Button } from '../../components/Button.tsx'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { broadcastSolid } from '../ui/broadcast.ts'
import { RosterPicker, type RosterT } from './RosterPicker.tsx'

// 2026-11-21 (docs/ARCHITECTURE.md §4.52): three.js comes when the garage opens, not with /kart's menu
const KartPreview = lazy(() => import('./KartPreview.tsx'))

export interface GaragePanelProps {
  t: RosterT
  kart: KartId
  driver: DriverId
  onKart(kart: KartId): void
  onDriver(driver: DriverId): void
  onClose(): void
  /** The track on /kart (2026-11-21): its quickest vehicles are recommended */
  track?: string
}

export function GaragePanel({ t, kart, driver, onKart, onDriver, onClose, track }: GaragePanelProps) {
  const ids = useId()
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    title.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <Panel aria-labelledby={`${ids}title`} data-testid="kart-garage">
      <Header>
        <Title id={`${ids}title`} ref={title} tabIndex={-1}>
          {t('kart.roster.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.roster.close')}
        </Button>
      </Header>
      <RosterPicker
        t={t}
        kart={kart}
        driver={driver}
        onKart={onKart}
        onDriver={onDriver}
        track={track}
        preview={
          <Suspense fallback={null}>
            <KartPreview
              kart={kart}
              driver={driver}
              label={t('kart.roster.preview', { kart: t(`kart.body.${kart}`) })}
              hint={t('kart.roster.previewHint')}
              morphLabel={t('kart.roster.morph')}
            />
          </Suspense>
        }
      />
    </Panel>
  )
}

const Panel = styled.section`
  ${broadcastSolid}
  position: absolute;
  top: 56px;
  right: ${space.sm}px;

  bottom: ${space.sm}px;
  width: min(420px, calc(100% - ${2 * space.sm}px));
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: ${space.md}px;
  padding: ${space.md}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${space.sm}px;
`

const Title = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`
