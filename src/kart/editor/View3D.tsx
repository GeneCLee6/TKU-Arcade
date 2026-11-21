// e10-t07: the track in 3D, as the race draws it (Scene.ts and the track art, the chosen scenery's
// light), with a kart flying round the road and the camera behind it or high above. Its own lazy
// chunk inside the editor's: three.js loads only when someone asks for the 3D view.
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { parseTrack, type Track, type TrackJson } from '../../../shared/kart/track.ts'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { loadBody, loadDriver } from '../bodies.ts'
import { loadQuality } from '../quality.ts'
import { loadTrackScenery } from '../art/trackScenery.ts'
import { createKartScene, supportsWebGL2 } from '../Scene.ts'

/** How fast the kart flies round, m/s */
const SPEED = 30

interface View3DProps {
  readonly track: TrackJson
  readonly overhead: boolean
  t: (key: KartMessageKey, params?: MessageParams) => string
}

export default function View3D({ track, overhead, t }: View3DProps) {
  const stage = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(() => !supportsWebGL2())
  const view = useRef({ overhead })
  useEffect(() => {
    view.current = { overhead }
  }, [overhead])

  useEffect(() => {
    if (!stage.current || failed) return
    const parsed = parseTrack(track)
    if ('problems' in parsed) return
    const road = parsed.track.road
    const along: number[] = []
    let total = 0
    road.forEach((point, index) => {
      along.push(total)
      const next = road[(index + 1) % road.length]!
      total += Math.hypot(next.x - point.x, next.z - point.z)
    })
    // 2026-11-21 (§4.52): a track's own scenery comes first (one from the editor has none: at once)
    const holder = stage.current
    let gone = false
    let stop = () => {
      gone = true
    }
    void loadTrackScenery(parsed.track).then(
      () => {
        if (!gone) stop = start(holder, parsed.track)
      },
      () => {
        if (!gone) setFailed(true)
      },
    )
    return () => stop()

    function start(holder: HTMLElement, built: Track): () => void {
      let scene: ReturnType<typeof createKartScene>
      try {
        scene = createKartScene(holder, [], built, loadQuality())
      } catch {
        queueMicrotask(() => setFailed(true))
        return () => {}
      }
      const body = loadBody()
      const driver = loadDriver()
      let distance = 0
      let segment = 0
      let last = performance.now()
      let handle = 0
      let first = true
      const frame = (now: number) => {
        handle = requestAnimationFrame(frame)
        const seconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
        last = now
        distance = (distance + SPEED * seconds) % total
        if (distance < along[segment]!) segment = 0
        while (segment + 1 < road.length && along[segment + 1]! <= distance) segment++
        const a = road[segment]!
        const b = road[(segment + 1) % road.length]!
        const span = Math.hypot(b.x - a.x, b.z - a.z) || 1
        const k = (distance - along[segment]!) / span
        const heading = Math.atan2(b.x - a.x, -(b.z - a.z))
        const pose = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading }
        if (first) {
          scene.snapCamera(heading)
          first = false
        }
        scene.others(
          [
            {
              id: 1,
              ...pose,
              body,
              driver,
              look: { speed: SPEED, steer: 0, drift: 0, boosting: false },
            },
          ],
          seconds,
        )
        scene.watch(
          pose,
          {
            heading,
            vx: Math.sin(heading) * SPEED,
            vz: -Math.cos(heading) * SPEED,
            boosting: false,
          },
          seconds,
          view.current.overhead,
        )
      }
      handle = requestAnimationFrame(frame)
      const onLost = () => setFailed(true)
      scene.canvas.addEventListener('webglcontextlost', onLost)
      return () => {
        cancelAnimationFrame(handle)
        scene.canvas.removeEventListener('webglcontextlost', onLost)
        scene.dispose()
      }
    }
  }, [track, failed])

  if (failed) return <NoWebgl role="alert">{t('kart.editor.noWebgl')}</NoWebgl>
  return <Stage ref={stage} role="img" aria-label={t('kart.editor.view3dLabel')} />
}

const Stage = styled.div`
  position: absolute;
  inset: 0;
`

const NoWebgl = styled.p`
  margin: 0;
  padding: ${space.lg}px;
  color: ${color.text};
  font-size: ${fontSize.md}px;
`
