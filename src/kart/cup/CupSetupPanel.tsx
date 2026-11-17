// /kart's menu for the Grand Prix (owner 2026-11-17; docs/ARCHITECTURE.md §4.23): a panel over the
// track like the race against the computer's. The cup (its tracks listed, and the best result in it),
// how many opponents, how good they are, items or not, and the laps; Start draws the opponents and
// hands the new cup to the page. A cup under way can be continued or abandoned from here. Escape
// closes it.
import { useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import { MAX_LAPS } from '../../../shared/games/kart/info.ts'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { Button } from '../../components/Button.tsx'
import type { MessageParams } from '../../i18n/t.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { MAX_BOTS } from '../bots/roster.ts'
import { DIFFICULTIES, type Difficulty } from '../bots/skill.ts'
import {
  currentTrack,
  raceCount,
  resumeCup,
  startCup,
  type CupRun,
  type CupSetup,
} from './cupRun.ts'
import { cupOf, pickableCups, type CupId } from './cups.ts'
import {
  clearCupRun,
  loadCupBest,
  loadCupRun,
  loadCupSetup,
  saveCupRun,
  saveCupSetup,
} from './store.ts'

export interface CupSetupPanelProps {
  t: (key: KartMessageKey, params?: MessageParams) => string
  onCup(run: CupRun): void
  onClose(): void
}

const COUNTS = Array.from({ length: MAX_BOTS }, (_, i) => i + 1)
const LAPS = Array.from({ length: MAX_LAPS }, (_, i) => i + 1)

export function CupSetupPanel({ t, onCup, onClose }: CupSetupPanelProps) {
  const ids = useId()
  const title = useRef<HTMLHeadingElement>(null)
  // The hidden test cup shows only for the tests' autopilot
  const [testing] = useState(() => new URLSearchParams(window.location.search).has('autopilot'))
  const cups = pickableCups(testing)
  const [setup, setSetup] = useState<CupSetup>(() => {
    const stored = loadCupSetup()
    return cups.some((cup) => cup.id === stored.cup) ? stored : { ...stored, cup: cups[0]!.id }
  })
  const [underway, setUnderway] = useState<CupRun | null>(loadCupRun)
  const [abandoning, setAbandoning] = useState(false)
  useEffect(() => {
    title.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const change = (next: Partial<CupSetup>) => setSetup((current) => ({ ...current, ...next }))
  const start = () => {
    saveCupSetup(setup)
    const run = startCup(setup, Math.floor(Math.random() * 2 ** 31))
    saveCupRun(run)
    onCup(run)
  }
  const carryOn = () => {
    if (!underway) return
    const run = resumeCup(underway)
    saveCupRun(run)
    onCup(run)
  }
  const abandon = () => {
    clearCupRun()
    setUnderway(null)
    setAbandoning(false)
  }

  const cupName = (id: CupId) => t(`kart.cup.name.${id}`)
  const best = loadCupBest(setup.cup)
  const next = underway ? currentTrack(underway) : null

  return (
    <Panel aria-labelledby={`${ids}title`} data-testid="kart-cup-setup">
      <Header>
        <Title id={`${ids}title`} ref={title} tabIndex={-1}>
          {t('kart.cup.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.cup.close')}
        </Button>
      </Header>
      {underway && (
        <Underway>
          <Button type="button" onClick={carryOn} data-testid="kart-cup-continue">
            {next
              ? t('kart.cup.continue', {
                  cup: cupName(underway.setup.cup),
                  race: underway.results.length + 1,
                  races: raceCount(underway),
                })
              : t('kart.cup.continuePodium', { cup: cupName(underway.setup.cup) })}
          </Button>
          {abandoning ? (
            <Confirm role="group" aria-label={t('kart.cup.abandon')}>
              <span>{t('kart.cup.abandonSure')}</span>
              <Button
                type="button"
                $variant="secondary"
                $size="sm"
                onClick={abandon}
                data-testid="kart-cup-abandon-yes"
              >
                {t('kart.cup.abandonYes')}
              </Button>
              <Button type="button" $size="sm" onClick={() => setAbandoning(false)}>
                {t('kart.cup.abandonNo')}
              </Button>
            </Confirm>
          ) : (
            <Button
              type="button"
              $variant="secondary"
              $size="sm"
              onClick={() => setAbandoning(true)}
              data-testid="kart-cup-abandon"
            >
              {t('kart.cup.abandon')}
            </Button>
          )}
        </Underway>
      )}
      <Fields>
        <Field>
          <span>{t('kart.cup.cup')}</span>
          <select
            value={setup.cup}
            onChange={(event) => change({ cup: event.target.value as CupId })}
            data-testid="kart-cup-cup"
          >
            {cups.map((cup) => (
              <option key={cup.id} value={cup.id}>
                {cupName(cup.id)}
              </option>
            ))}
          </select>
        </Field>
        <Tracks aria-label={t('kart.cup.tracksOf', { cup: cupName(setup.cup) })}>
          {cupOf(setup.cup).tracks.map((track, index) => (
            <li key={`${track}-${index}`}>{t(`kart.course.${track}`)}</li>
          ))}
        </Tracks>
        <Muted data-testid="kart-cup-best">
          {best
            ? t('kart.cup.best', { place: best.place, points: best.points })
            : t('kart.cup.noBest')}
        </Muted>
        <Field>
          <span>{t('kart.bots.count')}</span>
          <select
            value={setup.bots}
            onChange={(event) => change({ bots: Number(event.target.value) })}
            data-testid="kart-cup-count"
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
            data-testid="kart-cup-difficulty"
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
            data-testid="kart-cup-mode"
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
            data-testid="kart-cup-laps"
          >
            {LAPS.map((laps) => (
              <option key={laps} value={laps}>
                {laps}
              </option>
            ))}
          </select>
        </Field>
      </Fields>
      <Muted>{t('kart.cup.pointsNote')}</Muted>
      {underway && <Muted>{t('kart.cup.replaces')}</Muted>}
      <Button type="button" onClick={start} data-testid="kart-cup-start">
        {t('kart.cup.start')}
      </Button>
    </Panel>
  )
}

const Panel = styled.section`
  position: absolute;
  top: 56px;
  right: ${space.sm}px;

  max-height: calc(100% - 56px - ${space.sm}px);
  width: min(380px, calc(100% - ${2 * space.sm}px));
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

const Underway = styled.div`
  display: grid;
  gap: ${space.sm}px;
  padding-bottom: ${space.md}px;
  border-bottom: 1px solid ${color.border};
`

const Confirm = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
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

const Tracks = styled.ol`
  margin: 0;
  padding-left: ${space.xl}px;
  color: ${color.muted};
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`
