import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import type { KartTuning } from '../../shared/kart/physics.ts'
import {
  parseTuning,
  presetOf,
  PRESET_IDS,
  PRESETS,
  serializeTuning,
  shownValue,
  steadySlips,
  storedValue,
  TUNING_GROUPS,
  TUNING_KEYS,
  TUNING_SPECS,
  type PresetId,
  type TuningKey,
} from '../../shared/kart/tuning.ts'
import { Button } from '../components/Button.tsx'
import type { MessageParams } from '../i18n/t.ts'
import { color, font, fontSize, radius, space } from '../styles/tokens.ts'
import { NARROW_PANEL_TOP, NARROW_TOP } from './layout.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

interface TuningPanelProps {
  readonly t: KartT
  readonly tuning: KartTuning
  /** Returns false when the browser would not store it */
  readonly onTuning: (tuning: KartTuning) => boolean
  readonly onClose: () => void
}

const CUSTOM = 'custom'

/** Enough decimals to show a slider's step */
const decimalsOf = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))

/** A number as the panel shows it, with its unit: "30 m/s", "40°", "45%" */
function formatValue(t: KartT, key: TuningKey, value: number): string {
  const { unit, step } = TUNING_SPECS[key]
  if (unit === 'share') return t('kart.unit.share', { value: Math.round(value * 100) })
  const shown = shownValue(key, value).toFixed(decimalsOf(step))
  return t(`kart.unit.${unit}`, { value: shown })
}

/**
 * e8-t03: every number in KART_TUNING on a slider, three presets, and the numbers as JSON to share.
 * Changes apply at once; the car can be driven with the panel open (sliders keep their own keys).
 */
