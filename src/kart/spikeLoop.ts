import { advanceClock } from '../../shared/kart/clock.ts'
import {
  INITIAL_KART,
  kartSlip,
  kartSpeed,
  poseBetween,
  stepKart,
  type KartState,
} from '../../shared/kart/physics.ts'
import { inputFromKeys, scrollsThePage } from './keyboard.ts'
import { createKartScene } from './Scene.ts'

const STATS_EVERY_MS = 500

export interface SpikeStats {
  readonly fps: number
  readonly slowestMs: number
  readonly speed: number
  readonly slipDegrees: number
  readonly drifting: boolean
  readonly drawingBuffer: string
  readonly rendererName: string
}

/** What tests and a curious owner can read from the console. It stays after the loop stops. */
export interface SpikeDebug {
  running: boolean
  tick: number
  frames: number
  state: KartState
}

declare global {
  interface Window {
    __kartSpike?: SpikeDebug
  }
}

export interface SpikeOptions {
  readonly onStats: (stats: SpikeStats) => void
  readonly onContextLost: () => void
}

/**
 * The game loop, outside React (docs/ARCHITECTURE.md §4): rendering follows the display, the physics
 * runs in fixed steps. Returns the function that stops everything; it may be called more than once.
 * Throws when WebGL is unavailable.
 */
export function startSpikeLoop(container: HTMLElement, options: SpikeOptions): () => void {
  const scene = createKartScene(container)
  const held = new Set<string>()
  const debug: SpikeDebug = { running: true, tick: 0, frames: 0, state: INITIAL_KART }
  window.__kartSpike = debug

  let previous = INITIAL_KART
  let current = INITIAL_KART
  let accumulator = 0
  let lastFrame: number | undefined
  let handle = 0

  let statsFrom: number | undefined
  let statsFrames = 0
  let slowest = 0

  const frame = (now: number) => {
    handle = requestAnimationFrame(frame)
    const frameMs = lastFrame === undefined ? 0 : now - lastFrame
    lastFrame = now

    const clock = advanceClock(accumulator, frameMs / 1000)
    accumulator = clock.accumulator
    const input = inputFromKeys(held)
    for (let step = 0; step < clock.steps; step++) {
      previous = current
      current = stepKart(current, input)
    }
    debug.tick += clock.steps
    debug.frames++
    debug.state = current
    scene.draw(poseBetween(previous, current, clock.alpha), frameMs / 1000)

    statsFrom ??= now
    statsFrames++
    slowest = Math.max(slowest, frameMs)
    const span = now - statsFrom
    if (span >= STATS_EVERY_MS) {
      options.onStats({
        fps: ((statsFrames - 1) * 1000) / span,
        slowestMs: slowest,
        speed: kartSpeed(current),
        slipDegrees: (kartSlip(current) * 180) / Math.PI,
        drifting: current.drifting,
        drawingBuffer: scene.drawingBuffer(),
        rendererName: scene.rendererName,
      })
      statsFrom = now
      statsFrames = 1
      slowest = 0
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    held.add(event.code)
    if (scrollsThePage(event.code)) event.preventDefault()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code)
  }
  // The key-up of a key let go in another window never arrives
  const onBlur = () => held.clear()

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    debug.running = false
    cancelAnimationFrame(handle)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    scene.canvas.removeEventListener('webglcontextlost', onContextLost)
    scene.dispose()
  }
  const onContextLost = () => {
    stop()
    options.onContextLost()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  scene.canvas.addEventListener('webglcontextlost', onContextLost)
  handle = requestAnimationFrame(frame)
  return stop
}
