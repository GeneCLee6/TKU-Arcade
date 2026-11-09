import { memo } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import { GAUGE_FULL } from '../../shared/kart/physics.ts'
import type { MessageParams } from '../i18n/t.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import type { SpikeHud } from './spikeLoop.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

interface HudProps {
  readonly t: KartT
  readonly hud: SpikeHud
  readonly maxStored: number
}

/** The boost gauge, the boosts ready to fire and whether one is running. Deliberately plain. */
export const Hud = memo(function Hud({ t, hud, maxStored }: HudProps) {
  return (
    <Box data-testid="kart-hud">
      <Row>
        <span>{t('kart.hud.gauge')}</span>
        <Track
          role="meter"
          aria-label={t('kart.hud.gauge')}
          aria-valuemin={0}
          aria-valuemax={GAUGE_FULL}
          aria-valuenow={hud.gauge}
          data-testid="kart-gauge"
        >
          <Fill $boosting={hud.boosting} style={{ width: `${(hud.gauge / GAUGE_FULL) * 100}%` }} />
        </Track>
      </Row>
      <Row>
        <span data-testid="kart-stored">
          {t('kart.hud.stored', { count: hud.storedBoosts, max: maxStored })}
        </span>
        {hud.boosting && (
          <Badge data-testid="kart-boosting">
            {hud.chain > 0 ? t('kart.hud.chain', { count: hud.chain }) : t('kart.hud.boosting')}
          </Badge>
        )}
      </Row>
    </Box>
  )
})

const Box = styled.div`
  display: grid;
  gap: ${space.xs}px;
  justify-self: end;
  width: min(280px, 100%);
  padding: ${space.sm}px ${space.md}px;
  border-radius: ${radius.component}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 24px;
`

const Track = styled.div`
  flex: 1;
  height: 12px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  overflow: hidden;
`

const Fill = styled.div<{ $boosting: boolean }>`
  height: 100%;
  background: ${({ $boosting }) => ($boosting ? color.warning : color.accent)};
`

const Badge = styled.span`
  margin-inline-start: auto;
  padding: 0 ${space.sm}px;
  border-radius: ${radius.component}px;
  background: ${color.warning};
  color: ${color.surface};
  font-weight: bold;
`
