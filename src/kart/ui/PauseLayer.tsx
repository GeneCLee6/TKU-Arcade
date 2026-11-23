// 2026-11-22 (owner: "against the computer, Esc pauses and opens the main menu: back to the lobby or
// other settings"; docs/ARCHITECTURE.md §4.73): the menu over a race. Esc, Start on a gamepad or the
// button on the screen opens it. A race with no one else in it (the time trial, against the computer,
// a Grand Prix, the school, a challenge) stops while it is open: the race clock (race/raceClock.ts)
// stands still, the music drops and the effects fall silent (audio/bus.ts). A room's race does not
// stop for anyone: the menu says so, and the kart only stops taking the keys while it is open.
//
// Its parts: resume, restart, the settings (SettingsPanel), back to /kart's menu, back to the lobby;
// in a room only the settings and leaving the room. Whatever the page leaves out is not shown.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { Button } from '../../components/Button.tsx'
import { displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { duckKartBus } from '../audio/bus.ts'
import { loadBindings, loadRules, saveBindings, saveRules } from '../devices.ts'
import { pauseRace, resumeRace } from '../race/raceClock.ts'
import { exitFullscreen, useFullscreenMode } from '../../lib/fullscreen.ts'
import { broadcastSolid, ticker } from './broadcast.ts'
import type { Bindings } from '../../../shared/kart/input.ts'
import type { KartRules } from '../../../shared/kart/physics.ts'

// 2026-11-23 (docs/KART-PERF.md §11): the settings and the keys, only once asked for (menuPanels.ts)
const SettingsPanel = lazy(() => import('./menuPanels.ts').then((m) => ({ default: m.SettingsPanel })))
const ControlsPanel = lazy(() => import('./menuPanels.ts').then((m) => ({ default: m.ControlsPanel })))

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** A gamepad's Start (the standard mapping's button 9): no driving action is on it */
export const START_BUTTON = 9

/**
 * 2026-11-23 (#152): what a page's own pause button (`PauseButton`) sends: the menu opens as with
 * Esc, wherever on the page the button sits (the school's, a challenge's, the time trial's rows)
 */
const OPEN_EVENT = 'kart-pause-open'

