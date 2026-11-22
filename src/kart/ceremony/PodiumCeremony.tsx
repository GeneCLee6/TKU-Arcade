// 2026-11-22 (owner: "at the end, an animated podium for the top three"; docs/ARCHITECTURE.md §4.73):
// after every race against others (a room, against the computer, each race of a Grand Prix, and the
// cup's final podium), before the results. The 3D stage (podiumStage.ts) with each place's name plate
// slammed in over it as its light comes up, confetti with the winner, about seven seconds, then the
// results; any key, a tap or the button skips it. Its own lazy chunk (three.js is already loaded
// by then on a race's page). Without WebGL the plates alone show.
import { useEffect, useRef, useState } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType } from '../../styles/esports.ts'
import { kartPodium } from '../../styles/kartTokens.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Confetti } from '../ui/Confetti.tsx'
import { broadcast, slam } from '../ui/broadcast.ts'
import { CEREMONY_MS, REVEAL_AT, SKIP_AFTER_MS, type PodiumEntry } from './podium.ts'
import { createPodiumStage } from './podiumStage.ts'

registerMessages(KART_MESSAGES)

type KartT = (key: KartMessageKey, params?: MessageParams) => string

export interface PodiumCeremonyProps {
  /** Up to three, one a place */
  readonly entries: readonly PodiumEntry[]
  /** Over the stage; the plain "Podium" by default */
  readonly title?: string
  readonly onDone: () => void
}

export default function PodiumCeremony({ entries, title, onDone }: PodiumCeremonyProps) {
  const t: KartT = useT()
  const holder = useRef<HTMLDivElement>(null)
  const [missing, setMissing] = useState(false)
  const [winner, setWinner] = useState(false)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  const names = entries
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((entry) => entry.name)
    .join(', ')

  useEffect(() => {
    if (!holder.current) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const stage = createPodiumStage(holder.current, entries, still, t('kart.flow.podium.canvas', { names }))
    if (!stage) setMissing(true)
    return () => stage?.dispose()
    // Made once: the entries of a race's podium do not change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The winner's moment (the confetti), the end, and a skip once the show has begun
  useEffect(() => {
    const began = performance.now()
    const winnerTimer = window.setTimeout(() => setWinner(true), REVEAL_AT[1] * 1000)
    const doneTimer = window.setTimeout(() => doneRef.current(), CEREMONY_MS)
    const skip = (event: Event) => {
      if (performance.now() - began < SKIP_AFTER_MS) return
      if (event instanceof KeyboardEvent && (event.repeat || event.key === 'Tab')) return
      doneRef.current()
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.clearTimeout(winnerTimer)
      window.clearTimeout(doneTimer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [])

  return (
    <Page data-testid="kart-podium" data-places={entries.length}>
      <Holder ref={holder} aria-hidden={missing || undefined} />
      <Lights aria-hidden="true" />
      {winner && <Confetti />}
      <Top>
        <Title>{title ?? t('kart.flow.podium.title')}</Title>
      </Top>
      <Plates>
        {[2, 1, 3].map((place) => {
          const entry = entries.find((one) => one.place === place)
          if (!entry) return <span key={place} />
          return (
            <Plate
              key={place}
              $place={entry.place}
              $delay={REVEAL_AT[entry.place]}
              $you={entry.you}
              data-testid={`kart-podium-${entry.place}`}
            >
              <PlaceTag $place={entry.place}>{t(`kart.flow.podium.place${entry.place}`)}</PlaceTag>
              <Name>{entry.name}</Name>
              <Line>{entry.line}</Line>
              <Ride>
                {t('kart.flow.intro.rides', {
                  kart: t(`kart.body.${entry.kart}` as KartMessageKey),
                  driver: t(`kart.driver.${entry.driver}` as KartMessageKey),
                })}
              </Ride>
            </Plate>
          )
        })}
      </Plates>
      <Skip>
        <SkipHint>{t('kart.flow.podium.skipHint')}</SkipHint>
        <Button type="button" $variant="secondary" $size="sm" onClick={onDone} data-testid="kart-podium-skip">
          {t('kart.flow.podium.skip')}
        </Button>
      </Skip>
      <Progress aria-hidden="true" />
    </Page>
  )
}

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 30;
  overflow: hidden;
  background: ${kartPodium.sky};
`

const Holder = styled.div`
  position: absolute;
  inset: 0;
`

const sweep = keyframes`
  from { transform: translateX(-30%) rotate(18deg); }
  to { transform: translateX(30%) rotate(-18deg); }
`

// Two beams of light crossing the stage, over the 3D (and in its place without WebGL)
const Lights = styled.div`
  position: absolute;
  inset: -20% 0 0;
  pointer-events: none;
  background:
    linear-gradient(100deg, transparent 42%, color-mix(in srgb, ${kartPodium.lights[1]} 22%, transparent) 50%, transparent 58%),
    linear-gradient(80deg, transparent 40%, color-mix(in srgb, ${kartPodium.lights[0]} 18%, transparent) 50%, transparent 60%);
  mix-blend-mode: screen;
  animation: ${sweep} 3.2s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Top = styled.div`
  position: absolute;
  top: ${space.lg}px;
  left: 0;
  right: 0;
  display: grid;
  justify-items: center;
  pointer-events: none;
`

const Title = styled.h1`
  ${broadcast}
  ${displayType}
  margin: 0;
  padding: ${space.sm}px ${space.xl}px;
  color: ${color.text};
  font-size: clamp(28px, 6vw, 56px);
  text-transform: uppercase;
  ${slam(380)}
`

const Plates = styled.div`
  position: absolute;
  left: 50%;
  bottom: 84px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: ${space.sm}px;
  width: min(760px, calc(100% - ${2 * space.md}px));
  translate: -50% 0;
  pointer-events: none;
`

const plateIn = keyframes`
  from { opacity: 0; transform: translateY(24px) scale(0.92) skewX(-8deg); }
  70% { opacity: 1; transform: translateY(-4px) scale(1.03) skewX(0); }
  to { opacity: 1; transform: none; }
`

const Plate = styled.section<{ $place: 1 | 2 | 3; $delay: number; $you: boolean }>`
  ${broadcast}
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: ${space.sm}px ${space.md}px;
  border-bottom: 4px solid ${({ $place }) => kartPodium.steps[$place - 1]};
  opacity: 0;
  animation: ${plateIn} 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards;
  animation-delay: ${({ $delay }) => $delay}s;
  ${({ $place }) =>
    $place === 1 &&
    css`
      margin-bottom: ${space.lg}px;
    `}
  ${({ $you }) =>
    $you &&
    css`
      outline: 2px solid ${color.accent};
      outline-offset: 2px;
    `}

  @media (prefers-reduced-motion: reduce) {
    opacity: 1;
    animation: none;
  }
`

const PlaceTag = styled.span<{ $place: 1 | 2 | 3 }>`
  ${displayType}
  color: ${({ $place }) => kartPodium.steps[$place - 1]};
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const Name = styled.strong`
  overflow: hidden;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Line = styled.span`
  ${monoType}
  color: ${color.text};
  font-size: ${fontSize.md}px;
  font-weight: 700;
`

const Ride = styled.span`
  overflow: hidden;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Skip = styled.div`
  position: absolute;
  right: ${space.md}px;
  bottom: ${space.md}px;
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
`

const SkipHint = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;

  @media (max-width: 560px) {
    display: none;
  }
`

const fill = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`

const Progress = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: ${color.accent};
  transform-origin: left;
  animation: ${fill} ${CEREMONY_MS}ms linear forwards;
`
