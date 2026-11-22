// 2026-11-19: the garage's 3D preview (KartPreview.tsx). One small scene of its own: the picked
// vehicle and driver on a dark disc, under the afternoon's light, turning slowly; drag turns it by
// hand, and a switch opens its N2O shape. The same model the race draws (art/kartModel.ts), so what
// is picked is what is driven. No post-processing and no shadows: it is a few hundred pixels across
// and must cost next to nothing beside the race behind it.
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
import { buildKartModel, type KartModel } from '../art/kartModel.ts'
import { BODY_DETAIL } from '../art/bodyDetail.ts'
import { loadQuality } from '../quality.ts'
import { bodyReady } from '../art/vehicleBodies.ts'
import { buildKartEnvironment } from '../art/kartParts.ts'
import type { DriverGesture } from '../driverGestures.ts'

export interface PreviewStage {
  /** Shows this vehicle and driver (again, or another) */
  show(kart: KartId, driver: DriverId): void
  /** Opens or closes the N2O shape */
  boost(on: boolean): void
  /**
   * 2026-11-20 (§4.47): the driver does this, the kart standing still (the Grand Prix's podium);
   * undefined, back to the garage's idle drive
   */
  pose(gesture: DriverGesture | undefined): void
  /** What the picture is, for a screen reader */
  label(text: string): void
  dispose(): void
}

const MAX_PIXEL_RATIO = 2
/** Radians a second it turns by itself */
const SPIN = 0.5
/** Radians a pixel dragged */
const DRAG = 0.012

/**
 * The stage in `container`, on a canvas of its own (made and removed here, so that a stage made
 * again in the same place starts from a fresh one), or null where there is no WebGL (a test's DOM,
 * a blocked GPU). `still`: it does not turn by itself (prefers-reduced-motion)
 */
export function createPreviewStage(container: HTMLElement, still: boolean): PreviewStage | null {
  const canvas = document.createElement('canvas')
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return null
  }
  canvas.setAttribute('role', 'img')
  canvas.tabIndex = 0
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' })
  container.append(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  const scene = new Scene()
  const theme = kartThemes.day
  scene.add(new HemisphereLight(theme.hemisphereSky, theme.hemisphereGround, theme.hemisphereIntensity))
  const sun = new DirectionalLight(theme.sun, theme.sunIntensity)
  sun.position.set(-3, 6, -2)
  scene.add(sun)
  const environment = buildKartEnvironment(renderer)
  const floorMaterial = new MeshStandardMaterial({
    color: new Color(kartParts.dark),
    roughness: 0.6,
    metalness: 0.3,
    envMap: environment,
  })
  const floorGeometry = new CircleGeometry(2, 40)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const camera = new PerspectiveCamera(30, 1, 0.1, 50)
  // Seen from behind and to one side, as the chase camera sees it, a little above
  let yaw = 0.7
  let pitch = 0.36
  let model: KartModel | null = null
  let shown: { kart: KartId; driver: DriverId } | null = null
  let boosting = false
  let gesture: DriverGesture | undefined
  let dragging = false
  let lastX = 0
  let lastY = 0
  let last = performance.now()
  let frame = 0
  let disposed = false

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // A narrow panel sees the whole vehicle too: further back the taller the picture is
    camera.fov = camera.aspect < 1.6 ? 38 : 30
    camera.updateProjectionMatrix()
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(canvas)
  resize()

  const onDown = (event: PointerEvent) => {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    canvas.setPointerCapture(event.pointerId)
  }
  const onMove = (event: PointerEvent) => {
    if (!dragging) return
    yaw -= (event.clientX - lastX) * DRAG
    pitch = Math.max(0.05, Math.min(1.2, pitch + (event.clientY - lastY) * DRAG * 0.6))
    lastX = event.clientX
    lastY = event.clientY
  }
  const onUp = () => {
    dragging = false
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') yaw += 0.3
    else if (event.key === 'ArrowRight') yaw -= 0.3
    else return
    event.preventDefault()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('keydown', onKey)

  const draw = (now: number) => {
    if (disposed) return
    frame = requestAnimationFrame(draw)
    const seconds = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!dragging && !still) yaw += SPIN * seconds
    const distance = 4.5
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      0.5 + Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    camera.lookAt(0, 0.42, 0)
    model?.update(
      {
        speed: boosting ? 60 : gesture ? 0 : 14,
        steer: 0,
        drift: 0,
        boosting,
        ...(boosting ? { boostKind: 'n2o' as const } : {}),
        ...(gesture ? { gesture } : {}),
      },
      seconds,
    )
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(draw)

  const show = (kart: KartId, driver: DriverId): void => {
    if (shown && shown.kart === kart && shown.driver === driver) return
    const asked = { kart, driver }
    shown = asked
    // 2026-11-21 (bodyLoad.ts): a family not fetched yet comes first; the last pick wins
    if (!bodyReady(kart)) {
      void loadBodies([kart]).then(
        () => {
          if (disposed || shown !== asked) return
          shown = null
          show(kart, driver)
        },
        () => {},
      )
      return
    }
    if (model) {
      scene.remove(model.group)
      model.dispose()
    }
    model = buildKartModel(false, false, kart, driver, {
      environment,
      // 2026-11-22: the garage shows the body up close: its fine detail, as the race's quality has it
      detail: BODY_DETAIL[loadQuality()],
    })
    scene.add(model.group)
  }

  return {
    show,
    boost(on) {
      boosting = on
    },
    pose(next) {
      gesture = next
    },
    label(text) {
      canvas.setAttribute('aria-label', text)
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('keydown', onKey)
      if (model) {
        scene.remove(model.group)
        model.dispose()
      }
      floorGeometry.dispose()
      floorMaterial.dispose()
      environment.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
