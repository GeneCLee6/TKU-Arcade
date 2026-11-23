// 2026-11-20 (owner: "more lifelike, cooler"; docs/KART-WORLD.md §6.1): the Wharf Warehouses' own
// scenery (shared/kart/tracks/wharf.ts). The big shed in the hairpin the lane runs behind, its number
// on its side and roof; numbered warehouses round the yard; container stacks between them; the quay
// to the east with its yellow edge, bollards and two gantry cranes reaching out over the water; a
// container ship alongside and two workboats. Our own simple shapes, placed from the track so that
// nothing stands on any road; no real port, ship or company copied. Seeded: the same yard each time.
import { BoxGeometry, InstancedMesh, Color } from 'three'
import { scatter } from '../../../shared/kart/scenery.ts'
import { trackBounds, type Track } from '../../../shared/kart/track.ts'
import { kartThemes, waterScene, wharfScene } from '../../styles/kartTokens.ts'
import {
  addBatch,
  Batch,
  containerTexture,
  corrugatedTexture,
  fitRect,
  insideFootprint,
  numberRect,
  numberTexture,
  type Footprint,
  type Point3,
} from './skillKit.ts'
import { buildWater } from './seaWater.ts'
import type { ArtKit } from './trackArt.ts'

export interface WharfPlan {
  /** Where the quay ends and the water begins: everything east of it is sea */
  readonly seaX: number
  readonly shed: Footprint | null
  readonly warehouses: readonly Footprint[]
  readonly stacks: readonly { x: number; z: number; high: number; turn: number; seed: number }[]
  /** Whether a tree or the festival's dressing may stand at (x, z) */
  fits(x: number, z: number): boolean
}

/** The quay's apron, metres wide, west of the water */
const APRON = 18
const SEA_LEVEL = -0.9

export function wharfPlan(track: Track, density: number): WharfPlan {
  const box = trackBounds(track)
  const seaX = box.maxX + 48
  // The big shed: in the hairpin the lane cuts across, between its apex and the lane's back straight
  let shed: Footprint | null = null
  const fork = track.forks?.[0]
  if (fork) {
    const apex = track.road[Math.round((fork.from + fork.to) / 2)]!
    const back = fork.path[Math.floor(fork.path.length / 2)]!
    const x = (apex.x + back.x) / 2
    const z = (apex.z + back.z) / 2
    // Its length along the lane's back straight, square to the line from the apex
    const turn = Math.atan2(back.x - apex.x, back.z - apex.z)
    shed = fitRect(track.road, x, z, turn, [96, 46], 5)
  }
  const warehouses: Footprint[] = scatter(track.road, {
    seed: 3101,
    count: Math.round(12 * density) + 3,
    box: { minX: box.minX - 110, maxX: seaX - APRON - 20, minZ: box.minZ - 110, maxZ: box.maxZ + 110 },
    // A warehouse's half diagonal is at most 20 m: none reaches a road
    clearance: 24,
    spacing: 46,
    maxClearance: 110,
    fits: (x, z) => !shed || !insideFootprint(shed, x, z, 26),
  }).map((one) => ({
    x: one.x,
    z: one.z,
    along: 22 + one.a * 12,
    across: 14 + one.b * 8,
    turn: Math.round(one.b * 4) * (Math.PI / 2),
  }))
  const buildings = [...(shed ? [shed] : []), ...warehouses]
  const stacks = scatter(track.road, {
    seed: 3102,
    count: Math.round(34 * density) + 6,
    box: { minX: box.minX - 70, maxX: seaX - 6, minZ: box.minZ - 70, maxZ: box.maxZ + 70 },
    clearance: 7,
    spacing: 10,
    maxClearance: 70,
    fits: (x, z) => !buildings.some((one) => insideFootprint(one, x, z, 5)),
  }).map((one, index) => ({
    x: one.x,
    z: one.z,
    high: 1 + Math.floor(one.a * 3),
    turn: Math.round(one.b * 2) * (Math.PI / 2),
    seed: index,
  }))
  return {
    seaX,
    shed,
    warehouses,
    stacks,
    fits: (x, z) =>
      x < seaX - APRON - 4 &&
      !buildings.some((one) => insideFootprint(one, x, z, 4)) &&
      !stacks.some((one) => Math.hypot(one.x - x, one.z - z) < 7),
  }
}

