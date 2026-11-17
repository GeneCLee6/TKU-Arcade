import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  PCFShadowMap,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Wall } from '../../shared/kart/walls.ts'
import type { Track } from '../../shared/kart/track.ts'
import { buildTrackArt, themeOf, type TrackArt } from './art/trackArt.ts'
import { QUALITY, type Quality } from './quality.ts'
import { createKartEffects } from './art/effects.ts'
import { createSpeedLines } from './art/speedLines.ts'
import { buildKartModel, type KartLook, type KartModel } from './art/kartModel.ts'
import type { KartBody } from './bodies.ts'
import { createItemArt, type ItemArt, type ItemBoxLook, type ShotLook } from './art/itemArt.ts'

const STILL: KartLook = { speed: 0, steer: 0, drift: 0, boosting: false }
import { kartScene, kartThemes } from '../styles/kartTokens.ts'
import { fieldOfView, followCar, REFERENCE_SPEED, startRig, type Chased } from './camera.ts'

const GROUND_SIZE = 400
const GRID_CELL = 5
const CAMERA_BACK = 7.5
const CAMERA_UP = 3.4
const CAMERA_LOOK_AHEAD = 3
/** Watching from above (e9-t10): this high, this far behind the kart */
const OVERHEAD_UP = 55
const OVERHEAD_BACK = 18
const MAX_PIXEL_RATIO = 2
/** Walls are drawn this high and this thick; the physics sees only their centre line */
const WALL_HEIGHT = 1.1
const WALL_THICKNESS = 0.5

export interface Pose {
  readonly x: number
  readonly z: number
  readonly heading: number
}

/** Another racer's kart (e9-t03): where it is drawn this frame, and how it looks */
export interface OtherKart extends Pose {
  readonly id: number
  readonly body: KartBody
  readonly look: KartLook
}

/**
 * The item race's things to draw this frame (e9-t05, e9-t06b): the boxes, the karts with a shield up,
 * and the shots on the road
 */
export interface ItemProps {
  readonly boxes: readonly ItemBoxLook[]
  readonly shields: readonly { readonly x: number; readonly z: number }[]
  readonly shots: readonly ShotLook[]
}

/** Where a point of the world is on the canvas, in CSS pixels from its top left; null off screen */
export type ScreenPoint = { readonly x: number; readonly y: number } | null

export interface KartScene {
  /** The GPU's name where the browser tells, so that an fps number says what it was measured on */
  readonly rendererName: string
  readonly canvas: HTMLCanvasElement
  /** `chased` is what the chase camera follows: the direction of travel, and whether it boosts */
  draw(pose: Pose, chased: Chased, frameSeconds: number, look?: KartLook): void
  /**
   * Watching (e9-t10): no kart of this browser's own; the camera follows `pose` (a kart drawn by
   * `others`) from behind, or from high above it with `overhead`
   */
  watch(pose: Pose, chased: Chased, frameSeconds: number, overhead: boolean): void
  /** Puts the camera straight behind the car at once, as after a reset */
  snapCamera(heading: number): void
  /** Where the best run's ghost is now (e8-t11), or null to hide it */
  ghost(pose: Pose | null): void
  /** The other racers' karts this frame (e9-t03); one missing from the list is taken away */
  others(karts: readonly OtherKart[], frameSeconds: number): void
  /** The item boxes and shields this frame (e9-t05); made the first time there are any */
  items(props: ItemProps, frameSeconds: number): void
  /** Where each of these points (x, height, z) is on screen, as of the last frame drawn */
  project(points: readonly (readonly [number, number, number])[]): ScreenPoint[]
  /** `{width}x{height}` of the drawing buffer */
  drawingBuffer(): string
  /** Frees everything on the GPU and takes the canvas out of the page */
  dispose(): void
}

/** Asks for a throwaway context, so that a browser without WebGL 2 never reaches three.js */
export function supportsWebGL2(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) return false
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  return true
}

