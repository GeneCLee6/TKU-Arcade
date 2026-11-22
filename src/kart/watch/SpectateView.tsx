// e9-t10: watching a race live (AC-9.5), for someone in the room with no kart in it (came in late,
// or never sat down) and for a racer who has finished or dropped out. Every joined socket already
// gets every kart's frames (docs/KART-NETCODE.md §2): they are drawn as a racer draws the others
// (remotes.ts, 100 ms behind), and the camera follows the kart chosen, from behind or from above.
import { loadoutOfByte } from '../../../shared/kart/karts.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KartView } from '../../../shared/games/kart/types.ts'
import { itemBoxes } from '../../../shared/kart/items.ts'
import { readRelayed, type KartFrame } from '../../../shared/kart/net.ts'
import { shotLive, shotPosition } from '../../../shared/kart/shots.ts'
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
  Fallback,
  MapCorner,
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
import { Button } from '../../components/Button.tsx'
import { TeamGauges, TeamScore } from '../race/TeamHud.tsx'

/** The kart and driver a frame's body byte names (e10-t05) */
function kartOfByte(byte: number) {
  const { kart, driver } = loadoutOfByte(byte)
  return { body: kart, driver }
}

/** How often the places are worked out again */
/** The karts are drawn about this far behind the room's clock, seconds (interpolation) */
const WATCH_LAG = 0.1
const POLL_MS = 250

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
  const latest = useRef(view)
  const followRef = useRef(follow)
  const overheadRef = useRef(overhead)
  const frames = useRef(new Map<number, KartFrame>())
  useLayoutEffect(() => {
    latest.current = view
    followRef.current = follow
    overheadRef.current = overhead
  })

  const command = (which: WatchCommand) => {
    if (which === 'view') setOverhead((now) => !now)
    if (which === 'next' || which === 'previous') {
      setFollow((now) => cycleSeat(order, now, which === 'next' ? 1 : -1))
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
    const stopListening = realtime.listen((data) => {
      const relayed = readRelayed(data)
      if (!relayed) return
      frames.current.set(relayed.seat, relayed.frame)
      remotes.add(relayed.seat, relayed.frame, performance.now() / 1000)
    })
    const boxes = itemBoxes(track)
    // 2026-11-17: the hits from here on spin their karts (hitFx.ts)
    const hitFeed = createHitFeed(null, latest.current.used)
    // #86: and the items sound around the kart followed
    const ears = createWatchEars(latest.current.used)
    const player = createCuePlayer()
    const stopUnlock = unlockOnGesture(player)
    let stop: (() => void) | undefined
    try {
      stop = engine.startWatchLoop(stage.current, {
        track,
        quality: loadQuality(),
        frame() {
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
          let props = null
          let hits = null
          if (room.mode === 'items') {
            const now = clock.now()
            const started = hitFeed.read(room.events, now).effects
            const where = (seat: number) => karts.find((kart) => kart.id === seat)
            hits = hitFrameOf(hitFeed.effects, started, now, where)
            for (const heard of ears.read(room.events, now, followRef.current, where)) {
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
                .map((shot) => ({
                  n: shot.n,
                  item: shot.item,
                  ...shotPosition(
                    shot,
                    now,
                    shot.target === null
                      ? null
                      : (karts.find((kart) => kart.id === shot.target) ?? null),
                  ),
                })),
            }
          }
          // 2026-11-22: the race clock for the moving obstacles, from the room's GO (the karts
          // are drawn a moment behind, as they are interpolated)
          const goAt = latest.current.goAt
          const tick = goAt === null ? 0 : Math.max(0, ((clock.now() - goAt) / 1000 - WATCH_LAG) * 60)
          return { karts, follow: followRef.current, overhead: overheadRef.current, props, hits, tick }
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
      stopListening()
      clock.stop()
      stopUnlock()
      player.dispose()
    }
  }, [realtime, track, failure, engine])

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

  return (
    <WatchPage data-testid="kart-spectate">
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
        {view.racers.map((one) => (
          <NameTag key={one.seat} data-tag={one.seat} style={{ display: 'none' }}>
            {nameOf(one.seat)}
          </NameTag>
        ))}
      </TagLayer>
      <TopLeft>
        <WatchedPanel
          t={t}
          name={name}
          place={follow === null ? 0 : order.indexOf(follow) + 1}
          total={view.racers.length}
          detail={detail}
        />
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
        <Minimap ref={minimap} t={t} road={track.road} gates={track.gates} forks={track.forks} />
      </MapCorner>
      <WatchControls
        t={t}
        overhead={overhead}
        onCommand={command}
        onClose={onClose}
        keys={t('games.kart.watch.keys')}
      />
    </WatchPage>
  )
}