const tint = new Color()

export function buildWharf(kit: ArtKit, plan: WharfPlan): { update(seconds: number): void } {
  const { track, group } = kit
  const box = trackBounds(track)
  const { seaX } = plan
  const north = box.minZ - 260
  const south = box.maxZ + 260

  // ── The sea and the quay's edge ──
  const seaWidth = 900
  // 2026-11-22 (#115, seaWater.ts): real water on the medium and high pictures; just over the land's
  // grass, which it hides; the quay stands higher than both
  const sea = buildWater(
    kit,
    {
      x: seaX + seaWidth / 2,
      z: (north + south) / 2,
      width: seaWidth,
      depth: south - north,
      near: box,
      y: 0.04,
      depthAt: (x) => (x - seaX) / 60,
      ...waterScene.wharf,
      sky: kartThemes.day.skyHorizon,
      flatMap: kit.textures.water,
      flatColor: wharfScene.sea,
      flatRepeat: 16,
      overGround: true,
    },
    kit.level.water ?? 0,
  )
  group.add(kit.shadowed(sea.mesh, false))

  const solid = new Batch()
  const quayY = 0.7
  solid.box({ x: seaX - APRON / 2, y: quayY / 2, z: (north + south) / 2 }, [APRON, quayY, south - north], Math.PI / 2, wharfScene.quay)
  solid.box({ x: seaX - 0.6, y: quayY + 0.06, z: (north + south) / 2 }, [1.2, 0.14, south - north], Math.PI / 2, wharfScene.quayEdge)
  solid.box({ x: seaX + 0.2, y: (quayY + SEA_LEVEL) / 2, z: (north + south) / 2 }, [0.4, quayY - SEA_LEVEL + 0.6, south - north], Math.PI / 2, wharfScene.quayFace)

  // Bollards along the edge: a black post with a yellow cap
  const bollards: Point3[] = []
  for (let z = north + 20; z < south - 20; z += 14) bollards.push({ x: seaX - 2, y: quayY, z })
  const posts = new InstancedMesh(kit.keep(new BoxGeometry(0.7, 0.9, 0.7)), kit.standard(wharfScene.bollard), bollards.length)
  const caps = new InstancedMesh(kit.keep(new BoxGeometry(1, 0.2, 1)), kit.standard(wharfScene.bollardCap), bollards.length)
  bollards.forEach((one, index) => {
    kit.place(posts, index, one.x, one.y + 0.45, one.z, [1, 1, 1])
    kit.place(caps, index, one.x, one.y + 1, one.z, [1, 1, 1])
  })
  group.add(kit.shadowed(posts), kit.shadowed(caps))

  // ── Two gantry cranes on the quay, booms out over the water ──
  const middleZ = (box.minZ + box.maxZ) / 2
  for (const [k, z] of [middleZ - 70, middleZ + 60].entries()) {
    const x = seaX - APRON / 2
    const legH = 30
    const colourA = k === 0 ? wharfScene.crane : wharfScene.craneWhite
    const colourB = k === 0 ? wharfScene.craneWhite : wharfScene.crane
    for (const dz of [-7, 7]) {
      for (const dx of [-6.5, 6.5]) {
        solid.box({ x: x + dx, y: quayY + legH / 2, z: z + dz }, [1.4, legH, 1.4], 0, colourA)
      }
      // A sill beam along each side, bogies on the rail
      solid.box({ x, y: quayY + 1, z: z + dz }, [15, 1.4, 1.6], 0, wharfScene.craneDark)
      solid.box({ x, y: quayY + legH - 4, z: z + dz }, [14, 1.2, 1.2], 0, colourB)
    }
    for (const dx of [-6.5, 6.5]) solid.box({ x: x + dx, y: quayY + legH * 0.55, z }, [1, 1, 14], 0, colourA)
    // The girder on top, the boom out over the sea and the backreach over the land
    solid.box({ x, y: quayY + legH + 1.2, z }, [16, 2.4, 16], 0, colourA)
    solid.box({ x: x + 22, y: quayY + legH + 3.4, z }, [62, 2, 3.2], 0, colourA)
    solid.box({ x: x - 16, y: quayY + legH + 3.4, z }, [20, 2, 3.2], 0, colourA)
    // The machinery house, the cab under the boom, the stays up to the apex
    solid.box({ x: x - 4, y: quayY + legH + 4.6, z }, [9, 4, 7], 0, wharfScene.craneWhite)
    solid.box({ x: x + 10, y: quayY + legH - 0.6, z }, [3.2, 2.8, 3.2], 0, wharfScene.craneDark)
    solid.box({ x: x - 2, y: quayY + legH + 10, z }, [1.2, 12, 1.2], 0, colourB)
    solid.tube({ x: x - 2, y: quayY + legH + 15.5, z }, { x: x + 50, y: quayY + legH + 4.3, z }, 0.3, wharfScene.craneDark, 6)
    solid.tube({ x: x - 2, y: quayY + legH + 15.5, z }, { x: x - 25, y: quayY + legH + 4.3, z }, 0.3, wharfScene.craneDark, 6)
    // A container hanging from the spreader
    solid.box({ x: x + 30, y: quayY + legH - 6, z }, [6.1, 2.6, 2.44], Math.PI / 2, wharfScene.containers[k + 2]!)
    solid.tube({ x: x + 30, y: quayY + legH + 2.4, z }, { x: x + 30, y: quayY + legH - 4.7, z }, 0.12, wharfScene.craneDark, 4)
  }

  // ── The ship alongside, and two workboats ──
  const shipX = seaX + 26
  const shipLength = 150
  const hull: [number, number][] = [
    [-9, SEA_LEVEL - 2],
    [9, SEA_LEVEL - 2],
    [11, SEA_LEVEL + 7],
    [-11, SEA_LEVEL + 7],
  ]
  solid.prism({ x: shipX, y: 0, z: middleZ }, hull, shipLength, 0, wharfScene.hulls[1])
  // The bow, narrower and raised, and a white band along the gunwale
  solid.prism(
    { x: shipX, y: 0, z: middleZ - shipLength / 2 - 5 },
    [
      [-6, SEA_LEVEL - 1],
      [6, SEA_LEVEL - 1],
      [8, SEA_LEVEL + 7.6],
      [-8, SEA_LEVEL + 7.6],
    ],
    10,
    0,
    wharfScene.hulls[0],
  )
  solid.box({ x: shipX, y: SEA_LEVEL + 7.2, z: middleZ }, [22.4, 0.5, shipLength], 0, wharfScene.deckhouse)
  // The deckhouse aft, its bridge wings, the funnel
  const aft = middleZ + shipLength / 2 - 14
  solid.box({ x: shipX, y: SEA_LEVEL + 14, z: aft }, [18, 13, 12], 0, wharfScene.deckhouse)
  solid.box({ x: shipX, y: SEA_LEVEL + 20, z: aft - 4 }, [24, 1.4, 5], 0, wharfScene.deckhouse)
  solid.box({ x: shipX, y: SEA_LEVEL + 17.4, z: aft - 6.3 }, [17, 1.6, 0.3], 0, wharfScene.boatTrim)
  solid.box({ x: shipX, y: SEA_LEVEL + 24, z: aft + 3 }, [4, 7, 4], 0, wharfScene.funnel)
  for (const [k, offset] of [-30, 32].entries()) {
    const x = seaX + 64 + k * 30
    const z = middleZ + offset * 3 + 40
    solid.prism({ x, y: 0, z }, [[-2.6, SEA_LEVEL - 0.6], [2.6, SEA_LEVEL - 0.6], [3.2, SEA_LEVEL + 1.8], [-3.2, SEA_LEVEL + 1.8]], 16, k * 0.6, wharfScene.hulls[k * 2]!)
    solid.box({ x, y: SEA_LEVEL + 3.2, z: z + 2 }, [4, 2.8, 5], k * 0.6, wharfScene.deckhouse)
  }

  // ── Containers: on the ship's deck and in stacks round the yard (the walls' rows are skillWalls') ──
  const boxes: { x: number; y: number; z: number; turn: number; colour: string }[] = []
  const palette = wharfScene.containers
  for (let bay = 0; bay < 15; bay++) {
    for (let row = 0; row < 7; row++) {
      const high = 1 + ((bay * 5 + row * 3) % 4)
      for (let tier = 0; tier < high; tier++) {
        boxes.push({
          x: shipX - 7.5 + row * 2.5,
          y: SEA_LEVEL + 7.5 + 1.3 + tier * 2.6,
          z: middleZ - shipLength / 2 + 8 + bay * 6.4,
          turn: Math.PI / 2,
          colour: palette[(bay * 3 + row * 5 + tier) % palette.length]!,
        })
      }
    }
  }
  for (const stack of plan.stacks) {
    const wide = stack.seed % 3 === 0 ? 2 : 1
    for (let side = 0; side < wide; side++) {
      for (let tier = 0; tier < stack.high; tier++) {
        boxes.push({
          x: stack.x + Math.sin(stack.turn) * side * 2.5,
          y: 1.3 + tier * 2.6,
          z: stack.z + Math.cos(stack.turn) * side * 2.5,
          turn: stack.turn,
          colour: palette[(stack.seed * 7 + tier * 3 + side) % palette.length]!,
        })
      }
    }
  }
  const containers = new InstancedMesh(
    kit.keep(new BoxGeometry(6.1, 2.6, 2.44)),
    kit.standard('#ffffff', containerTexture(kit)),
    boxes.length,
  )
  boxes.forEach((one, index) => {
    kit.place(containers, index, one.x, one.y, one.z, [1, 1, 1], one.turn)
    containers.setColorAt(index, tint.set(one.colour))
  })
  group.add(kit.shadowed(containers))

  // ── The sheds: sheet-metal sides, a low gable roof, roller doors, a number on each ──
  const metal = new Batch()
  const plates = new Batch()
  const sheds = [...(plan.shed ? [{ ...plan.shed, big: true }] : []), ...plan.warehouses.map((one) => ({ ...one, big: false }))]
  sheds.forEach((shed, index) => {
    const height = shed.big ? 13 : 9 + (index % 3) * 1.5
    const wall = wharfScene.shedWalls[index % wharfScene.shedWalls.length]!
    metal.box({ x: shed.x, y: height / 2, z: shed.z }, [shed.along, height, shed.across], shed.turn, wall, 4)
    const roof: [number, number][] = [
      [-shed.across / 2 - 0.8, 0],
      [shed.across / 2 + 0.8, 0],
      [0, shed.across * 0.16],
    ]
    metal.prism({ x: shed.x, y: height, z: shed.z }, roof, shed.along + 1.2, shed.turn + Math.PI / 2, wharfScene.shedRoof, 4)
    // Roller doors along the front, the number over them and on the far side
    const c = Math.cos(shed.turn)
    const s = Math.sin(shed.turn)
    const front = (along: number, out: number, y: number): Point3 => ({
      x: shed.x + c * along + s * out,
      y,
      z: shed.z - s * along + c * out,
    })
    const doors = shed.big ? 4 : 2
    for (let door = 0; door < doors; door++) {
      const along = ((door + 0.5) / doors - 0.5) * shed.along * 0.8
      for (const side of [1, -1]) {
        metal.box(front(along, side * (shed.across / 2), 2.8), [5, 5.6, 0.3], shed.turn, wharfScene.door, 1.2)
      }
    }
    const number = numberRect(index % 8)
    const plateW = shed.big ? 9 : 6
    for (const side of [1, -1]) {
      plates.panel(front(0, side * (shed.across / 2 + 0.08), height - plateW * 0.32 - 0.6), plateW, plateW * 0.62, shed.turn + (side > 0 ? 0 : Math.PI), '#ffffff', number)
    }
  })
  addBatch(kit, metal, { map: corrugatedTexture(kit) })
  const numbers = numberTexture(kit, ['07', '01', '02', '03', '04', '05', '06', '08'])
  addBatch(kit, plates, { map: numbers, cast: false })
  addBatch(kit, solid)

  return {
    update(seconds) {
      sea.update(seconds)
    },
  }
}
