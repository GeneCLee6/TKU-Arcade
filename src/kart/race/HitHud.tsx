// 2026-11-17: what the HUD shows while this racer is stunned by a shot: the screen's edges flash and
// a banner says so, both for as long as the stun lasts. The kart itself spins in the scene (hitFx.ts).
import { memo } from 'react'
import styled, { keyframes } from 'styled-components'
import type { Translate } from '../../i18n/t.ts'
import { displayType } from '../../styles/esports.ts'
import { broadcast } from '../ui/broadcast.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'

export interface StunHudProps {
  t: Translate
  /** How long the stun lasts, ms */
  ms: number
}

/** Mounted with a new `key` for each hit */
export const StunHud = memo(function StunHud({ t, ms }: StunHudProps) {
  return (
    <>
      <Edges aria-hidden="true" style={{ animationDuration: `${ms}ms` }} />
      <Banner role="status" data-testid="kart-stunned" style={{ animationDuration: `${ms}ms` }}>
        {t('games.kart.item.stunned')}
      </Banner>
    </>
  )
})

const fade = keyframes`
  0% { opacity: 1; }
  70% { opacity: 0.8; }
  100% { opacity: 0; }
`

const wobble = keyframes`
  0% { opacity: 0; transform: translateX(-50%) scale(1.3) rotate(-4deg); }
  12% { opacity: 1; transform: translateX(-50%) scale(1) rotate(3deg); }
  30% { transform: translateX(-50%) rotate(-2deg); }
  50% { transform: translateX(-50%) rotate(1deg); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) rotate(0deg); }
`

const Edges = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 90px 24px color-mix(in srgb, ${color.danger} 55%, transparent);
  animation: ${fade} ease-out forwards;
`

const Banner = styled.p`
  ${broadcast}
  ${displayType}
  position: absolute;
  top: 22%;
  left: 50%;
  margin: 0;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.danger};
  font-size: ${fontSize.xl}px;
  pointer-events: none;
  animation: ${wobble} ease-out forwards;

  @media (prefers-reduced-motion: reduce) {
    animation-name: ${fade};
  }
`
