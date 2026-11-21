// 2026-11-21 (owner: "the room should show everyone's character from the front and what they drive"):
// the 3D pictures on the race room's place cards (KartLobby.tsx). Eight cards, but one WebGL context:
// a single renderer off the page draws one card's vehicle and driver at a time, seen from the front,
// and each picture is copied onto that card's own 2D canvas. The cards take turns: every one each
// frame on a big screen, two a frame on a phone, none when off screen or the tab is hidden, and with
// less motion asked for each is drawn once, standing still. The same models the race draws
// (art/kartModel.ts) and the drivers' own gestures (driverGestures.ts): idle on the grid, arms up
// when they press Ready. Loaded on its own (three.js), after the cards are on the screen.
import {
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import { kartParts, kartThemes } from '../../styles/kartTokens.ts'
import { loadBodies } from '../art/bodyLoad.ts'
import { buildKartEnvironment } from '../art/kartParts.ts'
import { buildKartModel, type KartModel } from '../art/kartModel.ts'
import { bodyReady } from '../art/vehicleBodies.ts'
import type { DriverGesture } from '../driverGestures.ts'

export interface LobbyLook {
  readonly kart: KartId
  readonly driver: DriverId
  readonly ready: boolean
}

export interface LobbyStage {
  /** What place `slot` shows, or nothing (an open place) */
  set(slot: number, look: LobbyLook | null): void
  /** The canvas place `slot` is copied onto; null when its card goes */
  attach(slot: number, canvas: HTMLCanvasElement | null): void
  dispose(): void
}

export interface LobbyStageOptions {
  /** prefers-reduced-motion: each picture drawn once, standing still */
  readonly still: boolean
  /** A phone: fewer pictures a frame */
  readonly slow: boolean
}

/** The off-page picture, CSS pixels (the cards are about this size or smaller) */
const WIDTH = 220
const HEIGHT = 180
const MAX_PIXEL_RATIO = 1.5
/** A frame at most this often, ms */
const FRAME_MS = 33
/** Pictures drawn a frame: every place, or two on a phone */
const PER_FRAME = { fast: 8, slow: 2 }
/** Seen from the front, a little to one side, and swaying either side of it (radians, a second) */
const FRONT = Math.PI
const SWAY = 0.5
const SWAY_SPEED = 0.55
/** Arms up this long after pressing Ready, s */
const CHEER_FOR = 2.2

interface Place {
  look: LobbyLook | null
  model: KartModel | null
  built: string | null
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  visible: boolean
  /** Drawn since its last change (still mode draws each once) */
  fresh: boolean
  /** performance.now() when it turned ready, or null */
  readySince: number | null
}

/** The stage, or null where there is no WebGL (the cards stay as they are, words only) */
export function createLobbyStage({ still, slow }: LobbyStageOptions): LobbyStage | null {
  const offPage = document.createElement('canvas')
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas: offPage, antialias: true, alpha: true })
  } catch {
    return null
  }
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  renderer.setPixelRatio(ratio)
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const theme = kartThemes.day
  scene.add(new HemisphereLight(theme.hemisphereSky, theme.hemisphereGround, theme.hemisphereIntensity))
  const sun = new DirectionalLight(theme.sun, theme.sunIntensity)
  // From in front, so that the faces are lit
  sun.position.set(2, 6, -5)
  scene.add(sun)
  const environment = buildKartEnvironment(renderer)
  const floorMaterial = new MeshStandardMaterial({
    color: new Color(kartParts.dark),
    roughness: 0.6,
    metalness: 0.3,
    envMap: environment,
  })
  const floorGeometry = new CircleGeometry(1.9, 40)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const camera = new PerspectiveCamera(34, WIDTH / HEIGHT, 0.1, 50)

  const places: Place[] = Array.from({ length: 8 }, () => ({
    look: null,
    model: null,
    built: null,
    canvas: null,
    context: null,
    visible: true,
    fresh: false,
    readySince: null,
  }))
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const place = places.find((one) => one.canvas === entry.target)
            if (place) place.visible = entry.isIntersecting
          }
        })

  let disposed = false
  let handle = 0
  let lastFrame = 0
  let lastAt = performance.now()
  let turn = 0

  const build = (place: Place) => {
    const look = place.look
    const key = look ? `${look.kart}.${look.driver}` : null
    if (key === place.built) return
    if (place.model) {
      scene.remove(place.model.group)
      place.model.dispose()
      place.model = null
    }
    place.built = null
    if (!look) return
    // A family not fetched yet comes first (bodyLoad.ts); the last pick wins
    if (!bodyReady(look.kart)) {
      void loadBodies([look.kart]).then(
        () => {
          if (!disposed && place.look === look) {
            build(place)
            place.fresh = false
          }
        },
        () => {},
      )
      return
    }
    place.model = buildKartModel(false, false, look.kart, look.driver, { environment })
    place.model.group.visible = false
    scene.add(place.model.group)
    place.built = key
  }

  const drawPlace = (index: number, now: number, seconds: number) => {
    const place = places[index]!
    const model = place.model
    const context = place.context
    if (!model || !context || !place.canvas) return
    const cheering = place.readySince !== null && now - place.readySince < CHEER_FOR * 1000
    const gesture: DriverGesture = cheering ? 'cheer' : 'idle'
    model.group.visible = true
    model.update({ speed: 0, steer: 0, drift: 0, boosting: false, gesture }, still ? 1 : seconds)
    const yaw = FRONT + (still ? 0.35 : Math.sin(now / 1000 * SWAY_SPEED + index * 1.3) * SWAY)
    const distance = 3.7
    camera.position.set(Math.sin(yaw) * distance, 1.15, Math.cos(yaw) * distance)
    camera.lookAt(0, 0.6, 0)
    renderer.render(scene, camera)
    model.group.visible = false
    const target = place.canvas
    if (target.width !== offPage.width || target.height !== offPage.height) {
      target.width = offPage.width
      target.height = offPage.height
    }
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(offPage, 0, 0)
    place.fresh = true
  }

  const frame = (now: number) => {
    if (disposed) return
    handle = requestAnimationFrame(frame)
    if (now - lastFrame < FRAME_MS || document.hidden) return
    lastFrame = now
    const seconds = Math.min(0.2, (now - lastAt) / 1000)
    lastAt = now
    const due = places
      .map((place, index) => ({ place, index }))
      .filter(({ place }) => place.model && place.context && place.visible && (!still || !place.fresh))
    if (due.length === 0) return
    const count = Math.min(due.length, slow ? PER_FRAME.slow : PER_FRAME.fast)
    for (let n = 0; n < count; n++) {
      const { index } = due[(turn + n) % due.length]!
      // A phone's places are drawn less often: each moves on by the time since it was last drawn
      drawPlace(index, now, slow ? seconds * (due.length / count) : seconds)
    }
    turn = (turn + count) % Math.max(1, due.length)
  }
  handle = requestAnimationFrame(frame)

  return {
    set(slot, look) {
      const place = places[slot]
      if (!place) return
      const was = place.look
      place.look = look
      if (look?.ready && !was?.ready) place.readySince = performance.now()
      if (!look?.ready) place.readySince = null
      place.fresh = false
      build(place)
      if (!look && place.context && place.canvas) {
        place.context.clearRect(0, 0, place.canvas.width, place.canvas.height)
      }
    },
    attach(slot, canvas) {
      const place = places[slot]
      if (!place || place.canvas === canvas) return
      if (place.canvas) observer?.unobserve(place.canvas)
      place.canvas = canvas
      place.context = canvas ? canvas.getContext('2d') : null
      place.visible = true
      place.fresh = false
      if (canvas) observer?.observe(canvas)
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(handle)
      observer?.disconnect()
      for (const place of places) {
        if (place.model) {
          scene.remove(place.model.group)
          place.model.dispose()
        }
      }
      floorGeometry.dispose()
      floorMaterial.dispose()
      environment.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
