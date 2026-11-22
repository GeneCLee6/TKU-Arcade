// 2026-11-22 (#94, docs/ARCHITECTURE.md §4.70): Guanyin Hill Road's own scenery. Until now the
// track had only what every track has (trees, cone hills, the festival); now the places that make
// it the hill across the river from Tamsui, all our own low-poly shapes, nothing copied from a photo,
// a map or another game:
//
// - the ridge: a long range of peaks to the north, one tall peak and a long falling shoulder, hazy
//   with distance (one mesh: a height field, its colours by height);
// - a trail pavilion on the hilltop beside the road: a six-sided roof on six red posts, a stone
//   platform, steps down towards the road;
// - a small temple by the start straight: a stone terrace, red columns, a hall with a two-tier
//   roof and upswept ridge ends, a censer, two lanterns;
// - across the river to the east (the real water, seaWater.ts), a ferry pier: a concrete jetty on
//   piles, a ticket hut, a small ferry moored at it, mooring posts.
//
// Placed from the road (`guanyinPlan`, pure, so the tests check that nothing stands on it); the
// parts of one kind merged into one geometry (skillKit.ts's Batch), so the whole lot is a handful of
// draw calls.
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance } from '../../../shared/kart/scenery.ts'
import { trackBounds, type Track } from '../../../shared/kart/track.ts'
import { guanyinScene, kartThemes } from '../../styles/kartTokens.ts'
import { buildWater, type Water, type WaterLevel } from './seaWater.ts'
import { addBatch, Batch } from './skillKit.ts'
import type { ArtKit } from './trackArt.ts'

export interface Place {
  readonly x: number
  readonly z: number
  /** Which way its front (+z) faces, as an Object3D's rotation.y: towards the road */
  readonly turn: number
}

export interface GuanyinPlan {
  /** The ridge: its middle, how long and how deep */
  readonly ridge: { readonly x: number; readonly z: number; readonly length: number; readonly depth: number }
  readonly pavilion: Place
  readonly temple: Place
  /** The river to the east: its west bank, x; the pier juts out from it */
  readonly riverX: number
  readonly pier: Place
  readonly box: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
}

/** A building keeps this far off any road, metres */
export const GUANYIN_CLEAR = 9
/** The pavilion's and the temple's footprints reach this far from their middles */
export const PAVILION_REACH = 6
export const TEMPLE_REACH = 12
/** The ridge stands this far north of the road's northernmost point, metres */
const RIDGE_OFF = 430
/** The river's bank is this far east of the road's easternmost point */
const RIVER_OFF = 150

/** The turn that faces an object's +z front from (x, z) towards (tx, tz) */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z)

/**
 * Where everything goes, from the road alone. The pavilion: beside the hilltop (the road's highest
 * point), out from the middle of the track, as near as the road allows; the temple: likewise by the
 * start straight. Each is looked for out along a fan of directions until it is clear of every road
 */
export function guanyinPlan(track: Track): GuanyinPlan {
  const { road } = track
  const box = trackBounds(track)
  const middle = { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 }
  const beside = (index: number, reach: number): Place => {
    const point = road[index]!
    const away = Math.atan2(point.x - middle.x, point.z - middle.z)
    for (let out = point.width / 2 + GUANYIN_CLEAR + reach; out < 260; out += 2) {
      for (const swing of [0, 0.25, -0.25, 0.5, -0.5]) {
        const x = point.x + Math.sin(away + swing) * out
        const z = point.z + Math.cos(away + swing) * out
        if (roadClearance(road, x, z) >= GUANYIN_CLEAR + reach) {
          return { x, z, turn: facing(x, z, point.x, point.z) }
        }
      }
    }
    return { x: point.x + 260, z: point.z, turn: 0 }
  }
  let top = 0
  road.forEach((point, index) => {
    if ((point.y ?? 0) > (road[top]!.y ?? 0)) top = index
  })
  const riverX = box.maxX + RIVER_OFF
  return {
    ridge: {
      x: middle.x - 120,
      z: box.minZ - RIDGE_OFF,
      length: Math.max(1500, (box.maxX - box.minX) * 3.2),
      depth: 340,
    },
    pavilion: beside(top, PAVILION_REACH),
    temple: beside(Math.round(road.length * 0.03), TEMPLE_REACH),
    riverX,
    pier: { x: riverX, z: middle.z, turn: -Math.PI / 2 },
    box,
  }
}

