// 2026-11-17: the particles of a hit (hitFx.ts decides when and where). A shot that lands throws a
// ring of pale yellow four-pointed sparkles up and out round the kart with a white flash; a shield
// that stops one bursts into pale blue shards with a ring of light. Our own simple look: soft sprites,
// no characters or symbols. Pooled: made once per scene, nothing is made or freed while racing.
// 2026-11-20, the new items' moments in the same sprites: a mirror turning a shot back flashes silver
// shards; fog closing round a kart a few slow grey puffs; a skip landing a ring of blue splash; a
// rally green sparkles rising; static small violet sparks crackling close round the kart.
import {
  AdditiveBlending,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  type Scene,
  type Texture,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'

import type { HitBurst } from '../hitFx.ts'

/** How each kind of burst throws its bits: sparkles or soft glows, how many, how fast, what colour */
interface BurstStyle {
  readonly glow: boolean
  readonly count: number
  readonly life: number
  readonly size: readonly [number, number]
  /** Outwards and upwards, m/s: [least, spread] */
  readonly out: readonly [number, number]
  readonly up: readonly [number, number]
  readonly height: number
  readonly colour: string
  readonly flash: string
  readonly flashSize: number
}

const STYLES: Record<HitBurst['kind'], BurstStyle> = {
  star: {
    glow: false,
    count: 12,
    life: 0.8,
    size: [0.55, 0.25],
    out: [3.5, 2],
    up: [5, 2.5],
    height: 1.2,
    colour: kartScene.hitStar,
    flash: kartScene.hitFlash,
    flashSize: 4.5,
  },
  pop: {
    glow: false,
    count: 16,
    life: 0.45,
    size: [0.3, 0.15],
    out: [6, 3],
    up: [-1.5, 5],
    height: 0.9,
    colour: kartScene.popShard,
    flash: kartScene.shield,
    flashSize: 5.5,
  },
  bounce: {
    glow: false,
    count: 14,
    life: 0.5,
    size: [0.34, 0.16],
    out: [7, 3],
    up: [0, 4],
    height: 1,
    colour: kartScene.mirror,
    flash: kartScene.mirrorGlint,
    flashSize: 6,
  },
  fog: {
    glow: true,
    count: 6,
    life: 1.1,
    size: [2.4, 1.2],
    out: [1, 1.2],
    up: [0.4, 0.8],
    height: 1.4,
    colour: kartScene.seaFog,
    flash: kartScene.seaFog,
    flashSize: 7,
  },
  splash: {
    glow: false,
    count: 16,
    life: 0.6,
    size: [0.3, 0.2],
    out: [4.5, 2.5],
    up: [4, 3],
    height: 0.4,
    colour: kartScene.splash,
    flash: kartScene.splash,
    flashSize: 5,
  },
  cheer: {
    glow: false,
    count: 10,
    life: 0.9,
    size: [0.4, 0.2],
    out: [1.5, 1.5],
    up: [6, 2],
    height: 1,
    colour: kartScene.cheer,
    flash: kartScene.cheer,
    flashSize: 3.5,
  },
  static: {
    glow: false,
    count: 12,
    life: 0.35,
    size: [0.22, 0.12],
    out: [2.5, 2.5],
    up: [-1, 4],
    height: 1,
    colour: kartScene.static,
    flash: kartScene.static,
    flashSize: 3,
  },
}

export type { HitBurst }

export interface HitArt {
  update(bursts: readonly HitBurst[], seconds: number): void
  dispose(): void
}

const BITS = 96
const FLASH_LIFE = 0.22
const FLASHES = 6
const GRAVITY = 9

/** A four-pointed sparkle, white: tinted by its material */
function sparkleTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    context.translate(32, 32)
    context.fillStyle = 'rgba(255,255,255,1)'
    context.beginPath()
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4
      const radius = i % 2 === 0 ? 30 : 7
      context.lineTo(Math.sin(angle) * radius, -Math.cos(angle) * radius)
    }
    context.closePath()
    context.fill()
  }
  return new CanvasTexture(canvas)
}

/** A soft round glow */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.4)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

