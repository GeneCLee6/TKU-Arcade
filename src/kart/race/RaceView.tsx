import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SOCIAL_SEAT } from '../../components/social/bus.ts'
import styled, { css, keyframes } from 'styled-components'
import type { KartAction, KartItemEvent, KartView } from '../../../shared/games/kart/types.ts'
import { actionKeys } from '../../../shared/kart/input.ts'
import { TARGETED_ITEMS, type ItemId } from '../../../shared/kart/items.ts'
import { SHOT_TUNING } from '../../../shared/kart/shots.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import '../../games/kart/messages.ts'
import { Standings } from '../../games/kart/Standings.tsx'
import { Button } from '../../components/Button.tsx'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { displayType, monoType } from '../../styles/esports.ts'
import { broadcast, ticker } from '../ui/broadcast.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { applyKart, type DriverId, type KartId } from '../../../shared/kart/karts.ts'
import { isTeamId, scoreTeams, type TeamId } from '../../../shared/kart/team.ts'
import { loadBody, loadDriver } from '../bodies.ts'
import type { Callout } from '../callouts.ts'
import { keyLabel, loadBindings, loadRules, loadTuning, useKeyLayout } from '../devices.ts'
import { BoostVeil, CALLOUT_CLEAR, CalloutText, Hud } from '../Hud.tsx'
import { Minimap, type MinimapHandle } from '../Minimap.tsx'
import { loadQuality } from '../quality.ts'
import { LapSplitShow, RaceCenter, RaceClock, type RaceClockHandle } from '../RaceOverlay.tsx'
import { useKartAudioUnlock } from '../audio/unlock.ts'
import { SoundTap } from '../ui/SoundTap.tsx'
import { supportsWebGL2 } from '../webgl.ts'
import type { SpikeHud, SpikeStep, SpikeTrial } from '../spikeLoop.ts'
import { RACE_ENGINE } from '../load/kartLoad.ts'
import { KartLoading } from '../load/KartLoading.tsx'
import { useKartLoad } from '../load/useKartLoad.ts'
import { createAutopilot } from './autopilot.ts'
import { useRaceFullscreen } from './useRaceFullscreen.ts'
import { ITEM_SLOT_UPRIGHT_TOP, ItemNote, ItemSlot, MAP_UNDER_ITEM_SLOT } from './ItemHud.tsx'
import { effectsOf, FORESEEN_LATE_MS } from '../hitFx.ts'
import { FogVeil, StunHud } from './HitHud.tsx'
import { createRaceNet, type NameTag, type RaceNet } from './netRace.ts'
import { teamColor } from '../team/teamColor.ts'
import { TeamPanel, TeamScore, TeamVeil } from './TeamHud.tsx'
import {
  Celebration,
  CloseCountdown,
  FinalLapBanner,
  IntroCard,
  PlaceArrow,
} from '../ui/RaceShow.tsx'
import { PauseLayer, type PauseLayerProps } from '../ui/PauseLayer.tsx'
import { useCloseCountdown } from '../ui/useCloseCountdown.ts'
import { placeBump } from '../ui/placeBump.ts'
import { TouchControls } from '../touch/TouchControls.tsx'
import { useTouchControls } from '../touch/useTouchControls.ts'
import { CoachTip } from '../school/CoachTip.tsx'
import { useCoach } from '../school/useCoach.ts'
import { touchBottom, touchCorner, touchSpace } from '../touch/touchLayout.ts'

registerMessages(KART_MESSAGES)

const EMPTY_HUD: SpikeHud = {
  speed: 0,
  gauge: 0,
  storedBoosts: 0,
  boosting: false,
  chain: 0,
  hits: 0,
}

const CALLOUT_MS = 900
/** An item's note stays this long */
const NOTE_MS = 2_200
/** §4.43: a place gained or lost shows for this long, and the final lap's banner for this long, ms */
const PLACE_SHIFT_MS = 1_600
const FINAL_LAP_MS = 2_400
/** A use the room has not answered by now found no one to reach */
const NO_TARGET_MS = 900
/** Hit by a shot: a buzz this long on a phone driven by touch */
const HIT_BUZZ_MS = 80

type T = ReturnType<typeof useT>

/**
 * What an item used says to this racer, if anything: what it did for them, what it did to them, or
 * that a shield stopped it
 */