/** Opens the pause menu on this page, as Esc would (nothing while it is not taking the keys) */
function openKartPause(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * A pause button for a page's own row of buttons (2026-11-23, #152): one a finger can press on a
 * phone, opening the same menu as Esc and Start
 */
export function PauseButton({ t }: { readonly t: KartT }) {
  return (
    <Button
      type="button"
      $size="sm"
      $variant="secondary"
      onClick={openKartPause}
      title={t('kart.flow.pause.open')}
      data-kart-menu=""
      data-testid="kart-pause-button"
    >
      <RowIcon aria-hidden="true" />
      {t('kart.flow.pause.button')}
    </Button>
  )
}

export interface PauseLayerProps {
  readonly t: KartT
  /** True: the race stops while the menu is open; false: a room's race, which goes on */
  readonly canPause: boolean
  /** False while something else on the page has the keys (another panel open) */
  readonly enabled?: boolean
  readonly onRestart?: () => void
  /** Back to /kart's menu */
  readonly onKartMenu?: () => void
  /** Back to the lobby; by default the lobby's address */
  readonly onLobby?: () => void
  /** A room: leave it */
  readonly onLeave?: () => void
  /** The menu opened or closed (a race stops taking the keys while it is open) */
  readonly onOpenChange?: (open: boolean) => void
  /** The keys or the gamepad changed in the controls (a race reads them at once) */
  readonly onControls?: (controls: { bindings: Bindings; rules: KartRules }) => void
  /** Where the button sits: over the race at the top, by default beside the place */
  readonly corner?: 'place' | 'right'
  /** False: no button on the screen (a page with a menu of its own: Esc and Start only) */
  readonly button?: boolean
  /** Something to show above the menu's buttons */
  readonly children?: ReactNode
}

type Showing = 'menu' | 'settings' | 'controls' | null

export function PauseLayer({
  t,
  canPause,
  enabled = true,
  onRestart,
  onKartMenu,
  onLobby,
  onLeave,
  onOpenChange,
  onControls,
  corner = 'place',
  button = true,
  children,
}: PauseLayerProps) {
  const [showing, setShowing] = useState<Showing>(null)
  const showingRef = useRef<Showing>(null)
  const firstButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [controls, setControls] = useState(() => ({ bindings: loadBindings(), rules: loadRules() }))
  const open = showing !== null
  // 2026-11-22 (#148): full screen (or its focus mode) is left from here too
  const fullscreen = useFullscreenMode()
  const changeRef = useRef(onOpenChange)
  useEffect(() => {
    changeRef.current = onOpenChange
  })

  const show = useCallback((next: Showing) => {
    showingRef.current = next
    setShowing(next)
  }, [])

  // The race stops (or only the keys do) while the menu is open, and goes on when it closes or the
  // page goes; the music comes back up
  useEffect(() => {
    changeRef.current?.(open)
    if (!open) return
    if (canPause) pauseRace()
    duckKartBus(true)
    return () => {
      if (canPause) resumeRace()
      duckKartBus(false)
    }
  }, [open, canPause])

  useEffect(() => {
    if (showing === 'menu') firstButton.current?.focus()
  }, [showing])

  const toggle = useCallback(() => {
    const now = showingRef.current
    if (now === null) show('menu')
    else if (now === 'settings') show('menu')
    else if (now === 'menu') {
      show(null)
      opener.current?.focus()
    }
    // The controls panel closes itself on Escape
  }, [show])

  // Esc, and a gamepad's Start
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') return
      event.preventDefault()
      toggle()
    }
    let frame = 0
    let held = false
    const poll = () => {
      frame = requestAnimationFrame(poll)
      let pressed = false
      try {
        for (const pad of navigator.getGamepads?.() ?? []) {
          if (pad?.connected && (pad.buttons[START_BUTTON]?.pressed ?? false)) pressed = true
        }
      } catch {
        // Blocked by a permissions policy: no gamepad
      }
      if (pressed && !held) toggle()
      held = pressed
    }
    // 2026-11-23: a page's own pause button (openKartPause)
    const onOpen = () => {
      if (showingRef.current === null) show('menu')
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_EVENT, onOpen)
    frame = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_EVENT, onOpen)
      cancelAnimationFrame(frame)
    }
  }, [enabled, toggle, show])

  const close = () => {
    show(null)
    opener.current?.focus()
  }
  const leaveWith = (action: () => void) => () => {
    show(null)
    action()
  }
  const lobby = onLobby ?? (() => window.location.assign('/'))

  return (
    <>
      {button && (
        <OpenButton
          ref={opener}
          type="button"
          $corner={corner}
          onClick={() => show('menu')}
          aria-label={t(canPause ? 'kart.flow.pause.open' : 'kart.flow.pause.openMenu')}
          aria-expanded={open}
          data-kart-menu=""
          data-testid="kart-pause-open"
        >
          <PauseIcon aria-hidden="true" />
        </OpenButton>
      )}
      {open && (
        <Veil data-kart-menu="" data-testid="kart-pause" data-paused={canPause || undefined}>
          <Card role="dialog" aria-modal="true" aria-labelledby="kart-pause-title">
            <Title id="kart-pause-title">
              {showing === 'settings' || showing === 'controls'
                ? t('kart.flow.settings.title')
                : t(canPause ? 'kart.flow.pause.title' : 'kart.flow.pause.menuTitle')}
            </Title>
            {!canPause && (
              <Live role="status" data-testid="kart-pause-live">
                {t('kart.flow.pause.live')}
              </Live>
            )}
            {children}
            {showing === 'menu' && (
              <Actions>
                <Button ref={firstButton} type="button" onClick={close} data-testid="kart-pause-resume">
                  {t(canPause ? 'kart.flow.pause.resume' : 'kart.flow.pause.back')}
                </Button>
                {canPause && onRestart && (
                  <Button type="button" $variant="secondary" onClick={leaveWith(onRestart)} data-testid="kart-pause-restart">
                    {t('kart.flow.pause.restart')}
                  </Button>
                )}
                <Button type="button" $variant="secondary" onClick={() => show('settings')} data-testid="kart-pause-settings">
                  {t('kart.flow.pause.settings')}
                </Button>
                {onKartMenu && (
                  <Button type="button" $variant="secondary" onClick={leaveWith(onKartMenu)} data-testid="kart-pause-menu">
                    {t('kart.flow.pause.kartMenu')}
                  </Button>
                )}
                {onLeave ? (
                  <Button type="button" $variant="danger" onClick={leaveWith(onLeave)} data-testid="kart-pause-leave">
                    {t('kart.flow.pause.leave')}
                  </Button>
                ) : (
                  <Button type="button" $variant="secondary" onClick={leaveWith(lobby)} data-testid="kart-pause-lobby">
                    {t('kart.flow.pause.lobby')}
                  </Button>
                )}
                {fullscreen !== 'off' && (
                  <Button type="button" $variant="ghost" onClick={exitFullscreen} data-testid="kart-pause-exit-fullscreen">
                    {t('kart.flow.pause.exitFullscreen')}
                  </Button>
                )}
                <Hint>{t('kart.flow.pause.hint')}</Hint>
              </Actions>
            )}
            {showing === 'settings' && (
              <>
                <Scroll>
                  <Suspense>
                    <SettingsPanel t={t} onControls={() => show('controls')} />
                  </Suspense>
                </Scroll>
                <div>
                  <Button type="button" onClick={() => show('menu')} data-testid="kart-settings-done">
                    {t('kart.flow.settings.close')}
                  </Button>
                </div>
              </>
            )}
          </Card>
          {showing === 'controls' && (
            <Suspense>
              <ControlsPanel
                t={t}
                bindings={controls.bindings}
                rules={controls.rules}
                onBindings={(bindings) => {
                  const next = { ...controls, bindings }
                  setControls(next)
                  onControls?.(next)
                  return saveBindings(bindings)
                }}
                onRules={(rules) => {
                  const next = { ...controls, rules }
                  setControls(next)
                  onControls?.(next)
                  return saveRules(rules)
                }}
                onClose={() => show('settings')}
              />
            </Suspense>
          )}
        </Veil>
      )}
    </>
  )
}

