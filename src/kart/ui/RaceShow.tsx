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
