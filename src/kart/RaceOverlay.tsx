import { forwardRef, useImperativeHandle, useRef } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import { formatTime } from '../../shared/kart/timeTrial.ts'
import { Button } from '../components/Button.tsx'
import type { MessageParams } from '../i18n/t.ts'
import { displayType } from '../styles/esports.ts'
import { broadcast, digits, slam, splitShadow, ticker } from './ui/broadcast.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import type { SpikeTrial } from './spikeLoop.ts'
import { Celebration } from './ui/RaceShow.tsx'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** Writes the running times without a React render: the loop calls it every frame */
export interface RaceClockHandle {
  set(total: number, lap: number): void
}

/**
 * The time trial's own layer (e8-t10): the lap and the running times beside the minimap, the
 * 3-2-1-GO in the middle, a wrong-way warning, and the results with "race again" at the finish
 */
export const RaceClock = forwardRef<RaceClockHandle, { t: KartT; trial: SpikeTrial }>(
  function RaceClock({ t, trial }, ref) {
    const total = useRef<HTMLSpanElement>(null)
    const lap = useRef<HTMLSpanElement>(null)
    useImperativeHandle(ref, () => ({
      set(totalSeconds, lapSeconds) {
        if (total.current) total.current.textContent = formatTime(totalSeconds)
        if (lap.current) lap.current.textContent = formatTime(lapSeconds)
      },
    }))
    const best = trial.lapTimes.length > 0 ? Math.min(...trial.lapTimes) : null
    const record = trial.bestRun
    const last = trial.lapTimes.at(-1) ?? null
    return (
      <Clock data-testid="kart-race-clock">
        <LapLine data-testid="kart-lap">
          {t('kart.hud.lap', { count: trial.lap, of: trial.laps })}
        </LapLine>
        <Row>
          <Label>{t('kart.race.time')}</Label>
          <Time ref={total}>{formatTime(0)}</Time>
        </Row>
        <Row>
          <Label>{t('kart.race.thisLap')}</Label>
          <Time ref={lap}>{formatTime(0)}</Time>
        </Row>
        {last !== null && (
          <Row>
            <Label>{t('kart.race.lastLap')}</Label>
            <Time>{formatTime(last)}</Time>
          </Row>
        )}
        {best !== null && (
          <Row>
            <Label>{t('kart.race.bestLap')}</Label>
            <Time>{formatTime(best)}</Time>
          </Row>
        )}
        {record !== null && (
          <Row>
            <Label data-testid="kart-record-kart">
              {trial.recordKart
                ? t('kart.race.recordIn', {
                    kart:
                      trial.recordKart === 'unknown'
                        ? t('kart.race.unknownKart')
                        : t(`kart.body.${trial.recordKart}`),
                  })
                : t('kart.race.record')}
            </Label>
            <Time data-testid="kart-record">{formatTime(record)}</Time>
          </Row>
        )}
        {trial.kartBestRun !== null && (
          <Row>
            <Label>{t('kart.race.kartRecord')}</Label>
            <Time data-testid="kart-kart-record">{formatTime(trial.kartBestRun)}</Time>
          </Row>
        )}
      </Clock>
    )
  },
)

