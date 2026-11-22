// 2026-11-22 (docs/ARCHITECTURE.md §4.73): the podium after a race, in 3D. A dark stage with three
// steps (gold, silver, bronze), each winner's own kart and driver on theirs, facing the camera; a
// warm spot comes up on each as it is revealed (podium.ts's timings), coloured lights sweep the
// stage, and the winner holds a cup overhead. The same kart model as the race (art/kartModel.ts),
// the drivers' gestures from driverGestures.ts. One small renderer of its own, made after the race's
// is gone; no shadows, no post-processing.
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SpotLight,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three'
import { kartPodium } from '../../styles/kartTokens.ts'
import { loadBodies } from '../art/bodyLoad.ts'
import { releaseSharedTextures } from '../art/sharedTextures.ts'
import { buildKartEnvironment } from '../art/kartParts.ts'
import { buildKartModel, type KartModel } from '../art/kartModel.ts'
import {
  PODIUM_GESTURE,
  podiumCamera,
  revealed,
  STEP_HEIGHT,
  STEP_X,
  type PodiumEntry,
  type PodiumPlace,
} from './podium.ts'

export interface PodiumStage {
  dispose(): void
}

const MAX_PIXEL_RATIO = 1.5
/** Where the cup is held, above the kart's middle (the driver's hands overhead), metres */
const TROPHY_UP = 1.32

/** A cup: a turned profile (bowl, stem, foot) and two handles */
function trophyMesh(material: Material, geometries: BufferGeometry[]): Group {
  const profile = [
    [0.0, 0],
    [0.16, 0],
    [0.16, 0.04],
    [0.06, 0.07],
    [0.04, 0.2],
    [0.08, 0.24],
    [0.17, 0.32],
    [0.2, 0.46],
    [0.19, 0.48],
    [0.0, 0.36],
  ].map(([x, y]) => new Vector2(x, y))
  const cup = new LatheGeometry(profile, 24)
  geometries.push(cup)
  const group = new Group()
  group.add(new Mesh(cup, material))
  const handle = new CylinderGeometry(0.015, 0.015, 0.16, 6)
  geometries.push(handle)
  for (const side of [-1, 1]) {
    const one = new Mesh(handle, material)
    one.position.set(side * 0.21, 0.38, 0)
    one.rotation.z = side * 0.5
    group.add(one)
  }
  return group
}

/**
 * The stage in `container`, on a canvas of its own, or null where there is no WebGL. `entries`: up to
 * three, one a place. `still`: no camera glide or sway, every place lit at once (reduced motion)
 */
