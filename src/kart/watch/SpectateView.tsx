// e9-t10: watching a race live (AC-9.5), for someone in the room with no kart in it (came in late,
// or never sat down) and for a racer who has finished or dropped out. Every joined socket already
// gets every kart's frames (docs/KART-NETCODE.md §2): they are drawn as a racer draws the others
// (remotes.ts, 100 ms behind), and the camera follows the kart chosen, from behind or from above.
import { loadoutOfByte } from '../../../shared/kart/karts.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KartView } from '../../../shared/games/kart/types.ts'
import { itemBoxes } from '../../../shared/kart/items.ts'
import { readRelayed, type KartFrame } from '../../../shared/kart/net.ts'
import { shotHeight, shotLive, shotPosition } from '../../../shared/kart/shots.ts'
import { courseOf } from '../../../shared/kart/track.ts'
import { runningScore } from '../../../shared/kart/team.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import { cycleSeat, watchOrder, type WatchCommand } from '../../../shared/kart/watch.ts'
import '../../games/kart/messages.ts'
import { hasMessage, type TextKey } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { Minimap, type MinimapHandle } from '../Minimap.tsx'
import { loadQuality } from '../quality.ts'
import { createRemotes } from '../race/remotes.ts'
import { supportsWebGL2 } from '../webgl.ts'
import { createHitFeed, hitFrameOf } from '../hitFx.ts'
import { createCuePlayer } from '../kartAudio.ts'
import { createWatchEars } from '../watchSounds.ts'
import { unlockOnGesture } from './watchDom.ts'
import { createServerClock } from './serverClock.ts'
import type { WatchedKart } from './watchLoop.ts'
import { WATCH_ENGINE } from '../load/kartLoad.ts'
import { KartLoading } from '../load/KartLoading.tsx'
import { useKartLoad } from '../load/useKartLoad.ts'
import {
  CleanHint,
  Fallback,
  MapCorner,
  WatchTop,
  NameTag,
  TagLayer,
  TopLeft,
  WatchControls,
  WatchedItem,
  WatchedPanel,
  WatchPage,
  WatchStage,
} from './WatchParts.tsx'
import { placeTags, TAG_HEIGHT, useWatchKeys } from './watchDom.ts'
import { useCloseCountdown } from '../ui/useCloseCountdown.ts'
import { CloseCountdown } from '../ui/RaceShow.tsx'
import { KART_FLOW_MESSAGES } from '../../../shared/kart/i18n.flow.ts'
import { registerMessages } from '../../i18n/t.ts'
import { Button } from '../../components/Button.tsx'
import { color } from '../../styles/tokens.ts'
import { TeamGauges, TeamScore } from '../race/TeamHud.tsx'
import type { BroadcastReadout, BroadcastRun } from './broadcast/broadcastRun.ts'
import { prefersReducedMotion, useBroadcastKit } from './broadcastSwitch.ts'

// The countdown's words (2026-11-23), without the rest of the kart's
registerMessages(KART_FLOW_MESSAGES)

/** The kart and driver a frame's body byte names (e10-t05) */
function kartOfByte(byte: number) {
  const { kart, driver } = loadoutOfByte(byte)
  return { body: kart, driver }
}

/** How often the places are worked out again */
/** The karts are drawn about this far behind the room's clock, seconds (interpolation) */
const WATCH_LAG = 0.1
const POLL_MS = 250
/** 2026-11-23: how often the broadcast's overlay catches up with the director */
const READOUT_MS = 200

export interface SpectateViewProps {
  view: KartView
  realtime: RoomRealtime
  nameOf: (seat: number) => string
  onClose: () => void
}

