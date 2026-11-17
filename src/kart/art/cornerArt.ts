// 2026-11-17 (owner: "the maps should be as good as the classic kart racers'"; docs/KART-FEEL.md §8):
// the arrow boards along the outside of every corner (shared/kart/cornerSigns.ts says where). A
// yellow board on two posts, just behind the barrier, with three black arrowheads pointing the way
// the corner goes. Our own drawing on a canvas; one instanced draw for the left-hand boards, one for
// the right-hand ones and one for the posts.
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import { cornerSigns, type CornerSign } from '../../../shared/kart/cornerSigns.ts'
import { kartScene } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

const BOARD_WIDTH = 3.8
const BOARD_HEIGHT = 1.75
/** The board's lower edge, over the road: clear of the barrier's top */
const BOARD_FOOT = 1.3
const POST = 0.14

/** Three arrowheads on a board, pointing right (`way` 1) or left (-1) */
function arrowTexture(way: -1 | 1): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 120
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = kartScene.signEdge
    context.fillRect(0, 0, 256, 120)
    context.fillStyle = kartScene.sign
    context.fillRect(7, 7, 242, 106)
    context.fillStyle = kartScene.signEdge
    // Each arrowhead: a thick chevron
    for (let arrow = 0; arrow < 3; arrow++) {
      const left = 26 + arrow * 72
      const tip = way === 1 ? left + 58 : 256 - left - 58
      const back = way === 1 ? left : 256 - left
      const notch = way === 1 ? left + 26 : 256 - left - 26
      const inner = way === 1 ? left + 32 : 256 - left - 32
      context.beginPath()
      context.moveTo(back, 18)
      context.lineTo(inner, 18)
      context.lineTo(tip, 60)
      context.lineTo(inner, 102)
      context.lineTo(back, 102)
      context.lineTo(notch, 60)
      context.closePath()
      context.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * Adds the corner boards to the track's art. `heightAt` is the road's height at a road point (0 on a
 * flat track)
 */
export function buildCornerSigns(kit: ArtKit, heightAt: (index: number) => number): void {
  const { track, level, group, keep, own, ownTexture, standard, shadowed, place } = kit
  const signs = cornerSigns(track.road, level.density)
  if (signs.length === 0) return
  const boardGeometry = keep(new PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT))
  for (const way of [-1, 1] as const) {
    const these = signs.filter((sign) => sign.turn === way)
    if (these.length === 0) continue
    const texture = ownTexture(arrowTexture(way))
    texture.anisotropy = level.anisotropy
    // Unlit, so that they read as bright at sunset and at night as at noon; seen from both sides
    const boards = new InstancedMesh(
      boardGeometry,
      own(new MeshBasicMaterial({ map: texture, side: DoubleSide })),
      these.length,
    )
    these.forEach((sign, index) => {
      // A plane faces +z; turned by -heading it faces back along the road, at the karts coming
      place(
        boards,
        index,
        sign.x,
        heightAt(sign.index) + BOARD_FOOT + BOARD_HEIGHT / 2,
        sign.z,
        [1, 1, 1],
        -sign.heading,
      )
    })
    boards.instanceMatrix.needsUpdate = true
    group.add(boards)
  }
  const posts = new InstancedMesh(
    keep(new BoxGeometry(POST, BOARD_FOOT + BOARD_HEIGHT * 0.5, POST)),
    standard(kartScene.metal),
    signs.length * 2,
  )
  const postOf = (sign: CornerSign, side: -1 | 1) => {
    const across = (BOARD_WIDTH / 2 - 0.25) * side
    return {
      x: sign.x + Math.cos(sign.heading) * across,
      z: sign.z + Math.sin(sign.heading) * across,
    }
  }
  signs.forEach((sign, index) => {
    for (const [slot, side] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const at = postOf(sign, side)
      place(
        posts,
        index * 2 + slot,
        at.x,
        heightAt(sign.index) + (BOARD_FOOT + BOARD_HEIGHT * 0.5) / 2,
        at.z,
        [1, 1, 1],
        -sign.heading,
      )
    }
  })
  posts.instanceMatrix.needsUpdate = true
  group.add(shadowed(posts))
}
