import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three'
import { kartScene } from '../styles/tokens.ts'

const GROUND_SIZE = 400
const GRID_CELL = 5
const CAMERA_BACK = 7.5
const CAMERA_UP = 3.4
const CAMERA_LOOK_AHEAD = 3
// How fast the camera's angle catches up with the car, per second: it lags, so a drift shows
const CAMERA_FOLLOW = 4
const MAX_PIXEL_RATIO = 2

export interface Pose {
  readonly x: number
  readonly z: number
  readonly heading: number
}

export interface KartScene {
  /** The GPU's name where the browser tells, so that an fps number says what it was measured on */
  readonly rendererName: string
  readonly canvas: HTMLCanvasElement
  draw(pose: Pose, frameSeconds: number): void
  /** `{width}x{height}` of the drawing buffer */
  drawingBuffer(): string
  /** Frees everything on the GPU and takes the canvas out of the page */
  dispose(): void
}

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** Asks for a throwaway context, so that a browser without WebGL 2 never reaches three.js */
export function supportsWebGL2(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) return false
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  return true
}

/** Builds the scene inside `container`. Throws when three.js cannot start. */
export function createKartScene(container: HTMLElement): KartScene {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.domElement.style.display = 'block'
  container.append(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(kartScene.sky)
  scene.fog = new Fog(kartScene.sky, 70, 190)

  scene.add(new HemisphereLight(kartScene.lightSky, kartScene.lightGround, 2))
  const sun = new DirectionalLight(kartScene.lightSky, 1.5)
  sun.position.set(30, 60, 20)
  scene.add(sun)

  const groundGeometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE)
  const groundMaterial = new MeshLambertMaterial({ color: kartScene.ground })
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  const grid = new GridHelper(
    GROUND_SIZE,
    GROUND_SIZE / GRID_CELL,
    kartScene.gridLine,
    kartScene.gridLine,
  )
  scene.add(ground, grid)

  const bodyGeometry = new BoxGeometry(1.5, 0.55, 2.6)
  const bodyMaterial = new MeshLambertMaterial({ color: kartScene.body })
  const body = new Mesh(bodyGeometry, bodyMaterial)
  body.position.y = 0.45
  // A box looks the same from every side: the nose shows which way the car points
  const noseGeometry = new BoxGeometry(1.1, 0.3, 0.8)
  const noseMaterial = new MeshLambertMaterial({ color: kartScene.nose })
  const nose = new Mesh(noseGeometry, noseMaterial)
  nose.position.set(0, 0.85, -0.7)
  const car = new Group()
  car.add(body, nose)
  scene.add(car)

  const camera = new PerspectiveCamera(60, 1, 0.1, 260)
  let cameraHeading = 0

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = container
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    // Held upright, a fixed vertical angle leaves almost nothing to the sides
    camera.fov = camera.aspect < 1 ? 80 : 60
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
    draw({ x, z, heading }, frameSeconds) {
      car.position.set(x, 0, z)
      car.rotation.y = -heading

      // The plane has no end: ground and grid follow the car in whole cells, so the lines stay put
      const snappedX = Math.round(x / GRID_CELL) * GRID_CELL
      const snappedZ = Math.round(z / GRID_CELL) * GRID_CELL
      ground.position.set(snappedX, 0, snappedZ)
      grid.position.set(snappedX, 0.01, snappedZ)

      const follow = 1 - Math.exp(-CAMERA_FOLLOW * frameSeconds)
      cameraHeading = wrap(cameraHeading + wrap(heading - cameraHeading) * follow)
      const sin = Math.sin(cameraHeading)
      const cos = Math.cos(cameraHeading)
      camera.position.set(x - sin * CAMERA_BACK, CAMERA_UP, z + cos * CAMERA_BACK)
      camera.lookAt(x + sin * CAMERA_LOOK_AHEAD, 0.6, z - cos * CAMERA_LOOK_AHEAD)

      renderer.render(scene, camera)
    },
    drawingBuffer: () => `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    dispose() {
      observer.disconnect()
      for (const geometry of [groundGeometry, grid.geometry, bodyGeometry, noseGeometry]) {
        geometry.dispose()
      }
      for (const material of [groundMaterial, bodyMaterial, noseMaterial]) material.dispose()
      grid.material.dispose()
      renderer.dispose()
      // Browsers allow a handful of live contexts: don't wait for the collector to free this one
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
