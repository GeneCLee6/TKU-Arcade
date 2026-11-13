import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { KART_MESSAGES, type KartMessageKey } from '../../shared/kart/i18n.ts'
import { KART_ACTIONS, type Bindings, type KartAction } from '../../shared/kart/input.ts'
import type { KartRules, KartTuning } from '../../shared/kart/physics.ts'
import { Button } from '../components/Button.tsx'
import { registerMessages, type MessageParams } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import type { Callout } from './callouts.ts'
import { ControlsPanel } from './ControlsPanel.tsx'
import {
  keyLabel,
  loadBindings,
  loadRules,
  loadTuning,
  padLabel,
  saveBindings,
  saveRules,
  saveTuning,
} from './devices.ts'
import { CalloutText, Hud } from './Hud.tsx'
import { supportsWebGL2 } from './Scene.ts'
import { Minimap, type MinimapHandle } from './Minimap.tsx'
import { RaceCenter, RaceClock, type RaceClockHandle } from './RaceOverlay.tsx'
import {
  SPIKE_COURSES,
  spikeTrack,
  startSpikeLoop,
  type SpikeCourse,
  type SpikeHud,
  type SpikeStats,
  type SpikeTrial,
} from './spikeLoop.ts'
import { NARROW_PANEL_TOP, NARROW_TOP } from './layout.ts'
import { TuningPanel } from './TuningPanel.tsx'

registerMessages(KART_MESSAGES)

type Failure = 'noWebgl' | 'contextLost'

const EMPTY_HUD: SpikeHud = {
  speed: 0,
  gauge: 0,
  storedBoosts: 0,
  boosting: false,
  chain: 0,
  hits: 0,
}

/** How long a callout stays up; its animation fades it out by then */
const CALLOUT_MS = 900

type Open = 'controls' | 'tuning' | undefined

/**
 * e8-t01: three.js, a fixed-step loop and a box car, to see whether the stack holds up in a browser.
 * e8-t02a and e8-t12 add the boost gauge, boosts, a gamepad and changeable controls; e8-t02b, e8-t03
 * and e8-t08 add a walled test arena with a reset, the tuning panel, the chase camera and the HUD.
 * Reached only by typing /kart/spike: nothing links here, and the lobby does not know about it.
 */
