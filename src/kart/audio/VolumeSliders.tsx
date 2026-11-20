// 2026-11-20 (§4.46): the music's and the effects' volumes, two sliders for the kart's settings
// panels (the controls panel, the touch panel). Kept in this browser (volumes.ts); heard at once.
import { useState, useSyncExternalStore } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { fontSize, space } from '../../styles/tokens.ts'
import { loadVolumes, saveVolumes, subscribeVolumes, type KartVolumes } from './volumes.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

export function VolumeSliders({ t }: { readonly t: KartT }) {
  const volumes = useSyncExternalStore(subscribeVolumes, loadVolumes)
  const [unsaved, setUnsaved] = useState(false)
  const change = (patch: Partial<KartVolumes>) => {
    if (!saveVolumes({ ...volumes, ...patch })) setUnsaved(true)
  }
  return (
    <Group data-testid="kart-volumes">
      <legend>{t('kart.sound.title')}</legend>
      <Row>
        <span>{t('kart.sound.music')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volumes.music}
          onChange={(event) => change({ music: Number(event.target.value) })}
          aria-label={t('kart.sound.music')}
          data-testid="kart-volume-music"
        />
        <Value aria-hidden="true">{t('kart.sound.percent', { value: Math.round(volumes.music * 100) })}</Value>
      </Row>
      <Row>
        <span>{t('kart.sound.effects')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volumes.effects}
          onChange={(event) => change({ effects: Number(event.target.value) })}
          aria-label={t('kart.sound.effects')}
          data-testid="kart-volume-effects"
        />
        <Value aria-hidden="true">{t('kart.sound.percent', { value: Math.round(volumes.effects * 100) })}</Value>
      </Row>
      <Note>{t(unsaved ? 'kart.sound.notSaved' : 'kart.sound.note')}</Note>
    </Group>
  )
}

const Group = styled.fieldset`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: ${space.sm}px 0 0;
  border: 0;

  legend {
    padding: 0;
    font-weight: 700;
  }
`

const Row = styled.label`
  display: grid;
  grid-template-columns: 6em 1fr 3.5em;
  align-items: center;
  gap: ${space.sm}px;
`

const Value = styled.span`
  text-align: right;
  font-variant-numeric: tabular-nums;
`

const Note = styled.p`
  margin: 0;
  font-size: ${fontSize.sm}px;
  opacity: 0.8;
`
