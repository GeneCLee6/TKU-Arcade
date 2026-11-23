import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { setSoundOn, useSoundOn } from '../lib/sound.ts'
import { loadQuality, QUALITIES, saveQuality, type Quality } from './quality.ts'
import { KART_BODIES, loadBody, loadDriver, saveBody, saveDriver, type KartBody } from './bodies.ts'
import { applyKart, type DriverId } from '../../shared/kart/karts.ts'
import { trackMeta } from '../../shared/kart/meta.ts'
import styled, { css, keyframes } from 'styled-components'
import { KART_MESSAGES, type KartMessageKey } from '../../shared/kart/i18n.ts'
import { KART_ACTIONS, type Bindings, type KartAction } from '../../shared/kart/input.ts'
import type { KartRules, KartTuning } from '../../shared/kart/physics.ts'
import { Button } from '../components/Button.tsx'
import { registerMessages, type MessageParams } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import type { Callout } from './callouts.ts'
import {
  keyLabel,
  loadBindings,
  loadRules,
  loadTuning,
  padLabel,
  saveBindings,
  saveRules,
  saveTuning,
  useKeyLayout,
} from './devices.ts'
import { BoostVeil, CalloutText, Hud } from './Hud.tsx'
import { supportsWebGL2 } from './webgl.ts'
import { Minimap, type MinimapHandle } from './Minimap.tsx'
import { RaceCenter, RaceClock, type RaceClockHandle } from './RaceOverlay.tsx'
import type { BoardRunDone, SpikeHud, SpikeStats, SpikeTrial } from './spikeLoop.ts'
import type { BoardChase } from './board/chase.ts'
import { formatTime } from '../../shared/kart/timeTrial.ts'
import { SPIKE_COURSES, spikeTrack, type SpikeCourse } from './courses.ts'
import { RACE_ENGINE } from './load/kartLoad.ts'
import { KartLoading } from './load/KartLoading.tsx'
import { useKartLoad } from './load/useKartLoad.ts'
import { KART_COMPACT } from './layout.ts'
import type { BotSetup } from './bots/setup.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import type { Track } from '../../shared/kart/track.ts'
import { codeInAddress } from './editor/link.ts'
import { createAutopilot } from './race/autopilot.ts'
import type { CupRun } from './cup/cupRun.ts'
import { GhostPicker } from './GhostPicker.tsx'
import { loadGhostPick, saveGhostPick, type GhostPick } from './records.ts'
import { TouchControls } from './touch/TouchControls.tsx'
import { useTouchControls } from './touch/useTouchControls.ts'
import { touchBottom, touchCorner, touchSpace } from './touch/touchLayout.ts'
import { broadcastSolid } from './ui/broadcast.ts'
import { PauseLayer } from './ui/PauseLayer.tsx'
import { CoachTip } from './school/CoachTip.tsx'
import { useCoach } from './school/useCoach.ts'
import { answerInvite, shouldInvite } from './school/store.ts'

// 2026-11-22: full screen (src/lib/fullscreen.ts), its button a small chunk of its own
const FullscreenButton = lazy(() => import('../components/FullscreenButton.tsx'))
// 2026-11-23 (docs/KART-PERF.md §11): the menu's panels, fetched when the first of them is opened (a
// moment on a phone) rather than with the page, all in one chunk (menuPanels.ts)
const GaragePanel = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.GaragePanel })))
const ControlsPanel = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.ControlsPanel })))
const TuningPanel = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.TuningPanel })))
const BotSetupPanel = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.BotSetupPanel })))
const CupSetupPanel = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.CupSetupPanel })))
const SettingsDialog = lazy(() => import('./ui/menuPanels.ts').then((m) => ({ default: m.SettingsDialog })))
// 2026-11-23 (§4.81): the leaderboard's upload card, loaded once a board run has finished
const BoardUpload = lazy(() => import('./board/BoardUpload.tsx'))

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

/** What the garage panel has picked, applied when it closes */
interface GaragePick {
  body?: KartBody
  driver?: DriverId
}

