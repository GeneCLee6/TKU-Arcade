// 2026-11-21 (owner: "the room should show everyone's character from the front and what they drive"):
// the 3D pictures on the race room's place cards (KartLobby.tsx). Eight cards, but one WebGL context:
// a single renderer off the page draws one card's vehicle and driver at a time, seen from the front,
// and each picture is copied onto that card's own 2D canvas. The cards take turns: every one each
// frame on a big screen, two a frame on a phone, none when off screen or the tab is hidden, and with
// less motion asked for each is drawn once, standing still. The same models the race draws
// (art/kartModel.ts) and the drivers' own gestures (driverGestures.ts): idle on the grid, arms up
// when they press Ready. Loaded on its own (three.js), after the cards are on the screen.
//
// 2026-11-22 (owner: "the drivers fill the screen"): the cards are as big as the screen lets them be
// (KartLobby.tsx), so the picture follows their size (measured, in steps, capped), the camera stands
// back just enough for a kart to fit the card's width, and a phone draws at one pixel a pixel.
//
// 2026-11-23 (#151): the drivers stand in front of their karts (kartModel.ts's `standing`; in the
// race they sit). A phone took turns drawing three cards a frame, about five frames a second each,
// which looked stuck rather than alive: now it draws each card once, again only when it changes (a
// new pick, Ready and its cheer, the cheer over, a new size), and the card's own CSS sways the
// picture gently (KartLobby.tsx), which the compositor does at the screen's own rate for nothing.
import {
  Box3,
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
import { buildKartModel, solidBox, type KartModel } from '../art/kartModel.ts'
import { BODY_DETAIL } from '../art/bodyDetail.ts'
import { releaseSharedTextures } from '../art/sharedTextures.ts'
import { loadQuality } from '../quality.ts'
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
  /** A phone: each picture drawn once and again only when it changes (the card's CSS moves it) */
  readonly slow: boolean
}

