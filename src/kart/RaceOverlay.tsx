import { forwardRef, useImperativeHandle, useRef } from 'react'
import styled, { keyframes } from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import { formatTime } from '../../shared/kart/timeTrial.ts'
import { Button } from '../components/Button.tsx'
import type { MessageParams } from '../i18n/t.ts'
import { displayType, glass, monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import type { SpikeTrial } from './spikeLoop.ts'

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
            <Label>{t('kart.race.record')}</Label>
            <Time data-testid="kart-record">{formatTime(record)}</Time>
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
}: {
  t: KartT
  trial: SpikeTrial
  onRestart: () => void
}) {
  if (trial.phase === 'countdown') {
    return (
      <Big key={`countdown-${trial.countdown}`} role="status" data-testid="kart-countdown">
        {trial.countdown > 0 ? String(trial.countdown) : t('kart.race.go')}
      </Big>
    )
  }
  if (trial.phase === 'finished' && trial.total !== null) {
    const best = Math.min(...trial.lapTimes)
    return (
      <Results role="dialog" aria-labelledby="kart-results-title" data-testid="kart-results">
        <Title id="kart-results-title">{t('kart.race.finished')}</Title>
        <Total>{formatTime(trial.total)}</Total>
        {(trial.newBestRun || trial.newBestLap) && (
          <News role="status" data-testid="kart-new-record">
            {t(trial.newBestRun ? 'kart.race.newRecord' : 'kart.race.newBestLap')}
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
  ${glass}
  display: grid;
  gap: 2px;
  min-width: 132px;
  padding: ${space.xs}px ${space.sm}px;
`

const LapLine = styled.p`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.lg}px;
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
  ${monoType}
  font-size: ${fontSize.sm}px;
`

const pop = keyframes`
  from {
    opacity: 0;
    transform: scale(1.6);
  }
`

const Big = styled.p`
  position: absolute;
  top: 30%;
  left: 50%;
  margin: 0;
  translate: -50% 0;
  color: ${color.text};
  ${displayType}
  font-size: 96px;
  text-shadow: 0 0 24px ${color.accent};
  animation: ${pop} 300ms ease-out;
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
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
  background: ${color.danger};
  ${displayType}
  font-size: ${fontSize.xl}px;
  pointer-events: none;
`

const Results = styled.section`
  ${glass}
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
`

const Total = styled.p`
  margin: 0;
  ${monoType}
  font-size: ${fontSize.xxl}px;
  font-weight: 700;
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
  }
`

const TimeCell = styled.span<{ $best: boolean }>`
  ${monoType}
  color: ${(p) => (p.$best ? color.success : color.text)};
`
