// 2026-11-22 (docs/NETWORK.md): what the room page says while its socket is coming back. Nothing for
// the first second (most drops are back by then: a flash of "reconnecting" every time would look
// worse than it is); then a bar that stays out of the way, at the top; a way to try at once after a
// few seconds; and a short "back" once it is, which goes by itself.
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { color, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

/** Reconnecting for less than this shows nothing */
export const BANNER_DELAY_MS = 1_000
/** After this long the bar offers to try at once */
export const TRY_NOW_AFTER_MS = 6_000
/** "Back" shows this long, then goes */
export const BACK_SHOWN_MS = 2_500

export interface ConnectionBannerProps {
  reconnecting: boolean
  onTryNow(): void
}

export function ConnectionBanner({ reconnecting, onTryNow }: ConnectionBannerProps) {
  const t = useT()
  // 0: nothing; 1: the bar; 2: the bar with its button
  const [stage, setStage] = useState(0)
  const [back, setBack] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (!reconnecting) return
    const timers = [
      setTimeout(() => {
        shown.current = true
        setBack(false)
        setStage(1)
      }, BANNER_DELAY_MS),
      setTimeout(() => setStage(2), TRY_NOW_AFTER_MS),
    ]
    return () => {
      for (const timer of timers) clearTimeout(timer)
      setStage(0)
      // Only someone who saw it go is told it is back
      if (shown.current) {
        shown.current = false
        setBack(true)
      }
    }
  }, [reconnecting])

  useEffect(() => {
    if (!back) return
    const timer = setTimeout(() => setBack(false), BACK_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [back])

  if (stage > 0) {
    return (
      <Bar $tone="warning" data-testid="reconnect-banner">
        <span>{t('room.reconnecting')}</span>
        {stage === 2 && (
          <Button $size="sm" $variant="secondary" onClick={onTryNow}>
            {t('room.reconnecting.now')}
          </Button>
        )}
      </Bar>
    )
  }
  if (back) {
    return (
      <Bar $tone="success" data-testid="reconnected-banner">
        <span>{t('room.reconnected')}</span>
      </Bar>
    )
  }
  return null
}

const Bar = styled.div<{ $tone: 'warning' | 'success' }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.xs}px ${space.md}px;
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-left: ${space.xs}px solid ${(p) => (p.$tone === 'warning' ? color.warning : color.success)};
`