/** The off-page picture, CSS pixels: the cards' size, in steps of STEP, no bigger than this */
const START = { width: 220, height: 220 }
const MAX = { width: 380, height: 420 }
const MIN = 80
const STEP = 20
const MAX_PIXEL_RATIO = { fast: 1.5, slow: 1 }
/** A frame at most this often, ms */
const FRAME_MS = 33
/** Pictures drawn a frame: every place; on a phone, only those that changed, one a frame */
const PER_FRAME = { fast: 8, slow: 1 }
/** The camera's vertical field of view (degrees), and how much of a kart's width a card must show */
const FOV = 34
/** Room round the kart and driver in the picture, a share of their size */
const MARGIN = 1.16
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
  /** The gesture it was last drawn with (a phone draws again when it changes) */
  drawn: DriverGesture | null
  /** The kart and its standing driver: the middle across and along, half the width, the top */
  framing: { x: number; z: number; half: number; top: number } | null
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
  const ratio = Math.min(window.devicePixelRatio || 1, slow ? MAX_PIXEL_RATIO.slow : MAX_PIXEL_RATIO.fast)
  renderer.setPixelRatio(ratio)
  let size = { ...START }
  renderer.setSize(size.width, size.height, false)
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
  const camera = new PerspectiveCamera(FOV, size.width / size.height, 0.1, 50)
  const halfTan = Math.tan(((FOV / 2) * Math.PI) / 180)
  const frameCamera = () => {
    camera.aspect = size.width / size.height
    camera.updateProjectionMatrix()
  }
  frameCamera()
  /**
   * Far enough back for the kart and its driver beside it to fit the card: their width across it,
   * the driver's height up it (2026-11-23: standing, so worked out from each model's own size)
   */
  const distanceFor = (framing: NonNullable<Place['framing']>) =>
    Math.min(
      7,
      Math.max(
        3,
        (framing.half * MARGIN) / (halfTan * camera.aspect) + 0.9,
        ((framing.top / 2) * MARGIN) / halfTan + 0.9,
      ),
    )
  const box = new Box3()

  const places: Place[] = Array.from({ length: 8 }, () => ({
    look: null,
    model: null,
    built: null,
    canvas: null,
    context: null,
    visible: true,
    fresh: false,
    readySince: null,
    drawn: null,
    framing: null,
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

  // The cards' size: all of them alike, so the biggest seen sets the picture's
  const measured = new Map<HTMLCanvasElement, { width: number; height: number }>()
  const quantize = (value: number, max: number) =>
    Math.min(max, Math.max(MIN, Math.round(value / STEP) * STEP))
  const resize = () => {
    let width = 0
    let height = 0
    for (const one of measured.values()) {
      width = Math.max(width, one.width)
      height = Math.max(height, one.height)
    }
    if (width === 0 || height === 0) return
    const next = { width: quantize(width, MAX.width), height: quantize(height, MAX.height) }
    if (next.width === size.width && next.height === size.height) return
    size = next
    renderer.setSize(size.width, size.height, false)
    frameCamera()
    for (const place of places) place.fresh = false
  }
  const sizes =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLCanvasElement
            const box = entry.contentRect
            if (box.width > 0 && box.height > 0) measured.set(target, { width: box.width, height: box.height })
            else measured.delete(target)
          }
          resize()
        })

  /** Drawn once, and again only on a change: a phone, or less motion asked for */
  const stills = still || slow
  /** The gesture `place` shows at `now`: arms up for a while after Ready, otherwise at ease */
  const gestureOf = (place: Place, now: number): DriverGesture =>
    place.readySince !== null && now - place.readySince < CHEER_FOR * 1000 ? 'cheer' : 'idle'

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
    place.model = buildKartModel(
      false,
      false,
      look.kart,
      look.driver,
      { environment, detail: BODY_DETAIL[loadQuality()] },
      { standing: true },
    )
    solidBox(place.model.group, box)
    place.framing = {
      x: (box.min.x + box.max.x) / 2,
      z: (box.min.z + box.max.z) / 2,
      // Seen from the front, swaying a little: its width, and some of its length
      half: Math.max((box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 4),
      top: box.max.y,
    }
    place.model.group.visible = false
    scene.add(place.model.group)
    place.built = key
  }

  const drawPlace = (index: number, now: number, seconds: number) => {
    const place = places[index]!
    const model = place.model
    const context = place.context
    const framing = place.framing
    if (!model || !context || !place.canvas || !framing) return
    const gesture = gestureOf(place, now)
    place.drawn = gesture
    model.group.visible = true
    // Drawn once (a phone, less motion): the pose taken in full at once
    model.update({ speed: 0, steer: 0, drift: 0, boosting: false, gesture }, stills ? 1 : seconds)
    const yaw =
      FRONT +
      (stills ? (index % 2 === 0 ? 0.35 : -0.35) : Math.sin(now / 1000 * SWAY_SPEED + index * 1.3) * SWAY)
    // Round the middle of the kart and its driver; a tall card a little higher, looking down
    const tall = Math.max(0, 1 / camera.aspect - 1)
    const distance = distanceFor(framing)
    const middle = framing.top * 0.52
    camera.position.set(
      framing.x + Math.sin(yaw) * distance,
      middle + 0.35 + tall * 0.5,
      framing.z + Math.cos(yaw) * distance,
    )
    camera.lookAt(framing.x, middle + tall * 0.08, framing.z)
    renderer.render(scene, camera)
    model.group.visible = false
    const target = place.canvas
    if (target.width !== offPage.width || target.height !== offPage.height) {
      target.width = offPage.width
      target.height = offPage.height
    }
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(offPage, 0, 0, target.width, target.height)
    place.fresh = true
  }

  const frame = (now: number) => {
    if (disposed) return
    handle = requestAnimationFrame(frame)
    if (now - lastFrame < FRAME_MS || document.hidden) return
    lastFrame = now
    const seconds = Math.min(0.2, (now - lastAt) / 1000)
    lastAt = now
    // Drawn once, a card is drawn again when its gesture changes (Ready's cheer, and its end)
    if (stills) {
      for (const place of places) {
        if (place.fresh && place.model && place.drawn !== gestureOf(place, now)) place.fresh = false
      }
    }
    const due = places
      .map((place, index) => ({ place, index }))
      .filter(({ place }) => place.model && place.context && place.visible && (!stills || !place.fresh))
    if (due.length === 0) return
    const count = Math.min(due.length, slow ? PER_FRAME.slow : PER_FRAME.fast)
    for (let n = 0; n < count; n++) {
      const { index } = due[(turn + n) % due.length]!
      drawPlace(index, now, seconds)
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
      if (place.canvas) {
        observer?.unobserve(place.canvas)
        sizes?.unobserve(place.canvas)
        measured.delete(place.canvas)
      }
      place.canvas = canvas
      place.context = canvas ? canvas.getContext('2d') : null
      place.visible = true
      place.fresh = false
      if (canvas) {
        observer?.observe(canvas)
        sizes?.observe(canvas)
      }
    },
    dispose() {
      disposed = true
      releaseSharedTextures(renderer, scene)
      cancelAnimationFrame(handle)
      observer?.disconnect()
      sizes?.disconnect()
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
