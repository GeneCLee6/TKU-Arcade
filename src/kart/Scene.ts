import {
  BoxGeometry,
  Group,
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
import { groundAt, heightGuess, pitchOf, terrainOf } from '../../shared/kart/terrain.ts'
import { buildTrackArt, themeOf, type TrackArt } from './art/trackArt.ts'
import { QUALITY, type Quality } from './quality.ts'
import { createKartEffects, type KartEffects } from './art/effects.ts'
import { buildKartEnvironment } from './art/kartParts.ts'
import { createPost, type PostFrame } from './post.ts'
import { createSpeedLines } from './art/speedLines.ts'
import {
  buildKartModel,
  type KartFinish,
  type KartLook,
  type KartModel,
} from './art/kartModel.ts'
import type { DriverId } from '../../shared/kart/karts.ts'
import type { KartBody } from './bodies.ts'
import { createItemArt, type ItemArt, type ItemBoxLook, type ShotLook } from './art/itemArt.ts'
import { createHitArt, type HitArt, type HitBurst } from './art/hitArt.ts'
import { OWN_KART, type SpinPose } from './hitFx.ts'

const STILL: KartLook = { speed: 0, steer: 0, drift: 0, boosting: false }
/** How far the heat shimmer behind a thruster reaches, as a share of the screen's height */
const HEAT_REACH = 0.17
const NO_HEAT: PostFrame['heat'] = []
const FLAT = { y: 0, pitch: 0 }
import { kartScene, kartThemes } from '../styles/kartTokens.ts'
import {
  cameraPull,
  cameraShake,
  fieldOfView,
  followCar,
  kickRig,
  REFERENCE_SPEED,
  startRig,
  type Chased,
} from './camera.ts'
import type { CameraShot } from './director.ts'

const GROUND_SIZE = 400
const GRID_CELL = 5
// 2026-11-17 (docs/KART-FEEL.md §7): nearer and lower than before (7.5 m back, 3.4 m up), looking
// further up the road: the kart is bigger on the screen, the road rushes by closer under the camera
// and more of what is coming is in view
const CAMERA_BACK = 6.2
const CAMERA_UP = 2.6
const CAMERA_LOOK_AHEAD = 6
/** The height of the point the camera looks at, over the road */
const CAMERA_LOOK_UP = 1
/** How much further back the camera sits at full pace, metres (it was 1.2 before 2026-11-17) */
const CAMERA_PULL = 0.4
/** How fast the camera's height follows the kart's on a hill track, per second: it lags a jump a little */
const CAMERA_RISE = 7
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
  /**
   * A hill track (2026-11-17, shared/kart/terrain.ts): the kart's height, where the physics knows it
   * (this browser's own kart); left out, it is worked out from the ground and any jump behind
   */
  readonly y?: number
  /** Its speed, m/s, for that guess (a ghost's, worked out from its samples) */
  readonly speed?: number
  /**
   * Whether it is in the air, where its frame says (FLAG_AIRBORNE): false keeps it on the road.
   * Left out (a replay, a ghost), the guess decides
   */
  readonly airborne?: boolean
}

