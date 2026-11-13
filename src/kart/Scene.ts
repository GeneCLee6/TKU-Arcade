import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  PCFSoftShadowMap,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three'
import type { Wall } from '../../shared/kart/walls.ts'
import type { Track } from '../../shared/kart/track.ts'
import { buildTrackArt, type TrackArt } from './art/trackArt.ts'
import { QUALITY, type Quality } from './quality.ts'
import { createKartEffects } from './art/effects.ts'
import { buildKartModel, type KartLook } from './art/kartModel.ts'

const STILL: KartLook = { speed: 0, steer: 0, drift: 0, boosting: false }
import { kartScene } from '../styles/kartTokens.ts'
import { fieldOfView, followCar, startRig, type Chased } from './camera.ts'

const GROUND_SIZE = 400
const GRID_CELL = 5
const CAMERA_BACK = 7.5
const CAMERA_UP = 3.4
const CAMERA_LOOK_AHEAD = 3
const MAX_PIXEL_RATIO = 2
/** Walls are drawn this high and this thick; the physics sees only their centre line */
const WALL_HEIGHT = 1.1
const WALL_THICKNESS = 0.5

export interface Pose {
  readonly x: number
  readonly z: number
  readonly heading: number
}

export interface KartScene {
  /** The GPU's name where the browser tells, so that an fps number says what it was measured on */
  readonly rendererName: string
  readonly canvas: HTMLCanvasElement
  /** `chased` is what the chase camera follows: the direction of travel, and whether it boosts */
  draw(pose: Pose, chased: Chased, frameSeconds: number, look?: KartLook): void
  /** Puts the camera straight behind the car at once, as after a reset */
  snapCamera(heading: number): void
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
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  container.append(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(kartScene.sky)
  scene.fog = new Fog(kartScene.sky, 70, 190)

  scene.add(new HemisphereLight(kartScene.lightSky, kartScene.lightGround, 2))
  const sun = new DirectionalLight(kartScene.lightSky, 1.5)
  sun.position.set(30, 60, 20)
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
    scene.fog = new Fog(kartScene.skyHorizon, 160, settings.fogFar)
    scene.background = new Color(kartScene.skyHorizon)
  } else {
    scene.add(ground, grid)
  }

  // The first kart and its driver (e8-t07), with its smoke, tyre marks and boost flame
  const kart = buildKartModel(shadows)
  const car = kart.group
  scene.add(car)
  const effects = createKartEffects(scene, kart)

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

  const camera = new PerspectiveCamera(60, 1, 0.5, track ? 2000 : 260)
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
        sun.position.set(x + 30, 60, z + 20)
        sun.target.position.set(x, 0, z)
      }
      art?.update(performance.now() / 1000)

      rig = followCar(rig, chased, frameSeconds)
      const fov = fieldOfView(baseFov, rig, reducedMotion?.matches ?? false)
      if (fov !== camera.fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      const sin = Math.sin(rig.heading)
      const cos = Math.cos(rig.heading)
      camera.position.set(x - sin * CAMERA_BACK, CAMERA_UP, z + cos * CAMERA_BACK)
      camera.lookAt(x + sin * CAMERA_LOOK_AHEAD, 0.6, z - cos * CAMERA_LOOK_AHEAD)

      renderer.render(scene, camera)
    },
    snapCamera(heading) {
      rig = startRig(heading)
      effects.lift()
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
      kart.dispose()
      art?.dispose()
      grid.material.dispose()
      renderer.dispose()
      // Browsers allow a handful of live contexts: don't wait for the collector to free this one
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
