// /kart's menu for a race against the computer (owner 2026-11-17; docs/ARCHITECTURE.md §4.20): a
// panel over the track like the garage. The track, how many opponents, how good they are, items or
// not, and the laps; Start hands the settings to the page. Escape closes it.
import { useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import { MAX_LAPS } from '../../../shared/games/kart/info.ts'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { RACE_TRACK_IDS, type RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import { Button } from '../../components/Button.tsx'
import type { MessageParams } from '../../i18n/t.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { MAX_BOTS } from './roster.ts'
import { loadBotSetup, saveBotSetup, type BotSetup } from './setup.ts'
import { DIFFICULTIES, type Difficulty } from './skill.ts'

export interface BotSetupPanelProps {
  t: (key: KartMessageKey, params?: MessageParams) => string
  onStart(setup: BotSetup): void
  onClose(): void
  /** 2026-11-17: opens the Grand Prix's panel instead (src/kart/cup/, docs/ARCHITECTURE.md §4.23) */
  onGrandPrix?: () => void
}

const COUNTS = Array.from({ length: MAX_BOTS }, (_, i) => i + 1)
const LAPS = Array.from({ length: MAX_LAPS }, (_, i) => i + 1)

export function BotSetupPanel({ t, onStart, onClose, onGrandPrix }: BotSetupPanelProps) {
  const ids = useId()
  const title = useRef<HTMLHeadingElement>(null)
  const [setup, setSetup] = useState<BotSetup>(loadBotSetup)
  useEffect(() => {
    title.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const change = (next: Partial<BotSetup>) => setSetup((current) => ({ ...current, ...next }))
  const start = () => {
    saveBotSetup(setup)
    onStart(setup)
  }

  return (
    <Panel aria-labelledby={`${ids}title`} data-testid="kart-bots-setup">
      <Header>
        <Title id={`${ids}title`} ref={title} tabIndex={-1}>
          {t('kart.bots.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.bots.close')}
        </Button>
      </Header>
      {onGrandPrix && (
        <Button
          type="button"
          $variant="secondary"
          onClick={onGrandPrix}
          data-testid="kart-cup-open"
        >
          {t('kart.cup.open')}
        </Button>
      )}
      <Fields>
        <Field>
          <span>{t('kart.bots.track')}</span>
          <select
            value={setup.track}
            onChange={(event) => change({ track: event.target.value as RaceTrackId })}
            data-testid="kart-bots-track"
          >
            {RACE_TRACK_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`kart.course.${id}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <span>{t('kart.bots.count')}</span>
          <select
            value={setup.bots}
            onChange={(event) => change({ bots: Number(event.target.value) })}
            data-testid="kart-bots-count"
          >
            {COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <span>{t('kart.bots.difficulty')}</span>
          <select
            value={setup.difficulty}
            onChange={(event) => change({ difficulty: event.target.value as Difficulty })}
            data-testid="kart-bots-difficulty"
          >
            {DIFFICULTIES.map((one) => (
              <option key={one} value={one}>
                {t(`kart.bots.difficulty.${one}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <span>{t('kart.bots.mode')}</span>
          <select
            value={setup.mode}
            onChange={(event) => change({ mode: event.target.value === 'race' ? 'race' : 'items' })}
            data-testid="kart-bots-mode"
          >
            <option value="items">{t('kart.bots.mode.items')}</option>
            <option value="race">{t('kart.bots.mode.race')}</option>
          </select>
        </Field>
        <Field>
          <span>{t('kart.bots.laps')}</span>
          <select
            value={setup.laps}
            onChange={(event) => change({ laps: Number(event.target.value) })}
            data-testid="kart-bots-laps"
          >
            {LAPS.map((laps) => (
              <option key={laps} value={laps}>
                {laps}
              </option>
            ))}
          </select>
        </Field>
      </Fields>
      <Note>{t('kart.bots.note')}</Note>
      <Button type="button" onClick={start} data-testid="kart-bots-start">
        {t('kart.bots.start')}
      </Button>
    </Panel>
  )
}

const Panel = styled.section`
  position: absolute;
  top: 56px;
  right: ${space.sm}px;

  max-height: calc(100% - 56px - ${space.sm}px);
  width: min(360px, calc(100% - ${2 * space.sm}px));
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

const Fields = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

const Field = styled.label`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: ${space.sm}px;
  font-weight: 700;

  & > select {
    min-height: 32px;
    min-width: 10em;
    color: ${color.text};
    background: ${color.sunken};
    border: 1px solid ${color.border};
    font: inherit;
    font-weight: 400;
  }
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
`