export function SpikePage() {
  const t: (key: KartMessageKey, params?: MessageParams) => string = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<Failure | undefined>(() =>
    supportsWebGL2() ? undefined : 'noWebgl',
  )
  const [stats, setStats] = useState<SpikeStats>()
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [bindings, setBindings] = useState<Bindings>(loadBindings)
  const [rules, setRules] = useState<KartRules>(loadRules)
  const [tuning, setTuning] = useState<KartTuning>(() => loadTuning().tuning)
  const [open, setOpen] = useState<Open>()
  const controlsOpen = open === 'controls'
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const controlsOpener = useRef<HTMLButtonElement>(null)
  const tuningOpener = useRef<HTMLButtonElement>(null)
  // The loop reads these every frame without restarting. The tuning panel leaves the car drivable:
  // its fields keep their own keys (spikeLoop.ts), and a change is best felt at once.
  const controls = useRef({ bindings, rules, tuning, enabled: !controlsOpen })
  useEffect(() => {
    controls.current = { bindings, rules, tuning, enabled: !controlsOpen }
  }, [bindings, rules, tuning, controlsOpen])
  // e8-t04, e8-t05a: the yard, or a track with its minimap and a time trial (?track=oval|riverside)
  const [course, setCourse] = useState<SpikeCourse>(() => {
    const asked = new URLSearchParams(window.location.search).get('track')
    return SPIKE_COURSES.find((one) => one === asked) ?? 'arena'
  })
  const track = useMemo(() => spikeTrack(course), [course])
  const minimap = useRef<MinimapHandle>(null)
  const clock = useRef<RaceClockHandle>(null)
  const race = useRef<{ restart: () => void } | null>(null)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [showNumbers, setShowNumbers] = useState(() =>
    new URLSearchParams(window.location.search).has('fps'),
  )
  // Read once: this page does not need useMediaQuery, whose chunk the room would then have to share
  const [coarsePointer] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)

  useEffect(() => {
    if (!stage.current) return
    try {
      return startSpikeLoop(stage.current, {
        controls: () => controls.current,
        onStats: setStats,
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure('contextLost'),
        course,
        onPose: (x, z, heading, nextGate) => minimap.current?.place(x, z, heading, nextGate),
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        onReady: (handle) => {
          race.current = handle
        },
      })
    } catch {
      // The probe passed but three.js still could not start
      queueMicrotask(() => setFailure('noWebgl'))
    }
  }, [course])

  const switchCourse = (next: SpikeCourse) => {
    const url = new URL(window.location.href)
    if (next === 'arena') url.searchParams.delete('track')
    else url.searchParams.set('track', next)
    window.history.replaceState(null, '', url)
    setHud(EMPTY_HUD)
    setTrial(undefined)
    setCourse(next)
  }

  // Each callout shows for a moment; a new one replaces it and starts its own moment
  useEffect(() => {
    if (!callout) return
    const timer = window.setTimeout(() => setCallout(undefined), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [callout])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // F typed into the tuning panel's text box is a letter, not the numbers
      if (event.target instanceof HTMLTextAreaElement) return
      if (event.code === 'KeyF' && !event.repeat) setShowNumbers((shown) => !shown)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const changeBindings = useCallback((next: Bindings) => {
    setBindings(next)
    return saveBindings(next)
  }, [])
  const changeRules = useCallback((next: KartRules) => {
    setRules(next)
    return saveRules(next)
  }, [])
  const changeTuning = useCallback((next: KartTuning) => {
    setTuning(next)
    return saveTuning(next)
  }, [])
  const closeControls = useCallback(() => {
    setOpen(undefined)
    // Back where the keyboard was before the panel opened
    queueMicrotask(() => controlsOpener.current?.focus())
  }, [])
  const closeTuning = useCallback(() => {
    setOpen(undefined)
    queueMicrotask(() => tuningOpener.current?.focus())
  }, [])

  /** The first control of an action, for the hint: a key, else a gamepad control */
  const firstControl = (action: KartAction): string => {
    const key = bindings.keys[action].find((code) => code !== null)
    if (key) return keyLabel(key, t)
    const pad = bindings.pad[action].find((control) => control !== null)
    return pad ? padLabel(pad, t) : t('kart.controls.none')
  }
  const hintKeys = Object.fromEntries(KART_ACTIONS.map((action) => [action, firstControl(action)]))

  if (failure) {
    return (
      <Fallback>
        <FallbackTitle>{t('kart.spike.title')}</FallbackTitle>
        <p role="alert">
          {t(failure === 'noWebgl' ? 'kart.spike.noWebgl' : 'kart.spike.contextLost')}
        </p>
        <Link to="/">{t('kart.spike.back')}</Link>
      </Fallback>
    )
  }

  return (
    <Page>
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
      <TopRow>
        <Panel>
          <Link to="/">{t('kart.spike.back')}</Link>
        </Panel>
        <Buttons>
          <Button
            ref={controlsOpener}
            $variant="secondary"
            $size="sm"
            aria-expanded={controlsOpen}
            onClick={() => (controlsOpen ? closeControls() : setOpen('controls'))}
          >
            {t('kart.controls.open')}
          </Button>
          <Button
            ref={tuningOpener}
            $variant="secondary"
            $size="sm"
            aria-expanded={open === 'tuning'}
            onClick={() => (open === 'tuning' ? closeTuning() : setOpen('tuning'))}
          >
            {t('kart.tuning.open')}
          </Button>
          <CourseLabel>
            <span>{t('kart.spike.course')}</span>
            <select
              value={course}
              onChange={(event) => switchCourse(event.target.value as SpikeCourse)}
              data-testid="kart-course"
            >
              {SPIKE_COURSES.map((one) => (
                <option key={one} value={one}>
                  {t(`kart.course.${one}`)}
                </option>
              ))}
            </select>
          </CourseLabel>
          <Button $variant="secondary" $size="sm" onClick={() => setShowNumbers((shown) => !shown)}>
            {t(showNumbers ? 'kart.spike.hideNumbers' : 'kart.spike.showNumbers')}
          </Button>
        </Buttons>
      </TopRow>
      {showNumbers && stats && (
        <Numbers data-testid="kart-numbers">
          <dt>{t('kart.spike.fps')}</dt>
          <dd data-testid="kart-fps">{Math.round(stats.fps)}</dd>
          <dt>{t('kart.spike.slowest')}</dt>
          <dd>{t('kart.spike.ms', { ms: Math.round(stats.slowestMs) })}</dd>
          <dt>{t('kart.spike.speed')}</dt>
          <dd>{t('kart.spike.metresPerSecond', { speed: Math.round(stats.speed) })}</dd>
          <dt>{t('kart.spike.slip')}</dt>
          <dd>{t('kart.spike.degrees', { degrees: Math.round(stats.slipDegrees) || 0 })}</dd>
          <dt>{t('kart.spike.drift')}</dt>
          <dd>{t(stats.drifting ? 'kart.spike.yes' : 'kart.spike.no')}</dd>
          <dt>{t('kart.spike.resolution')}</dt>
          <dd>{stats.drawingBuffer}</dd>
          <dt>{t('kart.spike.renderer')}</dt>
          <dd>{stats.rendererName}</dd>
          <dt>{t('kart.spike.gamepad')}</dt>
          <dd data-testid="kart-gamepad">{stats.gamepad ?? t('kart.spike.noGamepad')}</dd>
        </Numbers>
      )}
      {hud.hits > 0 && (
        <WallFlash key={hud.hits} aria-hidden="true" data-testid="kart-wall-flash" />
      )}
      {callout && <CalloutText key={callout.id} t={t} callout={callout.callout} />}
      {track && (
        <MapCorner>
          {trial && <RaceClock ref={clock} t={t} trial={trial} />}
          <Minimap ref={minimap} t={t} road={track.road} gates={track.gates} />
        </MapCorner>
      )}
      {track && trial && (
        <RaceCenter t={t} trial={trial} onRestart={() => race.current?.restart()} />
      )}
      <Bottom>
        <Hud t={t} hud={hud} maxStored={tuning.maxStoredBoosts} />
        <Hint>
          <HintTitle>{t('kart.spike.title')}</HintTitle>
          {coarsePointer ? t('kart.spike.noTouch') : t('kart.spike.keys', hintKeys)}
        </Hint>
      </Bottom>
      {open === 'tuning' && (
        <TuningPanel t={t} tuning={tuning} onTuning={changeTuning} onClose={closeTuning} />
      )}
      {controlsOpen && (
        <ControlsPanel
          t={t}
          bindings={bindings}
          rules={rules}
          onBindings={changeBindings}
          onRules={changeRules}
          onClose={closeControls}
        />
      )}
    </Page>
  )
}

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow: hidden;
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
`

const flash = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`

/** A red edge round the screen for a moment after a crash: a fade, not motion */
const WallFlash = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 64px ${color.danger};
  opacity: 0;
  animation: ${flash} 0.5s ease-out;
`

const Panel = styled.div`
  padding: ${space.sm}px ${space.md}px;
  border-radius: ${radius.component}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const TopRow = styled.div`
  position: absolute;
  top: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${space.sm}px;

  a {
    white-space: nowrap;
  }
`

const Numbers = styled(Panel).attrs({ as: 'dl' })`
  position: absolute;
  top: 64px;
  left: ${space.sm}px;

  @media ${NARROW_TOP} {
    top: ${NARROW_PANEL_TOP}px;
  }
  max-width: calc(100% - ${2 * space.sm}px);
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0 ${space.md}px;

  dt {
    color: ${color.muted};
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${space.sm}px;
`

// Under the top row, on the right: where the eye goes for the course, away from the HUD
const MapCorner = styled.div`
  position: absolute;
  top: 64px;
  right: ${space.sm}px;
  display: grid;
  justify-items: end;
  gap: ${space.xs}px;
  pointer-events: none;
`

const CourseLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  min-height: 32px;
  padding: 0 ${space.sm}px;
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 55%, transparent);
  font-size: ${fontSize.sm}px;
  font-weight: 700;

  & > select {
    min-height: 28px;
    color: ${color.text};
    background: ${color.sunken};
    border: 1px solid ${color.border};
    font: inherit;
  }
`

const Bottom = styled.div`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
  display: grid;
  gap: ${space.sm}px;
`

const Hint = styled(Panel)``

const HintTitle = styled.h1`
  margin: 0;
  font-size: ${fontSize.sm}px;
`

const Fallback = styled.main`
  display: grid;
  gap: ${space.md}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;

  p {
    margin: 0;
  }
`

const FallbackTitle = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`
