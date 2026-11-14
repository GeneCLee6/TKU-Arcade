// e8-t05b: every texture the track art uses, painted on a canvas at load: no image files, nothing to
// download or register (docs/ASSETS.md: drawn by this repository's code). Seeded, so a track looks
// the same every time. Colours are kartScene's plain values (tokens.ts), as WebGL cannot read CSS.
import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { kartScene } from '../../styles/kartTokens.ts'

export type Paint = (context: CanvasRenderingContext2D, size: number, random: () => number) => void

export function painted(size: number, seed: number, paint: Paint, anisotropy: number): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  const rng = createRng(seed)
  if (context) paint(context, size, () => rng.float())
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = anisotropy
  return texture
}

/** Fine grain over a base colour: `spots` dots of up to `spread` lighter or darker */
export function grain(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  spots: number,
  spread: number,
) {
  for (let i = 0; i < spots; i++) {
    const shade = (random() - 0.5) * spread
    context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`
    const dot = 1 + random() * 2
    context.fillRect(random() * size, random() * size, dot, dot)
  }
}

export interface TrackTextures {
  /** Across the road: u 0 to 1 kerb to kerb; along it: v repeats every ASPHALT_LENGTH metres */
  readonly asphalt: Texture
  readonly grass: Texture
  /** Red and white blocks, one pair every KERB_LENGTH metres */
  readonly kerb: Texture
  readonly barrier: Texture
  readonly water: Texture
  readonly checker: Texture
  readonly brick: Texture
  readonly sand: Texture
  dispose(): void
}

export const ASPHALT_LENGTH = 12
export const KERB_LENGTH = 4
export const BARRIER_LENGTH = 8

export function trackTextures(anisotropy: number): TrackTextures {
  const asphalt = painted(
    512,
    11,
    (context, size, random) => {
      context.fillStyle = kartScene.asphalt
      context.fillRect(0, 0, size, size)
      grain(context, size, random, 9000, 0.16)
      // Darker wear where the wheels run, a little either side of the middle
      for (const lane of [0.3, 0.7]) {
        const gradient = context.createLinearGradient(
          (lane - 0.12) * size,
          0,
          (lane + 0.12) * size,
          0,
        )
        gradient.addColorStop(0, 'rgba(0,0,0,0)')
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.18)')
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = gradient
        context.fillRect(0, 0, size, size)
      }
      // White edge lines and a dashed centre line
      context.fillStyle = kartScene.roadLine
      context.fillRect(size * 0.035, 0, size * 0.018, size)
      context.fillRect(size * 0.947, 0, size * 0.018, size)
      context.fillRect(size * 0.492, 0, size * 0.016, size * 0.5)
    },
    anisotropy,
  )
  const grass = painted(
    512,
    12,
    (context, size, random) => {
      context.fillStyle = kartScene.grass
      context.fillRect(0, 0, size, size)
      // Mown stripes, then tufts
      for (let stripe = 0; stripe < 8; stripe += 2) {
        context.fillStyle = 'rgba(255,255,255,0.05)'
        context.fillRect(0, (stripe * size) / 8, size, size / 8)
      }
      for (let i = 0; i < 6000; i++) {
        context.fillStyle = random() > 0.5 ? kartScene.grassLight : kartScene.grassDark
        context.globalAlpha = 0.35
        context.fillRect(random() * size, random() * size, 1.5, 3 + random() * 3)
      }
      context.globalAlpha = 1
    },
    anisotropy,
  )
  const kerb = painted(
    128,
    13,
    (context, size) => {
      context.fillStyle = kartScene.kerbRed
      context.fillRect(0, 0, size, size / 2)
      context.fillStyle = kartScene.kerbWhite
      context.fillRect(0, size / 2, size, size / 2)
      context.fillStyle = 'rgba(0,0,0,0.15)'
      context.fillRect(0, size / 2 - 2, size, 4)
    },
    anisotropy,
  )
  const barrier = painted(
    256,
    14,
    (context, size, random) => {
      // A blue wall with a white top band and a yellow stripe: our own colours
      context.fillStyle = kartScene.barrier
      context.fillRect(0, 0, size, size)
      context.fillStyle = kartScene.barrierTop
      context.fillRect(0, 0, size, size * 0.18)
      context.fillStyle = kartScene.barrierStripe
      context.fillRect(0, size * 0.62, size, size * 0.1)
      grain(context, size, random, 1500, 0.08)
      context.fillStyle = 'rgba(0,0,0,0.25)'
      context.fillRect(0, 0, 3, size)
    },
    anisotropy,
  )
  const water = painted(
    256,
    15,
    (context, size, random) => {
      const gradient = context.createLinearGradient(0, 0, size, size)
      gradient.addColorStop(0, kartScene.water)
      gradient.addColorStop(1, kartScene.waterDeep)
      context.fillStyle = gradient
      context.fillRect(0, 0, size, size)
      context.strokeStyle = 'rgba(255,255,255,0.35)'
      context.lineWidth = 1.5
      for (let i = 0; i < 60; i++) {
        const x = random() * size
        const y = random() * size
        context.beginPath()
        context.moveTo(x, y)
        context.quadraticCurveTo(x + 6, y - 3, x + 12 + random() * 10, y)
        context.stroke()
      }
    },
    anisotropy,
  )
  const checker = painted(
    128,
    16,
    (context, size) => {
      const cells = 8
      for (let row = 0; row < cells; row++) {
        for (let column = 0; column < cells; column++) {
          context.fillStyle = (row + column) % 2 === 0 ? kartScene.finish : kartScene.checkerDark
          context.fillRect(
            (column * size) / cells,
            (row * size) / cells,
            size / cells,
            size / cells,
          )
        }
      }
    },
    anisotropy,
  )
  const brick = painted(
    256,
    17,
    (context, size, random) => {
      context.fillStyle = kartScene.mortar
      context.fillRect(0, 0, size, size)
      const rows = 16
      const height = size / rows
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 === 0 ? 0 : height
        for (let x = -offset; x < size; x += height * 2) {
          const shade = 0.85 + random() * 0.3
          context.fillStyle = kartScene.brick
          context.globalAlpha = shade
          context.fillRect(x + 1, row * height + 1, height * 2 - 2, height - 2)
        }
      }
      context.globalAlpha = 1
    },
    anisotropy,
  )
  const sand = painted(
    256,
    18,
    (context, size, random) => {
      context.fillStyle = kartScene.sand
      context.fillRect(0, 0, size, size)
      grain(context, size, random, 4000, 0.2)
    },
    anisotropy,
  )
  const all = [asphalt, grass, kerb, barrier, water, checker, brick, sand]
  return {
    asphalt,
    grass,
    kerb,
    barrier,
    water,
    checker,
    brick,
    sand,
    dispose: () => all.forEach((texture) => texture.dispose()),
  }
}
