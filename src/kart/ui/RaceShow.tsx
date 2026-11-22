// 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): what goes over the race besides the HUD
// as a broadcast would show it: the title card over the fly round before the countdown, the final
// lap's banner, a place gained or lost, and the finish's big word over confetti. Styled as the rest
// of the race's interface (broadcast.ts); everything that moves stands still under reduced motion.
import styled, { css, keyframes } from 'styled-components'
import { displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { broadcast, slam, splitShadow, streak, ticker } from './broadcast.ts'
import { Confetti } from './Confetti.tsx'

const BIG = 'clamp(72px, min(20vh, 24vw), 168px)'

/** Before the countdown, over the fly round: the track, the laps, and how to skip */
export function IntroCard({
  title,
  laps,
  skip,
}: {
  readonly title: string | null
  readonly laps: string
  readonly skip: string
}) {
  return (
    <Intro role="status" data-testid="kart-intro">
      {title && <IntroTitle>{title}</IntroTitle>}
      <IntroLaps>{laps}</IntroLaps>
      <IntroSkip>{skip}</IntroSkip>
    </Intro>
  )
}

/** The final lap's banner, slammed in across the upper middle */
export function FinalLapBanner({ text }: { readonly text: string }) {
  return (
    <Banner role="status" data-testid="kart-final-lap">
      {text}
    </Banner>
  )
}

/** The finish's show: the big word (a place, or FINISH), a line under it, confetti behind */
export function Celebration({
  big,
  line,
}: {
  readonly big: string
  readonly line?: string
}) {
  return (
    <Show data-testid="kart-celebration">
      <Confetti />
      <ShowBig role="status">{big}</ShowBig>
      {line && <ShowLine>{line}</ShowLine>}
    </Show>
  )
}

const Intro = styled.section`
  ${broadcast}
  position: absolute;
  left: 50%;
  bottom: 22%;
  display: grid;
  justify-items: center;
  gap: ${space.xs}px;
  min-width: min(420px, calc(100% - ${2 * space.lg}px));
  padding: ${space.md}px ${space.xl}px;
  translate: -50% 0;
  pointer-events: none;
  ${slam(420)}
`

const IntroTitle = styled.h2`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
  text-align: center;
`

const IntroLaps = styled.p`
  ${ticker(color.accent)}
  margin: 0;
  padding: 2px ${space.lg}px;
  color: ${color.bg};
  font-weight: 700;
`

const blink = keyframes`
  from { opacity: 1; }
  to { opacity: 0.45; }
`

const IntroSkip = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  animation: ${blink} 0.8s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Banner = styled.p`
  ${displayType}
  position: absolute;
  top: 30%;
  left: 50%;
  margin: 0;
  padding: ${space.xs}px ${space.xl}px;
  translate: -50% 0;
  color: ${color.warning};
  font-size: clamp(40px, 9vw, 88px);
  line-height: 1;
  text-shadow: ${splitShadow};
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
  isolation: isolate;
  ${slam(420)}
  ${streak(color.warning)}
`

const Show = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`

const ShowBig = styled.p`
  ${displayType}
  position: absolute;
  top: 18%;
  left: 50%;
  margin: 0;
  translate: -50% 0;
  color: ${color.text};
  font-size: ${BIG};
  line-height: 1;
  text-shadow: ${splitShadow};
  text-transform: uppercase;
  white-space: nowrap;
  isolation: isolate;
  ${slam(480)}
  ${streak(color.accent)}
`

const ShowLine = styled.p`
  ${ticker(color.surface, 12)}
  position: absolute;
  top: calc(18% + ${BIG} + ${space.md}px);
  left: 50%;
  margin: 0;
  padding: ${space.xs}px ${space.xl}px;
  translate: -50% 0;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  white-space: nowrap;
`

const rise = keyframes`
  0% { opacity: 0; transform: translateY(10px); }
  20% { opacity: 1; transform: translateY(0); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-6px); }