interface Bit {
  sprite: Sprite
  material: SpriteMaterial
  age: number
  life: number
  size: number
  vx: number
  vy: number
  vz: number
  spin: number
  /** The ground under it (a hill track, 2026-11-17): it never falls below this */
  floor: number
}

/** `ground` gives the road's height at a place: 0 everywhere on a flat track */
export function createHitArt(
  scene: Scene,
  ground: (x: number, z: number) => number = () => 0,
): HitArt {
  const sparkle = sparkleTexture()
  const glow = glowTexture()
  const textures: Texture[] = [sparkle, glow]
  const material = (map: Texture, color: string) =>
    new SpriteMaterial({
      map,
      color,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
  const bits: Bit[] = []
  for (let i = 0; i < BITS; i++) {
    const own = material(sparkle, kartScene.hitStar)
    const sprite = new Sprite(own)
    sprite.visible = false
    scene.add(sprite)
    bits.push({
      sprite,
      material: own,
      age: 1,
      life: 0,
      size: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      floor: 0.1,
    })
  }
  const flashes: Bit[] = []
  for (let i = 0; i < FLASHES; i++) {
    const own = material(glow, kartScene.hitFlash)
    const sprite = new Sprite(own)
    sprite.visible = false
    scene.add(sprite)
    flashes.push({
      sprite,
      material: own,
      age: 1,
      life: 0,
      size: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      floor: 0.1,
    })
  }
  let nextBit = 0
  let nextFlash = 0

  const launch = (burst: HitBurst) => {
    const style = STYLES[burst.kind]
    const base = ground(burst.x, burst.z)
    for (let i = 0; i < style.count; i++) {
      const bit = bits[nextBit]!
      nextBit = (nextBit + 1) % bits.length
      const angle = (i / style.count) * Math.PI * 2 + Math.random() * 0.4
      const out = style.out[0] + Math.random() * style.out[1]
      bit.age = 0
      bit.life = style.life
      bit.size = style.size[0] + Math.random() * style.size[1]
      bit.vx = Math.sin(angle) * out
      bit.vz = Math.cos(angle) * out
      bit.vy = style.up[0] + Math.random() * style.up[1]
      bit.spin = (Math.random() - 0.5) * 8
      bit.material.map = style.glow ? glow : sparkle
      bit.material.color.set(style.colour)
      bit.floor = 0.1 + base
      bit.sprite.position.set(burst.x, style.height + base, burst.z)
      bit.sprite.visible = true
    }
    const flash = flashes[nextFlash]!
    nextFlash = (nextFlash + 1) % flashes.length
    flash.age = 0
    flash.life = FLASH_LIFE
    flash.size = style.flashSize
    flash.material.color.set(style.flash)
    flash.sprite.position.set(burst.x, 1 + base, burst.z)
    flash.sprite.visible = true
  }

  return {
    update(bursts, seconds) {
      for (const burst of bursts) launch(burst)
      for (const bit of bits) {
        if (!bit.sprite.visible) continue
        bit.age += seconds
        if (bit.age >= bit.life) {
          bit.sprite.visible = false
          continue
        }
        bit.vy -= GRAVITY * seconds
        bit.sprite.position.x += bit.vx * seconds
        bit.sprite.position.y = Math.max(bit.floor, bit.sprite.position.y + bit.vy * seconds)
        bit.sprite.position.z += bit.vz * seconds
        const left = 1 - bit.age / bit.life
        bit.material.opacity = left
        bit.material.rotation += bit.spin * seconds
        bit.sprite.scale.setScalar(bit.size * (0.6 + left * 0.4))
      }
      for (const flash of flashes) {
        if (!flash.sprite.visible) continue
        flash.age += seconds
        if (flash.age >= flash.life) {
          flash.sprite.visible = false
          continue
        }
        const p = flash.age / flash.life
        flash.material.opacity = 1 - p
        flash.sprite.scale.setScalar(flash.size * (0.5 + p))
      }
    },
    dispose() {
      for (const bit of [...bits, ...flashes]) {
        scene.remove(bit.sprite)
        bit.material.dispose()
      }
      for (const texture of textures) texture.dispose()
    },
  }
}
