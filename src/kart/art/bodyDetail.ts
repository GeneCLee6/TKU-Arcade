// 2026-11-22 (#99: the karts were geometry alone, no texture detail): the fine detail of a body,
// painted on a canvas at load, no image files (docs/ASSETS.md: drawn by this repository's code).
// One height map, tiled over every paint of a kart and read as a bump map (kartParts.ts's
// createPaintMaterial): panel seams, the screws along them, and on high the scratches of wear and a
// fine grain over the panels. On top of it, a livery decal loses a little of its paint at the edges
// (`wearDecal`), and on high the carbon weave is a finer twill (kartParts.ts's carbonTexture).
//
// By the graphics quality (quality.ts): low draws none of it and loads nothing (no texture, no
// bump in the shader); medium the seams and screws on a 256 px tile; high everything on 512 px. One
// texture per level for the whole page, shared by every kart and never freed: a quarter of a
// megabyte of GPU memory at most.
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, type Texture } from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { kartDetail } from '../../styles/kartTokens.ts'
import type { Quality } from '../quality.ts'

export type BodyDetailLevel = 'off' | 'medium' | 'high'

/** What each quality draws */
export const BODY_DETAIL: Readonly<Record<Quality, BodyDetailLevel>> = {
  low: 'off',
  medium: 'medium',
  high: 'high',
}

/** A tile's size by level, px, and how many panels a tile has across */
export const DETAIL_TILE: Readonly<Record<Exclude<BodyDetailLevel, 'off'>, number>> = {
  medium: 256,
  high: 512,
}
const PANELS = 4
/** How hard the bump reads: small, a seam is a line in the paint, not a groove */
export const DETAIL_BUMP = 0.9
/** How often the tile repeats over a part's texture coordinates */
export const DETAIL_REPEAT = 1

/**
 * The seams, screws and wear of a tile `size` px square, onto `context` (pure drawing: the test reads
 * the pixels). `wear` adds the scratches and the grain
 */
export function paintBodyDetail(
  context: CanvasRenderingContext2D,
  size: number,
  wear: boolean,
  random: () => number,
): void {
  context.fillStyle = kartDetail.panel
  context.fillRect(0, 0, size, size)
  const panel = size / PANELS
  const seam = Math.max(1, Math.round(size / 160))
  if (wear) {
    // A fine grain over the panels: the microscopic unevenness that catches the light
    for (let index = 0; index < size * 6; index++) {
      context.fillStyle = random() < 0.5 ? kartDetail.scratch : kartDetail.screwRim
      context.globalAlpha = 0.12
      context.fillRect(random() * size, random() * size, 1, 1)
    }
    context.globalAlpha = 1
  }
  // The seams: a grid of panels, every other row's joints half a panel along, as body panels are
  context.fillStyle = kartDetail.seam
  for (let row = 0; row < PANELS; row++) {
    const y = row * panel
    context.fillRect(0, y, size, seam)
    const offset = row % 2 === 0 ? 0 : panel / 2
    for (let column = 0; column < PANELS; column++) {
      context.fillRect((offset + column * panel) % size, y, seam, panel)
    }
  }
  // The screws: a pair along each panel's top seam, a sunk rim round a raised head
  const radius = Math.max(2, size / 110)
  for (let row = 0; row < PANELS; row++) {
    const offset = row % 2 === 0 ? 0 : panel / 2
    for (let column = 0; column < PANELS; column++) {
      for (const along of [0.2, 0.8]) {
        const x = (offset + (column + along) * panel) % size
        const y = row * panel + seam + radius * 1.6
        context.fillStyle = kartDetail.screwRim
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = kartDetail.screwHead
        context.beginPath()
        context.arc(x, y, radius * 0.6, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
  if (!wear) return
  // Scratches of wear: short, thin, mostly along the panel
  context.strokeStyle = kartDetail.scratch
  context.lineWidth = Math.max(1, size / 400)
  for (let index = 0; index < 26; index++) {
    const x = random() * size
    const y = random() * size
    const length = size * (0.02 + random() * 0.06)
    const angle = (random() - 0.5) * 0.6
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    context.stroke()
  }
}

const made = new Map<BodyDetailLevel, Texture>()

/**
 * 2026-11-23 (docs/KART-PERF.md §11, sharedTextures.ts): each renderer that draws a detail tile hangs a listener on it
 * (three.js frees its copy when the texture is disposed), and the tiles live as long as the page: a
 * renderer gone (a race, a podium, a garage) was held by them for good, every buffer and closure of
 * it, about 0.35 MB a race. Called by each renderer's owner as it goes: every renderer drops its copy
 * and its listener; the tiles stay, and a renderer still drawing uploads them again on its next frame
 */
export function releaseBodyDetail(): void {
  for (const texture of made.values()) texture.dispose()
}

/** The detail tile for a level, made once for the page; null for none (low) or without a canvas */
export function bodyDetailTexture(level: BodyDetailLevel): Texture | null {
  if (level === 'off' || typeof document === 'undefined') return null
  const known = made.get(level)
  if (known) return known
  const size = DETAIL_TILE[level]
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return null
  const rng = createRng(99)
  paintBodyDetail(context, size, level === 'high', () => rng.float())
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(DETAIL_REPEAT, DETAIL_REPEAT)
  texture.minFilter = LinearMipmapLinearFilter
  made.set(level, texture)
  return texture
}

/**
 * A livery decal's wear: a few chips of paint gone at its edges and a scuff across it, the canvas
 * cleared there (the decal is cut out by its alpha). Seeded by `seed`, so a kart's wear is always the
 * same
 */
export function wearDecal(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
): void {
  const rng = createRng(seed)
  const random = () => rng.float()
  context.save()
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = kartDetail.wear
  for (let index = 0; index < 14; index++) {
    // Chips near an edge: where a decal wears first
    const edge = random() < 0.5
    const x = edge ? (random() < 0.5 ? random() * 0.15 : 0.85 + random() * 0.15) * width : random() * width
    const y = edge ? random() * height : (random() < 0.5 ? random() * 0.15 : 0.85 + random() * 0.15) * height
    context.globalAlpha = 0.5 + random() * 0.5
    context.beginPath()
    context.arc(x, y, 0.6 + random() * Math.min(width, height) * 0.03, 0, Math.PI * 2)
    context.fill()
  }
  // A scuff: a faint stroke across
  context.globalAlpha = 0.25
  context.lineWidth = Math.max(1, height * 0.04)
  context.strokeStyle = kartDetail.wear
  context.beginPath()
  context.moveTo(width * (0.1 + random() * 0.3), height * random())
  context.lineTo(width * (0.6 + random() * 0.3), height * random())
  context.stroke()
  context.restore()
}
