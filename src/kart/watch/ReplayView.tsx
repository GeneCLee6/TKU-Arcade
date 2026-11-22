// e9-t10: the whole race again, after it (AC-9.5). The replay is what this browser recorded while
// the race ran (shared/kart/replay.ts): every kart ten times a second, the items used and held, and
// the results. Play, pause, speed, jump about the timeline, follow any kart, from behind or above.
import { loadoutOfByte } from '../../../shared/kart/karts.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { ITEM_TUNING } from '../../../shared/kart/items.ts'
import {
  advancePlayhead,
  heldAt,
  lapsAt,
  msToTicks,
  openReplay,
  sampleAt,
  seekPlayhead,
  mirrorsAt,
  shieldsAt,
  stepSpeed,
  teamBurnsAt,
  teamGaugesAt,
  TICKS_PER_SECOND,
  togglePlayhead,
  type Playhead,
  type Replay,
  type ReplayReel,
} from '../../../shared/kart/replay.ts'
import { shotsAt } from '../../../shared/kart/replayShots.ts'
import { runningScore } from '../../../shared/kart/team.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { Track } from '../../../shared/kart/track.ts'
import {
  cycleSeat,
  SEEK_SECONDS,
  watchOrder,
  type WatchCommand,
} from '../../../shared/kart/watch.ts'
import { Button } from '../../components/Button.tsx'
import { raceTime } from '../../games/kart/raceTime.ts'
import '../../games/kart/messages.ts'
import { hasMessage, type TextKey } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Minimap, type MinimapHandle } from '../Minimap.tsx'
import { loadQuality } from '../quality.ts'
import { supportsWebGL2 } from '../webgl.ts'
import { crossed, effectsOf, hitFrameOf } from '../hitFx.ts'
import { createCuePlayer } from '../kartAudio.ts'
import { replayCues } from '../watchSounds.ts'
import { TeamGauges, TeamScore } from '../race/TeamHud.tsx'
import type { WatchedKart } from './watchLoop.ts'
import { WATCH_ENGINE } from '../load/kartLoad.ts'
import { KartLoading } from '../load/KartLoading.tsx'
import { useKartLoad } from '../load/useKartLoad.ts'
import ReplayShare from './ReplayShare.tsx'
import {
  Fallback,
  MapCorner,
  WatchTop,
  NameTag,
  Note,
  Row,
  TagLayer,
  TopLeft,
  WatchControls,
  WatchedItem,
  WatchedPanel,
  WatchPage,
  WatchStage,
} from './WatchParts.tsx'
import { placeTags, TAG_HEIGHT, unlockOnGesture, useWatchKeys } from './watchDom.ts'

/** The kart and driver a frame's body byte names (e10-t05) */
function kartOfByte(byte: number) {
  const { kart, driver } = loadoutOfByte(byte)
  return { body: kart, driver }
}

/** How often the controls and the panel catch up with the playhead */
const UI_MS = 100
/** An item used shows this long after its moment, ticks */
const NOTE_TICKS = 2 * TICKS_PER_SECOND
const SHIELD_TICKS = msToTicks(ITEM_TUNING.shieldMs)
const MIRROR_TICKS = msToTicks(ITEM_TUNING.mirrorMs)

export interface ReplayViewProps {
  replay: Replay
  nameOf: (seat: number) => string
  /** Who is watching: the first kart followed, if it raced */
  you: number | null
  onClose: () => void
  /**
   * 2026-11-20 (§11.4): the track's revision it was recorded on, where known (opened from a file),
   * kept when it is saved again; and a line to show over it (the track has changed since)
   */
  revision?: number
  notice?: string | null
}

/** Every kart at `tick` */
function kartsAt(reel: ReplayReel, tick: number): WatchedKart[] {
  const karts: WatchedKart[] = []
  // A team race: whose blue boost burns at this moment (their flames are blue)
  const burning = teamBurnsAt(reel.replay.teams, tick)
  for (const [seat, samples] of reel.samples) {
    const one = sampleAt(samples, tick)
    if (!one) continue
    karts.push({
      id: seat,
      x: one.x,
      z: one.z,
      heading: one.heading,
      vx: one.vx,
      vz: one.vz,
      skidding: one.skidding,
      // e10-t05: the frame's body byte names the kart and its driver
      ...kartOfByte(one.body),
      look: {
        speed: one.vx * Math.sin(one.heading) - one.vz * Math.cos(one.heading),
        steer: one.steer,
        drift: one.driftDirection,
        boosting: one.boosting,
        ...(one.boosting && burning.has(seat) ? { boostKind: 'team' as const } : {}),
      },
    })
  }
  return karts
}