type Open = 'controls' | 'tuning' | 'garage' | 'bots' | 'cup' | 'settings' | undefined

/** What /kart drives on: a course, or the track made in the editor that its link brought (e10-t07) */
type PlayCourse = SpikeCourse | 'custom'

/** A track from the editor in the address: built and checked, or `bad` for a link that is none */
type Linked = { readonly code: string; readonly track: Track; readonly name: string } | 'bad' | null

function linkedTrack(): Linked {
  const code = codeInAddress()
  if (code === null) return null
  const result = customTrack(code)
  return result.ok ? { code, track: result.track, name: result.spec.name } : 'bad'
}

/**
 * e8-t01: three.js, a fixed-step loop and a box car, to see whether the stack holds up in a browser.
 * e8-t02a and e8-t12 add the boost gauge, boosts, a gamepad and changeable controls; e8-t02b, e8-t03
 * and e8-t08 add a walled test arena with a reset, the tuning panel, the chase camera and the HUD.
 * Reached only by typing /kart/spike: nothing links here, and the lobby does not know about it.
 */
/**
 * `play`: the kart page itself (/kart, e8-t14): a time trial on a track, without the test yard,
 * the tuning panel or the numbers, which stay on /kart/spike for tuning
 */
export function SpikePage({
  play = false,
  openBots = false,
  onBotRace,
  onCup,
  onSchool,
  onChallenge,
  onBoard,
  onOnline,
  chase = null,
  onStopChase,
}: {
  play?: boolean
  /** 2026-11-21: open on the race against the computer's panel (/kart?bots, from the lobby) */
  openBots?: boolean
  /** 2026-11-17: /kart's menu starts a race against the computer with these settings */
  onBotRace?: (setup: BotSetup) => void
  /** 2026-11-17: /kart's menu starts or continues a Grand Prix (src/kart/cup/) */
  onCup?: (run: CupRun) => void
  /** 2026-11-20 (§4.50): /kart's menu opens the driving school (src/kart/school/) */
  onSchool?: () => void
  /** 2026-11-21 (§4.60): /kart's menu opens the challenge mode (src/kart/challenge/) */
  onChallenge?: () => void
  /**
   * 2026-11-23 (§4.81): /kart's menu opens the leaderboard (src/kart/board/), on a track or the
   * week's; a time trial's results then offer to upload the run
   */
  onBoard?: (track?: string) => void
  /** 2026-11-23 (§4.83): /kart's menu opens the online races (src/kart/online/) */
  onOnline?: () => void
  /** 2026-11-23: a board row's ghost races along on its track, instead of this browser's own */
  chase?: BoardChase | null
  onStopChase?: () => void
} = {}) {
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
  const [open, setOpen] = useState<Open>(() => (openBots && onBotRace ? 'bots' : undefined))
  const controlsOpen = open === 'controls'
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const controlsOpener = useRef<HTMLButtonElement>(null)
  const tuningOpener = useRef<HTMLButtonElement>(null)
  const garageOpener = useRef<HTMLButtonElement>(null)
  const botsOpener = useRef<HTMLButtonElement>(null)
  // 2026-11-17: which ghost races along in the time trial
  const [ghostPick, setGhostPick] = useState<GhostPick>(loadGhostPick)
  // The loop reads these every frame without restarting. The tuning panel leaves the car drivable:
  // its fields keep their own keys (spikeLoop.ts), and a change is best felt at once.
  // e10-t05: the kart and driver to race with; the kart's numbers go on top of the tuning
  const [body, setBody] = useState<KartBody>(loadBody)
  const [driver, setDriver] = useState<DriverId>(loadDriver)
  const driven = useMemo(() => applyKart(tuning, body), [tuning, body])
  const controls = useRef({ bindings, rules, tuning: driven, enabled: !controlsOpen })
  useEffect(() => {
    controls.current = { bindings, rules, tuning: driven, enabled: !controlsOpen }
  }, [bindings, rules, driven, controlsOpen])
  // e8-t04, e8-t05a: the yard, or a track with its minimap and a time trial (?track=oval|riverside|harbour)
  const courses = play ? SPIKE_COURSES.filter((one) => one !== 'arena') : SPIKE_COURSES
  const soundOn = useSoundOn()
  // e10-t07: a shared track's link (?custom=<code>) opens on that track
  const [linked] = useState<Linked>(linkedTrack)
  const custom = linked !== null && linked !== 'bad' ? linked : null
  const customName = custom ? custom.name || t('kart.editor.untitled') : ''
  const [course, setCourse] = useState<PlayCourse>(() => {
    if (custom) return 'custom'
    const asked = new URLSearchParams(window.location.search).get('track')
    return courses.find((one) => one === asked) ?? (play ? 'riverside' : 'arena')
  })
  const courseMeta = course === 'custom' ? null : trackMeta(course)
  const track = useMemo(
    () => (course === 'custom' ? (custom?.track ?? null) : spikeTrack(course)),
    [course, custom],
  )
  // Testing: the time trial drives itself (the browser tests)
  const [autopiloted] = useState(() => new URLSearchParams(window.location.search).has('autopilot'))
  // 2026-11-18: `?autopilot=expert` (or average, or novice) shows one of the drivers `npm run
  // kart:feel` measures with (bots/drivers.ts), to watch how each one's lap goes
  // (2026-11-23, docs/KART-PERF.md §11: the drivers bring the computer's brain, fetched only then)
  const [asked] = useState(() => new URLSearchParams(window.location.search).get('autopilot') || null)
  const [drivers, setDrivers] = useState<typeof import('./bots/drivers.ts') | null>(null)
  useEffect(() => {
    if (asked) void import('./bots/drivers.ts').then(setDrivers)
  }, [asked])
  const pilot = drivers?.DRIVER_IDS.find((id) => id === asked)
  const minimap = useRef<MinimapHandle>(null)
  const clock = useRef<RaceClockHandle>(null)
  const race = useRef<{ restart: () => void } | null>(null)
  const [trial, setTrial] = useState<SpikeTrial>()
  // 2026-11-23 (§4.81): the last run recorded for the leaderboard, offered at its results
  const [boardRun, setBoardRun] = useState<BoardRunDone | null>(null)
  const chasing = chase && chase.track === course ? chase : null
  const chaseGhost = chasing?.ghost
  // Whether /kart offers the board: a flag, so that a new handler each render does not restart the race
  const hasBoard = !!onBoard
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [showNumbers, setShowNumbers] = useState(() =>
    new URLSearchParams(window.location.search).has('fps'),
  )
  // 2026-11-17: buttons on the screen for a phone, shown on a coarse pointer or the first touch
  const touch = useTouchControls()
  const touchSource = touch.source
  // On a small screen the controls fold into a menu, and the long how-to-drive text starts folded
  const [menuOpen, setMenuOpen] = useState(false)
  // The hints' key names follow the keyboard's layout once the browser has said it
  useKeyLayout()
  const menuButton = useRef<HTMLButtonElement>(null)
  const topRow = useRef<HTMLDivElement>(null)
  const menuId = useId()
  // 2026-11-17: folded on every screen, so that nothing covers the kart and what it leaves behind
  const [helpOpen, setHelpOpen] = useState(false)
  // 2026-11-20 (§4.50): a tip for a technique not yet used, and, the first time here, the school
  const coach = useCoach()
  const coachStep = coach.onStep
  const [invite, setInvite] = useState(() => !!onSchool && !autopiloted && shouldInvite())

  // 2026-11-21 (docs/ARCHITECTURE.md §4.52): the engine, the track's own scenery, the kart and the
  // song, fetched before the scene is built (the page itself comes without three.js)
  const load = useKartLoad(
    { engine: RACE_ENGINE, track, bodies: [body], music: true },
    `${course}|${track?.id}|${body}`,
  )
  const engine = load.engine

  useEffect(() => {
    if (!stage.current || !engine) return
    if (asked && !drivers) return
    try {
      return engine.startSpikeLoop(stage.current, {
        controls: () => controls.current,
        onStats: setStats,
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure('contextLost'),
        ...(course === 'custom' ? { track: track ?? undefined } : { course }),
        ...(autopiloted && track
          ? {
              autopilot: pilot && drivers
                ? drivers.createDriver(drivers.DRIVERS[pilot], track, controls.current.tuning, 7)
                : createAutopilot(track, controls.current.tuning),
            }
          : {}),
        quality,
        body,
        driver,
        ghostPick,
        onPose: (x, z, heading, nextGate, tick) => minimap.current?.place(x, z, heading, nextGate, tick),
        onTrial: (next) => {
          // A run's upload card goes with its results: a new countdown leaves it behind
          if (next.phase === 'countdown') setBoardRun(null)
          setTrial(next)
        },
        onClock: (total, lap) => clock.current?.set(total, lap),
        onReady: (handle) => {
          race.current = handle
        },
        touch: touchSource,
        ...(autopiloted ? {} : { onStep: (step) => coachStep(step, controls.current.tuning) }),
        // The built-in race tracks have a board (not the test oval, not a shared custom track)
        ...(hasBoard && course !== 'custom' && course !== 'oval' && course !== 'arena'
          ? { onBoardRun: setBoardRun }
          : {}),
        ...(chaseGhost ? { ghost: chaseGhost } : {}),
      })
    } catch {
      // The probe passed but three.js still could not start
      queueMicrotask(() => setFailure('noWebgl'))
    }
  }, [course, track, autopiloted, asked, drivers, pilot, quality, body, driver, ghostPick, touchSource, coachStep, engine, hasBoard, chaseGhost])

  const switchCourse = (next: PlayCourse) => {
    const url = new URL(window.location.href)
    if (next === 'arena' || next === 'custom') url.searchParams.delete('track')
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

  // The menu closes on Escape and on a press anywhere outside the top row
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButton.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !topRow.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])
  /** Opens a panel; the menu, if that is where the button was, closes */
  const openPanel = (panel: Open) => {
    setMenuOpen(false)
    setOpen(panel)
  }

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
  /** Back to the button that opened a panel, or to the menu button when the menu holds it */
  const focusOpener = (opener: HTMLButtonElement | null) => {
    if (opener && opener.offsetParent !== null) opener.focus()
    else menuButton.current?.focus()
  }
  const closeControls = useCallback(() => {
    setOpen(undefined)
    // Back where the keyboard was before the panel opened
    queueMicrotask(() => focusOpener(controlsOpener.current))
  }, [])
  const closeTuning = useCallback(() => {
    setOpen(undefined)
    queueMicrotask(() => focusOpener(tuningOpener.current))
  }, [])
  // A pick in the garage waits for the panel to close: a new kart or driver restarts the race, and
  // the countdown should not run behind the open panel (PR #86's known limit)
  const [garagePick, setGaragePick] = useState<GaragePick>({})
  const pending = useRef<GaragePick>({})
  const racing = useRef({ body, driver })
  useEffect(() => {
    racing.current = { body, driver }
  }, [body, driver])
  const closeGarage = useCallback(() => {
    setOpen(undefined)
    const pick = pending.current
    pending.current = {}
    setGaragePick({})
    const now = racing.current
    const nextBody = pick.body ?? now.body
    const nextDriver = pick.driver ?? now.driver
    if (nextBody !== now.body || nextDriver !== now.driver) {
      setTrial(undefined)
      setBody(nextBody)
      setDriver(nextDriver)
    }
    queueMicrotask(() => focusOpener(garageOpener.current))
  }, [])
  const closeBots = useCallback(() => {
    setOpen(undefined)
    queueMicrotask(() => focusOpener(botsOpener.current))
  }, [])
  // The Grand Prix opens from the race against the computer's panel, and goes back to its button
  const closeCup = useCallback(() => {
    setOpen(undefined)
    queueMicrotask(() => focusOpener(botsOpener.current))
  }, [])
  const pickBody = (next: KartBody) => {
    saveBody(next)
    setTrial(undefined)
    setBody(next)
  }
  const pickGarageBody = (next: KartBody) => {
    saveBody(next)
    pending.current = { ...pending.current, body: next }
    setGaragePick(pending.current)
  }
  const pickGarageDriver = (next: DriverId) => {
    saveDriver(next)
    pending.current = { ...pending.current, driver: next }
    setGaragePick(pending.current)
  }

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
    <Page style={touch.shown ? touchSpace(touch.settings) : undefined}>
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
      {!engine && (
        <KartLoading
          t={t}
          track={course === 'custom' ? customName : t(`kart.course.${course}`)}
          progress={load.progress}
          failed={load.failed}
          onRetry={load.retry}
          bindings={bindings}
          touch={touch.shown}
        />
      )}
      <TopRow ref={topRow}>
        <Panel>
          <Link to="/">{t('kart.spike.back')}</Link>
          {play && (
            <>
              {' · '}
              <Link
                to={custom ? `/kart/editor?custom=${custom.code}` : '/kart/editor'}
                data-testid="kart-editor-link"
              >
                {t(custom ? 'kart.editor.editCopy' : 'kart.editor.open')}
              </Link>
              {' · '}
              <Link to="/kart/replay" data-testid="kart-replay-file-link">
                {t('kart.spike.replayFile')}
              </Link>
              {onOnline && (
                <>
                  {' · '}
                  {/* 2026-11-23 (§4.83): here rather than in the row of buttons, which a wide screen
                      must keep on one line (the garage's close button sits under it) */}
                  <OnlineLink
                    to="/kart?online"
                    onClick={(event) => {
                      event.preventDefault()
                      onOnline()
                    }}
                    data-testid="kart-online-open"
                  >
                    {t('kart.online.open')}
                  </OnlineLink>
                </>
              )}
            </>
          )}
          {linked === 'bad' && (
            <BadLink role="alert" data-testid="kart-bad-link">
              {t('kart.editor.badLink')}
            </BadLink>
          )}
        </Panel>
        <MenuButton
          ref={menuButton}
          $variant="primary"
          $size="sm"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((shown) => !shown)}
          data-testid="kart-menu"
        >
          {t('kart.spike.menu')}
        </MenuButton>
        <Buttons id={menuId} $open={menuOpen}>
          {onSchool && (
            <Button
              $size="sm"
              onClick={() => {
                answerInvite()
                onSchool()
              }}
              data-testid="kart-school-open"
            >
              {t('kart.school.open')}
            </Button>
          )}
          {onChallenge && (
            <Button $size="sm" onClick={onChallenge} data-testid="kart-challenge-open">
              {t('kart.challenge.open')}
            </Button>
          )}
          {onBoard && (
            <Button
              $size="sm"
              onClick={() => onBoard(course === 'custom' ? undefined : course)}
              data-testid="kart-board-open"
            >
              {t('kart.board.open')}
            </Button>
          )}
          {onBotRace && (
            <Button
              ref={botsOpener}
              $size="sm"
              aria-expanded={open === 'bots'}
              onClick={() => (open === 'bots' ? closeBots() : openPanel('bots'))}
              data-testid="kart-bots-open"
            >
              {t('kart.bots.open')}
            </Button>
          )}
          <Button
            ref={controlsOpener}
            $variant="secondary"
            $size="sm"
            aria-expanded={controlsOpen}
            onClick={() => (controlsOpen ? closeControls() : openPanel('controls'))}
          >
            {t('kart.controls.open')}
          </Button>
          {!play && (
            <Button
              ref={tuningOpener}
              $variant="secondary"
              $size="sm"
              aria-expanded={open === 'tuning'}
              onClick={() => (open === 'tuning' ? closeTuning() : openPanel('tuning'))}
            >
              {t('kart.tuning.open')}
            </Button>
          )}
          {play && (
            <Button
              $variant="secondary"
              $size="sm"
              aria-expanded={open === 'settings'}
              onClick={() => (open === 'settings' ? setOpen(undefined) : openPanel('settings'))}
              data-testid="kart-settings-open"
            >
              {t('kart.flow.settings.title')}
            </Button>
          )}
          <Button
            ref={garageOpener}
            $variant="secondary"
            $size="sm"
            aria-expanded={open === 'garage'}
            onClick={() => (open === 'garage' ? closeGarage() : openPanel('garage'))}
            data-testid="kart-garage-open"
          >
            {t('kart.roster.open')}
          </Button>
          <Button
            $variant="secondary"
            $size="sm"
            aria-pressed={soundOn}
            onClick={() => setSoundOn(!soundOn)}
            data-testid="kart-sound"
          >
            {t(soundOn ? 'kart.spike.soundOn' : 'kart.spike.soundOff')}
          </Button>
          <CourseLabel>
            <span>{t('kart.spike.quality')}</span>
            <select
              value={quality}
              onChange={(event) => {
                const next = event.target.value as Quality
                saveQuality(next)
                setTrial(undefined)
                setQuality(next)
              }}
              data-testid="kart-quality"
            >
              {QUALITIES.map((one) => (
                <option key={one} value={one}>
                  {t(`kart.quality.${one}`)}
                </option>
              ))}
            </select>
          </CourseLabel>
          <CourseLabel>
            <span>{t('kart.spike.body')}</span>
            <select
              value={body}
              onChange={(event) => pickBody(event.target.value as KartBody)}
              data-testid="kart-body"
            >
              {KART_BODIES.map((one) => (
                <option key={one} value={one}>
                  {t(`kart.body.${one}`)}
                </option>
              ))}
            </select>
          </CourseLabel>
          <CourseLabel>
            <span>{t('kart.spike.course')}</span>
            <select
              value={course}
              onChange={(event) => switchCourse(event.target.value as PlayCourse)}
              data-testid="kart-course"
            >
              {custom && <option value="custom">{customName}</option>}
              {courses.map((one) => (
                <option key={one} value={one}>
                  {t(`kart.course.${one}`)}
                </option>
              ))}
            </select>
          </CourseLabel>
          {courseMeta && open !== 'garage' && (
            // 2026-11-21 (docs/KART-META.md): the track's quickest three, the flagship aside
            <CourseMeta data-testid="kart-course-meta" data-track={course}>
              {t('kart.meta.line', {
                karts: courseMeta.podium.map((one) => t(`kart.body.${one}`)).join(' · '),
              })}
            </CourseMeta>
          )}
          {!play && (
            <Button
              $variant="secondary"
              $size="sm"
              onClick={() => setShowNumbers((shown) => !shown)}
            >
              {t(showNumbers ? 'kart.spike.hideNumbers' : 'kart.spike.showNumbers')}
            </Button>
          )}
          <Suspense>
            <FullscreenButton landscape />
          </Suspense>
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
      {hud.boosting && <BoostVeil aria-hidden="true" data-testid="kart-boost-veil" />}
      {hud.hits > 0 && (
        <WallFlash key={`hit-${hud.hits}`} aria-hidden="true" data-testid="kart-wall-flash" />
      )}
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      <CoachTip t={t} coach={coach} bindings={bindings} touch={touch.shown} />
      {invite && onSchool && (
        <Invite role="region" aria-label={t('kart.school.open')} data-testid="kart-school-invite">
          <p>{t('kart.school.invite')}</p>
          <InviteButtons>
            <Button
              $size="sm"
              onClick={() => {
                answerInvite()
                onSchool()
              }}
              data-testid="kart-school-invite-go"
            >
              {t('kart.school.inviteGo')}
            </Button>
            <Button
              $size="sm"
              $variant="secondary"
              onClick={() => {
                answerInvite()
                setInvite(false)
              }}
              data-testid="kart-school-invite-no"
            >
              {t('kart.school.inviteNo')}
            </Button>
          </InviteButtons>
        </Invite>
      )}
      {track && (
        <MapCorner $touch={touch.shown ? (touch.settings.leftHanded ? 'right' : 'left') : null}>
          {trial && <RaceClock ref={clock} t={t} trial={trial} />}
          {chasing && (
            <ChaseBanner data-testid="kart-board-chasing">
              <span>{t('kart.board.chasing', { nick: chasing.nick, time: formatTime(chasing.totalMs / 1000) })}</span>
              <Button $size="sm" $variant="secondary" onClick={onStopChase} data-testid="kart-board-stop-chase">
                {t('kart.board.stopChase')}
              </Button>
            </ChaseBanner>
          )}
          {trial && !chasing && (
            <GhostPicker
              t={t}
              pick={ghostPick}
              onPick={(next) => {
                if (next === ghostPick) return
                saveGhostPick(next)
                setTrial(undefined)
                setGhostPick(next)
              }}
            />
          )}
          <Minimap
            ref={minimap}
            t={t}
            road={track.road}
            gates={track.gates}
            forks={track.forks}
            walls={track.walls}
            obstacles={track.obstacles}
          />
        </MapCorner>
      )}
      <TouchControls t={t} touch={touch} hud={hud} maxStored={tuning.maxStoredBoosts} />
      {track && trial && (
        <RaceCenter
          t={t}
          trial={trial}
          onRestart={() => race.current?.restart()}
          onGarage={() => setOpen('garage')}
          extra={
            boardRun && boardRun.track === track.id ? (
              <Suspense fallback={null}>
                <BoardUpload run={boardRun} onBoard={onBoard} />
              </Suspense>
            ) : null
          }
        />
      )}
      <Bottom $touch={touch.shown}>
        <Hud t={t} hud={hud} maxStored={tuning.maxStoredBoosts} dense={touch.shown} />
        <Hint $hidden={touch.shown}>
          <HintTitle>{t(play ? 'kart.play.title' : 'kart.spike.title')}</HintTitle>
          {touch.shown ? (
            // The buttons' own panel (the gear) says how to drive by touch, on screen
            t('kart.touch.help')
          ) : (
            <details
              open={helpOpen}
              onToggle={(event) => setHelpOpen(event.currentTarget.open)}
              data-testid="kart-help"
            >
              <summary>{t('kart.spike.howTo')}</summary>
              {t('kart.spike.keys', hintKeys)}
            </details>
          )}
        </Hint>
      </Bottom>
      <Suspense>
        {open === 'settings' && (
          <SettingsDialog
            t={t}
            onClose={() => setOpen(undefined)}
            onControls={() => setOpen('controls')}
            onQuality={setQuality}
          />
        )}
      </Suspense>
      {play && (
        <PauseLayer
          t={t}
          canPause
          button={false}
          enabled={open === undefined && !menuOpen}
          onRestart={() => race.current?.restart()}
        />
      )}
      <Suspense>
        {open === 'tuning' && (
          <TuningPanel t={t} tuning={tuning} onTuning={changeTuning} onClose={closeTuning} />
        )}
        {open === 'garage' && (
          <GaragePanel
            t={t}
            kart={garagePick.body ?? body}
            driver={garagePick.driver ?? driver}
            onKart={pickGarageBody}
            onDriver={pickGarageDriver}
            onClose={closeGarage}
            track={course === 'custom' ? undefined : course}
          />
        )}
        {open === 'bots' && onBotRace && (
          <BotSetupPanel
            t={t}
            onStart={onBotRace}
            onClose={closeBots}
            onGrandPrix={onCup ? () => setOpen('cup') : undefined}
            custom={custom ? { code: custom.code, name: customName } : undefined}
          />
        )}
        {open === 'cup' && onCup && <CupSetupPanel t={t} onCup={onCup} onClose={closeCup} />}
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
      </Suspense>
    </Page>
  )
}