function noteFor(
  event: KartItemEvent,
  seat: number,
  t: T,
  nameOf: (seat: number) => string,
): { text: string; bad: boolean } | null {
  const item = t(`games.kart.item.${event.item}`)
  const first = event.targets[0]
  // A shot that hit someone (e9-t06b)
  if (event.hit) {
    // 2026-11-20: a mirror sent it back: `by` is the mirror's kart, `first` the thrower
    if (event.bounced) {
      if (event.by === seat) {
        return first === undefined
          ? { text: t('games.kart.item.youBouncedNone', { item }), bad: false }
          : { text: t('games.kart.item.youBounced', { name: nameOf(first), item }), bad: false }
      }
      if (first === seat && !event.blocked.includes(seat)) {
        return { text: t('games.kart.item.hitBounced', { name: nameOf(event.by), item }), bad: true }
      }
      if (first === seat) {
        return {
          text: t('games.kart.item.yourBubble', { name: nameOf(event.by), item }),
          bad: false,
        }
      }
      return null
    }
    if (first === undefined) return null
    // 2026-11-20: driven into someone's sea fog
    if (event.item === 'fog') {
      return first === seat
        ? { text: t('games.kart.item.hitFog', { name: nameOf(event.by) }), bad: true }
        : null
    }
    const stopped = event.blocked.includes(first)
    if (first === seat) {
      if (stopped)
        return {
          text: t('games.kart.item.yourBubble', { name: nameOf(event.by), item }),
          bad: false,
        }
      return event.by === seat
        ? { text: t('games.kart.item.hitOwn', { item }), bad: true }
        : { text: t('games.kart.item.hitShot', { name: nameOf(event.by), item }), bad: true }
    }
    if (event.by !== seat) return null
    return stopped
      ? { text: t('games.kart.item.stoppedYours', { name: nameOf(first), item }), bad: true }
      : { text: t('games.kart.item.youHit', { name: nameOf(first), item }), bad: false }
  }
  if (event.by === seat) {
    if (event.blocked.length > 0 && event.blocked.length === event.targets.length) {
      return {
        text: t('games.kart.item.stoppedYours', { name: nameOf(event.blocked[0]!), item }),
        bad: true,
      }
    }
    switch (event.item) {
      case 'shield':
        return { text: t('games.kart.item.youShield'), bad: false }
      case 'tow':
        return first === undefined
          ? null
          : { text: t('games.kart.item.youTow', { name: nameOf(first) }), bad: false }
      case 'headwind':
        return { text: t('games.kart.item.youHeadwind'), bad: false }
      case 'swap':
        return first === undefined
          ? null
          : { text: t('games.kart.item.youSwap', { name: nameOf(first) }), bad: false }
      case 'cloud':
        return first === undefined
          ? null
          : { text: t('games.kart.item.youCloud', { name: nameOf(first) }), bad: false }
      // 2026-11-20
      case 'mirror':
        return { text: t('games.kart.item.youMirror'), bad: false }
      case 'fog':
        return first === undefined
          ? null
          : { text: t('games.kart.item.youFog', { name: nameOf(first) }), bad: false }
      case 'skip':
        return { text: t('games.kart.item.youSkip'), bad: false }
      case 'jam':
        return first === undefined
          ? null
          : { text: t('games.kart.item.youJam', { name: nameOf(first) }), bad: false }
      case 'rally':
        return { text: t('games.kart.item.youRally'), bad: false }
      default:
        return null
    }
  }
  if (!event.targets.includes(seat)) return null
  const by = nameOf(event.by)
  if (event.blocked.includes(seat)) {
    return { text: t('games.kart.item.yourBubble', { name: by, item }), bad: false }
  }
  switch (event.item) {
    case 'headwind':
      return { text: t('games.kart.item.hitHeadwind', { name: by }), bad: true }
    case 'swap':
      return { text: t('games.kart.item.hitSwap', { name: by }), bad: true }
    case 'tow':
      return { text: t('games.kart.item.hitTow', { name: by }), bad: true }
    case 'cloud':
      return { text: t('games.kart.item.cloudComing', { name: by }), bad: true }
    case 'jam':
      return { text: t('games.kart.item.hitJam', { name: by }), bad: true }
    case 'rally':
      return { text: t('games.kart.item.hitRally', { name: by }), bad: false }
    default:
      return null
  }
}
/** How often the places and the connection's state are read again */
const POLL_MS = 250
/** 2026-11-23: on the grid once the clock is settled here, or after this long whatever, ms */
const SETTLE_WAIT_MS = 4_000

