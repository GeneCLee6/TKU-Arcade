// e9-t10: the scene for watching a race, live or replayed. No kart of this browser's own: every kart
// is drawn as one of the "others", and the camera follows the one being watched. Each animation
// frame asks the view for the karts (`frame`), so a live view and a replay differ only in that.
import { gridSpot } from '../../../shared/kart/race.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { padCommands, type WatchCommand } from '../../../shared/kart/watch.ts'
import { readGamepad } from '../devices.ts'
import type { Quality } from '../quality.ts'
import { createKartScene, type ItemProps, type KartScene, type OtherKart } from '../Scene.ts'

/** A kart to draw, with what the camera needs to follow it */
export interface WatchedKart extends OtherKart {
  readonly vx: number
  readonly vz: number
  readonly skidding: boolean
}

export interface WatchFrame {
  readonly karts: readonly WatchedKart[]
  /** The kart the camera follows; the grid's first spot while it has none */
  readonly follow: number | null
  readonly overhead: boolean
  /** The item race's boxes and shields; null for none */
  readonly props: ItemProps | null
}

export interface WatchLoopOptions {
  readonly track: Track
  readonly quality: Quality
  /** What to draw this frame, `seconds` after the last one */
  frame(seconds: number): WatchFrame
  /** After drawing: name tags and the minimap */
  drawn?(scene: KartScene, frame: WatchFrame): void
  /** A gamepad button pressed */
  onCommand?(command: WatchCommand): void
  onContextLost(): void
}

/** Starts drawing into `container`; returns the way to stop. Throws when three.js cannot start */
export function startWatchLoop(container: HTMLElement, options: WatchLoopOptions): () => void {
  const { track } = options
  const scene = createKartScene(container, [], track, options.quality)
  const grid = gridSpot(track, 0)
  let handle = 0
  let last = performance.now()
  let followed: number | null | undefined
  let buttons: boolean[] = []

  const frame = (now: number) => {
    handle = requestAnimationFrame(frame)
    const seconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    const pad = readGamepad()
    const pressed = pad?.snapshot.buttons.map((value) => value > 0.5) ?? []
    for (const command of padCommands(buttons, pressed)) options.onCommand?.(command)
    buttons = pressed
    const watched = options.frame(seconds)
    scene.others(watched.karts, seconds)
    if (watched.props) scene.items(watched.props, seconds)
    const kart = watched.karts.find((one) => one.id === watched.follow)
    const pose = kart ?? { x: grid.x, z: grid.z, heading: grid.heading }
    // A new kart to follow: the camera starts behind it rather than swinging round from the last
    if (followed !== (kart?.id ?? null)) {
      followed = kart?.id ?? null
      scene.snapCamera(pose.heading)
    }
    scene.watch(
      pose,
      {
        heading: pose.heading,
        vx: kart?.vx ?? 0,
        vz: kart?.vz ?? 0,
        boosting: kart?.look.boosting ?? false,
        skidding: kart?.skidding ?? false,
      },
      seconds,
      watched.overhead,
    )
    options.drawn?.(scene, watched)
  }

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(handle)
    scene.canvas.removeEventListener('webglcontextlost', onContextLost)
    scene.dispose()
  }
  const onContextLost = () => {
    stop()
    options.onContextLost()
  }
  scene.canvas.addEventListener('webglcontextlost', onContextLost)
  handle = requestAnimationFrame(frame)
  return stop
}