/** Builds the scene inside `container`, with `walls` and, for a track, its art. Throws when three.js cannot start. */
export function createKartScene(
  container: HTMLElement,
  walls: readonly Wall[],
  track?: Track,
  quality: Quality = 'high',
  body: KartBody = 'tide',
): KartScene {
  const settings = QUALITY[quality]
  const renderer = new WebGLRenderer({
    antialias: settings.antialias,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO, settings.pixelRatio))
  // A track's art casts shadows near the car when the quality allows (e8-t06)
  const shadows = track !== undefined && settings.shadowMap > 0
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = PCFShadowMap
  renderer.domElement.style.display = 'block'
  container.append(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(kartScene.sky)
  scene.fog = new Fog(kartScene.sky, 70, 190)

  // A track's own light (N1): the harbour's low sunset sun, or the afternoon everywhere else
  const theme = track ? themeOf(track) : kartThemes.day
  scene.add(
    new HemisphereLight(theme.hemisphereSky, theme.hemisphereGround, theme.hemisphereIntensity),
  )
  const sun = new DirectionalLight(theme.sun, theme.sunIntensity)
  const [sunX, sunY, sunZ] = theme.sunDirection
  sun.position.set(sunX, sunY, sunZ)
  scene.add(sun, sun.target)
  if (shadows) {
    sun.castShadow = true
    sun.shadow.mapSize.set(settings.shadowMap, settings.shadowMap)
    // A box round the car, moved with it: sharp shadows near, none far off where nobody looks
    const reach = 45
    Object.assign(sun.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 1,
      far: 200,
    })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
  }

  const groundGeometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE)
  const groundMaterial = new MeshLambertMaterial({
    color: kartScene.ground,
    // Pushes the ground back in the depth buffer, so that the grid lying on it never flickers away
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  const grid = new GridHelper(
    GROUND_SIZE,
    GROUND_SIZE / GRID_CELL,
    kartScene.gridLine,
    kartScene.gridLine,
  )
  // A track brings its own ground and sky; the test yard keeps the plain plane and grid
  let art: TrackArt | null = null
  if (track) {
    art = buildTrackArt(track, {
      density: settings.density,
      shadows,
      anisotropy: Math.min(settings.anisotropy, renderer.capabilities.getMaxAnisotropy()),
    })
    scene.add(art.group)
    scene.fog = new Fog(theme.fog, 160, settings.fogFar)
    scene.background = new Color(theme.fog)
  } else {
    scene.add(ground, grid)
  }

  // The hover kart and its driver (e8-t07, 2026-11-14), with its sparks, trails and boost flames
  const kart = buildKartModel(shadows, false, body)
  const car = kart.group
  scene.add(car)
  const effects = createKartEffects(scene, kart)
  // Made the first time there is a ghost to show
  let ghostKart: KartModel | null = null
  // The other racers' karts, by id, made when each first appears
  const otherKarts = new Map<number, KartModel>()
  let itemArt: ItemArt | null = null
  const projected = new Vector3()

  // One box per wall, along its centre line: the test yard's. A track's art draws its own barriers
  const wallGeometry = new BoxGeometry(1, WALL_HEIGHT, WALL_THICKNESS)
  const wallMaterial = new MeshLambertMaterial({ color: kartScene.wall })
  for (const wall of track ? [] : walls) {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
    const mesh = new Mesh(wallGeometry, wallMaterial)
    // Long enough to close the gap at a corner
    mesh.scale.x = length + WALL_THICKNESS
    mesh.position.set((wall.ax + wall.bx) / 2, WALL_HEIGHT / 2, (wall.az + wall.bz) / 2)
    mesh.rotation.y = -Math.atan2(wall.bz - wall.az, wall.bx - wall.ax)
    scene.add(mesh)
  }

  const camera = new PerspectiveCamera(60, 1, 0.5, track ? 2600 : 260)
  // In the scene, so that the speed lines riding on it are drawn
  scene.add(camera)
  const speedLines = createSpeedLines(camera)
  let rig = startRig(0)
  let baseFov = 60
  // The boost's wider view is motion: not for a viewer who asked for less (read live, it can change)
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = container
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    // Held upright, a fixed vertical angle leaves almost nothing to the sides
    baseFov = camera.aspect < 1 ? 80 : 60
    camera.fov = baseFov
    camera.updateProjectionMatrix()
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  const gl = renderer.getContext()
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const rendererName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''

  return {
    rendererName,
    canvas: renderer.domElement,
    draw({ x, z, heading }, chased, frameSeconds, look = STILL) {
      car.position.set(x, 0, z)
      car.rotation.y = -heading
      kart.update(look, frameSeconds)
      effects.update({ x, z, heading }, look, frameSeconds)

      // The plane has no end: ground and grid follow the car in whole cells, so the lines stay put
      const snappedX = Math.round(x / GRID_CELL) * GRID_CELL
      const snappedZ = Math.round(z / GRID_CELL) * GRID_CELL
      ground.position.set(snappedX, 0, snappedZ)
      grid.position.set(snappedX, 0.01, snappedZ)
      if (shadows) {
        sun.position.set(x + sunX, sunY, z + sunZ)
        sun.target.position.set(x, 0, z)
      }
      art?.update(performance.now() / 1000)

      rig = followCar(rig, chased, frameSeconds)
      const fov = fieldOfView(baseFov, rig, reducedMotion?.matches ?? false)
      if (fov !== camera.fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      const motion = !(reducedMotion?.matches ?? false)
      speedLines.update(rig.pace, rig.pace * REFERENCE_SPEED, frameSeconds, !motion)
      // A little further back at speed, so the road rushes up from under the camera
      const back = CAMERA_BACK + (motion ? Math.min(1.5, rig.pace) * 1.2 : 0)
      const sin = Math.sin(rig.heading)
      const cos = Math.cos(rig.heading)
      camera.position.set(x - sin * back, CAMERA_UP, z + cos * back)
      camera.lookAt(x + sin * CAMERA_LOOK_AHEAD, 0.6, z - cos * CAMERA_LOOK_AHEAD)

      renderer.render(scene, camera)
    },
    watch({ x, z }, chased, frameSeconds, overhead) {
      car.visible = false
      if (shadows) {
        sun.position.set(x + sunX, sunY, z + sunZ)
        sun.target.position.set(x, 0, z)
      }
      art?.update(performance.now() / 1000)
      rig = followCar(rig, chased, frameSeconds)
      const motion = !(reducedMotion?.matches ?? false) && !overhead
      const fov = overhead ? baseFov : fieldOfView(baseFov, rig, !motion)
      if (fov !== camera.fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      speedLines.update(rig.pace, rig.pace * REFERENCE_SPEED, frameSeconds, !motion)
      const sin = Math.sin(rig.heading)
      const cos = Math.cos(rig.heading)
      if (overhead) {
        // High above and a little behind, still turning with the kart's way so the road reads ahead
        camera.position.set(x - sin * OVERHEAD_BACK, OVERHEAD_UP, z + cos * OVERHEAD_BACK)
        camera.lookAt(x + sin * CAMERA_LOOK_AHEAD * 4, 0, z - cos * CAMERA_LOOK_AHEAD * 4)
      } else {
        const back = CAMERA_BACK + (motion ? Math.min(1.5, rig.pace) * 1.2 : 0)
        camera.position.set(x - sin * back, CAMERA_UP, z + cos * back)
        camera.lookAt(x + sin * CAMERA_LOOK_AHEAD, 0.6, z - cos * CAMERA_LOOK_AHEAD)
      }
      renderer.render(scene, camera)
    },
    snapCamera(heading) {
      rig = startRig(heading)
      effects.lift()
    },
    ghost(pose) {
      if (!pose) {
        if (ghostKart) ghostKart.group.visible = false
        return
      }
      ghostKart ??= buildKartModel(false, true, body)
      if (!ghostKart.group.parent) scene.add(ghostKart.group)
      ghostKart.group.visible = true
      ghostKart.group.position.set(pose.x, 0, pose.z)
      ghostKart.group.rotation.y = -pose.heading
    },
    others(karts, frameSeconds) {
      const seen = new Set<number>()
      for (const other of karts) {
        seen.add(other.id)
        let model = otherKarts.get(other.id)
        if (model && model.body !== other.body) {
          scene.remove(model.group)
          model.dispose()
          model = undefined
        }
        if (!model) {
          model = buildKartModel(false, false, other.body)
          otherKarts.set(other.id, model)
          scene.add(model.group)
        }
        model.group.position.set(other.x, 0, other.z)
        model.group.rotation.y = -other.heading
        model.update(other.look, frameSeconds)
      }
      for (const [id, model] of otherKarts) {
        if (seen.has(id)) continue
        scene.remove(model.group)
        model.dispose()
        otherKarts.delete(id)
      }
    },
    items(props, frameSeconds) {
      itemArt ??= createItemArt(scene)
      itemArt.update(props.boxes, props.shields, frameSeconds, props.shots)
    },
    project(points) {
      const { clientWidth: width, clientHeight: height } = container
      return points.map(([x, y, z]) => {
        projected.set(x, y, z).project(camera)
        if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
          return null
        }
        return { x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height }
      })
    },
    drawingBuffer: () => `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    dispose() {
      observer.disconnect()
      for (const geometry of [groundGeometry, grid.geometry, wallGeometry]) {
        geometry.dispose()
      }
      for (const material of [groundMaterial, wallMaterial]) {
        material.dispose()
      }
      effects.dispose()
      speedLines.dispose()
      kart.dispose()
      ghostKart?.dispose()
      for (const model of otherKarts.values()) model.dispose()
      itemArt?.dispose()
      art?.dispose()
      grid.material.dispose()
      renderer.dispose()
      // Browsers allow a handful of live contexts: don't wait for the collector to free this one
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