/** Another racer's kart (e9-t03): where it is drawn this frame, and how it looks */
export interface OtherKart extends Pose {
  readonly id: number
  readonly body: KartBody
  /** e10-t05b: who sits in it */
  readonly driver: DriverId
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

/**
 * A hit's looks this frame (2026-11-17, hitFx.ts): each kart's spin by id (OWN_KART for this
 * browser's), the bursts to start, and the chase camera's shake
 */
export interface HitFrame {
  readonly spins: ReadonlyMap<number, SpinPose>
  readonly bursts: readonly HitBurst[]
  readonly shake?: { readonly x: number; readonly y: number }
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
  /**
   * For looking at a kart (2026-11-18, spikeLoop.ts's debug `view`): the chase camera turned `orbit`
   * radians round the kart, `back` metres away and `up` metres high; null puts it back
   */
  view(view: { orbit?: number; back?: number; up?: number } | null): void
  /**
   * 2026-11-20 (director.ts): a camera placed by hand, blended with the chase camera by its `blend`
   * (the grid during the countdown); null for the chase camera alone
   */
  shot(shot: CameraShot | null): void
  /** Puts the camera straight behind the car at once, as after a reset */
  snapCamera(heading: number, y?: number): void
  /** Where the best run's ghost is now (e8-t11), or null to hide it */
  ghost(pose: Pose | null): void
  /** The other racers' karts this frame (e9-t03); one missing from the list is taken away */
  others(karts: readonly OtherKart[], frameSeconds: number): void
  /** The item boxes and shields this frame (e9-t05); made the first time there are any */
  items(props: ItemProps, frameSeconds: number): void
  /** A hit's spins, bursts and shake (2026-11-17); called before `others` and `draw` */
  hits(frame: HitFrame, frameSeconds: number): void
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

/**
 * Whether WebGL here is drawn by the processor rather than a graphics card (a browser with its
 * hardware acceleration off, a virtual machine, the browser tests): the picture is then drawn
 * straight to the screen whatever the quality and the karts' paint reflects nothing, since
 * developing the picture (post.ts) and making the environment map cost such a renderer dearly
 */
export function softwareRenderer(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) return false
  const info = probe.getExtension('WEBGL_debug_renderer_info')
  const name = info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
}

/** Builds the scene inside `container`, with `walls` and, for a track, its art. Throws when three.js cannot start. */
export function createKartScene(
  container: HTMLElement,
  walls: readonly Wall[],
  track?: Track,
  quality: Quality = 'high',
  body: KartBody = 'tide',
  driver: DriverId = 'spade',
): KartScene {
  const settings = QUALITY[quality]
  const software = softwareRenderer()
  const postLevel = software ? 'off' : settings.post
  const renderer = new WebGLRenderer({
    // Developed afterwards (post.ts), the scene is smoothed in its own buffer, not on the canvas
    antialias: settings.antialias && postLevel === 'off',
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO, settings.pixelRatio))
  // 2026-11-18: bloom, a tone curve and (high) a vignette, heat shimmer and a boost's streak
  const post = createPost(renderer, postLevel, settings.antialias ? 4 : 0)
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

  // What every kart's paint reflects (2026-11-18): the track's own sky, with bright panels in it
  // (not where the processor draws: making the map alone takes it seconds, and the paint is plain)
  const environment = software
    ? null
    : buildKartEnvironment(renderer, theme.skyTop, theme.skyHorizon)
  const finish: KartFinish = { environment, glow: post?.glow ?? 1 }
  // The hover kart and its driver (e8-t07, 2026-11-14), with its sparks, trails and boost flames
  const kart = buildKartModel(shadows, false, body, driver, finish)
  const car = kart.group
  scene.add(car)
  const effects = createKartEffects(scene, kart, false, finish.glow)
  // Made the first time there is a ghost to show
  let ghostKart: KartModel | null = null
  // The other racers' karts, by id, made when each first appears
  const otherKarts = new Map<number, KartModel>()
  // What each of them leaves behind (2026-11-17): skid marks, smoke, sparks and boost flames
  const otherEffects = new Map<number, KartEffects>()
  let itemArt: ItemArt | null = null
  let hitArt: HitArt | null = null
  let spins: ReadonlyMap<number, SpinPose> = new Map()
  let shake = { x: 0, y: 0 }
  /** A spin is added to the drawn model only: the kart is where the physics has it */
  const spinModel = (
    group: Group,
    heading: number,
    spin: SpinPose | undefined,
    lift: { y: number; pitch: number } = FLAT,
  ) => {
    group.rotation.set(lift.pitch, -heading - (spin?.yaw ?? 0), spin?.roll ?? 0, 'YXZ')
    group.position.y = lift.y + (spin?.lift ?? 0)
  }
  // A hill track (2026-11-17): every kart drawn at its height, nose along the slope or the flight
  const terrain = track ? terrainOf(track) : null
  const roadHeight = terrain ? (x: number, z: number) => groundAt(terrain, x, z).y : undefined
  const liftOf = (pose: Pose, speed: number): { y: number; pitch: number } => {
    if (!terrain) return FLAT
    const y =
      pose.y ??
      (pose.airborne === false
        ? groundAt(terrain, pose.x, pose.z).y
        : heightGuess(terrain, pose.x, pose.z, speed))
    return { y, pitch: pitchOf(terrain, pose.x, pose.z, pose.heading, speed, y) }
  }
  let cameraY = 0
  let looking: { orbit?: number; back?: number; up?: number } | null = null
  let directed: CameraShot | null = null
  const projected = new Vector3()
  /** Stunned by a hit (hitFx.ts): the driver sways for as long as the kart spins */
  const dazedBy = (spin: SpinPose | undefined) => (spin && (spin.yaw !== 0 || spin.lift !== 0) ? 1 : 0)
  let time = 0
  /** Draws the frame: developed (post.ts) where the quality has it, else straight to the screen */
  const present = (boost: number, frameSeconds: number, shimmer: boolean) => {
    if (!post) {
      renderer.render(scene, camera)
      return
    }
    time += frameSeconds
    let heat = NO_HEAT
    const spot = shimmer ? effects.heat() : null
    if (spot) {
      projected.set(spot.x, spot.y, spot.z).project(camera)
      if (projected.z < 1) {
        heat = [
          {
            x: (projected.x + 1) / 2,
            y: (projected.y + 1) / 2,
            reach: HEAT_REACH,
            strength: spot.strength,
          },
        ]
      }
    }
    post.render(scene, camera, { boost, heat, time })
  }

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
  // Boosts seen fired so far (look.bursts): one more kicks the camera
  let burstsSeen = 0
  let baseFov = 60
  // The boost's wider view is motion: not for a viewer who asked for less (read live, it can change)
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = container
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    post?.resize()
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
    draw(pose, chased, frameSeconds, look = STILL) {
      const { x, z, heading } = pose
      const lift = liftOf(pose, Math.abs(look.speed))
      car.position.set(x, 0, z)
      spinModel(car, heading, spins.get(OWN_KART), lift)
      kart.update(look, frameSeconds, dazedBy(spins.get(OWN_KART)))
      effects.update(terrain ? { x, z, heading, y: lift.y } : { x, z, heading }, look, frameSeconds)
      if (terrain) cameraY += (lift.y - cameraY) * (1 - Math.exp(-CAMERA_RISE * frameSeconds))

      // The plane has no end: ground and grid follow the car in whole cells, so the lines stay put
      const snappedX = Math.round(x / GRID_CELL) * GRID_CELL
      const snappedZ = Math.round(z / GRID_CELL) * GRID_CELL
      ground.position.set(snappedX, 0, snappedZ)
      grid.position.set(snappedX, 0.01, snappedZ)
      if (shadows) {
        sun.position.set(x + sunX, sunY + cameraY, z + sunZ)
        sun.target.position.set(x, cameraY, z)
      }
      art?.update(performance.now() / 1000)

      // A boost fired: the view lurches (camera.ts's kick)
      const fired = look.bursts ?? 0
      if (fired > burstsSeen) rig = kickRig(rig, look.burstPower ?? 0.6)
      burstsSeen = fired
      rig = followCar(rig, chased, frameSeconds)
      const fov = fieldOfView(baseFov, rig, reducedMotion?.matches ?? false)
      if (fov !== camera.fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      const motion = !(reducedMotion?.matches ?? false)
      speedLines.update(
        rig.pace,
        rig.pace * REFERENCE_SPEED,
        frameSeconds,
        !motion,
        Math.min(1, rig.boost + (rig.kick ?? 0)),
      )
      // Only a touch further back at speed (2026-11-17: less than before, so the road rushes by);
      // a boost leaves the camera behind for a moment, so the kart is seen to leap away
      const back =
        (looking?.back ?? CAMERA_BACK) +
        (motion ? Math.min(1.5, rig.pace) * CAMERA_PULL + cameraPull(rig) : 0)
      const sin = Math.sin(rig.heading + (looking?.orbit ?? 0))
      const cos = Math.cos(rig.heading + (looking?.orbit ?? 0))
      camera.position.set(x - sin * back, (looking?.up ?? CAMERA_UP) + cameraY, z + cos * back)
      if (motion) {
        const jolt = cameraShake(rig)
        camera.position.add(
          projected.set(
            cos * shake.x + (Math.random() - 0.5) * 2 * jolt,
            shake.y + (Math.random() - 0.5) * 2 * jolt,
            sin * shake.x + (Math.random() - 0.5) * 2 * jolt,
          ),
        )
      }
      if (looking) camera.lookAt(x, 0.6 + cameraY, z)
      else if (directed && directed.blend > 0) {
        // The chase camera blended into the director's shot (the grid in the countdown)
        const b = Math.min(1, directed.blend)
        const { eye, target } = directed
        camera.position.set(
          camera.position.x + (eye.x - camera.position.x) * b,
          camera.position.y + (eye.y - camera.position.y) * b,
          camera.position.z + (eye.z - camera.position.z) * b,
        )
        camera.lookAt(
          x + sin * CAMERA_LOOK_AHEAD + (target.x - x - sin * CAMERA_LOOK_AHEAD) * b,
          CAMERA_LOOK_UP + cameraY + (target.y - CAMERA_LOOK_UP - cameraY) * b,
          z - cos * CAMERA_LOOK_AHEAD + (target.z - z + cos * CAMERA_LOOK_AHEAD) * b,
        )
      } else
        camera.lookAt(
          x + sin * CAMERA_LOOK_AHEAD,
          CAMERA_LOOK_UP + cameraY,
          z - cos * CAMERA_LOOK_AHEAD,
        )

      present(motion ? Math.min(1, rig.boost + (rig.kick ?? 0) * 0.6) : 0, frameSeconds, motion)
    },
    watch(pose, chased, frameSeconds, overhead) {
      const { x, z } = pose
      car.visible = false
      if (terrain) {
        const { y } = liftOf(pose, Math.hypot(chased.vx, chased.vz))
        cameraY += (y - cameraY) * (1 - Math.exp(-CAMERA_RISE * frameSeconds))
      }
      if (shadows) {
        sun.position.set(x + sunX, sunY + cameraY, z + sunZ)
        sun.target.position.set(x, cameraY, z)
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
        camera.position.set(x - sin * OVERHEAD_BACK, OVERHEAD_UP + cameraY, z + cos * OVERHEAD_BACK)
        camera.lookAt(x + sin * CAMERA_LOOK_AHEAD * 4, cameraY, z - cos * CAMERA_LOOK_AHEAD * 4)
      } else {
        const back = CAMERA_BACK + (motion ? Math.min(1.5, rig.pace) * CAMERA_PULL : 0)
        camera.position.set(x - sin * back, CAMERA_UP + cameraY, z + cos * back)
        camera.lookAt(
          x + sin * CAMERA_LOOK_AHEAD,
          CAMERA_LOOK_UP + cameraY,
          z - cos * CAMERA_LOOK_AHEAD,
        )
      }
      present(motion ? rig.boost : 0, frameSeconds, false)
    },
    view(view) {
      looking = view
    },
    shot(shot) {
      directed = shot
    },
    snapCamera(heading, y) {
      rig = startRig(heading)
      burstsSeen = Number.MAX_SAFE_INTEGER
      if (y !== undefined) cameraY = y
      effects.lift()
    },
    ghost(pose) {
      if (!pose) {
        if (ghostKart) ghostKart.group.visible = false
        return
      }
      ghostKart ??= buildKartModel(false, true, body, driver, finish)
      if (!ghostKart.group.parent) scene.add(ghostKart.group)
      ghostKart.group.visible = true
      ghostKart.group.position.set(pose.x, 0, pose.z)
      ghostKart.group.rotation.y = -pose.heading
      if (terrain)
        spinModel(ghostKart.group, pose.heading, undefined, liftOf(pose, pose.speed ?? 0))
    },
    others(karts, frameSeconds) {
      const seen = new Set<number>()
      for (const other of karts) {
        seen.add(other.id)
        let model = otherKarts.get(other.id)
        if (model && (model.body !== other.body || model.driver !== other.driver)) {
          scene.remove(model.group)
          otherEffects.get(other.id)?.dispose()
          otherEffects.delete(other.id)
          model.dispose()
          model = undefined
        }
        if (!model) {
          model = buildKartModel(false, false, other.body, other.driver, finish)
          otherKarts.set(other.id, model)
          scene.add(model.group)
          otherEffects.set(other.id, createKartEffects(scene, model, true, finish.glow))
        }
        model.group.position.set(other.x, 0, other.z)
        const lift = liftOf(other, Math.abs(other.look.speed))
        spinModel(model.group, other.heading, spins.get(other.id), lift)
        model.update(other.look, frameSeconds, dazedBy(spins.get(other.id)))
        otherEffects
          .get(other.id)
          ?.update(
            { x: other.x, z: other.z, heading: other.heading, ...(terrain ? { y: lift.y } : {}) },
            other.airborne === true ? { ...other.look, airborne: true } : other.look,
            frameSeconds,
          )
      }
      for (const [id, model] of otherKarts) {
        if (seen.has(id)) continue
        scene.remove(model.group)
        otherEffects.get(id)?.dispose()
        otherEffects.delete(id)
        model.dispose()
        otherKarts.delete(id)
      }
    },
    items(props, frameSeconds) {
      itemArt ??= createItemArt(scene, roadHeight)
      itemArt.update(props.boxes, props.shields, frameSeconds, props.shots)
    },
    hits(frame, frameSeconds) {
      spins = frame.spins
      shake = frame.shake ?? { x: 0, y: 0 }
      if (!hitArt && frame.bursts.length === 0) return
      hitArt ??= createHitArt(scene, roadHeight)
      hitArt.update(frame.bursts, frameSeconds)
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
      for (const fx of otherEffects.values()) fx.dispose()
      for (const model of otherKarts.values()) model.dispose()
      itemArt?.dispose()
      hitArt?.dispose()
      art?.dispose()
      environment?.dispose()
      post?.dispose()
      grid.material.dispose()
      renderer.dispose()
      // Browsers allow a handful of live contexts: don't wait for the collector to free this one
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