`

/** A triangle beside the place: up (gained) or down (lost); shapes only, the words are its label */
export const PlaceArrow = styled.span<{ $up: boolean }>`
  /* Under the place, so that the panel does not grow into what sits beside it */
  position: absolute;
  top: calc(100% + ${space.xs}px);
  left: calc(50% - 9px);
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  ${({ $up }) =>
    $up
      ? css`
          border-bottom: 14px solid ${color.success};
        `
      : css`
          border-top: 14px solid ${color.danger};
        `}
  animation: ${rise} 1.6s ease-out both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// ── 2026-11-22 (docs/ARCHITECTURE.md §4.68): each driver presented, and the close's countdown ──────

/**
 * During the opening, the driver in front of the camera: a lower third with their place on the grid,
 * name, kart and driver, and their team's colour (a team race) or the accent. Keyed by the driver, so
 * that each one slides in afresh
 */
export function DriverCard({
  grid,
  name,
  ride,
  stripe,
  you,
  skip,
}: {
  readonly grid: string
  readonly name: string
  readonly ride: string | null
  /** The team's colour, or the accent */
  readonly stripe: string
  readonly you: string | null
  readonly skip: string
}) {
  return (
    <Lower role="status" data-testid="kart-driver-card" style={{ borderLeftColor: stripe }}>
      <LowerGrid style={{ background: stripe }}>{grid}</LowerGrid>
      <LowerBody>
        <LowerName>
          {name}
          {you && <LowerYou>{you}</LowerYou>}
        </LowerName>
        {ride && <LowerRide>{ride}</LowerRide>}
      </LowerBody>
      <LowerSkip>{skip}</LowerSkip>
    </Lower>
  )
}

/**
 * The seconds left after the first finish, for a racer still out on the track: a big number under a
 * label, red for the last three; or, once over, time up
 */
export function CloseCountdown({
  label,
  seconds,
  timeUp,
}: {
  readonly label: string
  readonly seconds: number
  readonly timeUp: string
}) {
  const over = seconds <= 0
  return (
    <Close role="timer" data-testid="kart-close-countdown" data-seconds={Math.max(0, seconds)}>
      <CloseLabel>{label}</CloseLabel>
      <CloseNumber key={seconds} $last={seconds <= 3}>
        {over ? timeUp : seconds}
      </CloseNumber>
    </Close>
  )
}

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(-40px) skewX(-10deg); }
  to { opacity: 1; transform: none; }
`

const Lower = styled.section`
  ${broadcast}
  position: absolute;
  left: max(${space.lg}px, 6vw);
  bottom: 22%;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: stretch;
  gap: 0 ${space.md}px;
  min-width: min(380px, calc(100% - ${2 * space.lg}px));
  max-width: calc(100% - ${2 * space.lg}px);
  padding: 0 ${space.lg}px 0 0;
  border-left: 6px solid ${color.accent};
  pointer-events: none;
  animation: ${slideIn} 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const LowerGrid = styled.span`
  ${displayType}
  display: grid;
  place-items: center;
  min-width: 3.4em;
  padding: ${space.sm}px;
  color: ${color.bg};
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const LowerBody = styled.div`
  display: grid;
  align-content: center;
  gap: 2px;
  min-width: 0;
  padding: ${space.sm}px 0;
`

const LowerName = styled.strong`
  ${displayType}
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  overflow: hidden;
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const LowerYou = styled.span`
  ${ticker(color.accent, 6)}
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
`

const LowerRide = styled.span`
  ${monoType}
  overflow: hidden;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const LowerSkip = styled.span`
  ${monoType}
  grid-column: 1 / -1;
  padding: 2px ${space.sm}px;
  color: ${color.muted};
  font-size: 12px;
  animation: ${blink} 0.8s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Close = styled.div`
  position: absolute;
  top: 18%;
  left: 50%;
  display: grid;
  justify-items: center;
  translate: -50% 0;
  pointer-events: none;
`

const CloseLabel = styled.p`
  ${ticker(color.danger, 8)}
  margin: 0;
  padding: 2px ${space.lg}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
`

const CloseNumber = styled.p<{ $last: boolean }>`
  ${displayType}
  margin: 0;
  color: ${({ $last }) => ($last ? color.danger : color.text)};
  font-size: clamp(56px, min(14vh, 16vw), 120px);
  line-height: 1;
  text-shadow: ${splitShadow};
  white-space: nowrap;
  isolation: isolate;
  ${slam(320)}
`