export interface RaceViewProps {
  view: KartView
  realtime: RoomRealtime
  act: (action: JsonValue) => void
  nameOf: (seat: number) => string
  /** After the finish: watch the others instead (e9-t10) */
  onWatch?: () => void
  /** 2026-11-20: the kart and driver each seat picked, to draw it on the grid before its frames come */
  lookOf?: (seat: number) => { kart: KartId; driver: DriverId } | null
  /**
   * 2026-11-21 (§4.60): after each physics step of this kart, the step as it ran: the challenge
   * mode judges a mission's rules by it (no N2O, no crash). Only reads
   */
  onStep?: (step: SpikeStep) => void
  /**
   * 2026-11-22 (§4.73): the menu over the race (Esc, Start, the button): what it offers, and whether
   * the race stops while it is open (a race with no one else in it) or goes on (a room's)
   */
  pause?: RacePause
}

export type RacePause = Pick<
  PauseLayerProps,
  'canPause' | 'onRestart' | 'onKartMenu' | 'onLobby' | 'onLeave'
>

/**
 * A race in a room (e9-t03, e9-t07, e9-t08, e9-t09), full screen, for someone with a kart in it.
 * The time trial's loop and HUD (spikeLoop.ts) with a `SpikeNet`: the countdown is the room's, the
 * other karts are drawn from their frames with name tags over them, and the places, the lap and an
 * unstable connection are shown on top. At the finish it shows this kart's place and waits for the
 * others; the room's result panel takes over when the server says the race is over.
 */
