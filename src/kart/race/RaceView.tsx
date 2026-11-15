import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import type { KartAction, KartView } from '../../../shared/games/kart/types.ts'
import { KART_MESSAGES } from '../../../shared/kart/i18n.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import '../../games/kart/messages.ts'
import { Standings } from '../../games/kart/Standings.tsx'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { displayType, glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { loadBody } from '../bodies.ts'
import type { Callout } from '../callouts.ts'
import { loadBindings, loadRules, loadTuning } from '../devices.ts'
import { CalloutText, Hud } from '../Hud.tsx'
import { Minimap, type MinimapHandle } from '../Minimap.tsx'
import { loadQuality } from '../quality.ts'
import { RaceCenter, RaceClock, type RaceClockHandle } from '../RaceOverlay.tsx'
import { supportsWebGL2 } from '../Scene.ts'
import { startSpikeLoop, type SpikeCourse, type SpikeHud, type SpikeTrial } from '../spikeLoop.ts'
import { autopilot } from './autopilot.ts'
import { createRaceNet, type NameTag, type RaceNet } from './netRace.ts'

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
/** How often the places and the connection's state are read again */
const POLL_MS = 250

export interface RaceViewProps {
  view: KartView
  realtime: RoomRealtime
  act: (action: JsonValue) => void
  nameOf: (seat: number) => string
}

/**
 * A race in a room (e9-t03, e9-t07, e9-t08, e9-t09), full screen, for someone with a kart in it.
 * The time trial's loop and HUD (spikeLoop.ts) with a `SpikeNet`: the countdown is the room's, the
 * other karts are drawn from their frames with name tags over them, and the places, the lap and an
 * unstable connection are shown on top. At the finish it shows this kart's place and waits for the
 * others; the room's result panel takes over when the server says the race is over.
 */
export default function RaceView({ view, realtime, act, nameOf }: RaceViewProps) {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const [order, setOrder] = useState<number[]>(() => view.racers.map((racer) => racer.seat))
  const [unstable, setUnstable] = useState(false)
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
  useLayoutEffect(() => {
    latest.current = view
    actRef.current = act
  })
  // Testing a room alone: a second tab can drive itself
  const [autopiloted] = useState(() => new URLSearchParams(window.location.search).has('autopilot'))
  const [settings] = useState(() => ({
    bindings: loadBindings(),
    rules: loadRules(),
    tuning: loadTuning().tuning,
    enabled: true,
  }))

  useEffect(() => {
    if (!stage.current || !track || failure) return
    const net = createRaceNet({
      realtime,
      track,
      seat,
      slot,
      body: loadBody(),
      goAt: () => latest.current.goAt,
      laps: latest.current.laps,
    })
    raceNet.current = net
    net.onTags((tags) => placeTags(tagLayer.current, tags))
    let stop: (() => void) | undefined
    try {
      stop = startSpikeLoop(stage.current, {
        controls: () => settings,
        onStats: () => {},
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure(true),
        course: track.id as SpikeCourse,
        quality: loadQuality(),
        body: loadBody(),
        onPose: (x, z, heading, nextGate) => minimap.current?.place(x, z, heading, nextGate),
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        net: autopiloted
          ? { ...net.net, autopilot: (trial) => autopilot(trial, track.road) }
          : net.net,
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    // Drawn and on the grid: the room can count this kart in
    const me = latest.current.racers.find((racer) => racer.seat === seat)
    if (stop && latest.current.phase === 'loading' && me && !me.loaded) {
      actRef.current({ t: 'loaded' } satisfies KartAction)
    }
    return () => {
      stop?.()
      net.stop()
      raceNet.current = null
    }
  }, [realtime, track, seat, slot, failure, settings, autopiloted])

  useEffect(() => {
    const timer = setInterval(() => {
      const net = raceNet.current
      if (!net) return
      const next = net.order(latest.current.racers)
      setOrder((current) => (current.join() === next.join() ? current : next))
      setUnstable(net.status().unstable && latest.current.phase === 'racing')
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])

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
  const finished = me?.finishMs != null || trial?.phase === 'finished'
  const ready = view.racers.filter((racer) => racer.loaded).length
  const counting = view.phase === 'countdown' && view.goAt !== null && trial?.phase === 'countdown'

  return (
    <Page data-testid="kart-race">
      <Stage ref={stage} role="img" aria-label={t('games.kart.race.canvas')} />
      <Tags ref={tagLayer} aria-hidden="true">
        {view.racers
          .filter((racer) => racer.seat !== seat)
          .map((racer) => (
            <Tag key={racer.seat} data-tag={racer.seat} style={{ display: 'none' }}>
              {nameOf(racer.seat)}
            </Tag>
          ))}
      </Tags>
      <TopLeft>
        <PlacePanel data-testid="kart-place" aria-label={t('games.kart.race.position')}>
          <PlaceNumber>{t('games.kart.race.place', { place: place || 1, total })}</PlaceNumber>
        </PlacePanel>
        {unstable && (
          <Unstable role="status" data-testid="kart-unstable">
            {t('games.kart.race.unstable')}
          </Unstable>
        )}
      </TopLeft>
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      <MapCorner>
        {trial && <RaceClock ref={clock} t={t} trial={trial} />}
        <Minimap ref={minimap} t={t} road={track.road} gates={track.gates} />
      </MapCorner>
      {view.phase === 'loading' && (
        <Center role="status" data-testid="kart-waiting">
          {t('games.kart.race.waiting', { ready, total })}
        </Center>
      )}
      {view.phase === 'countdown' && !counting && (
        <Center role="status">{t('games.kart.race.ready')}</Center>
      )}
      {trial && (counting || (trial.phase === 'racing' && trial.wrongWay)) && (
        <RaceCenter t={t} trial={trial} onRestart={() => {}} />
      )}
      {finished && (
        <Finish role="status" data-testid="kart-finish">
          <FinishTitle>{t('games.kart.race.finishedPlace', { place: place || 1 })}</FinishTitle>
          <Standings view={view} order={order} nameOf={nameOf} />
          <Muted>{t('games.kart.race.waitingOthers')}</Muted>
        </Finish>
      )}
      <Bottom>
        <Hud t={t} hud={hud} maxStored={settings.tuning.maxStoredBoosts} />
      </Bottom>
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
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
`

const Tags = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
`

const Tag = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  max-width: 12em;
  padding: 2px ${space.sm}px;
  overflow: hidden;
  border-radius: ${radius.component}px;
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
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

const PlacePanel = styled.div`
  ${glass}
  padding: ${space.xs}px ${space.md}px;
`

const PlaceNumber = styled.span`
  ${displayType}
  color: ${color.text};
  font-size: ${fontSize.xl}px;
`

const pulse = keyframes`
  from { opacity: 1; }
  to { opacity: 0.55; }
`

const Unstable = styled.p`
  margin: 0;
  padding: ${space.xs}px ${space.sm}px;
  border-radius: ${radius.component}px;
  color: ${color.onAccent};
  background: ${color.danger};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  animation: ${pulse} 0.8s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const MapCorner = styled.div`
  position: absolute;
  top: ${space.sm}px;
  right: ${space.sm}px;
  display: grid;
  justify-items: end;
  gap: ${space.xs}px;
  pointer-events: none;
`

const Center = styled.p`
  ${glass}
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
  ${glass}
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
  font-size: ${fontSize.xl}px;
`

const Muted = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Bottom = styled.div`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
`

const Fallback = styled.section`
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;

  p {
    margin: 0;
  }
`
