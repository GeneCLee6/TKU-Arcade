// 2026-11-22 (#103, docs/ARCHITECTURE.md §4.65): the moving obstacles drawn (shared/kart/obstacles.ts).
// Our own shapes from boxes and spheres, no model or picture file:
//
// - a boom: a grey post outside the kerb with a lamp housing, and a red-and-white striped arm
//   pivoting from it over the stretch of road it closes (a whole road gets an arm from each side,
//   meeting in the middle); two red lamps that flash in turn while it is warned of and while it is
//   down, a green one while it is up; a white stop line across its stretch just before it;
// - a slider: two rails across the road, a yellow trolley riding them and one container on it for
//   every 2.6 m of its length, each its own colour; an amber beacon on top that flashes while the
//   slide is warned of and while it slides.
//
// Everything of one kind is one InstancedMesh, so that a track's obstacles cost a handful of draw
// calls whatever their number. Where each is comes from the race clock (`clock`), the same pure
// function the physics uses, so what is drawn down is what is a wall.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Group,
  type Material,
  type Texture,
} from 'three'
import {
  boomState,
  obstaclesOf,
  sliderState,
  type BoomJson,
  type Obstacle,
  type SliderJson,
} from '../../../shared/kart/obstacles.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { obstacleScene } from '../../styles/kartTokens.ts'

export interface ObstacleArt {
  /** Puts every obstacle where it is at race step `tick` (a fraction is fine) */
  clock(tick: number): void
}

/** What the art is built with: trackArt.ts's own, so that it is freed with the rest */
export interface ObstacleKit {
  readonly group: Group
  readonly shadows: boolean
  keep<T extends BufferGeometry>(geometry: T): T
  own<T extends Material>(material: T): T
  ownTexture<T extends Texture>(texture: T): T
}

const POST_OUT = 0.9
const POST_HEIGHT = 1.35
const ARM_HEIGHT = 1.15
const ARM_THICK = 0.24
/** How far up an open arm stands, radians from level */
const ARM_UP = 1.45
const LAMP_RADIUS = 0.17
/** Lamps flash this many steps on, as many off */
const FLASH_STEPS = 14
const CONTAINER_WIDE = 2.44
const CONTAINER_TALL = 2.3
const TROLLEY_TALL = 0.45
const STOP_LINE_BEFORE = 2.2

/** A post: where it stands (across) and which way its arm reaches (+1 to the right) */
interface Arm {
  readonly obstacle: Obstacle
  readonly boom: BoomJson
  readonly at: number
  readonly way: 1 | -1
  readonly length: number
}

/** The arms of a boom: from the kerb end over its stretch; a whole road gets one from each side */
export function armsOf(obstacle: Obstacle, boom: BoomJson): Arm[] {
  const edge = obstacle.half - 0.5
  const fromKerb = boom.from <= -edge
  const toKerb = boom.to >= edge
  const span = boom.to - boom.from
  if (fromKerb && toKerb) {
    return [
      { obstacle, boom, at: boom.from, way: 1, length: span / 2 },
      { obstacle, boom, at: boom.to, way: -1, length: span / 2 },
    ]
  }
  // From whichever end is nearer a kerb
  return Math.abs(boom.from) >= Math.abs(boom.to)
    ? [{ obstacle, boom, at: boom.from, way: 1, length: span }]
    : [{ obstacle, boom, at: boom.to, way: -1, length: span }]
}

/** The turn about the vertical that faces an object's local -z along the road */
const turnOf = (obstacle: Obstacle): number => Math.atan2(-obstacle.dx, -obstacle.dz)

/** World (x, z) of a place `across` right and `back` behind an obstacle's spot */
const placeAt = (obstacle: Obstacle, across: number, back: number) => ({
  x: obstacle.x - obstacle.dz * across - obstacle.dx * back,
  z: obstacle.z + obstacle.dx * across - obstacle.dz * back,
})

/** A canvas texture of `stripes` red and white bands; null where there is no canvas (tests) */
function stripeTexture(): Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 4
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = obstacleScene.armWhite
  context.fillRect(0, 0, 64, 4)
  context.fillStyle = obstacleScene.armRed
  context.fillRect(0, 0, 32, 4)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.repeat.set(6, 1)
  return texture
}

/** Ridged steel, grey on grey: the instance colour paints it */
function ridgeTexture(): Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 64, 32)
  context.fillStyle = 'rgba(0,0,0,0.22)'
  for (let x = 0; x < 64; x += 8) context.fillRect(x, 0, 3, 32)
  context.fillStyle = 'rgba(0,0,0,0.35)'
  context.fillRect(0, 0, 64, 2)
  context.fillRect(0, 30, 64, 2)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  return texture
}