export function RaceCenter({
  t,
  trial,
  onRestart,
  onGarage,
}: {
  t: KartT
  trial: SpikeTrial
  onRestart: () => void
  /** 2026-11-17: opens the garage, to race again in another kart */
  onGarage?: () => void
}) {
  if (trial.phase === 'countdown') {
    return (
      <>
        <Big
          key={`countdown-${trial.countdown}`}
          role="status"
          data-testid="kart-countdown"
          data-go={trial.countdown > 0 ? undefined : true}
        >
          {trial.countdown > 0 ? String(trial.countdown) : t('kart.race.go')}
        </Big>
        {/* 2026-11-17 (the classic feel): how to launch */}
        <StartHint data-testid="kart-start-hint">{t('kart.race.startHint')}</StartHint>
      </>
    )
  }
  // 2026-11-20 (§4.43): the finish's show first, the results after it
  if (trial.phase === 'finished' && trial.total !== null && trial.celebrating) {
    return <Celebration big={t('kart.race.finish')} line={formatTime(trial.total)} />
  }
  if (trial.phase === 'finished' && trial.total !== null) {
    const best = Math.min(...trial.lapTimes)
    return (
      <Results role="dialog" aria-labelledby="kart-results-title" data-testid="kart-results">
        <Title id="kart-results-title">{t('kart.race.finished')}</Title>
        <Total>{formatTime(trial.total)}</Total>
        {(trial.newBestRun || trial.newBestLap || trial.newKartBestRun) && (
          <News role="status" data-testid="kart-new-record">
            {t(
              trial.newBestRun
                ? 'kart.race.newRecord'
                : trial.newKartBestRun
                  ? 'kart.race.newKartRecord'
                  : 'kart.race.newBestLap',
            )}
          </News>
        )}
        {trial.bestRun !== null && !trial.newBestRun && (
          <Record>{t('kart.race.recordIs', { time: formatTime(trial.bestRun) })}</Record>
        )}
        <Laps>
          {trial.lapTimes.map((time, index) => (
            <li key={index}>
              <span>{t('kart.race.lapNumber', { lap: index + 1 })}</span>
              <TimeCell $best={time === best}>
                {formatTime(time)}
                {time === best && ` · ${t('kart.race.best')}`}
              </TimeCell>
            </li>
          ))}
        </Laps>
        <Button onClick={onRestart} autoFocus>
          {t('kart.race.again')}
        </Button>
        {onGarage && (
          <Button $variant="secondary" onClick={onGarage} data-testid="kart-results-garage">
            {t('kart.race.changeKart')}
          </Button>
        )}
      </Results>
    )
  }
  if (trial.wrongWay) {
    return (
      <Warning role="alert" data-testid="kart-wrong-way">
        {t('kart.race.wrongWay')}
      </Warning>
    )
  }
  return null
}

const Clock = styled.div`
  ${broadcast}
  display: grid;
  gap: 2px;
  min-width: 132px;
  padding: ${space.xs}px ${space.sm}px;
`

// The lap on a ticker of the accent, as a broadcast's lap counter
const LapLine = styled.p`
  ${ticker(color.accent)}
  justify-self: start;
  margin: 0 0 2px;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const Row = styled.p`
  display: flex;
  justify-content: space-between;
  gap: ${space.sm}px;
  margin: 0;
`

const Label = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Time = styled.span`
  ${digits}
  font-size: ${fontSize.sm}px;
`

/** The count's height: a quarter of a wide screen's height, less on a narrow one */
const BIG = 'clamp(88px, min(24vh, 30vw), 200px)'

// 3, 2, 1, GO: as tall as a fifth of the screen, the two brand colours split either side of it,
// slammed in; GO in green
const Big = styled.p`
  position: absolute;
  top: 24%;
  left: 50%;
  margin: 0;
  translate: -50% 0;
  color: ${color.text};
  ${displayType}
  font-size: ${BIG};
  line-height: 1;
  text-shadow: ${splitShadow};
  text-transform: uppercase;
  pointer-events: none;
  ${slam(360)}

  &[data-go] {
    color: ${color.success};
  }
`

// How to launch: a lower third under the count
const StartHint = styled.p`
  ${ticker(color.surface, 12)}
  position: absolute;
  top: calc(24% + ${BIG} + ${space.md}px);
  left: 50%;
  margin: 0;
  padding: ${space.xs}px ${space.xl}px;
  translate: -50% 0;
  max-width: calc(100% - ${space.lg * 2}px);
  color: ${color.text};
  font-size: ${fontSize.md}px;
  font-weight: 600;
  text-align: center;
  pointer-events: none;

  &::before {
    box-shadow: inset 0 -2px 0 0 ${color.accent};
  }
`

const Warning = styled.p`
  position: absolute;
  top: 28%;
  left: 50%;
  margin: 0;
  padding: ${space.sm}px ${space.lg}px;
  translate: -50% 0;
  color: ${color.onAccent};
  ${ticker(color.danger, 14)}
  position: absolute;
  ${displayType}
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
  pointer-events: none;
`

const Results = styled.section`
  ${broadcast}
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  gap: ${space.md}px;
  min-width: min(320px, calc(100% - ${space.lg * 2}px));
  padding: ${space.lg}px;
  translate: -50% -50%;
`

const Title = styled.h2`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
`

const Total = styled.p`
  margin: 0;
  ${digits}
  font-size: ${fontSize.xxl}px;
`

const News = styled.p`
  margin: 0;
  color: ${color.success};
  ${displayType}
  font-size: ${fontSize.lg}px;
`

const Record = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Laps = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: flex;
    justify-content: space-between;
    gap: ${space.md}px;
    padding-bottom: 2px;
    border-bottom: 1px solid ${color.line};
  }
`

const TimeCell = styled.span<{ $best: boolean }>`
  ${digits}
  color: ${(p) => (p.$best ? color.success : color.text)};
`