export default function RaceView({
  view,
  realtime,
  act,
  nameOf,
  onWatch,
  lookOf,
  onStep,
  pause,
}: RaceViewProps) {
  const t = useT()
  // 2026-11-23 (audio/unlock.ts): every gesture here wakes the kart's sound
  useKartAudioUnlock()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  // The item key's name follows the keyboard's layout once the browser has said it
  useKeyLayout()
  // 2026-11-22: full screen by itself if asked for, a phone on its side where it may be locked
  useRaceFullscreen()
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const [order, setOrder] = useState<number[]>(() => view.racers.map((racer) => racer.seat))
  const [unstable, setUnstable] = useState(false)
  const [note, setNote] = useState<{ text: string; bad: boolean; id: number }>()
  const [stun, setStun] = useState<{ ms: number; id: number }>()
  /** 2026-11-20: driven into sea fog: the view clouds over a moment */
  const [fog, setFog] = useState<number>()
  const seenEvents = useRef(view.used)
  const pressed = useRef<{ item: ItemId; at: number } | null>(null)
  /** #86: when this browser last foresaw a hit on its kart (performance.now), shown at once */
  const foreseenAt = useRef(-Infinity)
  const minimap = useRef<MinimapHandle>(null)
  const clock = useRef<RaceClockHandle>(null)
  const tagLayer = useRef<HTMLDivElement>(null)
  const raceNet = useRef<RaceNet | null>(null)
  const track = useMemo(() => raceTrack(view.track), [view.track])
  const seat = view.you as number
  const slot = Math.max(
    0,
    view.racers.findIndex((racer) => racer.seat === seat),
  )
  // Read by the loop, every step
  const latest = useRef(view)
  const actRef = useRef(act)
  const tRef = useRef(t)
  const nameRef = useRef(nameOf)
  const lookRef = useRef(lookOf)
  const stepRef = useRef(onStep)
  useLayoutEffect(() => {
    stepRef.current = onStep
    latest.current = view
    actRef.current = act
    tRef.current = t
    nameRef.current = nameOf
    lookRef.current = lookOf
  })
  // Testing a room alone: a second tab can drive itself
  const [autopiloted] = useState(() => new URLSearchParams(window.location.search).has('autopilot'))
  // `?autopilot=drift`: the same driver, drifting through the bends (a team race's gauges fill)
  const [drifts] = useState(
    () => new URLSearchParams(window.location.search).get('autopilot') === 'drift',
  )
  // e10-t05: the kart and driver picked on /kart or in the waiting room; the kart's numbers go
  // into the tuning
  const [loadout] = useState(() => ({ body: loadBody(), driver: loadDriver() }))
  // 2026-11-17: buttons on the screen for a phone
  const touch = useTouchControls()
  const touchSource = touch.source
  const [settings] = useState(() => ({
    bindings: loadBindings(),
    rules: loadRules(),
    tuning: applyKart(loadTuning().tuning, loadout.body),
    enabled: true,
  }))
  // 2026-11-22 (§4.73): what the loop reads every frame: the keys changed in the menu's controls, and
  // none while a room's menu is open (the race goes on, the kart takes no keys)
  const liveControls = useRef(settings)
  // 2026-11-20 (§4.50): a tip for a technique not yet used (not for a kart driving itself)
  const coach = useCoach()
  const coachStep = coach.onStep
  // 2026-11-21 (§4.52): the engine, the track's own scenery, the vehicles on the grid and the song,
  // fetched before the scene is built; the room hears "drawn and on the grid" only after that
  const [gridBodies] = useState(() => [
    loadout.body,
    ...view.racers.map((racer) => lookOf?.(racer.seat)?.kart).filter((kart) => kart !== undefined),
  ])
  const load = useKartLoad(
    track ? { engine: RACE_ENGINE, track, bodies: gridBodies, music: true } : null,
    `${track?.id}|${gridBodies.join()}`,
  )
  const engine = load.engine

  useEffect(() => {
    if (!stage.current || !track || failure || !engine) return
    const net = createRaceNet({
      realtime,
      track,
      seat,
      slot,
      body: loadout.body,
      driver: loadout.driver,
      goAt: () => latest.current.goAt,
      laps: latest.current.laps,
      view: () => latest.current,
      lookOf: (one) => lookRef.current?.(one) ?? null,
      onItemPress: (item) => {
        pressed.current = TARGETED_ITEMS.has(item) ? { item, at: performance.now() } : null
      },
      onForeseenHit: (_, ms) => {
        foreseenAt.current = performance.now()
        touchSource.buzz(HIT_BUZZ_MS)
        setStun((last) => ({ ms, id: (last?.id ?? 0) + 1 }))
      },
    })
    raceNet.current = net
    net.onTags((tags) => {
      placeTags(tagLayer.current, tags)
      minimap.current?.others?.(tags)
    })
    let stop: (() => void) | undefined
    try {
      stop = engine.startSpikeLoop(stage.current, {
        controls: () => liveControls.current,
        onStats: () => {},
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure(true),
        track,
        quality: loadQuality(),
        body: loadout.body,
        driver: loadout.driver,
        onPose: (x, z, heading, nextGate, tick) => minimap.current?.place(x, z, heading, nextGate, tick),
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        touch: touchSource,
        onStep: (step) => {
          if (!autopiloted) coachStep(step, settings.tuning)
          stepRef.current?.(step)
        },
        net: autopiloted
          ? {
              ...net.net,
              autopilot: createAutopilot(track, settings.tuning, drifts),
            }
          : net.net,
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    // Drawn and on the grid: the room can count this kart in. 2026-11-23 (#152): once the room's
    // clock is settled here too (or after SETTLE_WAIT_MS at most), so that the opening the room then
    // starts shows every screen the same driver at the same moment
    let settleWait: ReturnType<typeof setTimeout> | null = null
    const tellLoaded = () => {
      if (settleWait !== null) clearTimeout(settleWait)
      settleWait = null
      const me = latest.current.racers.find((racer) => racer.seat === seat)
      if (latest.current.phase === 'loading' && me && !me.loaded) {
        actRef.current({ t: 'loaded' } satisfies KartAction)
      }
    }
    let told = false
    if (stop) {
      const once = () => {
        if (told) return
        told = true
        tellLoaded()
      }
      settleWait = setTimeout(once, SETTLE_WAIT_MS)
      net.whenSettled(once)
    }
    return () => {
      told = true
      if (settleWait !== null) clearTimeout(settleWait)
      stop?.()
      net.stop()
      raceNet.current = null
    }
  }, [realtime, track, seat, slot, failure, settings, autopiloted, drifts, loadout, touchSource, coachStep, engine])

  useEffect(() => {
    const timer = setInterval(() => {
      const net = raceNet.current
      if (!net) return
      const next = net.order(latest.current.racers)
      setOrder((current) => (current.join() === next.join() ? current : next))
      setUnstable(net.status().unstable && latest.current.phase === 'racing')
      // An item that reaches someone, pressed and still held: there was no one to reach
      const press = pressed.current
      if (press && performance.now() - press.at >= NO_TARGET_MS) {
        pressed.current = null
        const me = latest.current.racers.find((racer) => racer.seat === latest.current.you)
        if (me?.item === press.item) {
          setNote((last) => ({
            text: tRef.current('games.kart.item.noTarget'),
            bad: true,
            id: (last?.id ?? 0) + 1,
          }))
        }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  // What each item used says to this racer
  useEffect(() => {
    for (const event of view.events) {
      if (event.n < seenEvents.current) continue
      seenEvents.current = event.n + 1
      const next = noteFor(event, seat, tRef.current, nameRef.current)
      if (next) setNote((last) => ({ ...next, id: (last?.id ?? 0) + 1 }))
      // 2026-11-17: hit by a shot: the HUD says so while the kart spins
      if (event.hit && event.item === 'fog' && event.targets[0] === seat) {
        setFog((last) => (last ?? 0) + 1)
      }
      const spin = effectsOf(event).find((one) => one.kind === 'spin' && one.seat === seat)
      // (already up if this browser foresaw it, #86)
      if (spin?.kind === 'spin' && performance.now() - foreseenAt.current > FORESEEN_LATE_MS) {
        setStun((last) => ({ ms: spin.ms, id: (last?.id ?? 0) + 1 }))
        touchSource.buzz(HIT_BUZZ_MS)
      }
    }
  }, [view.events, seat, touchSource])

  // 2026-11-18, a team race: the team's gauge filled, and the charges this kart holds turned blue
  const myTeam = view.racers.find((racer) => racer.seat === seat)?.team
  const fills = view.teams && isTeamId(myTeam) ? view.teams.fills[myTeam] : 0
  const seenFills = useRef(fills)
  const chargesRef = useRef(0)
  useEffect(() => {
    chargesRef.current = hud.storedBoosts
  }, [hud.storedBoosts])
  useEffect(() => {
    if (fills > seenFills.current) {
      const key = chargesRef.current > 0 ? 'granted' : 'grantedNone'
      setNote((last) => ({
        text: tRef.current(`games.kart.team.${key}`),
        bad: false,
        id: (last?.id ?? 0) + 1,
      }))
    }
    seenFills.current = fills
  }, [fills])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(undefined), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [note])

  useEffect(() => {
    if (fog === undefined) return
    const timer = window.setTimeout(() => setFog(undefined), SHOT_TUNING.fogBlindMs)
    return () => window.clearTimeout(timer)
  }, [fog])

  useEffect(() => {
    if (!stun) return
    const timer = window.setTimeout(() => setStun(undefined), stun.ms)
    return () => window.clearTimeout(timer)
  }, [stun])

  // §4.43: a place gained or lost while racing, and the final lap
  const [placeShift, setPlaceShift] = useState<{ up: boolean; id: number }>()
  const [finalLapOver, setFinalLapOver] = useState(false)
  const lastPlace = useRef(0)
  const racing = trial?.phase === 'racing'
  const placeNow = order.indexOf(seat) + 1
  useEffect(() => {
    const before = lastPlace.current
    lastPlace.current = placeNow
    if (!racing || before === 0 || placeNow === 0 || placeNow === before) return
    setPlaceShift((last) => ({ up: placeNow < before, id: (last?.id ?? 0) + 1 }))
  }, [placeNow, racing])
  useEffect(() => {
    if (!placeShift) return
    const timer = window.setTimeout(() => setPlaceShift(undefined), PLACE_SHIFT_MS)
    return () => window.clearTimeout(timer)
  }, [placeShift])
  // 2026-11-22 (§4.73): after the first finish, the seconds left to everyone still out, with a tock
  // for each (shared/kart/opening.ts; the room closes the race at that moment)
  // (ui/useCloseCountdown.ts, which the watcher's screen shares)
  const closeLeft = useCloseCountdown(view, () => raceNet.current?.serverNow() ?? null)

  const onFinalLap = racing && trial.laps > 1 && trial.lap === trial.laps
  useEffect(() => {
    if (!onFinalLap) return
    const timer = window.setTimeout(() => setFinalLapOver(true), FINAL_LAP_MS)
    return () => window.clearTimeout(timer)
  }, [onFinalLap])
  const finalLap = onFinalLap && !finalLapOver

  useEffect(() => {
    if (!callout) return
    const timer = window.setTimeout(() => setCallout(undefined), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [callout])

  if (failure || !track) {
    return (
      <Fallback>
        <p role="alert">{t('games.kart.race.noWebgl')}</p>
        <Standings view={view} order={order} nameOf={nameOf} />
      </Fallback>
    )
  }

  const total = view.racers.length
  const place = order.indexOf(seat) + 1
  const me = view.racers.find((racer) => racer.seat === seat)
  // 2026-11-23: this racer's laps as the room counted them, seconds
  const lapSeconds = (me?.lapMs ?? []).map((ms) => ms / 1000)
  const finished = me?.finishMs != null || trial?.phase === 'finished'
  const ready = view.racers.filter((racer) => racer.loaded).length
  const firstItemKey = actionKeys(settings.bindings, 'item')[0]
  const itemKey = touch.shown
    ? t('kart.touch.item')
    : firstItemKey
      ? keyLabel(firstItemKey, t)
      : t('kart.controls.none')
  const counting = view.phase === 'countdown' && view.goAt !== null && trial?.phase === 'countdown'
  // A team race: everyone's side, and the score as the race stands (the running order, less those out)
  const teamOf = (one: number): TeamId | null => {
    const side = view.racers.find((racer) => racer.seat === one)?.team
    return view.teams && isTeamId(side) ? side : null
  }
  const mySide = teamOf(seat)
  const score = view.teams
    ? scoreTeams(
        order.filter((one) => {
          const racer = view.racers.find((other) => other.seat === one)
          return racer !== undefined && (racer.finishMs !== null || !racer.out)
        }),
        teamOf,
        [
          view.racers.filter((racer) => racer.team === 0).length,
          view.racers.filter((racer) => racer.team === 1).length,
        ],
      )
    : null
  const others = view.racers.filter((racer) => racer.seat !== seat)
  // The track's name on the fly round's card; a custom track has none of its own here
  const courseKey = `kart.course.${view.track}`
  const courseTitle = courseKey in KART_MESSAGES.en ? t(courseKey as KartMessageKey) : null

  return (
    <Page
      data-testid="kart-race"
      data-items={view.mode === 'items' || undefined}
      style={touch.shown ? touchSpace(touch.settings) : undefined}
    >
      <Stage ref={stage} role="img" aria-label={t('games.kart.race.canvas')} />
      <SoundTap label={t('kart.race.soundTap')} />
      {!engine && (
        <KartLoading
          t={t}
          track={courseTitle}
          progress={load.progress}
          failed={load.failed}
          onRetry={load.retry}
          bindings={settings.bindings}
          touch={touch.shown}
          note={view.phase === 'loading' ? t('games.kart.race.waiting', { ready, total }) : null}
        />
      )}
      <Tags ref={tagLayer} aria-hidden="true">
        {others.map((racer) => (
          <Tag
            key={racer.seat}
            data-tag={racer.seat}
            {...{ [SOCIAL_SEAT]: racer.seat }}
            $team={teamOf(racer.seat)}
            style={{ display: 'none' }}
          >
            {nameOf(racer.seat)}
          </Tag>
        ))}
      </Tags>
      <TouchControls
        t={t}
        touch={touch}
        items={view.mode === 'items'}
        hud={hud}
        maxStored={settings.tuning.maxStoredBoosts}
      />
      <TopLeft>
        <PlacePanel
          data-testid="kart-place"
          data-shift={placeShift ? (placeShift.up ? 'up' : 'down') : undefined}
          aria-label={t('games.kart.race.position')}
        >
          <PlaceNumber
            key={placeShift ? `place-${placeShift.id}` : 'place'}
            $shift={placeShift ? placeShift.up : null}
          >
            {t('games.kart.race.place', { place: place || 1, total })}
          </PlaceNumber>
          {placeShift && (
            <PlaceArrow
              key={`arrow-${placeShift.id}`}
              $up={placeShift.up}
              role="img"
              aria-label={t(placeShift.up ? 'games.kart.race.placeUp' : 'games.kart.race.placeDown', {
                place,
              })}
            />
          )}
        </PlacePanel>
        {score && <TeamScore t={t} totals={score.totals} mine={mySide} />}
        {note && <ItemNote key={`note-${note.id}`} text={note.text} bad={note.bad} />}
        {unstable && (
          <Unstable role="status" data-testid="kart-unstable">
            {t('games.kart.race.unstable')}
          </Unstable>
        )}
      </TopLeft>
      {view.mode === 'items' && (
        <ItemSlot t={t} item={me?.item ?? null} keyName={itemKey} centred />
      )}
      {stun && <StunHud key={`stun-${stun.id}`} t={t} ms={stun.ms} />}
      {fog !== undefined && (
        <FogVeil key={`fog-${fog}`} t={t} ms={SHOT_TUNING.fogBlindMs} />
      )}
      {hud.boosting && <BoostVeil aria-hidden="true" data-testid="kart-boost-veil" />}
      {hud.teamBoosting && <TeamVeil aria-hidden="true" data-testid="kart-team-veil" />}
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      <CoachTip t={t} coach={coach} bindings={settings.bindings} touch={touch.shown} />
      <MapCorner
        $touch={touch.shown ? (touch.settings.leftHanded ? 'right' : 'left') : null}
        $items={view.mode === 'items'}
      >
        {trial && <RaceClock ref={clock} t={t} trial={trial} />}
        <Minimap
          ref={minimap}
          t={t}
          road={track.road}
          gates={track.gates}
          walls={track.walls}
          forks={track.forks}
          obstacles={track.obstacles}
          dots={
            view.teams
              ? others.map((racer) => {
                  const side = teamOf(racer.seat)
                  return { seat: racer.seat, fill: side === null ? color.muted : teamColor(side) }
                })
              : undefined
          }
        />
      </MapCorner>
      {view.phase === 'loading' && (
        <Center role="status" data-testid="kart-waiting">
          {t('games.kart.race.waiting', { ready, total })}
        </Center>
      )}
      {view.phase === 'countdown' && !counting && (
        <Center role="status">{t('games.kart.race.ready')}</Center>
      )}
      {trial?.intro && (
        <IntroCard
          title={courseTitle}
          laps={t('kart.race.introLaps', { count: view.laps })}
          skip={t(touch.shown ? 'kart.race.introSkipTouch' : 'kart.race.introSkip')}
        />
      )}
      {trial &&
        !trial.intro &&
        (counting || (trial.phase === 'racing' && trial.wrongWay)) && (
          <RaceCenter t={t} trial={trial} onRestart={() => {}} />
        )}
      {/* 2026-11-23: each lap's time as the line is crossed, by the room's own laps */}
      <LapSplitShow t={t} lapTimes={lapSeconds} record={trial?.bestLap ?? null} />
      {finalLap && !finished && closeLeft === null && <FinalLapBanner text={t('kart.race.finalLap')} />}
      {closeLeft !== null && !finished && (
        <CloseCountdown
          label={t('kart.flow.close.label')}
          seconds={closeLeft}
          timeUp={t('kart.flow.close.timeUp')}
        />
      )}
      {finished && trial?.celebrating && (
        <Celebration
          big={t('games.kart.race.placeBig', { place: place || 1 })}
          line={t('kart.race.finish')}
        />
      )}
      {finished && !trial?.celebrating && (
        <Finish role="status" data-testid="kart-finish">
          <FinishTitle>{t('games.kart.race.finishedPlace', { place: place || 1 })}</FinishTitle>
          <Standings view={view} order={order} nameOf={nameOf} />
          <Muted>
            {closeLeft !== null && closeLeft > 0
              ? t('kart.flow.close.others', { seconds: closeLeft })
              : t('games.kart.race.waitingOthers')}
          </Muted>
          {onWatch && (
            <Button
              $variant="secondary"
              $size="sm"
              onClick={onWatch}
              data-testid="kart-watch-others"
            >
              {t('games.kart.watch.others')}
            </Button>
          )}
        </Finish>
      )}
      <Bottom $touch={touch.shown}>
        {view.teams && mySide !== null && (
          <TeamCorner>
            <TeamPanel
              t={t}
              gauge={view.teams.gauge[mySide]}
              burning={hud.teamBoosting ?? false}
            />
          </TeamCorner>
        )}
        <Hud t={t} hud={hud} maxStored={settings.tuning.maxStoredBoosts} dense={touch.shown} />
      </Bottom>
      {pause && (
        <PauseLayer
          t={t}
          {...pause}
          onOpenChange={(open) => {
            if (!pause.canPause) liveControls.current = { ...liveControls.current, enabled: !open }
          }}
          onControls={({ bindings, rules }) => {
            liveControls.current = { ...liveControls.current, bindings, rules }
          }}
        />
      )}
    </Page>
  )
}

/** Moves each name tag over its kart, outside React: called every frame */
function placeTags(layer: HTMLDivElement | null, tags: readonly NameTag[]): void {
  if (!layer) return
  const shown = new Set<number>()
  for (const tag of tags) {
    const element = layer.querySelector<HTMLElement>(`[data-tag="${tag.seat}"]`)
    if (!element) continue
    if (!tag.at) continue
    shown.add(tag.seat)
    element.style.display = ''
    element.style.transform = `translate(${Math.round(tag.at.x)}px, ${Math.round(tag.at.y)}px) translate(-50%, -100%)`
  }
  for (const element of layer.querySelectorAll<HTMLElement>('[data-tag]')) {
    if (!shown.has(Number(element.dataset.tag))) element.style.display = 'none'
  }
}

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 20;
  overflow: hidden;
  background: ${color.bg};

  /* An item race has the item slot at the top centre: the big words go under it */
  &[data-items] {
    ${CALLOUT_CLEAR}: 104px;

    @media (max-width: 760px), (max-height: 500px) {
      ${CALLOUT_CLEAR}: 72px;
    }

    @media (max-width: 560px) and (orientation: portrait) {
      ${CALLOUT_CLEAR}: ${ITEM_SLOT_UPRIGHT_TOP + 64}px;
    }
  }
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
  touch-action: none;
`

const Tags = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
`

const Tag = styled.span<{ $team: TeamId | null }>`
  /* A team race: the name over a bar of its side's colour */
  ${({ $team }) =>
    $team !== null &&
    css`
      border-bottom: 3px solid ${teamColor($team)};
    `}
  position: absolute;
  top: 0;
  left: 0;
  max-width: 12em;
  padding: 2px ${space.sm}px;
  overflow: hidden;
  border-left: 3px solid ${color.accent};
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 78%, transparent);
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TopLeft = styled.div`
  position: absolute;
  top: ${space.sm}px;
  left: ${space.sm}px;
  display: grid;
  justify-items: start;
  gap: ${space.xs}px;
  pointer-events: none;
`

// The place, as a broadcast's position tag: leaning, on a panel with the accent's bar. No wider
// than it was: the button that leaves a race against the computer stands right beside it
const PlacePanel = styled.div`
  ${broadcast}
  padding: ${space.xs}px ${space.md}px;
`

const PlaceNumber = styled.span<{ $shift: boolean | null }>`
  ${displayType}
  color: ${color.text};
  font-size: ${fontSize.xl}px;
  ${({ $shift }) => ($shift === null ? '' : placeBump($shift))}
`

const pulse = keyframes`
  from { opacity: 1; }
  to { opacity: 0.55; }
`

const Unstable = styled.p`
  ${ticker(color.danger, 6)}
  margin: 0;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  animation: ${pulse} 0.8s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// With the touch buttons on a phone held sideways: the map beside the clock, and over the steering
// (on the left, under the place, unless left-handed)
const MapCorner = styled.div<{ $touch: 'left' | 'right' | null; $items: boolean }>`
  position: absolute;
  top: ${space.sm}px;
  right: ${space.sm}px;
  display: grid;
  justify-items: end;
  gap: ${space.xs}px;
  pointer-events: none;

  /*
   * 2026-11-22 (#100): a phone held upright in an item race has the item slot in the middle under the
   * clock (ItemHud.tsx); the map goes under it on the left, where neither the HUD (right) nor the
   * steering (bottom left) is, the clock staying at the top right. The page is fixed to the screen,
   * so the screen's corner is the page's
   */
  ${({ $items }) =>
    $items &&
    css`
      @media (max-width: 560px) and (orientation: portrait) {
        & > [data-testid='kart-minimap'] {
          position: fixed;
          top: ${MAP_UNDER_ITEM_SLOT}px;
          left: ${space.sm}px;
        }
      }
    `}

  ${({ $touch }) =>
    $touch &&
    css`
      ${touchCorner($touch)}

      @media (max-height: 500px) {
        top: ${$touch === 'left' ? 64 : space.sm}px;
      }
    `}
`

const Center = styled.p`
  ${broadcast}
  position: absolute;
  top: 30%;
  left: 50%;
  margin: 0;
  padding: ${space.sm}px ${space.lg}px;
  translate: -50% 0;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  text-align: center;
`

const Finish = styled.section`
  ${broadcast}
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  gap: ${space.md}px;
  width: min(360px, calc(100% - ${2 * space.lg}px));
  padding: ${space.lg}px;
  translate: -50% -50%;
`

const FinishTitle = styled.h2`
  ${displayType}
  margin: 0;
  color: ${color.success};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const Muted = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Bottom = styled.div<{ $touch: boolean }>`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;

  ${({ $touch }) => $touch && touchBottom}
`

// The team's gauge (a team race): over the HUD's row, on the right, clear of the middle of the
// screen (the item slot has the top centre)
const TeamCorner = styled.div`
  position: absolute;
  right: 0;
  bottom: 100%;
  margin-bottom: ${space.xs}px;
`

const Fallback = styled.section`
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;

  p {
    margin: 0;
  }
`