export default function SpectateView({ view, realtime, nameOf, onClose }: SpectateViewProps) {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const tagLayer = useRef<HTMLDivElement>(null)
  const minimap = useRef<MinimapHandle>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const track = useMemo(() => raceTrack(view.track), [view.track])
  // 2026-11-21 (§4.52): the engine and the track's own scenery, fetched before the scene is built
  // (the karts' families come as they show)
  const load = useKartLoad(track ? { engine: WATCH_ENGINE, track } : null, track?.id ?? '')
  const engine = load.engine
  // The room's name for it, where the room's details are here (a custom track: none)
  const courseKey = `games.kart.track.${track?.id}`
  const courseTitle = hasMessage(courseKey) ? t(courseKey as TextKey) : null
  const [order, setOrder] = useState<number[]>(() => view.racers.map((racer) => racer.seat))
  // A racer watching after the finish starts on someone else
  const [follow, setFollow] = useState<number | null>(null)
  const [overhead, setOverhead] = useState(false)
  // 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): the director picks the kart and the
  // camera; and the interface hidden for a clean picture
  const [broadcastOn, setBroadcastOn] = useState(false)
  const [clean, setClean] = useState(false)
  const kit = useBroadcastKit(broadcastOn)
  const run = useRef<BroadcastRun | null>(null)
  const [readout, setReadout] = useState<BroadcastReadout | null>(null)
  const latest = useRef(view)
  const followRef = useRef(follow)
  const overheadRef = useRef(overhead)
  const frames = useRef(new Map<number, KartFrame>())
  /** The room's clock while the race is drawn (the countdown after the first finish reads it) */
  const roomClock = useRef<{ now(): number } | null>(null)
  useLayoutEffect(() => {
    latest.current = view
    followRef.current = follow
    overheadRef.current = overhead
  })

  /** The broadcast off, the camera left on the kart it was showing */
  const takeOver = () => {
    const shown = run.current?.readout().seat
    if (shown !== undefined && shown !== null) setFollow(shown)
    setBroadcastOn(false)
  }
  const command = (which: WatchCommand) => {
    if (which === 'clean') setClean((now) => !now)
    if (which === 'broadcast') {
      if (broadcastOn) takeOver()
      else setBroadcastOn(true)
    }
    if (which !== 'view' && which !== 'next' && which !== 'previous') return
    // Choosing for oneself ends the broadcast
    const from = broadcastOn ? (run.current?.readout().seat ?? follow) : follow
    if (broadcastOn) takeOver()
    if (which === 'view') setOverhead((now) => !now)
    if (which === 'next' || which === 'previous') {
      setFollow(cycleSeat(order, from, which === 'next' ? 1 : -1))
    }
  }
  const commandRef = useRef(command)
  useLayoutEffect(() => {
    commandRef.current = command
  })
  useWatchKeys(command)

  useEffect(() => {
    if (!stage.current || !track || failure || !engine) return
    const remotes = createRemotes()
    const clock = createServerClock(realtime)
    roomClock.current = clock
    const stopListening = realtime.listen((data) => {
      const relayed = readRelayed(data)
      if (!relayed) return
      frames.current.set(relayed.seat, relayed.frame)
      remotes.add(relayed.seat, relayed.frame, performance.now() / 1000)
    })
    const boxes = itemBoxes(track)
    // 2026-11-23: the shots' heights, on a track with terrain
    const terrain = courseOf(track).terrain ?? null
    // 2026-11-17: the hits from here on spin their karts (hitFx.ts)
    const hitFeed = createHitFeed(null, latest.current.used)
    // #86: and the items sound around the kart followed
    const ears = createWatchEars(latest.current.used)
    const player = createCuePlayer(loadQuality())
    const stopUnlock = unlockOnGesture(player)
    let stop: (() => void) | undefined
    try {
      stop = engine.startWatchLoop(stage.current, {
        track,
        quality: loadQuality(),
        frame(seconds, scene) {
          const poses = remotes.poses(performance.now() / 1000)
          // A team race: whose blue boost burns now, by the room's word (their flames are blue)
          const teamNow = latest.current.teams ? clock.now() : 0
          const burning = new Set(
            latest.current.teams
              ? latest.current.racers
                  .filter((racer) => (racer.teamUntil ?? 0) > teamNow)
                  .map((racer) => racer.seat)
              : [],
          )
          const karts = poses.map((pose): WatchedKart => ({
            id: pose.seat,
            x: pose.x,
            z: pose.z,
            heading: pose.heading,
            vx: pose.vx,
            vz: pose.vz,
            airborne: pose.frame.airborne === true,
            skidding: pose.frame.skidding,
            // e10-t05: the frame's body byte names the kart and its driver
            ...kartOfByte(pose.frame.body),
            look: {
              speed: pose.vx * Math.sin(pose.heading) - pose.vz * Math.cos(pose.heading),
              steer: pose.frame.steer,
              drift: pose.frame.driftDirection,
              boosting: pose.frame.boosting,
              // (boostFx.ts: a blue boost; any other is worked out from how long it runs)
              ...(pose.frame.boosting && burning.has(pose.seat)
                ? { boostKind: 'team' as const }
                : {}),
            },
          }))
          const room = latest.current
          // The broadcast: the director picks the kart and the shot
          let follow = followRef.current
          let shot = null
          const director = run.current
          const goAt = room.goAt
          if (director && goAt !== null) {
            const directed = director.step(
              {
                time: (clock.now() - goAt) / 1000 - WATCH_LAG,
                order: watchOrder(track, room.racers, (seat) => frames.current.get(seat) ?? null),
                karts: poses.map((pose) => ({
                  seat: pose.seat,
                  x: pose.x,
                  z: pose.z,
                  heading: pose.heading,
                  vx: pose.vx,
                  vz: pose.vz,
                  airborne: pose.frame.airborne === true,
                  crossings: pose.frame.crossings,
                  nextGate: pose.frame.nextGate,
                })),
                racers: room.racers,
                hits: room.events
                  .filter((event) => event.hit && event.targets.length > 0)
                  .map((event) => ({
                    by: event.by,
                    target: event.targets[0]!,
                    at: (event.at - goAt) / 1000,
                  })),
                // 2026-11-23: the items in flight, for the hits the director foresees
                shots: (room.shots ?? [])
                  .filter((shot) => shotLive(shot, clock.now()))
                  .map((shot) => ({
                    n: shot.n,
                    by: shot.by,
                    target: shot.target,
                    ...shotPosition(
                      shot,
                      clock.now(),
                      shot.target === null ? null : (karts.find((kart) => kart.id === shot.target) ?? null),
                    ),
                  })),
              },
              seconds,
              () => scene.cameraPose(),
            )
            follow = directed.follow
            shot = directed.shot
          }
          let props = null
          let hits = null
          if (room.mode === 'items') {
            const now = clock.now()
            const started = hitFeed.read(room.events, now).effects
            const where = (seat: number) => karts.find((kart) => kart.id === seat)
            hits = hitFrameOf(hitFeed.effects, started, now, where)
            for (const heard of ears.read(room.events, now, follow, where)) {
              player.cue(heard.cue, heard.volume)
            }
            props = {
              boxes: boxes.map((box, i) => ({
                x: box.x,
                z: box.z,
                shown: (room.boxes[i] ?? Infinity) <= now,
              })),
              shields: room.racers
                .filter((racer) => (racer.shieldUntil ?? 0) > now)
                .map((racer) => karts.find((kart) => kart.id === racer.seat))
                .filter((kart) => kart !== undefined),
              // 2026-11-20: a mirror up
              mirrors: room.racers
                .filter((racer) => (racer.mirrorUntil ?? 0) > now)
                .map((racer) => karts.find((kart) => kart.id === racer.seat))
                .filter((kart) => kart !== undefined),
              // e9-t06b: the shots on the road; a cloud flies at its target as this browser sees it
              shots: (room.shots ?? [])
                .filter((shot) => shotLive(shot, now))
                .map((shot) => {
                  const y = shotHeight(shot, now, terrain)
                  return {
                    n: shot.n,
                    item: shot.item,
                    ...shotPosition(
                      shot,
                      now,
                      shot.target === null
                        ? null
                        : (karts.find((kart) => kart.id === shot.target) ?? null),
                    ),
                    ...(y !== null ? { y } : {}),
                  }
                }),
            }
          }
          // 2026-11-22: the race clock for the moving obstacles, from the room's GO (the karts
          // are drawn a moment behind, as they are interpolated)
          const tick = goAt === null ? 0 : Math.max(0, ((clock.now() - goAt) / 1000 - WATCH_LAG) * 60)
          return {
            karts,
            follow,
            overhead: director ? false : overheadRef.current,
            props,
            hits,
            tick,
            shot,
          }
        },
        drawn(scene, frame) {
          const shown = frame.karts.filter((kart) => kart.id !== frame.follow)
          const points = scene.tagPoints(
            shown.map((kart) => kart.id),
            TAG_HEIGHT,
          )
          placeTags(
            tagLayer.current,
            shown.map((kart, i) => ({ seat: kart.id, at: points[i] ?? null })),
          )
          const followed = frame.karts.find((kart) => kart.id === frame.follow)
          if (followed) {
            const gate = frames.current.get(followed.id)?.nextGate ?? 0
            minimap.current?.place(followed.x, followed.z, followed.heading, gate, frame.tick)
          }
          // 2026-11-23: the broadcast's map shows every kart (the dots, when it is on)
          minimap.current?.others?.(
            frame.karts
              .filter((kart) => kart.id !== frame.follow)
              .map((kart) => ({ seat: kart.id, x: kart.x, z: kart.z })),
          )
        },
        onCommand: (which) => commandRef.current(which),
        onContextLost: () => setFailure(true),
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => {
      stop?.()
      stopListening()
      clock.stop()
      roomClock.current = null
      stopUnlock()
      player.dispose()
    }
  }, [realtime, track, failure, engine])

  // The broadcast's director, once its chunk is here; gone when it is turned off
  useEffect(() => {
    if (!kit || !broadcastOn || !track) return
    run.current = kit.createBroadcastRun({
      track,
      laps: latest.current.laps,
      reducedMotion: prefersReducedMotion(),
    })
    const timer = setInterval(() => setReadout(run.current?.readout() ?? null), READOUT_MS)
    return () => {
      clearInterval(timer)
      run.current = null
      setReadout(null)
    }
  }, [kit, broadcastOn, track])

  // 2026-11-23 (#152): after the first finish, the seconds left to everyone still out, with a tock
  // for each, as the racers see them (shared/kart/opening.ts; the room closes the race then)
  const closeLeft = useCloseCountdown(view, () => roomClock.current?.now() ?? null)

  useEffect(() => {
    const timer = setInterval(() => {
      if (!track) return
      const room = latest.current
      const next = watchOrder(track, room.racers, (seat) => frames.current.get(seat) ?? null)
      setOrder((current) => (current.join() === next.join() ? current : next))
      // Nobody chosen yet: the leader, or whoever is next if that is this browser's own kart
      setFollow((now) => {
        if (now !== null && room.racers.some((racer) => racer.seat === now)) return now
        const heard = next.filter((seat) => frames.current.has(seat))
        return heard.find((seat) => seat !== room.you) ?? heard[0] ?? null
      })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [track])

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

  const racer = view.racers.find((one) => one.seat === follow)
  const detail = !racer
    ? ''
    : racer.finishMs !== null
      ? t('games.kart.race.finished')
      : racer.out
        ? t('games.kart.race.out')
        : t('games.kart.race.lap', {
            lap: Math.min(racer.lapMs.length + 1, view.laps),
            laps: view.laps,
          })
  const name = follow === null ? null : nameOf(follow)
  const Overlay = kit?.BroadcastOverlay
  const directing = broadcastOn && Overlay !== undefined && readout !== null

  return (
    <WatchPage data-testid="kart-spectate" data-clean={clean}>
      <WatchStage
        ref={stage}
        role="img"
        aria-label={t('games.kart.watch.canvas', { name: name ?? '' })}
        data-keep=""
        onClick={() => setClean(false)}
      />
      {clean && <CleanHint data-keep="">{t('games.kart.broadcast.cleanHint')}</CleanHint>}
      {directing && <Overlay t={t} readout={readout} nameOf={nameOf} laps={view.laps} live />}
      {closeLeft !== null && (
        <CloseCountdown
          label={t('kart.flow.close.label')}
          seconds={closeLeft}
          timeUp={t('kart.flow.close.timeUp')}
        />
      )}
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
        {view.racers.map((one) => (
          <NameTag key={one.seat} data-tag={one.seat} style={{ display: 'none' }}>
            {nameOf(one.seat)}
          </NameTag>
        ))}
      </TagLayer>
      <WatchTop>
        <TopLeft>
          {!directing && (
            <WatchedPanel
              t={t}
              name={name}
              place={follow === null ? 0 : order.indexOf(follow) + 1}
              total={view.racers.length}
              detail={detail}
            />
          )}
          {view.teams && (
            <>
              <TeamScore t={t} totals={runningScore(order, view.racers).totals} mine={null} />
              <TeamGauges t={t} gauge={view.teams.gauge} />
            </>
          )}
        </TopLeft>
        <WatchedItem
          t={t}
          item={view.mode === 'items' && follow !== null ? (racer?.item ?? null) : undefined}
        />
        <MapCorner>
          <Minimap
            ref={minimap}
            t={t}
            road={track.road}
            gates={track.gates}
            forks={track.forks}
            obstacles={track.obstacles}
            dots={directing ? view.racers.map((one) => one.seat).map((seat) => ({ seat, fill: color.text })) : undefined}
          />
        </MapCorner>
      </WatchTop>
      <WatchControls
        t={t}
        overhead={overhead}
        broadcast={broadcastOn}
        onCommand={command}
        onClose={onClose}
        keys={t('games.kart.watch.keys')}
      />
    </WatchPage>
  )
}
