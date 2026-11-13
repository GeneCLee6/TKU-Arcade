import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  DoubleSide,
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
import type { Wall } from '../../shared/kart/walls.ts'
import { roadDirection, type Track } from '../../shared/kart/track.ts'
import { kartScene } from '../styles/tokens.ts'
import { fieldOfView, followCar, startRig, type Chased } from './camera.ts'

const GROUND_SIZE = 400
const GRID_CELL = 5
const CAMERA_BACK = 7.5
const CAMERA_UP = 3.4
const CAMERA_LOOK_AHEAD = 3
const MAX_PIXEL_RATIO = 2
/** Walls are drawn this high and this thick; the physics sees only their centre line */
const WALL_HEIGHT = 1.1
/** The road sits this far above the ground, under the grid's lines it would otherwise flicker with */
const ROAD_LIFT = 0.03
const FINISH_WIDTH = 1.2
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
  draw(pose: Pose, chased: Chased, frameSeconds: number): void
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

/** Builds the scene inside `container`, with `walls`. Throws when three.js cannot start. */
/**
 * The road as one flat ribbon from kerb to kerb (e8-t04), just above the ground, and the finish line
 * across it. A grey box stand-in until the track's own model (e8-t05b)
 */
function roadGeometry(track: Pick<Track, 'road'>): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const { road } = track
  road.forEach((point, index) => {
    const { dx, dz } = roadDirection(road, index)
    const half = point.width / 2
    positions.push(point.x + dz * half, ROAD_LIFT, point.z - dx * half)
    positions.push(point.x - dz * half, ROAD_LIFT, point.z + dx * half)
    const a = index * 2
    const b = ((index + 1) % road.length) * 2
    // Two triangles from this point's pair to the next, facing up
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createKartScene(
  container: HTMLElement,
  walls: readonly Wall[],
  track?: Pick<Track, 'road' | 'gates'>,
): KartScene {
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

  // One box per wall, along its centre line
  const wallGeometry = new BoxGeometry(1, WALL_HEIGHT, WALL_THICKNESS)
  const wallMaterial = new MeshLambertMaterial({ color: kartScene.wall })
  for (const wall of walls) {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
    const mesh = new Mesh(wallGeometry, wallMaterial)
    // Long enough to close the gap at a corner
    mesh.scale.x = length + WALL_THICKNESS
    mesh.position.set((wall.ax + wall.bx) / 2, WALL_HEIGHT / 2, (wall.az + wall.bz) / 2)
    mesh.rotation.y = -Math.atan2(wall.bz - wall.az, wall.bx - wall.ax)
    scene.add(mesh)
  }

  const extraGeometries: BufferGeometry[] = []
  const extraMaterials: MeshLambertMaterial[] = []
  if (track) {
    const ribbon = roadGeometry(track)
    // Both sides: which way round the triangles go then never decides whether the road shows
    const roadMaterial = new MeshLambertMaterial({ color: kartScene.road, side: DoubleSide })
    scene.add(new Mesh(ribbon, roadMaterial))
    extraGeometries.push(ribbon)
    extraMaterials.push(roadMaterial)
    const finish = track.gates[0]
    if (finish) {
      const lineGeometry = new BoxGeometry(1, 0.02, FINISH_WIDTH)
      const lineMaterial = new MeshLambertMaterial({ color: kartScene.finish })
      const line = new Mesh(lineGeometry, lineMaterial)
      line.scale.x = Math.hypot(finish.bx - finish.ax, finish.bz - finish.az)
      line.position.set((finish.ax + finish.bx) / 2, ROAD_LIFT + 0.01, (finish.az + finish.bz) / 2)
      line.rotation.y = -Math.atan2(finish.bz - finish.az, finish.bx - finish.ax)
      scene.add(line)
      extraGeometries.push(lineGeometry)
      extraMaterials.push(lineMaterial)
    }
  }

  const camera = new PerspectiveCamera(60, 1, 1, 260)
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
    draw({ x, z, heading }, chased, frameSeconds) {
      car.position.set(x, 0, z)
      car.rotation.y = -heading

      // The plane has no end: ground and grid follow the car in whole cells, so the lines stay put
      const snappedX = Math.round(x / GRID_CELL) * GRID_CELL
      const snappedZ = Math.round(z / GRID_CELL) * GRID_CELL
      ground.position.set(snappedX, 0, snappedZ)
      grid.position.set(snappedX, 0.01, snappedZ)

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
    },
    drawingBuffer: () => `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    dispose() {
      observer.disconnect()
      for (const geometry of [
        groundGeometry,
        grid.geometry,
        bodyGeometry,
        noseGeometry,
        wallGeometry,
      ]) {
        geometry.dispose()
      }
      for (const material of [groundMaterial, bodyMaterial, noseMaterial, wallMaterial]) {
        material.dispose()
      }
      for (const geometry of extraGeometries) geometry.dispose()
      for (const material of extraMaterials) material.dispose()
      grid.material.dispose()
      renderer.dispose()
      // Browsers allow a handful of live contexts: don't wait for the collector to free this one
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
