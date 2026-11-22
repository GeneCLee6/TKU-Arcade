// 2026-11-22 (owner: "the menu can set the music and sound volumes, the animations and effects";
// docs/ARCHITECTURE.md §4.73): the kart's settings in one place, in the pause menu and on /kart's
// menu. The volumes (audio/volumes.ts) are heard at once; the quality, the effects level and the
// shake are read when a race's scene is built, so they apply from the next race; the opening and the
// tips are read as the race goes. All kept in this browser, never throwing where storage is blocked.
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { Button } from '../../components/Button.tsx'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { displayType } from '../../styles/esports.ts'
import { broadcastSolid } from './broadcast.ts'
import { VolumeSliders } from '../audio/VolumeSliders.tsx'
import { loadQuality, QUALITIES, saveQuality, type Quality } from '../quality.ts'
import {
  EFFECTS_LEVELS,
  loadSettings,
  saveSettings,
  subscribeSettings,
  type RaceSettings,
} from '../settings.ts'
import { loadCoachOn, saveCoachOn } from '../school/store.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

export interface SettingsPanelProps {
  readonly t: KartT
  /** The way to the controls (keys, gamepad); none where they are set elsewhere on the page */
  readonly onControls?: () => void
  /** A quality picked here (a page that rebuilds its scene for it, /kart's time trial) */
  readonly onQuality?: (quality: Quality) => void
}

export function SettingsPanel({ t, onControls, onQuality }: SettingsPanelProps) {
  const settings = useSyncExternalStore(subscribeSettings, loadSettings)
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [coach, setCoach] = useState(loadCoachOn)
  const [unsaved, setUnsaved] = useState(false)
  const change = (patch: Partial<RaceSettings>) => {
    if (!saveSettings({ ...settings, ...patch })) setUnsaved(true)
  }
  return (
    <Panel data-testid="kart-settings">
      <VolumeSliders t={t} />
      <Group>
        <legend>{t('kart.flow.settings.graphics')}</legend>
        <Row>
          <span>{t('kart.spike.quality')}</span>
          <select
            value={quality}
            onChange={(event) => {
              const next = event.target.value as Quality
              setQuality(next)
              saveQuality(next)
              onQuality?.(next)
            }}
            data-testid="kart-settings-quality"
          >
            {QUALITIES.map((one) => (
              <option key={one} value={one}>
                {t(`kart.quality.${one}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row>
          <span>{t('kart.flow.settings.effects')}</span>
          <select
            value={settings.effects}
            onChange={(event) => change({ effects: event.target.value as RaceSettings['effects'] })}
            data-testid="kart-settings-effects"
          >
            {EFFECTS_LEVELS.map((one) => (
              <option key={one} value={one}>
                {t(`kart.quality.${one}`)}
              </option>
            ))}
          </select>
        </Row>
        <Small>{t('kart.flow.settings.effectsNote')}</Small>
        <Check>
          <input
            type="checkbox"
            checked={settings.shake}
            onChange={(event) => change({ shake: event.target.checked })}
            data-testid="kart-settings-shake"
          />
          {t('kart.flow.settings.shake')}
        </Check>
        <Small>{t('kart.flow.settings.qualityNote')}</Small>
      </Group>
      <Group>
        <legend>{t('kart.flow.settings.opening')}</legend>
        <Check>
          <input
            type="checkbox"
            checked={settings.driverIntro}
            onChange={(event) => change({ driverIntro: event.target.checked })}
            data-testid="kart-settings-driver-intro"
          />
          {t('kart.flow.settings.driverIntro')}
        </Check>
        <Check>
          <input
            type="checkbox"
            checked={settings.flyby}
            onChange={(event) => change({ flyby: event.target.checked })}
            data-testid="kart-settings-flyby"
          />
          {t('kart.flow.settings.flyby')}
        </Check>
        <Check>
          <input
            type="checkbox"
            checked={coach}
            onChange={(event) => {
              setCoach(event.target.checked)
              saveCoachOn(event.target.checked)
            }}
            data-testid="kart-settings-tips"
          />
          {t('kart.school.coach')}
        </Check>
      </Group>
      {unsaved && <Small role="status">{t('kart.sound.notSaved')}</Small>}
      {onControls && (
        <div>
          <Button type="button" $variant="secondary" $size="sm" onClick={onControls} data-testid="kart-settings-controls">
            {t('kart.flow.settings.controls')}
          </Button>
        </div>
      )}
    </Panel>
  )
}

const Panel = styled.div`
  display: grid;
  gap: ${space.md}px;
`

const Group = styled.fieldset`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    padding: 0 0 ${space.xs}px;
    font-weight: 700;
  }
`

const Row = styled.label`
  display: grid;
  grid-template-columns: 6em 1fr;
  align-items: center;
  gap: ${space.sm}px;

  select {
    min-height: 32px;
    color: ${color.text};
    background: ${color.surface};
    border: 1px solid ${color.line};
    border-radius: 4px;
    font: inherit;
  }
`

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

/** The settings on a page of their own (/kart's menu): a panel over it, closed by Done or Escape */
export function SettingsDialog({
  t,
  onClose,
  onControls,
  onQuality,
}: SettingsPanelProps & { readonly onClose: () => void }) {
  const titleId = useId()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <Dialog role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="kart-settings-dialog">
      <DialogTitle id={titleId}>{t('kart.flow.settings.title')}</DialogTitle>
      <SettingsPanel t={t} onControls={onControls} onQuality={onQuality} />
      <div>
        <Button type="button" onClick={onClose} data-testid="kart-settings-done">
          {t('kart.flow.settings.close')}
        </Button>
      </div>
    </Dialog>
  )
}

const Dialog = styled.section`
  ${broadcastSolid}
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 40;
  display: grid;
  gap: ${space.md}px;
  width: min(440px, calc(100% - ${2 * space.md}px));
  max-height: calc(100dvh - ${2 * space.md}px);
  padding: ${space.lg}px;
  overflow-y: auto;
  translate: -50% -50%;
`

const DialogTitle = styled.h2`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`
