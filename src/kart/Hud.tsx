import { memo } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import { GAUGE_FULL } from '../../shared/kart/physics.ts'
import type { MessageParams } from '../i18n/t.ts'
import { clippedFill, displayType, monoType, SLANT } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import type { Callout } from './callouts.ts'
import type { SpikeHud } from './spikeLoop.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** The gauge is drawn as this many segments, 5 points each */
export const GAUGE_SEGMENTS = 20

interface HudProps {
  readonly t: KartT
  readonly hud: SpikeHud
  readonly maxStored: number
}

/**
 * e8-t08: the race HUD in the esports look (docs/DESIGN.md): the speed in km/h, the boost gauge in
 * segments, the stored boosts, and the chain while one runs. Lap, sector and time come with the time
 * trial (e8-t10, J5).
 */
export const Hud = memo(function Hud({ t, hud, maxStored }: HudProps) {
  const lit = Math.floor((hud.gauge / GAUGE_FULL) * GAUGE_SEGMENTS)
  return (
    <Box data-testid="kart-hud" aria-label={t('kart.hud.title')} role="group">
      <SpeedPanel $boosting={hud.boosting}>
        <SpeedNumber
          data-testid="kart-speed"
          role="img"
          aria-label={t('kart.hud.speedValue', { speed: hud.speed })}
        >
          {hud.speed}
        </SpeedNumber>
        <Label aria-hidden="true">{t('kart.hud.speedUnit')}</Label>
      </SpeedPanel>
      <BoostPanel>
        <LabelRow>
          <Label>{t('kart.hud.gauge')}</Label>
          <Percent>{t('kart.hud.percent', { value: hud.gauge })}</Percent>
        </LabelRow>
        <Segments
          role="meter"
          aria-label={t('kart.hud.gauge')}
          aria-valuemin={0}
          aria-valuemax={GAUGE_FULL}
          aria-valuenow={hud.gauge}
          data-testid="kart-gauge"
        >
          {Array.from({ length: GAUGE_SEGMENTS }, (_, index) => (
            <Segment key={index} $on={index < lit} />
          ))}
        </Segments>
        <LabelRow>
          <Charges
            role="img"
            aria-label={t('kart.hud.stored', { count: hud.storedBoosts, max: maxStored })}
            data-testid="kart-stored"
          >
            <Label aria-hidden="true">{t('kart.hud.charges')}</Label>
            {Array.from({ length: maxStored }, (_, index) => (
              <Charge key={index} $on={index < hud.storedBoosts} />
            ))}
          </Charges>
          {hud.boosting && (
            <Tag $chain={hud.chain >= 2} data-testid="kart-boosting">
              {hud.chain >= 2 ? t('kart.hud.chain', { count: hud.chain }) : t('kart.hud.boosting')}
            </Tag>
          )}
        </LabelRow>
      </BoostPanel>
    </Box>
  )
})

interface CalloutProps {
  readonly t: KartT
  readonly callout: Callout
}

const CALLOUT_KEYS = {
  drift: 'kart.callout.drift',
  slide: 'kart.callout.slide',
  release: 'kart.callout.release',
  boost: 'kart.callout.boost',
  start: 'kart.callout.start',
  stall: 'kart.callout.stall',
} as const satisfies Record<Exclude<Callout['kind'], 'chain'>, KartMessageKey>

/**
 * DRIFT, BOOST, CHAIN ×n, and the techniques' words: big, brief, and only for the eyes (the HUD says
 * the boost and the chain in words)
 */
export const CalloutText = memo(function CalloutText({ t, callout }: CalloutProps) {
  const text =
    callout.kind === 'chain'
      ? t('kart.callout.chain', { count: callout.count })
      : t(CALLOUT_KEYS[callout.kind])
  return (
    <CalloutBox aria-hidden="true" data-testid="kart-callout" data-kind={callout.kind}>
      <CalloutTag $kind={callout.kind}>{text}</CalloutTag>
    </CalloutBox>
  )
})

/** The panels' shape: square on the left, the right edge leaning like the shell's slant */
const hudPanel = css`
  ${clippedFill('polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)', color.panel)}

  &::before {
    box-shadow: inset 0 0 0 1px ${color.line};
  }
`

const Box = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: ${space.md}px;
  pointer-events: none;

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-end;
    gap: ${space.sm}px;
  }
`

const SpeedPanel = styled.div<{ $boosting: boolean }>`
  ${hudPanel}
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.xxl}px ${space.md}px ${space.lg}px;
  color: ${({ $boosting }) => ($boosting ? color.magenta : color.text)};
`

const SpeedNumber = styled.span`
  ${displayType}
  font-size: 72px;
  line-height: 0.85;
  font-variant-numeric: tabular-nums;
  min-width: 3.1ch;
  text-align: end;

  @media (max-width: 760px) {
    font-size: 44px;
  }
`

const Label = styled.span`
  ${monoType}
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${color.muted};
`

const BoostPanel = styled.div`
  ${hudPanel}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.xxl}px ${space.md}px ${space.lg}px;
  color: ${color.text};
`

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  min-height: 24px;
`

const Percent = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Segments = styled.div`
  display: flex;
  gap: 4px;
  padding-inline: 4px;

  @media (max-width: 760px) {
    gap: 3px;
  }
`

const Segment = styled.i<{ $on: boolean }>`
  width: 11px;
  height: 22px;
  transform: skewX(${SLANT});
  background: ${({ $on }) => ($on ? color.accent : color.raised)};
  box-shadow: ${({ $on }) => ($on ? `0 0 8px ${color.accent}` : `inset 0 0 0 1px ${color.line}`)};

  @media (max-width: 760px) {
    width: 8px;
    height: 18px;
  }
`

const Charges = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Charge = styled.i<{ $on: boolean }>`
  width: 26px;
  height: 14px;
  transform: skewX(${SLANT});
  background: ${({ $on }) => ($on ? color.magenta : 'transparent')};
  box-shadow: ${({ $on }) =>
    $on ? `0 0 12px ${color.magenta}` : `inset 0 0 0 1px ${color.border}`};
`

const tagClip = 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)'

const Tag = styled.span<{ $chain: boolean }>`
  ${monoType}
  ${({ $chain }) => clippedFill(tagClip, $chain ? color.magenta : color.accent)}
  padding: 2px ${space.md}px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${color.onAccent};
`

const pop = keyframes`
  0% { transform: scale(1.4); opacity: 0; }
  15% { transform: scale(1); opacity: 1; }
  75% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-18px); opacity: 0; }
`

const CalloutBox = styled.div`
  position: absolute;
  top: 24%;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  animation: ${pop} 0.9s cubic-bezier(0.2, 0.9, 0.2, 1) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const calloutFill: Record<Callout['kind'], string> = {
  drift: color.warning,
  slide: color.gameSpectrum,
  release: color.accent,
  boost: color.accent,
  chain: color.magenta,
  start: color.success,
  stall: color.danger,
}
/** The small callouts: the ones that come often in a lap */
const SMALL: ReadonlySet<Callout['kind']> = new Set(['drift', 'slide', 'release'])
const calloutClip = 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)'

const CalloutTag = styled.span<{ $kind: Callout['kind'] }>`
  ${displayType}
  ${({ $kind }) => clippedFill(calloutClip, calloutFill[$kind])}
  padding: ${space.xs}px ${space.xxl}px;
  color: ${color.onAccent};
  text-transform: uppercase;
  white-space: nowrap;
  font-size: ${({ $kind }) => (SMALL.has($kind) ? 'clamp(28px, 4vw, 44px)' : 'clamp(36px, 6.5vw, 72px)')};
`
