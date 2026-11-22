import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { buttonPx, sliderSteer, type TouchButton } from '../../../shared/kart/touch.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import type { TouchControlsState } from './useTouchControls.ts'
import { boostButtonLook, type BoostCell, type BoostHud } from './boostButton.ts'
import { TouchSettingsPanel } from './TouchSettingsPanel.tsx'
import { GAP, SLIDER_REACH, SLIDER_WIDTH, SMALL, STEER_SCALE } from './touchLayout.ts'

// 2026-11-17 (docs/ARCHITECTURE.md §4.25): the buttons a phone drives with. Shown on a coarse
// pointer or after the first touch; a driving key or a gamepad hides them again. Every finger is
// followed on its own (Pointer Events), so steering, drifting and tapping the gas work together, and
// a thumb may slide from one button to the next in its cluster.

type KartT = (key: KartMessageKey, params?: MessageParams) => string

type Finger =
  | { readonly kind: 'button'; readonly button: TouchButton; readonly cluster: HTMLElement }
  | { readonly kind: 'slider'; readonly originX: number; readonly steer: number }

interface TouchControlsProps {
  readonly t: KartT
  readonly touch: TouchControlsState
  /** An item race: the item button shows */
  readonly items?: boolean
  /**
   * The HUD and how many charges the kart holds at most (2026-11-22, #100): the BOOST button shows
   * a boost burning, and the charges held (boostButton.ts)
   */
  readonly hud?: BoostHud
  readonly maxStored?: number
}

