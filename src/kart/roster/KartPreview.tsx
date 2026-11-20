// 2026-11-19: the picked vehicle and driver, drawn in 3D in the garage (previewStage.ts): it turns
// by itself, a drag (or the arrow keys) turns it by hand, and a switch shows its N2O shape. Loaded
// on its own (three.js): /kart's garage has it already, the waiting room fetches it when a kart room
// opens. Where there is no WebGL it draws nothing, and the garage is the cards and bars it always was.
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import { monoType } from '../../styles/esports.ts'
import { color, space } from '../../styles/tokens.ts'
import { cutClip } from '../ui/broadcast.ts'
import { createPreviewStage, type PreviewStage } from './previewStage.ts'
import type { DriverGesture } from '../driverGestures.ts'

export interface KartPreviewProps {
  kart: KartId
  driver: DriverId
  /** What the picture is, for a screen reader */
  label: string
  hint: string
  morphLabel: string
  /**
   * 2026-11-20 (§4.47): the driver does this, standing (the Grand Prix's podium): no hint, no N2O
   * switch, and it scrolls with the page
   */
  pose?: DriverGesture
}

export default function KartPreview({
  kart,
  driver,
  label,
  hint,
  morphLabel,
  pose,
}: KartPreviewProps) {
  const holder = useRef<HTMLDivElement>(null)
  const stage = useRef<PreviewStage | null>(null)
  const [missing, setMissing] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!holder.current) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const made = createPreviewStage(holder.current, still)
    stage.current = made
    if (!made) setMissing(true)
    return () => {
      made?.dispose()
      stage.current = null
    }
  }, [])
  useEffect(() => stage.current?.show(kart, driver), [kart, driver])
  useEffect(() => stage.current?.label(label), [label])
  useEffect(() => stage.current?.boost(open), [open])
  useEffect(() => stage.current?.pose(pose), [pose])

  if (missing) return null
  return (
    <Frame data-testid="kart-preview" data-kart={kart} data-open={open} data-pose={pose} $still={!!pose}>
      <Holder ref={holder} />
      {!pose && (
        <>
          <Hint aria-hidden="true">{hint}</Hint>
          <Morph type="button" aria-pressed={open} onClick={() => setOpen((was) => !was)}>
            {morphLabel}
          </Morph>
        </>
      )}
    </Frame>
  )
}

// It stays in sight while the cards under it scroll, so that a pick is seen at once; not on a
// screen too short to spare the room (a phone on its side)
const Frame = styled.div<{ $still: boolean }>`
  position: ${({ $still }) => ($still ? 'relative' : 'sticky')};
  top: 0;
  z-index: 1;
  height: clamp(130px, 26vh, 220px);
  clip-path: ${cutClip(10)};
  background: radial-gradient(
    ellipse at 50% 70%,
    color-mix(in srgb, ${color.accent} 22%, ${color.surface}),
    ${color.surface}
  );

  @media (max-height: 500px) {
    position: relative;
  }
`

const Holder = styled.div`
  width: 100%;
  height: 100%;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  canvas:focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: -2px;
  }
`

const Hint = styled.span`
  ${monoType}
  position: absolute;
  left: ${space.sm}px;
  bottom: ${space.xs}px;
  color: ${color.muted};
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
`

const Morph = styled.button`
  ${monoType}
  position: absolute;
  right: ${space.sm}px;
  bottom: ${space.xs}px;
  min-height: 32px;
  padding: 0 ${space.sm}px;
  color: ${color.text};
  background: ${color.raised};
  border: 1px solid ${color.line};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }

  &[aria-pressed='true'] {
    color: ${color.onAccent};
    background: ${color.accent};
    border-color: ${color.accent};
  }
`
