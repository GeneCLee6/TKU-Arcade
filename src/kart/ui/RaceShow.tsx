// 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): what goes over the race besides the HUD
// as a broadcast would show it: the title card over the fly round before the countdown, the final
// lap's banner, a place gained or lost, and the finish's big word over confetti. Styled as the rest
// of the race's interface (broadcast.ts); everything that moves stands still under reduced motion.
import styled, { css, keyframes } from 'styled-components'
import { displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { broadcast, digits, slam, splitShadow, streak, ticker } from './broadcast.ts'
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

/**
 * 2026-11-23 (lapSplit.ts): the lap just finished, at the top middle: "Lap 2 0:31.420", marked when
 * it is the race's fastest so far, and its difference from the best, faster green, slower red
 */
export function LapSplitCard({
  label,
  time,
  fastest,
  delta,
  faster,
  against,
}: {
  readonly label: string
  readonly time: string
  /** "Fastest lap", or null */
  readonly fastest: string | null
  /** "+0.42", or null */
  readonly delta: string | null
  readonly faster: boolean
  /** What the difference is against, for a screen reader */
  readonly against: string | null
}) {
  return (
    <Split role="status" data-testid="kart-lap-split" data-fastest={fastest ? '' : undefined}>
      <SplitLap>{label}</SplitLap>
      <SplitTime>{time}</SplitTime>
      {fastest && <SplitFastest data-testid="kart-lap-fastest">{fastest}</SplitFastest>}
      {delta && (
        <SplitDelta $faster={faster} data-testid="kart-lap-delta" data-faster={faster ? '' : undefined}>
          {against && <SplitHidden>{against} </SplitHidden>}
          {delta}
        </SplitDelta>
      )}
    </Split>
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

  /* 2026-11-23: under the lap's time when both show (crossing the line into the final lap) */
  [data-testid='kart-lap-split'] ~ & {
    top: max(30%, calc(max(19%, 104px) + 80px));

    @media (max-width: 560px) and (orientation: portrait) {
      top: 292px;
    }
  }
`

// Under the item slot (top middle, about 96 px), over the final lap's banner (30%), which the
// banner leaves room for when both show at once (the line into the final lap)
const Split = styled.section`
  ${broadcast}
  position: absolute;
  top: max(19%, 104px);
  left: 50%;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: ${space.xs}px ${space.md}px;
  max-width: calc(100% - ${2 * space.lg}px);
  padding: ${space.sm}px ${space.lg}px;
  translate: -50% 0;
  pointer-events: none;
  ${slam(320)}

  /* A phone held upright: under the item slot there (ItemHud.tsx's MAP_UNDER_ITEM_SLOT) */
  @media (max-width: 560px) and (orientation: portrait) {
    top: 212px;
  }
`

const SplitLap = styled.span`
  ${ticker(color.accent)}
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const SplitTime = styled.span`
  ${digits}
  color: ${color.text};
  font-size: clamp(${fontSize.xl}px, 5vh, 40px);
`

const SplitFastest = styled.span`
  ${displayType}
  color: ${color.magenta};
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const SplitDelta = styled.span<{ $faster: boolean }>`
  ${digits}
  color: ${({ $faster }) => ($faster ? color.success : color.danger)};
  font-size: ${fontSize.xl}px;
`

const SplitHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
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

// ── 2026-11-22 (docs/ARCHITECTURE.md §4.73): the close's countdown ──────────────────────────────────

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