const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow: hidden;
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
  /* No double-tap zoom and no scrolling from a finger on the race */
  touch-action: none;
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

// 2026-11-20 (§4.50): under the top row on the left, clear of the map and the HUD
const Invite = styled.section`
  ${broadcastSolid}
  /* Under the top row's open menu (its z-index), over the race */
  position: absolute;
  top: 64px;
  left: ${space.sm}px;
  display: grid;
  gap: ${space.sm}px;
  width: min(340px, calc(100% - ${2 * space.sm}px));
  padding: ${space.sm}px ${space.md}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;

  p {
    margin: 0;
  }

  /* A phone held sideways: the map and the clock have the left; the invite goes top centre */
  @media (max-height: 500px) {
    top: ${space.sm}px;
    left: 50%;
    translate: -50% 0;
    width: min(340px, calc(100% - 320px));
  }
`

const InviteButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const BadLink = styled.p`
  margin: ${space.xs}px 0 0;
  color: ${color.danger};
`

const Panel = styled.div`
  padding: ${space.sm}px ${space.md}px;
  border-radius: ${radius.component}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

// Above the map corner and the overlays, so that the open menu is never covered
const TopRow = styled.div`
  position: absolute;
  z-index: 1;
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

// The way to the online races: the panel's one link that stands out
const OnlineLink = styled(Link)`
  color: ${color.accent};
  font-weight: 700;
`