export const TouchControls = memo(function TouchControls({
  t,
  touch,
  items = false,
  hud,
  maxStored = 0,
}: TouchControlsProps) {
  const { source, shown, settings, changeSettings } = touch
  const fingers = useRef(new Map<number, Finger>())
  const layer = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const size = buttonPx(settings)
  const boost = hud ? boostButtonLook(hud, maxStored) : null

  /** The pressed look, outside React: it changes with every finger */
  const paint = useCallback((held: ReadonlySet<TouchButton>) => {
    for (const element of layer.current?.querySelectorAll<HTMLElement>('[data-touch]') ?? []) {
      const pressed = held.has(element.dataset.touch as TouchButton)
      if ((element.dataset.pressed === 'true') !== pressed)
        element.dataset.pressed = String(pressed)
    }
  }, [])

  /** What the fingers hold goes to the loop and to the look */
  const sync = () => {
    const held = new Set<TouchButton>()
    let slider: number | null = null
    for (const finger of fingers.current.values()) {
      if (finger.kind === 'button') held.add(finger.button)
      else slider = finger.steer
    }
    source.hold(held, slider ?? 0)
    if (slider === null && knob.current) knob.current.style.transform = ''
    paint(held)
  }

  // Hidden, or the settings opened: nothing stays held
  useEffect(() => {
    if (shown && !open) return
    fingers.current.clear()
    source.clear()
    if (knob.current) knob.current.style.transform = ''
    paint(new Set())
  }, [shown, open, source, paint])

  /** The button of this cluster under the finger, else the nearest one */
  const buttonAt = (cluster: HTMLElement, x: number, y: number): TouchButton | undefined => {
    let best: TouchButton | undefined
    let bestDistance = Infinity
    for (const element of cluster.querySelectorAll<HTMLElement>('[data-touch]')) {
      const box = element.getBoundingClientRect()
      const dx = Math.max(box.left - x, 0, x - box.right)
      const dy = Math.max(box.top - y, 0, y - box.bottom)
      const distance = Math.hypot(dx, dy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = element.dataset.touch as TouchButton
      }
    }
    return best
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // The settings button is a plain button: let it be clicked
    if ((event.target as Element).closest('[data-plain]')) return
    event.preventDefault()
    const cluster = event.currentTarget
    try {
      cluster.setPointerCapture(event.pointerId)
    } catch {
      // Already gone: its pointerup will not come either, and the map is cleaned on the next one
    }
    if (cluster.dataset.cluster === 'steer' && settings.steer === 'slider') {
      fingers.current.set(event.pointerId, { kind: 'slider', originX: event.clientX, steer: 0 })
      sync()
      return
    }
    const button = buttonAt(cluster, event.clientX, event.clientY)
    if (!button) return
    fingers.current.set(event.pointerId, { kind: 'button', button, cluster })
    source.tap(button)
    sync()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const finger = fingers.current.get(event.pointerId)
    if (!finger) return
    if (finger.kind === 'slider') {
      const reach = size * SLIDER_REACH
      const steer = sliderSteer(event.clientX - finger.originX, reach)
      fingers.current.set(event.pointerId, { ...finger, steer })
      source.setSlider(steer)
      if (knob.current) {
        const shift = Math.max(-reach, Math.min(reach, event.clientX - finger.originX))
        knob.current.style.transform = `translateX(${Math.round(shift)}px)`
      }
      return
    }
    // A thumb slid onto another button of its cluster presses that one instead; slid off every
    // button, it keeps the one it had
    const under = document.elementFromPoint(event.clientX, event.clientY)
    const element = under?.closest<HTMLElement>('[data-touch]')
    if (!element || !finger.cluster.contains(element)) return
    const button = element.dataset.touch as TouchButton
    if (button === finger.button) return
    fingers.current.set(event.pointerId, { ...finger, button })
    source.tap(button)
    sync()
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!fingers.current.delete(event.pointerId)) return
    sync()
  }

  const closeSettings = useCallback(() => {
    setOpen(false)
    queueMicrotask(() => opener.current?.focus())
  }, [])

  if (!shown) return null

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: onPointerUp,
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
  }
  const steerSize = Math.round(size * STEER_SCALE)
  const vars = {
    '--touch-size': `${size}px`,
    '--touch-steer': `${steerSize}px`,
    '--touch-small': `${SMALL}px`,
    '--touch-gap': `${GAP}px`,
    '--touch-opacity': String(settings.opacity),
  } as CSSProperties

  return (
    <Layer ref={layer} style={vars} data-testid="kart-touch">
      <Cluster
        {...handlers}
        data-cluster="steer"
        data-testid="kart-touch-steer"
        $side={settings.leftHanded ? 'right' : 'left'}
        role="group"
        aria-label={t('kart.touch.steer')}
      >
        {settings.steer === 'slider' ? (
          <Slider data-testid="kart-touch-slider" aria-hidden="true">
            <Knob ref={knob} />
          </Slider>
        ) : (
          <SteerRow aria-hidden="true">
            <Pad data-touch="left" data-testid="kart-touch-left" $tone="plain" $steer>
              <Arrow $flip />
            </Pad>
            <Pad data-touch="right" data-testid="kart-touch-right" $tone="plain" $steer>
              <Arrow />
            </Pad>
          </SteerRow>
        )}
      </Cluster>
      <Cluster
        {...handlers}
        data-cluster="actions"
        data-testid="kart-touch-actions"
        $side={settings.leftHanded ? 'left' : 'right'}
        role="group"
        aria-label={t('kart.touch.controls')}
      >
        <Actions $mirror={settings.leftHanded}>
          <Small data-touch="reset" data-testid="kart-touch-reset" aria-hidden="true">
            {t('kart.touch.reset')}
          </Small>
          <Gear
            ref={opener}
            type="button"
            data-plain
            data-testid="kart-touch-settings"
            aria-label={t('kart.touch.open')}
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <GearIcon />
          </Gear>
          {items ? (
            <Pad data-touch="item" data-testid="kart-touch-item" $tone="item" aria-hidden="true">
              {t('kart.touch.item')}
            </Pad>
          ) : (
            <span />
          )}
          <Pad data-touch="brake" data-testid="kart-touch-brake" $tone="brake" aria-hidden="true">
            {t('kart.touch.brake')}
          </Pad>
          <Pad
            data-touch="boost"
            data-testid="kart-touch-boost"
            data-boost={boost?.state}
            data-locked={boost?.locked || undefined}
            $tone="boost"
            aria-hidden="true"
            style={boost ? ({ '--boost-left': boost.left } as CSSProperties) : undefined}
          >
            {boost?.state === 'burning' && <BoostRing />}
            <PadWord $small={boost?.state === 'burning'}>
              {t(boost?.state === 'burning' ? 'kart.touch.boosting' : 'kart.touch.boost')}
            </PadWord>
            {boost && boost.cells.length > 0 && (
              <Cells data-testid="kart-touch-boost-cells">
                {boost.cells.map((cell, index) => (
                  <Cell key={index} data-cell={cell} $cell={cell} />
                ))}
              </Cells>
            )}
          </Pad>
          <Pad
            data-touch="throttle"
            data-testid="kart-touch-gas"
            $tone="gas"
            $tall
            aria-hidden="true"
          >
            {t('kart.touch.gas')}
          </Pad>
          <Pad data-touch="drift" data-testid="kart-touch-drift" $tone="drift" aria-hidden="true">
            {t('kart.touch.drift')}
          </Pad>
        </Actions>
      </Cluster>
      <Rotate role="note">{t('kart.touch.rotate')}</Rotate>
      {open && (
        <TouchSettingsPanel
          t={t}
          settings={settings}
          onSettings={changeSettings}
          onClose={closeSettings}
        />
      )}
    </Layer>
  )
})