export const TuningPanel = memo(function TuningPanel({
  t,
  tuning,
  onTuning,
  onClose,
}: TuningPanelProps) {
  const ids = useId()
  const title = useRef<HTMLHeadingElement>(null)
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const preset = presetOf(tuning)
  const slips = useMemo(() => steadySlips(tuning), [tuning])

  useEffect(() => title.current?.focus(), [])

  // Escape closes the panel, from anywhere in it or on the page
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const change = (next: KartTuning, message: string) => {
    const saved = onTuning(next)
    setStatus(saved ? message : `${message} ${t('kart.controls.notSaved')}`)
  }

  const choosePreset = (id: PresetId) =>
    change(PRESETS[id], t('kart.tuning.presetChosen', { name: t(`kart.preset.${id}`) }))

  const setValue = (key: TuningKey, shown: number) => {
    const saved = onTuning({ ...tuning, [key]: storedValue(key, shown) })
    // A slider says its own value; only a failure to keep it is worth a word
    setStatus(saved ? '' : t('kart.controls.notSaved'))
  }

  const exportJson = () => {
    const json = serializeTuning(tuning)
    setText(json)
    const done = (copied: boolean) =>
      setStatus(t(copied ? 'kart.tuning.copied' : 'kart.tuning.exported'))
    try {
      navigator.clipboard.writeText(json).then(
        () => done(true),
        () => done(false),
      )
    } catch {
      done(false)
    }
  }

  const importJson = () => {
    const parsed = parseTuning(text, tuning)
    if (!parsed.ok) {
      const { error } = parsed
      if (error.reason === 'badValue') {
        const spec = TUNING_SPECS[error.key]
        setStatus(
          t('kart.tuning.badValue', {
            name: t(`kart.param.${error.key}`),
            min: spec.min,
            max: spec.max,
          }),
        )
      } else {
        setStatus(t(error.reason === 'notJson' ? 'kart.tuning.notJson' : 'kart.tuning.notTuning'))
      }
      return
    }
    let message = t('kart.tuning.imported')
    if (parsed.missing.length > 0) {
      const names = parsed.missing.map((key) => t(`kart.param.${key}`)).join(', ')
      message = `${message} ${t('kart.tuning.importedMissing', { names })}`
    }
    if (parsed.ignored.length > 0) {
      message = `${message} ${t('kart.tuning.importedIgnored', { names: parsed.ignored.slice(0, 5).join(', ') })}`
    }
    change(parsed.tuning, message)
  }

  return (
    <Panel aria-labelledby={`${ids}title`} data-testid="kart-tuning">
      <Header>
        <Title id={`${ids}title`} ref={title} tabIndex={-1}>
          {t('kart.tuning.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.controls.close')}
        </Button>
      </Header>
      <Muted>{t('kart.tuning.intro')}</Muted>
      <PresetRow>
        <label htmlFor={`${ids}preset`}>{t('kart.tuning.preset')}</label>
        <Select
          id={`${ids}preset`}
          data-testid="kart-preset"
          value={preset ?? CUSTOM}
          onChange={(event) => {
            if (event.target.value !== CUSTOM) choosePreset(event.target.value as PresetId)
          }}
        >
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`kart.preset.${id}`)}
            </option>
          ))}
          {!preset && (
            <option value={CUSTOM} disabled>
              {t('kart.tuning.custom')}
            </option>
          )}
        </Select>
      </PresetRow>
      <Muted data-testid="kart-slips">{t('kart.tuning.slips', slips)}</Muted>
      <Status role="status" data-testid="kart-tuning-status">
        {status}
      </Status>
      {TUNING_GROUPS.map((group) => (
        <Group key={group}>
          <legend>{t(`kart.tuning.group.${group}`)}</legend>
          {TUNING_KEYS.filter((key) => TUNING_SPECS[key].group === group).map((key) => {
            const spec = TUNING_SPECS[key]
            const id = `${ids}${key}`
            const shown = formatValue(t, key, tuning[key])
            return (
              <Slider key={key}>
                <label htmlFor={id}>{t(`kart.param.${key}`)}</label>
                <output htmlFor={id}>{shown}</output>
                <input
                  id={id}
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={shownValue(key, tuning[key])}
                  aria-valuetext={shown}
                  data-testid={`tune-${key}`}
                  onChange={(event) => setValue(key, Number(event.target.value))}
                />
              </Slider>
            )
          })}
        </Group>
      ))}
      <Group>
        <legend>{t('kart.tuning.share')}</legend>
        <label htmlFor={`${ids}json`}>{t('kart.tuning.json')}</label>
        <TextBox
          id={`${ids}json`}
          data-testid="kart-tuning-json"
          value={text}
          spellCheck={false}
          rows={6}
          onChange={(event) => setText(event.target.value)}
        />
        <Buttons>
          <Button type="button" $variant="secondary" $size="sm" onClick={exportJson}>
            {t('kart.tuning.export')}
          </Button>
          <Button type="button" $variant="secondary" $size="sm" onClick={importJson}>
            {t('kart.tuning.import')}
          </Button>
          <Button
            type="button"
            $variant="secondary"
            $size="sm"
            onClick={() => choosePreset('standard')}
          >
            {t('kart.tuning.reset')}
          </Button>
        </Buttons>
      </Group>
    </Panel>
  )
})

const Panel = styled.section`
  position: absolute;
  top: 56px;
  right: ${space.sm}px;

  @media ${NARROW_TOP} {
    top: ${NARROW_PANEL_TOP}px;
  }
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
  font-size: ${fontSize.lg}px;
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

const PresetRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
`

const Select = styled.select`
  min-height: 32px;
  padding: 0 ${space.sm}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  background: ${color.sunken};
  color: ${color.text};
  font: inherit;
`

const Status = styled.p`
  margin: 0;
  min-height: 1.5em;
`

const Group = styled.fieldset`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: ${space.sm}px ${space.md}px ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  min-width: 0;

  legend {
    font-weight: bold;
  }
`

const Slider = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 ${space.sm}px;

  output {
    font-variant-numeric: tabular-nums;
  }

  input {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
    accent-color: ${color.accent};
  }
`

const TextBox = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  padding: ${space.sm}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  background: ${color.sunken};
  color: ${color.text};
  font-family: ${font.mono};
  font-size: 12px;
  resize: vertical;
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`