const MenuButton = styled(Button)`
  display: none;

  @media ${KART_COMPACT} {
    display: inline-flex;
  }
`

const Buttons = styled.div<{ $open: boolean }>`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${space.sm}px;

  @media ${KART_COMPACT} {
    /* A drop-down under the menu button, scrolling when the screen is short */
    display: ${({ $open }) => ($open ? 'flex' : 'none')};
    position: absolute;
    top: calc(100% + ${space.xs}px);
    right: 0;
    width: min(320px, 100%);
    max-height: calc(100dvh - 64px);
    overflow-y: auto;
    flex-direction: column;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: stretch;
    padding: ${space.sm}px;
    border-radius: ${radius.component}px;
    background: ${color.surface};

    & > * {
      flex-shrink: 0;
    }

    & > label {
      justify-content: space-between;
    }

    @media (pointer: coarse) {
      & > label {
        min-height: 44px;
      }

      & select {
        min-height: 40px;
      }
    }
  }
`

// Under the top row, on the right: where the eye goes for the course, away from the HUD. On a
// phone held sideways with the touch buttons, the map goes beside the clock and over the steering
// (touchCorner)
const MapCorner = styled.div<{ $touch: 'left' | 'right' | null }>`
  position: absolute;
  top: 64px;
  right: ${space.sm}px;
  display: grid;
  justify-items: end;
  gap: ${space.xs}px;
  pointer-events: none;

  ${({ $touch }) => $touch && touchCorner($touch)}
`

// 2026-11-23 (§4.81): whose ghost from the leaderboard races along, and a way to stop
const ChaseBanner = styled.div`
  ${broadcastSolid}
  display: flex;
  gap: ${space.xs}px;
  align-items: center;
  max-width: min(320px, 70vw);
  padding: ${space.xs}px ${space.sm}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  pointer-events: auto;
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

const CourseMeta = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 ${space.sm}px;
  color: ${color.muted};
  background: color-mix(in srgb, ${color.bg} 55%, transparent);
  font-size: ${fontSize.sm}px;
`

const Bottom = styled.div<{ $touch: boolean }>`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
  display: grid;
  gap: ${space.sm}px;

  ${({ $touch }) => $touch && touchBottom}
`

const Hint = styled(Panel)<{ $hidden?: boolean }>`
  /* Never taller than half the screen: on a phone held sideways the text scrolls */
  max-height: 45dvh;
  overflow-y: auto;
  /* Only as wide as its words: folded, a small box in the corner, clear of the kart */
  justify-self: start;
  max-width: min(760px, 100%);

  ${({ $hidden }) => $hidden && visuallyHidden}

  summary {
    cursor: pointer;
    color: ${color.muted};
  }
`

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