function Arrow({ $flip = false }: { $flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40%"
      height="40%"
      aria-hidden="true"
      focusable="false"
      style={$flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M8 4 L17 12 L8 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7Z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const fadeAway = keyframes`
  to {
    opacity: 0;
    visibility: hidden;
  }
`

// Over the race, under the panels that come after it in the page; only the clusters take touches
const Layer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`

const noSelect = css`
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
`

const Cluster = styled.div<{ $side: 'left' | 'right' }>`
  ${noSelect}
  position: absolute;
  bottom: max(${space.sm}px, env(safe-area-inset-bottom));
  ${({ $side }) =>
    $side === 'left'
      ? css`
          left: max(${space.sm}px, env(safe-area-inset-left));
        `
      : css`
          right: max(${space.sm}px, env(safe-area-inset-right));
        `}
  pointer-events: auto;
`

const SteerRow = styled.div`
  display: flex;
  gap: var(--touch-gap);
`

const Actions = styled.div<{ $mirror: boolean }>`
  display: grid;
  grid-template-columns: repeat(2, var(--touch-size));
  grid-template-rows: var(--touch-small) repeat(3, var(--touch-size));
  grid-template-areas:
    'reset gear'
    'item brake'
    'boost gas'
    'drift gas';
  gap: var(--touch-gap);
  justify-items: center;
  align-items: center;

  /* Left-handed: the gas on the outer edge, on the left */
  ${({ $mirror }) =>
    $mirror &&
    css`
      grid-template-areas:
        'gear reset'
        'brake item'
        'gas boost'
        'gas drift';
    `}

  & > :nth-child(1) {
    grid-area: reset;
  }
  & > :nth-child(2) {
    grid-area: gear;
  }
  & > :nth-child(3) {
    grid-area: item;
  }
  & > :nth-child(4) {
    grid-area: brake;
  }
  & > :nth-child(5) {
    grid-area: boost;
  }
  & > :nth-child(6) {
    grid-area: gas;
  }
  & > :nth-child(7) {
    grid-area: drift;
  }
`

type Tone = 'plain' | 'gas' | 'brake' | 'drift' | 'boost' | 'item'

const toneColour: Record<Tone, string> = {
  plain: color.accent,
  gas: color.success,
  brake: color.danger,
  drift: color.warning,
  boost: color.magenta,
  item: color.accent,
}

const Pad = styled.span<{ $tone: Tone; $steer?: boolean; $tall?: boolean }>`
  ${displayType}
  position: relative;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: ${({ $steer }) => ($steer ? 'var(--touch-steer)' : 'var(--touch-size)')};
  height: ${({ $steer, $tall }) =>
    $steer
      ? 'var(--touch-steer)'
      : $tall
        ? 'calc(2 * var(--touch-size) + var(--touch-gap))'
        : 'var(--touch-size)'};
  border-radius: ${({ $tall }) => ($tall ? '999px' : '50%')};
  border: 2px solid ${({ $tone }) => toneColour[$tone]};
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  opacity: var(--touch-opacity);
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
  line-height: 1;
  text-align: center;

  &[data-pressed='true'] {
    opacity: 1;
    color: ${color.onAccent};
    background: ${({ $tone }) => toneColour[$tone]};
  }

  /* BOOST with nothing to fire, or while the classic feel's one boost burns: dimmed, a press does nothing */
  &[data-boost='empty'],
  &[data-locked] {
    border-style: dashed;
    color: ${color.muted};
    background: color-mix(in srgb, ${color.bg} 85%, transparent);
  }
`

/** The word on a button; while a boost burns BOOST says so, smaller to fit */
const PadWord = styled.span<{ $small: boolean }>`
  font-size: ${({ $small }) => ($small ? 11 : fontSize.sm)}px;
  letter-spacing: ${({ $small }) => ($small ? '0.02em' : 'normal')};
`

/** The burning boost: a ring round BOOST that runs down with it (--boost-left, 0 to 1) */
const BoostRing = styled.i`
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  background: conic-gradient(
    ${color.magenta} calc(var(--boost-left, 0) * 360deg),
    color-mix(in srgb, ${color.magenta} 20%, transparent) 0
  );
  mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
  pointer-events: none;
`

const cellColour: Record<BoostCell, string> = {
  charge: color.magenta,
  red: color.teamRed,
  blue: color.teamBoost,
  empty: 'transparent',
}

/** The charges held, one cell each, under the word */
const Cells = styled.span`
  position: absolute;
  bottom: 18%;
  left: 50%;
  translate: -50% 0;
  display: flex;
  gap: 3px;
`

const Cell = styled.i<{ $cell: BoostCell }>`
  width: 9px;
  height: 6px;
  border-radius: 1px;
  border: 1px solid ${({ $cell }) => ($cell === 'empty' ? color.border : cellColour[$cell])};
  background: ${({ $cell }) => cellColour[$cell]};
`

const Small = styled.span`
  ${displayType}
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--touch-small);
  height: var(--touch-small);
  border-radius: ${radius.card}px;
  border: 1px solid ${color.border};
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  opacity: var(--touch-opacity);
  font-size: 11px;
  text-transform: uppercase;

  &[data-pressed='true'] {
    opacity: 1;
    border-color: ${color.accent};
  }
`

const Gear = styled.button`
  display: grid;
  place-items: center;
  width: var(--touch-small);
  height: var(--touch-small);
  padding: 0;
  border-radius: ${radius.card}px;
  border: 1px solid ${color.border};
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  opacity: max(var(--touch-opacity), 0.7);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 2px;
    opacity: 1;
  }
`

const Slider = styled.span`
  position: relative;
  display: grid;
  place-items: center;
  width: calc(${SLIDER_WIDTH} * var(--touch-size));
  height: var(--touch-steer);
  border-radius: 999px;
  border: 2px solid ${color.accent};
  background: color-mix(in srgb, ${color.bg} 55%, transparent);
  opacity: var(--touch-opacity);
`

const Knob = styled.span`
  width: var(--touch-size);
  height: var(--touch-size);
  border-radius: 50%;
  background: ${color.accent};
`

/** Held upright: a word to turn the phone, which still drives as it is; it fades after a while */
const Rotate = styled.p`
  display: none;
  position: absolute;
  top: 40%;
  left: 50%;
  translate: -50% 0;
  width: max-content;
  max-width: calc(100% - ${2 * space.lg}px);
  margin: 0;
  padding: ${space.xs}px ${space.md}px;
  border-radius: ${radius.component}px;
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 75%, transparent);
  font-size: ${fontSize.sm}px;
  text-align: center;
  animation: ${fadeAway} 0.6s ease-in 6s forwards;

  @media (orientation: portrait) {
    display: block;
  }
`
