// e10-t05: /kart's garage, a panel over the track like the tuning panel: the kart and driver to race
// with, and the kart's stats. Escape closes it.
import { useEffect, useId, useRef } from 'react'
import styled from 'styled-components'
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import { Button } from '../../components/Button.tsx'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { RosterPicker, type RosterT } from './RosterPicker.tsx'

export interface GaragePanelProps {
  t: RosterT
  kart: KartId
  driver: DriverId
  onKart(kart: KartId): void
  onDriver(driver: DriverId): void
  onClose(): void
}

export function GaragePanel({ t, kart, driver, onKart, onDriver, onClose }: GaragePanelProps) {
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
      <RosterPicker t={t} kart={kart} driver={driver} onKart={onKart} onDriver={onDriver} />
    </Panel>
  )
}

const Panel = styled.section`
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
  border: 1px solid ${color.border};
  border-radius: ${radius.card}px;
  background: ${color.surface};
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
  margin: 0;
  font-size: ${fontSize.md}px;
`