export function createPodiumStage(
  container: HTMLElement,
  entries: readonly PodiumEntry[],
  still: boolean,
  label: string,
): PodiumStage | null {
  const canvas = document.createElement('canvas')
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true })
  } catch {
    return null
  }
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', label)
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' })
  container.append(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  const scene = new Scene()
  scene.background = new Color(kartPodium.sky)
  scene.fog = new Fog(kartPodium.sky, 14, 34)
  const environment = buildKartEnvironment(renderer)
  scene.add(new HemisphereLight(kartPodium.spot, kartPodium.floor, 0.35))
  scene.add(new AmbientLight(kartPodium.spot, 0.12))

  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const floorMaterial = new MeshStandardMaterial({
    color: new Color(kartPodium.floor),
    roughness: 0.35,
    metalness: 0.4,
    envMap: environment,
  })
  materials.push(floorMaterial)
  const floorGeometry = new CylinderGeometry(9, 9, 0.1, 48)
  geometries.push(floorGeometry)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.position.y = -0.05
  scene.add(floor)

  const sideMaterial = new MeshStandardMaterial({ color: new Color(kartPodium.stepSide), roughness: 0.5 })
  materials.push(sideMaterial)
  const trophyMaterial = new MeshStandardMaterial({
    color: new Color(kartPodium.trophy),
    roughness: 0.18,
    metalness: 1,
    envMap: environment,
  })
  materials.push(trophyMaterial)

  // The steps and their warm spots
  const spots = new Map<PodiumPlace, SpotLight>()
  for (const place of [1, 2, 3] as const) {
    const height = STEP_HEIGHT[place]
    const geometry = new BoxGeometry(2.6, height, 2.4)
    geometries.push(geometry)
    const top = new MeshStandardMaterial({
      color: new Color(kartPodium.steps[place - 1]),
      roughness: 0.3,
      metalness: 0.65,
      envMap: environment,
    })
    materials.push(top)
    // Top and front in the place's metal, the other faces dark
    const step = new Mesh(geometry, [sideMaterial, sideMaterial, top, sideMaterial, top, sideMaterial])
    step.position.set(STEP_X[place], height / 2, 0)
    scene.add(step)
    const spot = new SpotLight(kartPodium.spot, 0, 0, 0.32, 0.55, 0)
    spot.position.set(STEP_X[place], 9, 3)
    spot.target.position.set(STEP_X[place], height, 0)
    scene.add(spot, spot.target)
    spots.set(place, spot)
  }

  // Coloured lights sweeping the stage
  const sweepers = kartPodium.lights.map((tint, index) => {
    const light = new SpotLight(tint, 2.2, 0, 0.22, 0.6, 0)
    light.position.set((index - 1) * 6, 7, -4)
    const target = new Object3D()
    scene.add(light, target)
    light.target = target
    return { light, target, phase: index * 2.1 }
  })

  // The karts, once their families are fetched
  const models: { model: KartModel; place: PodiumPlace }[] = []
  let disposed = false
  void loadBodies(entries.map((entry) => entry.kart)).then(
    () => {
      if (disposed) return
      for (const entry of entries) {
        const model = buildKartModel(false, false, entry.kart, entry.driver, { environment })
        model.group.position.set(STEP_X[entry.place], STEP_HEIGHT[entry.place], 0)
        // Facing the camera (a kart faces -z)
        model.group.rotation.y = Math.PI + (STEP_X[entry.place] === 0 ? 0 : -Math.sign(STEP_X[entry.place]) * 0.25)
        if (entry.place === 1) {
          const cup = trophyMesh(trophyMaterial, geometries)
          cup.position.set(0, TROPHY_UP, 0.05)
          cup.visible = false
          model.group.add(cup)
          cup.name = 'trophy'
        }
        scene.add(model.group)
        models.push({ model, place: entry.place })
      }
    },
    () => {},
  )

  const camera = new PerspectiveCamera(34, 1, 0.1, 80)
  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // A narrow screen sees all three steps too
    camera.fov = camera.aspect < 1 ? 58 : camera.aspect < 1.5 ? 44 : 34
    camera.updateProjectionMatrix()
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(canvas)
  resize()

  const began = performance.now()
  let last = began
  let frame = 0
  const draw = (now: number) => {
    if (disposed) return
    frame = requestAnimationFrame(draw)
    const seconds = (now - began) / 1000
    const step = Math.min(0.1, (now - last) / 1000)
    last = now
    const shot = podiumCamera(seconds, still)
    camera.position.set(shot.eye.x, shot.eye.y, shot.eye.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    for (const [place, spot] of spots) {
      const target = revealed(place, seconds, still) ? (place === 1 ? 5.5 : 4) : 0
      spot.intensity += (target - spot.intensity) * Math.min(1, step * 6)
    }
    for (const sweeper of sweepers) {
      const angle = seconds * 0.9 + sweeper.phase
      sweeper.target.position.set(Math.sin(angle) * 4, 0, Math.cos(angle * 0.7) * 2)
      sweeper.light.intensity = still ? 1.2 : 2.2
    }
    for (const { model, place } of models) {
      const up = revealed(place, seconds, still)
      model.update(
        { speed: 0, steer: 0, drift: 0, boosting: false, gesture: up ? PODIUM_GESTURE[place] : 'idle' },
        step,
      )
      const cup = model.group.getObjectByName('trophy')
      if (cup) cup.visible = up
    }
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(draw)

  return {
    dispose() {
      disposed = true
      releaseSharedTextures(renderer, scene)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      for (const { model } of models) {
        scene.remove(model.group)
        model.dispose()
      }
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      environment.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
