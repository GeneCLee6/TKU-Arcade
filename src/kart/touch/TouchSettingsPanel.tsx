import { memo, useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import {
  MAX_OPACITY,
  MAX_SCALE,
  MIN_OPACITY,
  MIN_SCALE,
  type SteerStyle,
  type TouchSettings,
} from '../../../shared/kart/touch.ts'
import { Button } from '../../components/Button.tsx'
import type { MessageParams } from '../../i18n/t.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

interface TouchSettingsPanelProps {
  readonly t: KartT
  readonly settings: TouchSettings
  /** False when the browser would not keep it */
  readonly onSettings: (next: TouchSettings) => boolean
  readonly onClose: () => void
}

const STEER_STYLES: readonly SteerStyle[] = ['buttons', 'slider']

/** The touch buttons' settings, and how to drive with them (2026-11-17) */
export const TouchSettingsPanel = memo(function TouchSettingsPanel({
  t,
  settings,
  onSettings,
  onClose,
}: TouchSettingsPanelProps) {
  const titleId = useId()
  const title = useRef<HTMLHeadingElement>(null)
  const [unsaved, setUnsaved] = useState(false)
  useEffect(() => title.current?.focus(), [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const change = (patch: Partial<TouchSettings>) => {
    if (!onSettings({ ...settings, ...patch })) setUnsaved(true)
  }

  return (
    <Panel role="dialog" aria-labelledby={titleId} data-testid="kart-touch-panel">
      <Header>
        <Title id={titleId} ref={title} tabIndex={-1}>
          {t('kart.touch.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.touch.close')}
        </Button>
      </Header>
      <Fields>
        <legend>{t('kart.touch.steerStyle')}</legend>
        {STEER_STYLES.map((style) => (
          <label key={style}>
            <input
              type="radio"
              name={`${titleId}-steer`}
              checked={settings.steer === style}
              onChange={() => change({ steer: style })}
              data-testid={`kart-touch-steer-${style}`}
            />
            {t(style === 'buttons' ? 'kart.touch.steerButtons' : 'kart.touch.steerSlider')}
          </label>
        ))}
      </Fields>
      <Check>
        <input
          type="checkbox"
          checked={settings.autoThrottle}
          onChange={(event) => change({ autoThrottle: event.target.checked })}
          data-testid="kart-touch-auto"
        />
        <span>
          {t('kart.touch.autoThrottle')}
          <Note>{t('kart.touch.autoThrottleNote')}</Note>
        </span>
      </Check>
      <Range>
        <span>{t('kart.touch.size')}</span>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.1}
          value={settings.scale}
          onChange={(event) => change({ scale: Number(event.target.value) })}
          data-testid="kart-touch-size"
        />
        <output>{t('kart.touch.percent', { value: Math.round(settings.scale * 100) })}</output>
      </Range>
      <Range>
        <span>{t('kart.touch.opacity')}</span>
        <input
          type="range"
          min={MIN_OPACITY}
          max={MAX_OPACITY}
          step={0.1}
          value={settings.opacity}
          onChange={(event) => change({ opacity: Number(event.target.value) })}
          data-testid="kart-touch-opacity"
        />
        <output>{t('kart.touch.percent', { value: Math.round(settings.opacity * 100) })}</output>
      </Range>
      <Check>
        <input
          type="checkbox"
          checked={settings.leftHanded}
          onChange={(event) => change({ leftHanded: event.target.checked })}
          data-testid="kart-touch-lefty"
        />
        <span>{t('kart.touch.leftHanded')}</span>
      </Check>
      <Check>
        <input
          type="checkbox"
          checked={settings.vibrate}
          onChange={(event) => change({ vibrate: event.target.checked })}
          data-testid="kart-touch-vibrate"
        />
        <span>{t('kart.touch.vibrate')}</span>
      </Check>
      {unsaved && <Note role="status">{t('kart.touch.notSaved')}</Note>}
      <Help>
        <HelpTitle>{t('kart.touch.howTo')}</HelpTitle>
        <p>{t('kart.touch.help')}</p>
      </Help>
    </Panel>
  )
})

// Above the page's top row (z-index 1), which it opens under on a short screen
const Panel = styled.section`
  position: absolute;
  z-index: 2;
  top: ${space.sm}px;
  left: 50%;
  translate: -50% 0;
  width: min(440px, calc(100% - ${2 * space.sm}px));
  max-height: calc(100% - ${2 * space.sm}px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: ${space.md}px;
  padding: ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.card}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  pointer-events: auto;
  touch-action: pan-y;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${space.sm}px;
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Fields = styled.fieldset`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.md}px;
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;

  label {
    display: flex;
    align-items: center;
    gap: ${space.sm}px;
    min-height: 44px;
  }
`

const Check = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${space.sm}px;
  min-height: 44px;

  input {
    margin-top: 3px;
  }
`

const Range = styled.label`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 4ch;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;

  output {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }
`

const Note = styled.span`
  display: block;
  margin: 0;
  color: ${color.muted};
`

const Help = styled.div`
  p {
    margin: ${space.xs}px 0 0;
    color: ${color.muted};
  }
`

const HelpTitle = styled.h3`
  margin: 0;
  font-size: ${fontSize.sm}px;
`