/** The places at `tick`: a finish counts from its moment on */
function orderAt(track: Track, reel: ReplayReel, tick: number): number[] {
  return watchOrder(
    track,
    reel.replay.racers.map((racer) => ({
      seat: racer.seat,
      finishMs:
        racer.finishMs !== null && msToTicks(racer.finishMs) <= tick ? racer.finishMs : null,
      out: racer.out && tick >= (reel.samples.get(racer.seat)?.at(-1)?.tick ?? 0),
    })),
    (seat) => {
      const samples = reel.samples.get(seat)
      return samples ? sampleAt(samples, tick) : null
    },
  )
}

export default function ReplayView({
  replay,
  nameOf,
  you,
  onClose,
  revision,
  notice,
}: ReplayViewProps) {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const tagLayer = useRef<HTMLDivElement>(null)
  const minimap = useRef<MinimapHandle>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const reel = useMemo(() => openReplay(replay), [replay])
  const track = useMemo(() => raceTrack(replay.track), [replay.track])
  // 2026-11-21 (§4.52): the engine and the track's own scenery, fetched before the scene is built
  // (the karts' families come as they show)
  const load = useKartLoad(track ? { engine: WATCH_ENGINE, track } : null, track?.id ?? '')
  const engine = load.engine
  // The room's name for it, where the room's details are here (a custom track: none)
  const courseKey = `games.kart.track.${track?.id}`
  const courseTitle = hasMessage(courseKey) ? t(courseKey as TextKey) : null
  const [shown, setShown] = useState<Playhead>(() => ({
    tick: reel.start,
    playing: true,
    speed: 1,
  }))
  const head = useRef<Playhead>(shown)
  const seats = useMemo(() => [...reel.samples.keys()], [reel])
  const [follow, setFollow] = useState<number | null>(() =>
    you !== null && reel.samples.has(you) ? you : (seats[0] ?? null),
  )
  const [overhead, setOverhead] = useState(false)
  const followRef = useRef(follow)
  const overheadRef = useRef(overhead)
  useLayoutEffect(() => {
    followRef.current = follow
    overheadRef.current = overhead
  })
  const order = useMemo(
    () => (track ? orderAt(track, reel, shown.tick) : seats),
    [track, reel, shown.tick, seats],
  )

  const move = (next: Playhead) => {
    head.current = next
    setShown(next)
  }
  const command = (which: WatchCommand) => {
    const now = head.current
    switch (which) {
      case 'view':
        setOverhead((on) => !on)
        return
      case 'next':
      case 'previous':
        setFollow((seat) => cycleSeat(order, seat, which === 'next' ? 1 : -1))
        return
      case 'pause':
        return move(togglePlayhead(now, reel))
      case 'back':
      case 'forward': {
        const jump = SEEK_SECONDS * TICKS_PER_SECOND * (which === 'back' ? -1 : 1)
        return move(seekPlayhead(now, now.tick + jump, reel))
      }
      case 'slower':
      case 'faster':
        return move({ ...now, speed: stepSpeed(now.speed, which === 'faster' ? 1 : -1) })
    }
  }
  const commandRef = useRef(command)
  useLayoutEffect(() => {
    commandRef.current = command
  })
  useWatchKeys(command)

  useEffect(() => {
    if (!stage.current || !track || failure || !engine) return
    let stop: (() => void) | undefined
    // 2026-11-17: the recorded hits spin their karts; a burst only when playing through its moment
    const fxEvents = reel.replay.events.map((event) => ({
      ...event,
      at: (event.tick * 1000) / TICKS_PER_SECOND,
    }))
    const hitEffects = fxEvents.flatMap((event) => effectsOf(event))
    // #86: and the items sound around the kart followed, while it plays through them
    const player = createCuePlayer(loadQuality())
    const stopUnlock = unlockOnGesture(player)
    let lastMs: number | null = null
    /** The playhead as the last frame left it: moved since, it was dragged or jumped */
    let lastTick: number | null = null
    try {
      stop = engine.startWatchLoop(stage.current, {
        track,
        quality: loadQuality(),
        frame(seconds) {
          const sought = lastTick !== null && head.current.tick !== lastTick
          head.current = advancePlayhead(head.current, seconds, reel)
          const tick = head.current.tick
          lastTick = tick
          const karts = kartsAt(reel, tick)
          const nowMs = (tick * 1000) / TICKS_PER_SECOND
          const playedThrough = !sought && lastMs !== null && nowMs > lastMs && nowMs - lastMs < 500
          const where = (seat: number) => karts.find((kart) => kart.id === seat)
          const hits = hitFrameOf(
            hitEffects,
            playedThrough ? crossed(hitEffects, lastMs as number, nowMs) : [],
            nowMs,
            where,
          )
          const heard = replayCues(
            fxEvents,
            playedThrough ? lastMs : null,
            nowMs,
            head.current.speed,
            followRef.current,
            where,
          )
          for (const one of heard) player.cue(one.cue, one.volume)
          lastMs = nowMs
          const props =
            reel.replay.mode === 'items'
              ? {
                  boxes: [],
                  shields: shieldsAt(reel.replay.events, tick, SHIELD_TICKS)
                    .map((seat) => karts.find((kart) => kart.id === seat))
                    .filter((kart) => kart !== undefined),
                  // 2026-11-20
                  mirrors: mirrorsAt(reel.replay.events, tick, MIRROR_TICKS)
                    .map((seat) => karts.find((kart) => kart.id === seat))
                    .filter((kart) => kart !== undefined),
                  shots: shotsAt(
                    reel.replay.shots,
                    tick,
                    (seat) => karts.find((kart) => kart.id === seat) ?? null,
                  ),
                }
              : null
          return { karts, follow: followRef.current, overhead: overheadRef.current, props, hits }
        },
        drawn(scene, frame) {
          const others = frame.karts.filter((kart) => kart.id !== frame.follow)
          const points = scene.tagPoints(
            others.map((kart) => kart.id),
            TAG_HEIGHT,
          )
          placeTags(
            tagLayer.current,
            others.map((kart, i) => ({ seat: kart.id, at: points[i] ?? null })),
          )
          const followed = frame.karts.find((kart) => kart.id === frame.follow)
          const samples = frame.follow === null ? undefined : reel.samples.get(frame.follow)
          if (followed && samples) {
            const gate = sampleAt(samples, head.current.tick)?.nextGate ?? 0
            minimap.current?.place(followed.x, followed.z, followed.heading, gate)
          }
        },
        onCommand: (which) => commandRef.current(which),
        onContextLost: () => setFailure(true),
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => {
      stop?.()
      stopUnlock()
      player.dispose()
    }
  }, [track, reel, failure, engine])

  // The controls follow the playhead a few times a second, not every frame
  useEffect(() => {
    const timer = setInterval(() => {
      setShown((last) =>
        last.tick === head.current.tick && last.playing === head.current.playing
          ? last
          : head.current,
      )
    }, UI_MS)
    return () => clearInterval(timer)
  }, [])

  if (failure || !track) {
    return (
      <Fallback>
        <p role="alert">{t('games.kart.race.noWebgl')}</p>
        <Button $variant="secondary" $size="sm" onClick={onClose}>
          {t('games.kart.watch.close')}
        </Button>
      </Fallback>
    )
  }

  const tick = shown.tick
  const racer = replay.racers.find((one) => one.seat === follow)
  const finished = racer?.finishMs != null && msToTicks(racer.finishMs) <= tick
  const lapsDone = racer ? lapsAt(racer, tick) : 0
  const detail = !racer
    ? ''
    : finished
      ? t('games.kart.race.finished')
      : t('games.kart.race.lap', {
          lap: Math.min(lapsDone + 1, replay.laps),
          laps: replay.laps,
        })
  const name = follow === null ? null : nameOf(follow)
  const recent = replay.events.filter(
    (event) => event.tick <= tick && tick - event.tick < NOTE_TICKS,
  )
  const ms = (ticks: number) => (Math.max(0, ticks) * 1000) / TICKS_PER_SECOND
  // A team race: the gauges and the score as they stood at this moment
  const teamGauge = teamGaugesAt(replay.teams, tick)
  const teamTotals = teamGauge
    ? runningScore(
        order,
        replay.racers.map((one) => ({
          seat: one.seat,
          ...(one.team !== undefined ? { team: one.team } : {}),
          finishMs: one.finishMs !== null && msToTicks(one.finishMs) <= tick ? one.finishMs : null,
          out: false,
        })),
      ).totals
    : null

  return (
    <WatchPage data-testid="kart-replay">
      <WatchStage
        ref={stage}
        role="img"
        aria-label={t('games.kart.watch.canvas', { name: name ?? '' })}
      />
      {!engine && (
        <KartLoading
          t={t}
          track={courseTitle}
          progress={load.progress}
          failed={load.failed}
          onRetry={load.retry}
        />
      )}
      <TagLayer ref={tagLayer} aria-hidden="true">
        {seats.map((seat) => (
          <NameTag key={seat} data-tag={seat} style={{ display: 'none' }}>
            {nameOf(seat)}
          </NameTag>
        ))}
      </TagLayer>
      <WatchTop>
        <TopLeft>
          <Title>{t('games.kart.replay.title')}</Title>
          <WatchedPanel
            t={t}
            name={name}
            place={follow === null ? 0 : order.indexOf(follow) + 1}
            total={replay.racers.length}
            detail={detail}
          />
          {teamGauge && teamTotals && (
            <>
              <TeamScore t={t} totals={teamTotals} mine={null} />
              <TeamGauges t={t} gauge={teamGauge} />
            </>
          )}
          {notice && (
            <Note role="status" data-testid="kart-replay-notice">
              {notice}
            </Note>
          )}
          {reel.start > 0 && <Note>{t('games.kart.replay.partial')}</Note>}
          {recent.map((event) => (
            <Note key={`${event.tick}-${event.by}-${event.item}`}>
              {t('games.kart.replay.used', {
                name: nameOf(event.by),
                item: t(`games.kart.item.${event.item}`),
              })}
            </Note>
          ))}
        </TopLeft>
        <WatchedItem
          t={t}
          item={
            replay.mode === 'items' && follow !== null
              ? heldAt(replay.held, follow, tick)
              : undefined
          }
        />
        <MapCorner>
          <Minimap ref={minimap} t={t} road={track.road} gates={track.gates} forks={track.forks} />
        </MapCorner>
      </WatchTop>
      <WatchControls
        t={t}
        overhead={overhead}
        onCommand={command}
        onClose={onClose}
        keys={`${t('games.kart.watch.keys')} · ${t('games.kart.replay.keys')}`}
      >
        <Timeline>
          <Time>{raceTime(ms(tick))}</Time>
          <input
            type="range"
            min={reel.start}
            max={reel.end}
            step={1}
            value={Math.round(tick)}
            aria-label={t('games.kart.replay.timeline')}
            aria-valuetext={raceTime(ms(tick))}
            data-testid="kart-replay-timeline"
            onChange={(event) => move(seekPlayhead(head.current, Number(event.target.value), reel))}
          />
          <Time>{raceTime(ms(reel.end))}</Time>
        </Timeline>
        <Row>
          <Button $variant="secondary" $size="sm" onClick={() => command('back')}>
            {t('games.kart.replay.back')}
          </Button>
          <Button
            $size="sm"
            onClick={() => command('pause')}
            data-testid="kart-replay-play"
            data-playing={shown.playing}
          >
            {shown.playing ? t('games.kart.replay.pause') : t('games.kart.replay.play')}
          </Button>
          <Button $variant="secondary" $size="sm" onClick={() => command('forward')}>
            {t('games.kart.replay.forward')}
          </Button>
          <Button $variant="ghost" $size="sm" onClick={() => command('slower')}>
            {t('games.kart.replay.slower')}
          </Button>
          <Speed data-testid="kart-replay-speed">
            {t('games.kart.replay.speed', { speed: shown.speed })}
          </Speed>
          <Button $variant="ghost" $size="sm" onClick={() => command('faster')}>
            {t('games.kart.replay.faster')}
          </Button>
          <ReplayShare replay={replay} nameOf={nameOf} you={you} revision={revision} size="sm" />
        </Row>
      </WatchControls>
    </WatchPage>
  )
}

const Title = styled.h2`
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
`

const Timeline = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: ${space.sm}px;
  align-items: center;
  width: 100%;

  input {
    width: 100%;
    accent-color: ${color.accent};

    /* A thumb drags it on a phone (2026-11-17) */
    @media (pointer: coarse) {
      min-height: 44px;
    }
  }
`

const Time = styled.span`
  ${monoType}
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const Speed = styled.span`
  ${monoType}
  min-width: 4ch;
  color: ${color.text};
  text-align: center;
`
