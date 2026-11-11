import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import type { RoomTimer } from '../lib/roomConnection.ts'
import { monoType, SLANT } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

/** Often enough for the bar to look alive and for the seconds to turn over on time */
const TICK_MS = 250

export interface CountdownProps {
  timer: RoomTimer
  /** What this is counting towards, for screen readers; a general "time left" without it */
  label?: string
}

/** One running countdown: whole seconds left and a bar. Knows nothing of what it is counting */
export function Countdown(props: CountdownProps) {
  // A new deadline starts over, so it never shows a frame against the old clock reading
  return <Running key={props.timer.deadline} {...props} />
}

function Running({ timer, label }: CountdownProps) {
  const t = useT()
  const { deadline, totalMs } = timer
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const current = performance.now()
      setNow(current)
      if (current >= deadline) clearInterval(interval)
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [deadline])

  const leftMs = Math.max(0, deadline - now)
  const fraction = totalMs > 0 ? Math.min(1, leftMs / totalMs) : 0

  // A timer's live region is off by default; said out loud so that no browser announces each tick.
  // The bar repeats the text for the eye, so a screen reader that goes looking gets only the text.
  return (
    <Wrapper role="timer" aria-live="off" aria-label={label ?? t('countdown.label')}>
      <Seconds>{t('countdown.seconds', { seconds: Math.ceil(leftMs / 1000) })}</Seconds>
      <Track aria-hidden="true">
        <Fill style={{ width: `${fraction * 100}%` }} />
      </Track>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const Seconds = styled.span`
  ${monoType}
  font-size: ${fontSize.lg}px;
  font-weight: 700;
`

const Track = styled.div`
  height: ${space.sm}px;
  overflow: hidden;
  background: ${color.raised};
  transform: skewX(${SLANT});
`

const Fill = styled.div`
  height: 100%;
  background: ${color.accent};
  box-shadow: 0 0 ${space.md}px ${color.accent};
`
