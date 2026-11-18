// 2026-11-17 (owner: "the maps should be as good as the classic kart racers'"; docs/KART-FEEL.md §8):
// the arrow boards along the outside of every corner (shared/kart/cornerSigns.ts says where). A
// yellow board on two posts, just behind the barrier, with three black arrowheads pointing the way
// the corner goes. Our own drawing on a canvas; one instanced draw for the left-hand boards, one for
// the right-hand ones and one for the posts.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import {
  apexKerbs,
  brakeBoards,
  cornerSigns,
  gatePosts,
  type CornerSign,
} from '../../../shared/kart/cornerSigns.ts'
import { roadDirection } from '../../../shared/kart/track.ts'
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

// ── 2026-11-18: the rest of a corner's dressing (shared/kart/cornerSigns.ts says where) ──

/** The painted kerb lies this far over the road, and starts this far in from the kerb line */
const APEX_LIFT = 0.1
const APEX_INSET = 0.9
/** Its stripes repeat every this many metres */
const APEX_STRIPE = 4

/** A countdown board: white, with `bars` slanted red bars */
function barsTexture(bars: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = kartScene.signEdge
    context.fillRect(0, 0, 96, 160)
    context.fillStyle = kartScene.kerbWhite
    context.fillRect(6, 6, 84, 148)
    context.fillStyle = kartScene.kerbRed
    for (let bar = 0; bar < bars; bar++) {
      const top = 22 + bar * 44 + (3 - bars) * 22
      context.beginPath()
      context.moveTo(14, top + 26)
      context.lineTo(82, top)
      context.lineTo(82, top + 22)
      context.lineTo(14, top + 48)
      context.closePath()
      context.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const BRAKE_WIDTH = 1.5
const BRAKE_HEIGHT = 2.5
const BRAKE_FOOT = 1.1
const GATE_POST = { width: 0.7, height: 5.2, bands: 4 }

/**
 * Adds the apex kerbs, the countdown boards and the gate posts to the track's art. `heightAt` is the
 * road's height at a road point (0 on a flat track)
 */
export function buildCornerDressing(kit: ArtKit, heightAt: (index: number) => number): void {
  const { track, level, group, textures, keep, own, ownTexture, standard, shadowed, place } = kit
  const { road } = track

  // The apex kerbs: one mesh for them all, the kerb's own red and white
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const kerb of apexKerbs(road)) {
    const base = positions.length / 3
    let run = 0
    kerb.points.forEach((index, step) => {
      const point = road[index]!
      const { dx, dz } = roadDirection(road, index)
      if (step > 0) {
        const before = road[kerb.points[step - 1]!]!
        run += Math.hypot(point.x - before.x, point.z - before.z)
      }
      // The road's right is (-dz, dx); the kerb line, then in towards the middle of the road
      const outer = point.width / 2 - APEX_INSET
      const inner = outer - kerb.widths[step]!
      const y = heightAt(index) + APEX_LIFT
      for (const reach of [outer, inner]) {
        positions.push(point.x - dz * reach * kerb.side, y, point.z + dx * reach * kerb.side)
      }
      uvs.push(0, run / APEX_STRIPE, 1, run / APEX_STRIPE)
      if (step > 0) {
        const a = base + (step - 1) * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
  }
  if (indices.length > 0) {
    const geometry = keep(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const kerbs = new Mesh(
      geometry,
      own(
        new MeshLambertMaterial({
          map: textures.kerb,
          side: DoubleSide,
          // Over the asphalt and the line paint, at any distance
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        }),
      ),
    )
    group.add(shadowed(kerbs, false))
  }

  // The countdown boards: one draw for each count
  const boards = brakeBoards(road).filter((_, index) => level.density >= 0.75 || index % 2 === 0)
  const boardGeometry = keep(new PlaneGeometry(BRAKE_WIDTH, BRAKE_HEIGHT))
  for (const bars of [1, 2, 3] as const) {
    const these = boards.filter((board) => board.bars === bars)
    if (these.length === 0) continue
    const texture = ownTexture(barsTexture(bars))
    texture.anisotropy = level.anisotropy
    const instances = new InstancedMesh(
      boardGeometry,
      own(new MeshBasicMaterial({ map: texture, side: DoubleSide })),
      these.length,
    )
    these.forEach((board, index) => {
      place(
        instances,
        index,
        board.x,
        heightAt(board.index) + BRAKE_FOOT + BRAKE_HEIGHT / 2,
        board.z,
        [1, 1, 1],
        -board.heading,
      )
    })
    instances.instanceMatrix.needsUpdate = true
    group.add(instances)
  }
  if (boards.length > 0) {
    const posts = new InstancedMesh(
      keep(new BoxGeometry(POST, BRAKE_FOOT + BRAKE_HEIGHT * 0.5, POST)),
      standard(kartScene.metal),
      boards.length,
    )
    boards.forEach((board, index) => {
      place(
        posts,
        index,
        board.x,
        heightAt(board.index) + (BRAKE_FOOT + BRAKE_HEIGHT * 0.5) / 2,
        board.z,
        [1, 1, 1],
        -board.heading,
      )
    })
    posts.instanceMatrix.needsUpdate = true
    group.add(shadowed(posts))
  }

  // The gate posts: tall, banded red and white
  const gates = gatePosts(road)
  if (gates.length > 0) {
    const band = GATE_POST.height / GATE_POST.bands
    const bandGeometry = keep(new BoxGeometry(GATE_POST.width, band, GATE_POST.width))
    for (const colour of [0, 1]) {
      const instances = new InstancedMesh(
        bandGeometry,
        standard(colour === 0 ? kartScene.kerbRed : kartScene.kerbWhite),
        gates.length * (GATE_POST.bands / 2),
      )
      let slot = 0
      for (const post of gates) {
        for (let layer = colour; layer < GATE_POST.bands; layer += 2) {
          place(
            instances,
            slot++,
            post.x,
            heightAt(post.index) + band * (layer + 0.5),
            post.z,
            [1, 1, 1],
          )
        }
      }
      instances.instanceMatrix.needsUpdate = true
      group.add(shadowed(instances))
    }
  }
}