const OpenButton = styled.button<{ $corner: 'place' | 'right' }>`
  ${broadcastSolid}
  position: fixed;
  top: ${space.sm}px;
  ${({ $corner }) =>
    $corner === 'place'
      ? css`
          left: ${space.sm + 104}px;
        `
      : css`
          right: ${space.sm}px;
        `}
  z-index: 22;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: ${color.text};
  border: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 2px;
  }
`

// Two bars: the sign for pause, drawn, not a character
const PauseIcon = styled.span`
  display: block;
  width: 14px;
  height: 16px;
  background:
    linear-gradient(${color.text}, ${color.text}) 0 0 / 5px 100% no-repeat,
    linear-gradient(${color.text}, ${color.text}) 100% 0 / 5px 100% no-repeat;
`

/** The pause sign again, smaller, before the row button's word */
const RowIcon = styled(PauseIcon)`
  width: 10px;
  height: 12px;
  margin-right: ${space.xs}px;
  background:
    linear-gradient(currentColor, currentColor) 0 0 / 3px 100% no-repeat,
    linear-gradient(currentColor, currentColor) 100% 0 / 3px 100% no-repeat;
`

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const rise = keyframes`
  from { opacity: 0; transform: translateY(12px) skewX(-4deg); }
  to { opacity: 1; transform: none; }
`

const Veil = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: ${space.md}px;
  overflow-y: auto;
  background: color-mix(in srgb, ${color.bg} 62%, transparent);
  -webkit-backdrop-filter: blur(6px) saturate(0.7);
  backdrop-filter: blur(6px) saturate(0.7);
  animation: ${fadeIn} 0.18s ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Card = styled.section`
  ${broadcastSolid}
  display: grid;
  gap: ${space.md}px;
  width: min(440px, 100%);
  max-height: calc(100dvh - ${2 * space.md}px);
  padding: ${space.lg}px;
  animation: ${rise} 0.22s ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Title = styled.h2`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const Live = styled.p`
  ${ticker(color.danger, 6)}
  justify-self: start;
  margin: 0;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Actions = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

const Hint = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  text-align: center;
`

const Scroll = styled.div`
  min-height: 0;
  overflow-y: auto;
`