/**
 * Where the shared scenery (trees, the festival's stands, skyline and flags) may stand on Guanyin
 * Hill Road: not in the river (nor on its bank), and not on the pavilion's or the temple's ground
 */
export function guanyinFits(plan: GuanyinPlan, x: number, z: number): boolean {
  if (x > plan.riverX - 20) return false
  if (Math.hypot(x - plan.pavilion.x, z - plan.pavilion.z) < PAVILION_REACH + 6) return false
  if (Math.hypot(x - plan.temple.x, z - plan.temple.z) < TEMPLE_REACH + 6) return false
  return true
}

/** The ridge's height along it (u from 0 to 1): one tall peak and a long falling shoulder; our own */
export function ridgeHeight(u: number): number {
  const bump = (at: number, wide: number, high: number) => high * Math.exp(-(((u - at) / wide) ** 2))
  return (
    16 +
    bump(0.15, 0.1, 55) +
    bump(0.3, 0.065, 185) +
    bump(0.4, 0.09, 115) +
    bump(0.53, 0.12, 92) +
    bump(0.69, 0.1, 68) +
    bump(0.83, 0.08, 52)
  )
}

export interface GuanyinArt {
  update(seconds: number): void
}

export function buildGuanyin(
  kit: ArtKit,
  plan: GuanyinPlan,
  groundAt: (x: number, z: number) => number,
  waterLevel: WaterLevel,
): GuanyinArt {
  const { keep, own, group } = kit
  const rng = createRng(94)

  // ── The ridge: a height field, coloured by height ──
  {
    const { length, depth } = plan.ridge
    const along = 80
    const back = 14
    const positions: number[] = []
    const colours: number[] = []
    const indices: number[] = []
    const foot = new Color(guanyinScene.ridgeFoot)
    const crest = new Color(guanyinScene.ridgeTop)
    const colour = new Color()
    for (let j = 0; j <= back; j++) {
      const v = j / back
      for (let i = 0; i <= along; i++) {
        const u = i / along
        // Highest along its spine, a little behind its front, falling away both ways
        const spine = Math.exp(-(((v - 0.4) / 0.3) ** 2))
        const rough = 1 + (rng.float() - 0.5) * 0.05
        const height = ridgeHeight(u) * spine * rough
        positions.push(plan.ridge.x + (u - 0.5) * length, height - 6, plan.ridge.z - (v - 0.4) * depth)
        colour.copy(foot).lerp(crest, Math.min(1, height / 170))
        colours.push(colour.r, colour.g, colour.b)
      }
    }
    const row = along + 1
    for (let j = 0; j < back; j++) {
      for (let i = 0; i < along; i++) {
        const a = j * row + i
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row)
      }
    }
    const geometry = keep(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    group.add(
      new Mesh(geometry, own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))),
    )
  }

  const solid = new Batch()
  const tiles = new Batch()
  const glow = new Batch()

  // ── The trail pavilion: a stone platform, six red posts, a six-sided roof ──
  {
    const { x, z, turn } = plan.pavilion
    const y = groundAt(x, z)
    const radius = 3.4
    solid.box({ x, y: y + 0.3, z }, [radius * 2 + 1.4, 0.6, radius * 2 + 1.4], turn, guanyinScene.stone)
    for (let k = 0; k < 6; k++) {
      const angle = turn + (k * Math.PI) / 3
      const px = x + Math.sin(angle) * radius
      const pz = z + Math.cos(angle) * radius
      solid.tube({ x: px, y: y + 0.6, z: pz }, { x: px, y: y + 3.7, z: pz }, 0.17, guanyinScene.pillar, 6)
    }
    solid.box({ x, y: y + 1.05, z }, [radius * 1.3, 0.12, radius * 1.3], turn, guanyinScene.wood)
    // Steps down towards the road
    for (let k = 0; k < 7; k++) {
      const out = radius + 1.4 + k * 0.9
      const sx = x + Math.sin(turn) * out
      const sz = z + Math.cos(turn) * out
      solid.box({ x: sx, y: groundAt(sx, sz) + 0.12, z: sz }, [2.6, 0.24, 0.85], turn, guanyinScene.stone)
    }
    const roof = new Mesh(
      keep(new ConeGeometry(radius + 1.5, 2.2, 6)),
      own(new MeshStandardMaterial({ color: guanyinScene.roof, roughness: 0.7, flatShading: true })),
    )
    roof.position.set(x, y + 4.8, z)
    roof.rotation.y = turn
    group.add(kit.shadowed(roof))
    const finial = new Mesh(
      keep(new ConeGeometry(0.25, 0.9, 6)),
      own(new MeshStandardMaterial({ color: guanyinScene.gold, roughness: 0.4, metalness: 0.5 })),
    )
    finial.position.set(x, y + 6.3, z)
    group.add(finial)
  }

  // ── The temple: a terrace, a hall of red columns, a two-tier roof with upswept ridge ends ──
  {
    const { x, z, turn } = plan.temple
    const y = groundAt(x, z)
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    /** A place `right` across, `up` and `ahead` forward of the temple's middle (its front faces +z) */
    const at = (right: number, up: number, ahead: number) => ({
      x: x + c * right + s * ahead,
      y: y + up,
      z: z - s * right + c * ahead,
    })
    const wide = 14
    const hall = 9
    solid.box(at(0, 0.5, 0), [wide + 4, 1, hall + 6], turn, guanyinScene.stone)
    solid.box(at(0, 2.9, -0.8), [wide - 1, 3.8, hall - 2.5], turn, guanyinScene.wall)
    for (let k = 0; k < 6; k++) {
      const right = -wide / 2 + 0.6 + (k * (wide - 1.2)) / 5
      solid.tube(at(right, 1, hall / 2 - 0.6), at(right, 4.9, hall / 2 - 0.6), 0.24, guanyinScene.pillar, 8)
    }
    for (const right of [-3.4, 0, 3.4]) {
      solid.box(at(right, 2.5, hall / 2 - 2.0), [2.2, 3, 0.2], turn, guanyinScene.door)
    }
    // Two tiers of roof, each a gable whose eaves overhang, its ridge sweeping up at the ends
    for (const [up, span, rise, deep] of [
      [4.9, wide + 3.2, 1.6, hall + 2],
      [6.9, wide - 2, 1.8, hall - 1.5],
    ] as const) {
      tiles.prism(
        at(0, up, -0.6),
        [
          [-deep / 2, 0],
          [deep / 2, 0],
          [0, rise],
        ],
        span,
        turn + Math.PI / 2,
        guanyinScene.roof,
      )
      solid.box(at(0, up + rise + 0.15, -0.6), [span - 0.6, 0.3, 0.4], turn, guanyinScene.ridge)
      for (const side of [-1, 1]) {
        solid.box(at((side * (span - 0.4)) / 2, up + rise + 0.5, -0.6), [1.2, 0.25, 0.35], turn, guanyinScene.ridge)
        solid.box(at((side * (span + 0.6)) / 2, up + rise + 0.95, -0.6), [0.9, 0.22, 0.3], turn, guanyinScene.ridge)
      }
    }
    // A censer and two lanterns before it
    solid.box(at(0, 1.6, hall / 2 + 2.2), [1.2, 1.2, 1.2], turn, guanyinScene.bronze)
    for (const side of [-1, 1]) {
      solid.tube(at(side * 5.5, 1, hall / 2 + 2), at(side * 5.5, 2.6, hall / 2 + 2), 0.12, guanyinScene.wood, 6)
      glow.box(at(side * 5.5, 3.0, hall / 2 + 2), [0.7, 0.8, 0.7], turn, guanyinScene.lantern)
    }
  }

  // ── The river to the east and the ferry pier on its far bank ──
  const box = plan.box
  const riverWidth = 1500
  const north = box.minZ - 1000
  const south = box.maxZ + 1000
  const water: Water = buildWater(
    kit,
    {
      x: plan.riverX + riverWidth / 2,
      z: (north + south) / 2,
      width: riverWidth,
      depth: south - north,
      y: -0.6,
      depthAt: (wx) => Math.min(1, Math.max(0, (wx - plan.riverX) / 70)),
      deep: guanyinScene.riverDeep,
      shallow: guanyinScene.riverShallow,
      foam: guanyinScene.foam,
      sky: kartThemes.day.skyHorizon,
      flatMap: kit.textures.water,
      flatColor: guanyinScene.riverFlat,
      near: box,
    },
    waterLevel,
  )
  group.add(water.mesh)
  {
    const { x, z } = plan.pier
    // The bank: a strip of concrete all along it
    solid.box({ x: x - 4, y: -0.15, z: (north + south) / 2 }, [8, 0.9, south - north], 0, guanyinScene.concrete)
    // The jetty, out into the water on piles
    solid.box({ x: x + 28, y: 0.5, z }, [56, 0.6, 7], 0, guanyinScene.concrete)
    for (let k = 0; k < 7; k++) {
      for (const side of [-1, 1]) {
        solid.tube(
          { x: x + 6 + k * 8, y: -1.5, z: z + side * 3 },
          { x: x + 6 + k * 8, y: 0.3, z: z + side * 3 },
          0.3,
          guanyinScene.pile,
          6,
        )
      }
    }
    for (let k = 0; k < 6; k++) {
      solid.tube({ x: x + 8 + k * 9, y: 0.8, z: z + 3.2 }, { x: x + 8 + k * 9, y: 1.6, z: z + 3.2 }, 0.22, guanyinScene.post, 6)
    }
    solid.tube({ x: x + 2, y: 1.8, z: z - 3.3 }, { x: x + 55, y: 1.8, z: z - 3.3 }, 0.06, guanyinScene.post, 4)
    // The ticket hut on the bank
    solid.box({ x: x - 4, y: 1.8, z: z - 9 }, [5, 3.2, 4], 0, guanyinScene.wall)
    tiles.prism(
      { x: x - 4, y: 3.4, z: z - 9 },
      [
        [-3, 0],
        [3, 0],
        [0, 1.2],
      ],
      5.6,
      Math.PI / 2,
      guanyinScene.roof,
    )
    // The ferry: a hull, a white cabin with a band of windows, a funnel
    const fx = x + 44
    const fz = z + 9
    solid.prism(
      { x: fx, y: -0.2, z: fz },
      [
        [-11, 0.4],
        [-9.5, -0.9],
        [9, -0.9],
        [12, 1.4],
        [-11, 1.4],
      ],
      5.2,
      0,
      guanyinScene.hull,
    )
    solid.box({ x: fx - 1, y: 2.3, z: fz }, [12, 1.9, 4.2], 0, guanyinScene.cabin)
    glow.box({ x: fx - 1, y: 2.5, z: fz + 2.12 }, [11, 0.6, 0.05], 0, guanyinScene.window)
    glow.box({ x: fx - 1, y: 2.5, z: fz - 2.12 }, [11, 0.6, 0.05], 0, guanyinScene.window)
    solid.box({ x: fx - 1, y: 3.4, z: fz }, [12.6, 0.25, 4.8], 0, guanyinScene.band)
    solid.tube({ x: fx - 5, y: 3.4, z: fz }, { x: fx - 5, y: 5, z: fz }, 0.45, guanyinScene.funnel, 8)
  }

  addBatch(kit, solid)
  addBatch(kit, tiles)
  // The lanterns and the ferry's windows glow by themselves, each its own colour
  const glowing = glow.build()
  if (glowing) group.add(new Mesh(keep(glowing), own(new MeshBasicMaterial({ vertexColors: true }))))
  return {
    update(seconds) {
      water.update(seconds)
    },
  }
}
