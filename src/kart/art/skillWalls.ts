// 2026-11-20 (owner: "more lifelike, cooler"; docs/KART-WORLD.md §6): the walls of the tracks to
// learn by heart, dressed as what they are instead of plain boxes. The physics walls stay exactly
// where they were (shared/kart/tracks/*.ts): this only draws them. On the wharf a wall is a row of
// containers stacked three high; in the hillside lanes a yard's brick wall under a tiled coping,
// brick piers and a gateway roof where a gate goes through it; in the works a brick wall sprayed
// with paint of our own, or a shed's sheet-metal side. A fence a flier clears is striped yellow and
// black on every track. Instanced or merged: a handful of draws for all of them.
import { BoxGeometry, Color, InstancedMesh, type Texture } from 'three'
import type { Wall } from '../../../shared/kart/walls.ts'
import { kartScene, lanesScene, wharfScene, worksScene } from '../../styles/kartTokens.ts'
import {
  addBatch,
  Batch,
  brickTexture,
  containerTexture,
  corrugatedTexture,
  graffitiTexture,
  hazardTexture,
  mainClearance,
  tileTexture,
} from './skillKit.ts'
import type { ArtKit } from './trackArt.ts'

export type SkillStyle = 'wharf' | 'lanes' | 'works'

/** The tracks dressed here, by id */
export const skillStyleOf = (id: string): SkillStyle | null =>
  id === 'wharf' || id === 'lanes' || id === 'works' ? id : null

/** A wall lower than this is a fence a flier clears (shared/kart/tracks/wharf.ts FENCE_HEIGHT 1.5) */
const FENCE_MOST = 4
/** The containers: one is this long, this high, and drawn this deep */
const CONTAINER = { length: 6.1, height: 2.6, depth: 2.1 }
/** A brick wall is drawn this high and this thick under its coping */
const BRICK = { height: 6.2, thickness: 1.4 }
/** A gap between two walls' ends this wide (metres) is a slot or a gate */
const SLOT_LEAST = 6
const SLOT_MOST = 13

/** One wall as it is drawn: its ends, its middle, its length, which way it runs, its foot and height */
export interface WallRun {
  readonly wall: Wall
  readonly ax: number
  readonly az: number
  readonly bx: number
  readonly bz: number
  readonly span: number
  /** As an Object3D's rotation.y: the box's length along the wall */
  readonly turn: number
  readonly ux: number
  readonly uz: number
  readonly base: number
  /** The physics top less the foot */
  readonly height: number
  readonly fence: boolean
}

/** A slot: a gap between the ends of two tall walls in line, a kart's way through */
export interface Slot {
  readonly x: number
  readonly z: number
  readonly base: number
  /** Along the gap (from one wall's end to the other's) */
  readonly ux: number
  readonly uz: number
  readonly width: number
  /** The two ends */
  readonly ends: readonly [{ x: number; z: number }, { x: number; z: number }]
}

export function wallRuns(walls: readonly Wall[], groundAt: (x: number, z: number) => number): WallRun[] {
  return walls
    .filter((wall) => wall.top !== undefined)
    .map((wall) => {
      const span = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
      const ux = (wall.bx - wall.ax) / (span || 1)
      const uz = (wall.bz - wall.az) / (span || 1)
      const base = groundAt((wall.ax + wall.bx) / 2, (wall.az + wall.bz) / 2)
      const height = wall.top! - base
      return {
        wall,
        ax: wall.ax,
        az: wall.az,
        bx: wall.bx,
        bz: wall.bz,
        span,
        turn: -Math.atan2(uz, ux),
        ux,
        uz,
        base,
        height,
        fence: height < FENCE_MOST,
      }
    })
}

/**
 * The slots: wherever the free end of one tall wall faces the free end of another, in line with it,
 * a slot's width away. An end two walls share (an island's corner) is not free
 */
export function findSlots(runs: readonly WallRun[]): Slot[] {
  const tall = runs.filter((run) => !run.fence)
  const ends = tall.flatMap((run, index) => [
    { x: run.ax, z: run.az, run, index, out: { x: -run.ux, z: -run.uz } },
    { x: run.bx, z: run.bz, run, index, out: { x: run.ux, z: run.uz } },
  ])
  const free = ends.filter(
    (end) => !ends.some((other) => other.index !== end.index && Math.hypot(other.x - end.x, other.z - end.z) < 0.6),
  )
  const slots: Slot[] = []
  free.forEach((a, i) => {
    free.forEach((b, j) => {
      if (j <= i || a.index === b.index) return
      const gx = b.x - a.x
      const gz = b.z - a.z
      const width = Math.hypot(gx, gz)
      if (width < SLOT_LEAST || width > SLOT_MOST) return
      const ux = gx / width
      const uz = gz / width
      // Each end points out at the other: the two walls are in line across the gap
      if (a.out.x * ux + a.out.z * uz < 0.9 || -(b.out.x * ux + b.out.z * uz) < 0.9) return
      slots.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        base: (a.run.base + b.run.base) / 2,
        ux,
        uz,
        width,
        ends: [
          { x: a.x, z: a.z },
          { x: b.x, z: b.z },
        ],
      })
    })
  })
  return slots
}

