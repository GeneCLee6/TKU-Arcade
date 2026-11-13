// e8-t07: what a kart leaves behind: smoke puffing from the back wheels in a drift, dark tyre marks
// laid on the road while it slides, and a flame from the exhaust during a boost. Pooled and reused:
// nothing is made or freed while driving.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'
import type { KartLook, KartModel } from './kartModel.ts'

/** Smoke puffs alive at once, at most */
const PUFFS = 70
const PUFF_LIFE = 0.9
/** Tyre mark pieces kept; the oldest are laid over again */
const MARKS = 900
const MARK_WIDTH = 0.24
/** Just above the road and kerbs (trackArt.ts LIFT), under the car */
const MARK_HEIGHT = 0.085

export interface KartEffects {
  update(pose: { x: number; z: number; heading: number }, look: KartLook, seconds: number): void
  /** Forgets the marks, as after a reset: the next drift does not join up with the last */
  lift(): void
  dispose(): void
}

function puffTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31)
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

export function createKartEffects(world: Object3D, kart: KartModel): KartEffects {
  // ── Smoke ──
  const texture = puffTexture()
  const puffs: { sprite: Sprite; material: SpriteMaterial; age: number; vy: number }[] = []
  for (let index = 0; index < PUFFS; index++) {
    const material = new SpriteMaterial({
      map: texture,
      color: kartScene.smoke,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    const sprite = new Sprite(material)
    sprite.visible = false
    world.add(sprite)
    puffs.push({ sprite, material, age: PUFF_LIFE, vy: 0 })
  }
  let nextPuff = 0
  let puffDue = 0

  // ── Tyre marks: one ribbon piece per wheel per step while sliding ──
  const positions = new Float32Array(MARKS * 4 * 3)
  const indices = new Uint32Array(MARKS * 6)
  for (let piece = 0; piece < MARKS; piece++) {
    const a = piece * 4
    indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], piece * 6)
  }
  const markGeometry = new BufferGeometry()
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
  markGeometry.setAttribute('position', positionAttribute)
  markGeometry.setIndex(new BufferAttribute(indices, 1))
  const markMaterial = new MeshBasicMaterial({
    color: kartScene.skid,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const marks = new Mesh(markGeometry, markMaterial)
  // Its bounds change all the time; never culled
  marks.frustumCulled = false
  world.add(marks)
  let nextMark = 0
  let lastWheels: { x: number; z: number }[] | null = null

  // ── The boost flame, on the kart, at its exhaust ──
  const flame = new Group()
  const outerMaterial = new MeshBasicMaterial({
    color: kartScene.flame,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const innerMaterial = new MeshBasicMaterial({
    color: kartScene.flameCore,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const outerGeometry = new ConeGeometry(0.16, 0.9, 10)
  const innerGeometry = new ConeGeometry(0.08, 0.55, 8)
  const outer = new Mesh(outerGeometry, outerMaterial)
  const inner = new Mesh(innerGeometry, innerMaterial)
  // Cones point up: laid back along +z, out of the exhaust
  for (const cone of [outer, inner]) cone.rotation.x = Math.PI / 2
  outer.position.z = 0.45
  inner.position.z = 0.3
  flame.add(outer, inner)
  flame.position.set(...kart.exhaust)
  flame.visible = false
  kart.group.add(flame)
  let flicker = 0

  const toWorld = (pose: { x: number; z: number; heading: number }, lx: number, lz: number) => {
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    return { x: pose.x + lx * cos - lz * sin, z: pose.z + lx * sin + lz * cos }
  }

  const layMark = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.02 || length > 3) return
    // Across the direction of travel, half the mark's width either side
    const nx = (-dz / length) * (MARK_WIDTH / 2)
    const nz = (dx / length) * (MARK_WIDTH / 2)
    const at = nextMark * 12
    positions.set(
      [
        from.x + nx,
        MARK_HEIGHT,
        from.z + nz,
        from.x - nx,
        MARK_HEIGHT,
        from.z - nz,
        to.x + nx,
        MARK_HEIGHT,
        to.z + nz,
        to.x - nx,
        MARK_HEIGHT,
        to.z - nz,
      ],
      at,
    )
    nextMark = (nextMark + 1) % MARKS
    positionAttribute.needsUpdate = true
  }

  return {
    update(pose, look, seconds) {
      const sliding = look.drift !== 0 && Math.abs(look.speed) > 6
      const wheels = kart.rearWheels.map(([lx, lz]) => toWorld(pose, lx, lz))

      if (sliding && lastWheels)
        wheels.forEach((wheel, index) => layMark(lastWheels![index]!, wheel))
      lastWheels = sliding ? wheels : null

      // Puffs: a steady stream from each back wheel while sliding, a faint one under boost
      const rate = sliding ? 28 : look.boosting ? 6 : 0
      puffDue += rate * seconds
      while (puffDue >= 1) {
        puffDue -= 1
        const wheel = wheels[nextPuff % wheels.length]!
        const puff = puffs[nextPuff]!
        puff.age = 0
        puff.vy = 0.6 + Math.random() * 0.6
        puff.sprite.position.set(
          wheel.x + (Math.random() - 0.5) * 0.3,
          0.25,
          wheel.z + (Math.random() - 0.5) * 0.3,
        )
        puff.sprite.visible = true
        nextPuff = (nextPuff + 1) % PUFFS
      }
      for (const puff of puffs) {
        if (puff.age >= PUFF_LIFE) continue
        puff.age += seconds
        const share = Math.min(1, puff.age / PUFF_LIFE)
        puff.sprite.position.y += puff.vy * seconds
        const size = 0.8 + share * 2.8
        puff.sprite.scale.set(size, size, 1)
        puff.material.opacity = 0.8 * (1 - share)
        if (share >= 1) puff.sprite.visible = false
      }

      flame.visible = look.boosting
      if (look.boosting) {
        flicker += seconds * 40
        const stretch = 0.85 + Math.sin(flicker) * 0.15 + Math.random() * 0.1
        outer.scale.set(1, stretch, 1)
        inner.scale.set(1, 0.8 + Math.random() * 0.3, 1)
      }
    },
    lift() {
      lastWheels = null
    },
    dispose() {
      for (const puff of puffs) {
        puff.material.dispose()
        world.remove(puff.sprite)
      }
      texture.dispose()
      markGeometry.dispose()
      markMaterial.dispose()
      world.remove(marks)
      outerGeometry.dispose()
      innerGeometry.dispose()
      outerMaterial.dispose()
      innerMaterial.dispose()
    },
  }
}
