import { memo } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import { GAUGE_FULL } from '../../shared/kart/physics.ts'
import type { MessageParams } from '../i18n/t.ts'
import { clippedFill, displayType, monoType, SLANT } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import type { Callout } from './callouts.ts'
import { streak, ticker } from './ui/broadcast.ts'
import { HUD_STEPS, type SpikeHud } from './spikeLoop.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** The gauge is drawn as this many segments, 5 points each */
export const GAUGE_SEGMENTS = 20

interface HudProps {
  readonly t: KartT
  readonly hud: SpikeHud
  readonly maxStored: number
  /**
   * Touch buttons in both bottom corners (2026-11-17): smaller, to fit between them on a phone held
   * sideways
   */
  readonly dense?: boolean
}

/**
 * e8-t08: the race HUD in the esports look (docs/DESIGN.md): the speed in km/h, the boost gauge in
 * segments, the stored boosts, and the chain while one runs. Lap, sector and time come with the time
 * trial (e8-t10, J5). 2026-11-17 (docs/KART-FEEL.md §7): the two panels stand apart, either side of
 * the kart, so that the kart, its skid marks and its flames are never behind the HUD; and between
 * them, under the kart, a prompt says when the instant boost is earned and when to tap forward.
 * 2026-11-18 (owner: "it should take a big drift to boost ... one boost has to end before the
 * next"): in the same place, while a drift has not earned it yet, a meter shows how far it has to go
 * (far enough out, for long enough); and while a boost runs, a bar runs down with it and the
 * charges show locked. Later that day (owner: "in a team race everyone collects their own N2O, and
 * there is a red one and a blue one"): in a team race the charges the team's full gauge has turned
 * blue are drawn blue, first in the row since they fire first, and the rest in the team race's red.
 */