/** The obstacles of `track` drawn into `kit.group`; null for a track without any */
export function buildObstacleArt(track: Track, kit: ObstacleKit): ObstacleArt | null {
  const obstacles = obstaclesOf(track)
  if (obstacles.length === 0) return null
  const booms = obstacles.filter((one) => one.json.kind === 'boom')
  const sliders = obstacles.filter((one) => one.json.kind === 'slider')
  const arms = booms.flatMap((one) => armsOf(one, one.json as BoomJson))
  const dummy = new Object3D()
  const tint = new Color()

  const instanced = (
    geometry: BufferGeometry,
    material: Material,
    count: number,
    shadow: boolean,
  ): InstancedMesh => {
    const mesh = new InstancedMesh(kit.keep(geometry), material, Math.max(1, count))
    mesh.count = count
    mesh.castShadow = shadow && kit.shadows
    mesh.receiveShadow = kit.shadows
    mesh.frustumCulled = false
    kit.group.add(mesh)
    return mesh
  }
  const standard = (color: string, map: Texture | null = null) =>
    kit.own(new MeshStandardMaterial({ color, map, roughness: 0.75, metalness: 0.1 }))
  const glow = (color: string) => kit.own(new MeshBasicMaterial({ color, toneMapped: false }))
  const set = (mesh: InstancedMesh, index: number) => {
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  }

  // ── Booms: posts and housings (still), arms and lamps (each frame), stop lines (still) ──
  const posts = instanced(new BoxGeometry(0.42, POST_HEIGHT, 0.42), standard(obstacleScene.post), arms.length, true)
  const housings = instanced(new BoxGeometry(0.62, 0.55, 0.42), standard(obstacleScene.housing), arms.length, true)
  const stripes = stripeTexture()
  if (stripes) kit.ownTexture(stripes)
  const armGeometry = new BoxGeometry(1, ARM_THICK, ARM_THICK)
  armGeometry.translate(0.5, 0, 0)
  const armMeshes = instanced(
    armGeometry,
    standard(stripes ? obstacleScene.armWhite : obstacleScene.armRed, stripes),
    arms.length,
    true,
  )
  const lamp = new SphereGeometry(LAMP_RADIUS, 10, 8)
  const reds = instanced(lamp, glow(obstacleScene.lampRed), arms.length * 2, false)
  const greens = instanced(lamp.clone(), glow(obstacleScene.lampGreen), arms.length, false)
  const lines = instanced(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    kit.own(
      new MeshBasicMaterial({
        color: obstacleScene.stopLine,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    ),
    booms.length,
    false,
  )
  /** The post of each arm: outside the kerb at its end, a little before the line */
  const postSpots = arms.map((arm) => {
    const out = arm.at - arm.way * POST_OUT
    return placeAt(arm.obstacle, out, 0)
  })
  arms.forEach((arm, index) => {
    const spot = postSpots[index]!
    const y = arm.obstacle.y
    dummy.rotation.set(0, turnOf(arm.obstacle), 0)
    dummy.scale.set(1, 1, 1)
    dummy.position.set(spot.x, y + POST_HEIGHT / 2, spot.z)
    set(posts, index)
    dummy.position.set(spot.x, y + POST_HEIGHT + 0.27, spot.z)
    set(housings, index)
  })
  booms.forEach((obstacle, index) => {
    const boom = obstacle.json as BoomJson
    const middle = placeAt(obstacle, (boom.from + boom.to) / 2, STOP_LINE_BEFORE)
    dummy.rotation.set(0, turnOf(obstacle), 0)
    dummy.position.set(middle.x, obstacle.y + 0.06, middle.z)
    dummy.scale.set(boom.to - boom.from, 1, 0.45)
    set(lines, index)
  })
  for (const mesh of [posts, housings, lines]) mesh.instanceMatrix.needsUpdate = true

  // ── Sliders: rails (still), trolleys, containers and beacons (each frame) ──
  const sliderJsons = sliders.map((one) => one.json as SliderJson)
  const railCount = sliders.length * 2
  const rails = instanced(new BoxGeometry(1, 0.1, 0.22), standard(obstacleScene.rail), railCount, false)
  const trolleys = instanced(new BoxGeometry(1, 1, 1), standard(obstacleScene.trolley), sliders.length, true)
  const perSlider = sliderJsons.map((json) => Math.max(1, Math.round(json.length / 2.6)))
  const ridges = ridgeTexture()
  if (ridges) kit.ownTexture(ridges)
  const containerMaterial = kit.own(
    new MeshStandardMaterial({ color: '#ffffff', map: ridges, roughness: 0.7, metalness: 0.2 }),
  )
  const containers = instanced(
    new BoxGeometry(1, CONTAINER_TALL, 1),
    containerMaterial,
    perSlider.reduce((sum, n) => sum + n, 0),
    true,
  )
  let colourAt = 0
  perSlider.forEach((count, index) => {
    for (let k = 0; k < count; k++) {
      tint.set(obstacleScene.containers[(index * 3 + k) % obstacleScene.containers.length]!)
      containers.setColorAt(colourAt++, tint)
    }
  })
  if (containers.instanceColor) containers.instanceColor.needsUpdate = true
  const beacons = instanced(new SphereGeometry(0.26, 10, 8), glow(obstacleScene.lampAmber), sliders.length, false)
  sliders.forEach((obstacle, index) => {
    const json = sliderJsons[index]!
    const low = Math.min(json.a, json.b) - json.size / 2
    const high = Math.max(json.a, json.b) + json.size / 2
    for (const side of [-1, 1]) {
      const spot = placeAt(obstacle, (low + high) / 2, side * (json.length / 2 - 0.5))
      dummy.rotation.set(0, turnOf(obstacle), 0)
      dummy.position.set(spot.x, obstacle.y + 0.05, spot.z)
      dummy.scale.set(high - low + 2, 1, 1)
      set(rails, index * 2 + (side > 0 ? 1 : 0))
    }
  })
  rails.instanceMatrix.needsUpdate = true

  const hide = (mesh: InstancedMesh, index: number) => {
    dummy.scale.set(0, 0, 0)
    set(mesh, index)
  }

  return {
    clock(tick) {
      const flash = Math.floor(tick / FLASH_STEPS) % 2 === 0
      arms.forEach((arm, index) => {
        const state = boomState(arm.boom, tick)
        const pivot = placeAt(arm.obstacle, arm.at, 0)
        const y = arm.obstacle.y + ARM_HEIGHT
        // The arm reaches along local +x: turned half round for one reaching left
        const turn = turnOf(arm.obstacle) + (arm.way > 0 ? 0 : Math.PI)
        dummy.position.set(pivot.x, y, pivot.z)
        dummy.rotation.set(0, turn, ARM_UP * (1 - state.shut), 'YZX')
        dummy.scale.set(arm.length, 1, 1)
        set(armMeshes, index)
        dummy.rotation.set(0, 0, 0, 'XYZ')
        // The lamps on the housing's face towards the traffic
        const red = state.closed || state.warn
        for (let k = 0; k < 2; k++) {
          const on = red && (k === 0) === flash
          const at = placeAt(arm.obstacle, arm.at - arm.way * POST_OUT + (k === 0 ? -0.17 : 0.17), 0.25)
          if (on) {
            dummy.position.set(at.x, arm.obstacle.y + POST_HEIGHT + 0.3, at.z)
            dummy.scale.set(1, 1, 1)
            set(reds, index * 2 + k)
          } else hide(reds, index * 2 + k)
        }
        if (!red) {
          const at = placeAt(arm.obstacle, arm.at - arm.way * POST_OUT, 0.25)
          dummy.position.set(at.x, arm.obstacle.y + POST_HEIGHT - 0.05, at.z)
          dummy.scale.set(0.8, 0.8, 0.8)
          set(greens, index)
        } else hide(greens, index)
      })
      let containerAt = 0
      sliders.forEach((obstacle, index) => {
        const json = sliderJsons[index]!
        const state = sliderState(json, tick)
        const turn = turnOf(obstacle)
        const middle = placeAt(obstacle, state.across, 0)
        dummy.rotation.set(0, turn, 0)
        dummy.position.set(middle.x, obstacle.y + TROLLEY_TALL / 2 + 0.05, middle.z)
        dummy.scale.set(json.size + 0.3, TROLLEY_TALL, json.length)
        set(trolleys, index)
        const count = perSlider[index]!
        for (let k = 0; k < count; k++) {
          const back = (k - (count - 1) / 2) * (json.length / count)
          const at = placeAt(obstacle, state.across, back)
          dummy.position.set(at.x, obstacle.y + TROLLEY_TALL + CONTAINER_TALL / 2 + 0.05, at.z)
          dummy.scale.set(json.size, 1, Math.min(CONTAINER_WIDE, json.length / count - 0.12))
          set(containers, containerAt++)
        }
        if ((state.warn || state.shut > 0) && flash) {
          dummy.position.set(middle.x, obstacle.y + TROLLEY_TALL + CONTAINER_TALL + 0.35, middle.z)
          dummy.scale.set(1, 1, 1)
          set(beacons, index)
        } else hide(beacons, index)
      })
      for (const mesh of [armMeshes, reds, greens, trolleys, containers, beacons]) {
        mesh.instanceMatrix.needsUpdate = true
      }
    },
  }
}
