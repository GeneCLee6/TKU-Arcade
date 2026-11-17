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
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import { cycleSeat, watchOrder, type WatchCommand } from '../../../shared/kart/watch.ts'
import '../../games/kart/messages.ts'
import { useT } from '../../i18n/useT.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { Minimap, type MinimapHandle } from '../Minimap.tsx'
import { loadQuality } from '../quality.ts'
import { createRemotes } from '../race/remotes.ts'
import { supportsWebGL2 } from '../Scene.ts'
import { createHitFeed, hitFrameOf } from '../hitFx.ts'
import { createServerClock } from './serverClock.ts'
import { startWatchLoop, type WatchedKart } from './watchLoop.ts'
import {
  Fallback,
  MapCorner,
  NameTag,
  TagLayer,
  TopLeft,
  WatchControls,
  WatchedPanel,
  WatchPage,
  WatchStage,
} from './WatchParts.tsx'
import { placeTags, TAG_HEIGHT, useWatchKeys } from './watchDom.ts'
import { Button } from '../../components/Button.tsx'

/** The kart and driver a frame's body byte names (e10-t05) */
function kartOfByte(byte: number) {
  const { kart, driver } = loadoutOfByte(byte)
  return { body: kart, driver }
}

/** How often the places are worked out again */
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
    if (!stage.current || !track || failure) return
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
    let stop: (() => void) | undefined
    try {
      stop = startWatchLoop(stage.current, {
        track,
        quality: loadQuality(),
        frame() {
          const poses = remotes.poses(performance.now() / 1000)
          const karts = poses.map((pose): WatchedKart => ({
            id: pose.seat,
            x: pose.x,
            z: pose.z,
            heading: pose.heading,
            vx: pose.vx,
            vz: pose.vz,
            skidding: pose.frame.skidding,
            // e10-t05: the frame's body byte names the kart and its driver
            ...kartOfByte(pose.frame.body),
            look: {
              speed: pose.vx * Math.sin(pose.heading) - pose.vz * Math.cos(pose.heading),
              steer: pose.frame.steer,
              drift: pose.frame.driftDirection,
              boosting: pose.frame.boosting,
            },
          }))
          const room = latest.current
          let props = null
          let hits = null
          if (room.mode === 'items') {
            const now = clock.now()
            const started = hitFeed.read(room.events, now).effects
            hits = hitFrameOf(hitFeed.effects, started, now, (seat) =>
              karts.find((kart) => kart.id === seat),
            )
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
          return { karts, follow: followRef.current, overhead: overheadRef.current, props, hits }
        },
        drawn(scene, frame) {
          const shown = frame.karts.filter((kart) => kart.id !== frame.follow)
          const points = scene.project(shown.map((kart) => [kart.x, TAG_HEIGHT, kart.z] as const))
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
    }
  }, [realtime, track, failure])

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
          item={view.mode === 'items' ? (racer?.item ?? null) : undefined}
        />
      </TopLeft>
      <MapCorner>
        <Minimap ref={minimap} t={t} road={track.road} gates={track.gates} />
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