export const Hud = memo(function Hud({ t, hud, maxStored, dense = false }: HudProps) {
  const lit = Math.floor((hud.gauge / GAUGE_FULL) * GAUGE_SEGMENTS)
  const dash = hud.dash ?? 0
  const depth = Math.min(HUD_STEPS, hud.depth ?? 0)
  const boostLeft = Math.min(HUD_STEPS, hud.boostLeft ?? 0)
  const locked = (hud.boostLocked ?? false) && boostLeft > 0
  // A team race: how many of the charges are blue; any other race has no such field
  const team = hud.teamBoosts !== undefined
  const blue = Math.min(hud.teamBoosts ?? 0, hud.storedBoosts)
  const combo = hud.combo ?? 0
  const gains = hud.gains ?? 0
  const gain = hud.gain ?? 0
  const perfect = dash === 1 && (hud.perfectReady ?? false)
  // The classic feel shows its combo by the gauge, all the time; the arcade feel on the boost's tag
  const chained = hud.chain >= 2 && hud.combo === undefined
  return (
    <Box
      data-testid="kart-hud"
      data-dense={dense || undefined}
      aria-label={t('kart.hud.title')}
      role="group"
    >
      {dash > 0 && (
        <DashSlot>
          <DashPrompt
            $now={dash === 2}
            $perfect={perfect}
            data-testid="kart-dash"
            data-state={dash}
            data-perfect={perfect || undefined}
            role="status"
          >
            {t(
              dash === 2
                ? 'kart.hud.dashNow'
                : perfect
                  ? 'kart.hud.dashPerfect'
                  : 'kart.hud.dashEarned',
            )}
          </DashPrompt>
        </DashSlot>
      )}
      {dash === 0 && depth > 0 && (
        <DashSlot>
          <Depth
            role="meter"
            aria-label={t('kart.hud.depth')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={(depth / HUD_STEPS) * 100}
            data-testid="kart-depth"
          >
            <DepthLabel aria-hidden="true">{t('kart.hud.depth')}</DepthLabel>
            <DepthTrack>
              <DepthFill $share={depth / HUD_STEPS} />
            </DepthTrack>
          </Depth>
        </DashSlot>
      )}
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
          {combo >= 2 && (
            <Combo key={combo} data-testid="kart-combo" role="status">
              {t('kart.hud.combo', { count: combo })}
            </Combo>
          )}
          <Percent>
            {gains > 0 && gain > 0 && (
              <Gain
                key={gains}
                $perfect={hud.grade === 3}
                data-testid="kart-gain"
                data-grade={hud.grade}
                aria-label={t('kart.hud.gainSaid', { value: gain })}
              >
                {t('kart.hud.gain', { value: gain })}
              </Gain>
            )}
            {t('kart.hud.percent', { value: hud.gauge })}
          </Percent>
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
          {gains > 0 && gain > 0 && (
            <Jump key={gains} $perfect={hud.grade === 3} aria-hidden="true" />
          )}
        </Segments>
        <LabelRow>
          <Charges
            role="img"
            aria-label={
              team
                ? t(locked ? 'kart.hud.storedTeamLocked' : 'kart.hud.storedTeam', {
                    red: hud.storedBoosts - blue,
                    blue,
                    max: maxStored,
                  })
                : t(locked ? 'kart.hud.storedLocked' : 'kart.hud.stored', {
                    count: hud.storedBoosts,
                    max: maxStored,
                  })
            }
            data-testid="kart-stored"
            data-locked={locked || undefined}
            data-red={team ? hud.storedBoosts - blue : undefined}
            data-blue={team ? blue : undefined}
          >
            <Label aria-hidden="true">{t('kart.hud.charges')}</Label>
            {Array.from({ length: maxStored }, (_, index) => (
              <Charge
                key={index}
                $on={index < hud.storedBoosts}
                $locked={locked}
                $tone={!team ? color.magenta : index < blue ? color.teamBoost : color.teamRed}
                data-kind={
                  !team || index >= hud.storedBoosts ? undefined : index < blue ? 'blue' : 'red'
                }
              />
            ))}
          </Charges>
          {hud.boosting && (
            <Tag $chain={chained} data-testid="kart-boosting">
              {chained ? t('kart.hud.chain', { count: hud.chain }) : t('kart.hud.boosting')}
            </Tag>
          )}
        </LabelRow>
        {boostLeft > 0 && (
          <BoostLeft
            role="meter"
            aria-label={t('kart.hud.boostLeft')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={(boostLeft / HUD_STEPS) * 100}
            data-testid="kart-boost-left"
          >
            <BoostLeftFill $share={boostLeft / HUD_STEPS} />
          </BoostLeft>
        )}
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
  double: 'kart.callout.double',
  catch: 'kart.callout.catch',
  counter: 'kart.callout.counter',
  pad: 'kart.callout.pad',
  stack: 'kart.callout.stack',
  broken: 'kart.callout.broken',
  boost: 'kart.callout.boost',
  start: 'kart.callout.start',
  quick: 'kart.callout.quick',
  stall: 'kart.callout.stall',
  late: 'kart.callout.late',
} as const satisfies Record<Exclude<Callout['kind'], 'chain' | 'perfect'>, KartMessageKey>

/**
 * DRIFT, BOOST, CHAIN ×n, and the techniques' words: big, brief, and only for the eyes (the HUD says
 * the boost and the chain in words)
 */
export const CalloutText = memo(function CalloutText({ t, callout }: CalloutProps) {
  const text =
    callout.kind === 'chain'
      ? t('kart.callout.chain', { count: callout.count })
      : callout.kind === 'perfect'
        ? callout.count >= 2
          ? t('kart.callout.perfectCombo', { count: callout.count })
          : t('kart.callout.perfect')
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

/** The gap left between the two panels for the kart, on a screen wide enough to have one */
const KART_GAP = 'clamp(220px, 26vw, 420px)'

const Box = styled.div`
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: ${KART_GAP};
  pointer-events: none;

  @media (max-width: 1000px) {
    gap: ${space.md}px;
  }

  /* A phone held upright: one panel over the other, on the right */
  @media (max-width: 760px) and (min-height: 501px) {
    flex-direction: column;
    align-items: flex-end;
    gap: ${space.sm}px;
  }

  /* A short screen (a phone held sideways): side by side and small, keeping the road in view */
  @media (max-height: 500px) {
    gap: ${space.sm}px;
  }

  &[data-dense] {
    gap: ${space.xs}px;
  }
`

/** Inside a dense HUD (between the touch buttons) */
const DENSE = '[data-dense] &'

const SpeedPanel = styled.div<{ $boosting: boolean }>`
  ${hudPanel}
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.xxl}px ${space.md}px ${space.lg}px;
  color: ${({ $boosting }) => ($boosting ? color.magenta : color.text)};

  ${DENSE} {
    gap: ${space.xs}px;
    padding: ${space.sm}px ${space.xl}px ${space.sm}px ${space.md}px;
  }
`

const SpeedNumber = styled.span`
  ${displayType}
  font-size: 72px;
  line-height: 0.85;
  font-variant-numeric: tabular-nums;
  min-width: 3.1ch;
  text-align: end;

  @media (max-width: 760px), (max-height: 500px) {
    font-size: 44px;
  }

  ${DENSE} {
    font-size: 34px;
  }
`

const Label = styled.span`
  ${monoType}
  white-space: nowrap;
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

  ${DENSE} {
    gap: ${space.xs}px;
    padding: ${space.sm}px ${space.xl}px ${space.sm}px ${space.md}px;
  }
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
  position: relative;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const gainUp = keyframes`
  0% { opacity: 0; transform: translateY(6px) scale(0.7); }
  14% { opacity: 1; transform: translateY(-4px) scale(1.25); }
  28% { transform: translateY(-6px) scale(1); }
  75% { opacity: 1; transform: translateY(-8px) scale(1); }
  100% { opacity: 0; transform: translateY(-20px) scale(1); }
`

const shown = keyframes`
  0%, 99% { opacity: 1; }
  100% { opacity: 0; }
`

/**
 * What an instant boost out of a drift has just added to the gauge (2026-11-18): the number jumps
 * out over the percentage and floats away; gold for a perfect one. Under reduced motion it only
 * shows, and goes
 */
const Gain = styled.span<{ $perfect: boolean }>`
  ${displayType}
  position: absolute;
  right: 0;
  bottom: 100%;
  font-size: 22px;
  line-height: 1;
  white-space: nowrap;
  color: ${({ $perfect }) => ($perfect ? color.warning : color.accent)};
  text-shadow: 0 0 10px ${({ $perfect }) => ($perfect ? color.warning : color.accent)};
  opacity: 0;
  pointer-events: none;
  animation: ${gainUp} 1.1s ease-out both;

  ${DENSE} {
    font-size: 15px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: ${shown} 1.1s linear both;
  }
`

const comboIn = keyframes`
  0% { transform: scale(1.5) skewX(-10deg); }
  100% { transform: scale(1) skewX(0deg); }
`

/** The combo: instant boosts in a row. It kicks each time it grows */
const Combo = styled.span`
  ${monoType}
  ${ticker(color.magenta, 6)}
  padding: 1px ${space.md}px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${color.onAccent};
  animation: ${comboIn} 0.22s cubic-bezier(0.2, 0.9, 0.2, 1) both;

  ${DENSE} {
    padding: 0 ${space.sm}px;
    font-size: 10px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const jumpOut = keyframes`
  0% { opacity: 0.95; transform: scaleY(1.9); }
  100% { opacity: 0; transform: scaleY(1); }
`

const Segments = styled.div`
  position: relative;
  display: flex;
  gap: 4px;
  padding-inline: 4px;

  @media (max-width: 760px), (max-height: 500px) {
    gap: 3px;
  }

  ${DENSE} {
    gap: 2px;
  }
`

const Segment = styled.i<{ $on: boolean }>`
  width: 11px;
  height: 22px;
  transform: skewX(${SLANT});
  background: ${({ $on }) => ($on ? color.accent : color.raised)};
  box-shadow: ${({ $on }) => ($on ? `0 0 8px ${color.accent}` : `inset 0 0 0 1px ${color.line}`)};

  @media (max-width: 760px), (max-height: 500px) {
    width: 8px;
    height: 18px;
  }

  ${DENSE} {
    width: 5px;
    height: 14px;
  }
`

/** The gauge jumps: a flash over the whole bar the moment an exit's bonus lands */
const Jump = styled.i<{ $perfect: boolean }>`
  position: absolute;
  inset: 0;
  background: ${({ $perfect }) => ($perfect ? color.warning : color.accent)};
  box-shadow: 0 0 18px ${({ $perfect }) => ($perfect ? color.warning : color.accent)};
  mix-blend-mode: screen;
  opacity: 0;
  pointer-events: none;
  animation: ${jumpOut} 0.45s ease-out both;

  @media (prefers-reduced-motion: reduce) {
    animation: ${shown} 0.3s linear both;
  }
`

const Charges = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`

/** Locked while a boost runs (the next fires only once it has ended): an outline, no glow */
const Charge = styled.i<{ $on: boolean; $locked: boolean; $tone: string }>`
  width: 26px;
  height: 14px;

  ${DENSE} {
    width: 16px;
    height: 10px;
  }

  transform: skewX(${SLANT});
  background: ${({ $on, $locked, $tone }) =>
    !$on ? 'transparent' : $locked ? `color-mix(in srgb, ${$tone} 30%, transparent)` : $tone};
  box-shadow: ${({ $on, $locked, $tone }) =>
    $on && !$locked ? `0 0 12px ${$tone}` : `inset 0 0 0 1px ${$on ? $tone : color.border}`};
`

/** The running boost, running down: under the charges, as wide as the panel */
const BoostLeft = styled.div`
  height: 6px;
  margin-inline: 4px;
  transform: skewX(${SLANT});
  background: ${color.raised};
  box-shadow: inset 0 0 0 1px ${color.line};

  ${DENSE} {
    height: 4px;
  }
`

const BoostLeftFill = styled.i.attrs<{ $share: number }>(({ $share }) => ({
  style: { width: `${Math.round($share * 100)}%` },
}))`
  display: block;
  height: 100%;
  background: ${color.magenta};
  box-shadow: 0 0 10px ${color.magenta};
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

const pulse = keyframes`
  from { transform: scale(1); }
  to { transform: scale(1.08); }
`

/** Out of the panels' row: centred between them, at the bottom */
const DashSlot = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;

  @media (max-width: 1000px) {
    bottom: calc(100% + ${space.sm}px);
  }
`

/**
 * Between the panels, under the kart: the instant boost is earned (gold, like the sparks), or a
 * fresh press of forward fires it now (bright, pulsing)
 */
const DashPrompt = styled.span<{ $now: boolean; $perfect: boolean }>`
  ${monoType}
  ${({ $now }) => clippedFill(tagClip, $now ? color.success : color.warning)}
  box-shadow: ${({ $perfect }) => ($perfect ? `0 0 18px ${color.warning}` : 'none')};
  padding: ${space.xs}px ${space.lg}px;
  font-size: ${({ $now }) => ($now ? '16px' : '13px')};
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${color.onAccent};
  animation: ${({ $now }) => ($now ? pulse : 'none')} 0.18s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

/**
 * Where the prompt will be, while a drift has not earned the instant boost yet: how far it has to
 * go. Plain until it is full; then the gold prompt takes its place
 */
const Depth = styled.div`
  ${clippedFill(tagClip, color.panel)}
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.lg}px;

  &::before {
    box-shadow: inset 0 0 0 1px ${color.line};
  }
`

const DepthLabel = styled.span`
  ${monoType}
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${color.text};
`

const DepthTrack = styled.div`
  position: relative;
  width: clamp(72px, 12vw, 132px);
  height: 10px;
  transform: skewX(${SLANT});
  background: ${color.raised};
  box-shadow:
    inset 0 0 0 1px ${color.line},
    3px 0 0 0 ${color.warning};
`

const DepthFill = styled.i.attrs<{ $share: number }>(({ $share }) => ({
  style: { width: `${Math.round($share * 100)}%` },
}))`
  display: block;
  height: 100%;
  background: ${color.accent};
`

const veilIn = keyframes`
  from { opacity: 1; }
  to { opacity: 0.55; }
`

/**
 * Over the whole race while a boost runs: light pouring in from the edges of the screen, brightest
 * the moment it fires. A fade, not motion. The page puts it over the canvas, under the HUD
 */
export const BoostVeil = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow:
    inset 0 0 90px color-mix(in srgb, ${color.accent} 70%, transparent),
    inset 0 0 28px color-mix(in srgb, ${color.accent} 55%, transparent);
  animation: ${veilIn} 0.5s ease-out both;
`

const pop = keyframes`
  0% { transform: scale(2) skewX(-14deg); opacity: 0; }
  12% { transform: scale(0.96) skewX(-14deg); opacity: 1; }
  20% { transform: scale(1); opacity: 1; }
  75% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-18px); opacity: 0; }
`

/**
 * A page with something at its top centre (the item slot of an item race) sets this to how far down
 * that reaches: the big words then start under it
 */
export const CALLOUT_CLEAR = '--kart-callout-clear'

const CalloutBox = styled.div`
  position: absolute;
  top: max(13%, var(${CALLOUT_CLEAR}, 0px));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  isolation: isolate;
  animation: ${pop} 0.9s cubic-bezier(0.2, 0.9, 0.2, 1) both;

  /* The big ones (a perfect start, a boost, a chain) cross the screen with a streak of light */
  &[data-kind='start'],
  &[data-kind='quick'],
  &[data-kind='boost'],
  &[data-kind='chain'],
  &[data-kind='perfect'],
  &[data-kind='double'],
  &[data-kind='stack'] {
    ${streak(color.accent)}
  }

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
  quick: color.accent,
  stall: color.danger,
  double: color.magenta,
  catch: color.success,
  counter: color.warning,
  pad: color.accent,
  stack: color.magenta,
  broken: color.danger,
  perfect: color.warning,
  late: color.accent,
}
/** The small callouts: the ones that come often in a lap */
const SMALL: ReadonlySet<Callout['kind']> = new Set([
  'drift',
  'slide',
  'release',
  'catch',
  'counter',
  'pad',
  'late',
  // Every corner, for a good driver
  'perfect',
])
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