const tint = new Color()

/** Draws every wall with a top of a track to learn by heart: the walls passed are not drawn again */
export function buildSkillWalls(
  kit: ArtKit,
  style: SkillStyle,
  runs: readonly WallRun[],
  slots: readonly Slot[],
): void {
  const { track } = kit
  const tall = runs.filter((run) => !run.fence)
  const fences = runs.filter((run) => run.fence)

  // ── Fences a flier clears: striped, on posts, the same everywhere ──
  if (fences.length > 0) {
    const stripes = new Batch()
    const posts = new Batch()
    for (const run of fences) {
      const height = Math.max(0.95, run.height)
      const mid = { x: (run.ax + run.bx) / 2, y: run.base + height / 2, z: (run.az + run.bz) / 2 }
      stripes.box(mid, [run.span + 0.4, height, 0.4], run.turn, '#ffffff', 1)
      for (const end of [0, 1]) {
        posts.box(
          { x: end ? run.bx : run.ax, y: run.base + (height + 0.3) / 2, z: end ? run.bz : run.az },
          [0.5, height + 0.3, 0.6],
          run.turn,
          kartScene.metal,
        )
      }
    }
    addBatch(kit, stripes, { map: hazardTexture(kit) })
    addBatch(kit, posts)
  }
  if (tall.length === 0) return

  if (style === 'wharf') {
    buildContainerWalls(kit, tall)
    return
  }
  if (style === 'lanes') {
    buildYardWalls(kit, tall, slots)
    return
  }
  // The works: the alley's walls stand away from the main road, a shed's side along its kerb
  const alley = tall.filter((run) => mainClearance(track.road, (run.ax + run.bx) / 2, (run.az + run.bz) / 2) > 2)
  const shed = tall.filter((run) => !alley.includes(run))
  buildAlleyWalls(kit, alley)
  buildShedSide(kit, shed)
}

/** A row of containers stacked three high along each wall, each its own colour */
function buildContainerWalls(kit: ArtKit, tall: readonly WallRun[]): void {
  const boxes: { x: number; y: number; z: number; length: number; turn: number; colour: string }[] = []
  tall.forEach((run, wallIndex) => {
    const count = Math.max(1, Math.round(run.span / CONTAINER.length))
    const length = run.span / count
    for (let k = 0; k < count; k++) {
      const share = (k + 0.5) / count
      for (let tier = 0; tier < 3; tier++) {
        // A container is missing from the top now and then: the stack's outline is not a box
        if (tier === 2 && (wallIndex * 7 + k * 3) % 5 === 0) continue
        const hash = (wallIndex * 31 + k * 17 + tier * 7) % wharfScene.containers.length
        boxes.push({
          x: run.ax + (run.bx - run.ax) * share,
          y: run.base + CONTAINER.height * (tier + 0.5),
          z: run.az + (run.bz - run.az) * share,
          // A hair longer, so that no light shows between two in a row, and turned end for end
          length: length + 0.02,
          turn: run.turn + (k % 2 === 0 ? 0 : Math.PI),
          colour: wharfScene.containers[hash]!,
        })
      }
    }
  })
  const mesh = new InstancedMesh(
    kit.keep(new BoxGeometry(1, CONTAINER.height, CONTAINER.depth)),
    kit.standard('#ffffff', containerTexture(kit)),
    boxes.length,
  )
  boxes.forEach((one, index) => {
    kit.place(mesh, index, one.x, one.y, one.z, [one.length, 1, 1], one.turn)
    mesh.setColorAt(index, tint.set(one.colour))
  })
  kit.group.add(kit.shadowed(mesh))
}

/** Yard walls: brick under a tiled coping; at a gate, brick piers and a little tiled gateway roof */
function buildYardWalls(kit: ArtKit, tall: readonly WallRun[], slots: readonly Slot[]): void {
  const brick = new Batch()
  const tiles = new Batch()
  for (const run of tall) {
    const mid = { x: (run.ax + run.bx) / 2, y: run.base + BRICK.height / 2, z: (run.az + run.bz) / 2 }
    brick.box(mid, [run.span + BRICK.thickness, BRICK.height, BRICK.thickness], run.turn, lanesScene.brick, 3.5)
    // The coping: a tiled cap wider than the wall, a ridge along it
    tiles.box(
      { ...mid, y: run.base + BRICK.height + 0.2 },
      [run.span + BRICK.thickness + 0.6, 0.4, BRICK.thickness + 1.2],
      run.turn,
      lanesScene.tile,
      2,
    )
    tiles.box(
      { ...mid, y: run.base + BRICK.height + 0.55 },
      [run.span + BRICK.thickness + 0.2, 0.3, 0.5],
      run.turn,
      lanesScene.tileEdge,
      2,
    )
  }
  for (const slot of slots) {
    const turn = -Math.atan2(slot.uz, slot.ux)
    for (const end of slot.ends) {
      // A pier at each side of the gate, a little proud of the wall
      brick.box({ x: end.x, y: slot.base + 3.6, z: end.z }, [1.9, 7.2, 2.2], turn, lanesScene.pillar, 3.5)
    }
    // The gateway's roof over the gap: a beam and a tiled roof, high over any kart in the air
    const roofY = slot.base + 7.4
    brick.box({ x: slot.x, y: roofY, z: slot.z }, [slot.width + 1.9, 0.6, 2.2], turn, lanesScene.pillar, 3.5)
    tiles.prism(
      { x: slot.x, y: roofY + 0.3, z: slot.z },
      [
        [-1.9, 0],
        [1.9, 0],
        [0, 1.1],
      ],
      slot.width + 3.2,
      turn + Math.PI / 2,
      lanesScene.tile,
      2,
    )
  }
  addBatch(kit, brick, { map: brickTexture(kit, 41) })
  addBatch(kit, tiles, { map: tileTexture(kit) })
}

/** The works' alley: brick, a dark band of soot at the foot, sprayed with paint on both faces */
function buildAlleyWalls(kit: ArtKit, alley: readonly WallRun[]): void {
  if (alley.length === 0) return
  const brick = new Batch()
  const paint = new Batch()
  alley.forEach((run, wallIndex) => {
    const mid = { x: (run.ax + run.bx) / 2, y: run.base + BRICK.height / 2, z: (run.az + run.bz) / 2 }
    brick.box(mid, [run.span + BRICK.thickness, BRICK.height, BRICK.thickness], run.turn, worksScene.brick, 3.5)
    brick.box(
      { ...mid, y: run.base + BRICK.height + 0.2 },
      [run.span + BRICK.thickness + 0.2, 0.4, BRICK.thickness + 0.3],
      run.turn,
      worksScene.concreteDark,
    )
    // A piece of paint every few metres along each face, just off the brick
    const pieces = Math.max(1, Math.floor(run.span / 4.2))
    for (let k = 0; k < pieces; k++) {
      const share = (k + 0.5) / pieces
      const x = run.ax + (run.bx - run.ax) * share
      const z = run.az + (run.bz - run.az) * share
      for (const face of [1, -1]) {
        const off = (BRICK.thickness / 2 + 0.04) * face
        const cell = (wallIndex * 5 + k * 3 + (face > 0 ? 0 : 1)) % 4
        const u = (cell % 2) / 2
        const v = Math.floor(cell / 2) / 2
        paint.panel(
          { x: x - run.uz * off, y: run.base + 2.2, z: z + run.ux * off },
          3.8,
          3.4,
          run.turn + (face > 0 ? 0 : Math.PI),
          '#ffffff',
          [u, 1 - v - 0.5, u + 0.5, 1 - v],
        )
      }
    }
  })
  addBatch(kit, brick, { map: brickTexture(kit, 43) })
  addBatch(kit, paint, { map: graffitiTexture(kit, 44), transparent: true, cast: false })
}

/** A shed's side along the kerb: sheet metal, a band of windows, the roof's edge over it */
function buildShedSide(kit: ArtKit, shed: readonly WallRun[]): void {
  if (shed.length === 0) return
  const metal = new Batch()
  const trim = new Batch()
  for (const run of shed) {
    const height = 8
    const mid = { x: (run.ax + run.bx) / 2, y: run.base + height / 2, z: (run.az + run.bz) / 2 }
    metal.box(mid, [run.span + 0.6, height, 1.2], run.turn, worksScene.shedWalls[1], 4)
    trim.box({ ...mid, y: run.base + 5.6 }, [run.span + 0.62, 1.1, 1.26], run.turn, worksScene.glazing)
    trim.box({ ...mid, y: run.base + height + 0.3 }, [run.span + 0.8, 0.6, 2], run.turn, worksScene.shedRoof)
    trim.box({ ...mid, y: run.base + 0.5 }, [run.span + 0.64, 1, 1.28], run.turn, worksScene.concreteDark)
  }
  addBatch(kit, metal, { map: corrugatedTexture(kit) as Texture })
  addBatch(kit, trim)
}
