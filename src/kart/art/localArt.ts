// 2026-11-18 (the four technical tracks, docs/ARCHITECTURE.md §4.37): each one's own scenery, built
// where localPlan.ts says. Our own low-poly shapes and canvas-painted textures: no model or image
// files (docs/ASSETS.md), no real building, sign or logo copied. Everything that glows (the new
// town's windows and roof lines, the ring of light) is unlit colour bright enough for the bloom
// (post.ts), in keeping with the kart's esports look (docs/DESIGN.md §3.6).
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  TorusGeometry,
} from 'three'
import { localScene } from '../../styles/kartTokens.ts'
import type { LocalPlan } from './localPlan.ts'
import { painted } from './textures.ts'
import type { ArtKit } from './trackArt.ts'

export interface LocalArt {
  update(seconds: number): void
}

const STILL: LocalArt = { update: () => {} }

export function buildLocal(
  kit: ArtKit,
  plan: LocalPlan,
  groundAt: (x: number, z: number) => number,
): LocalArt {
  switch (plan.id) {
    case 'mangrove':
      return buildMangrove(kit, plan)
    case 'fort':
      return buildFort(kit, plan, groundAt)
    case 'danhai':
      return buildNightTown(kit, plan)
    case 'datun':
      return buildRidge(kit, plan, groundAt)
  }
}

// ── The mangrove flats: tidal pools, mangroves, egrets, a boardwalk ──
function buildMangrove(kit: ArtKit, plan: LocalPlan): LocalArt {
  const { group, textures, keep, own, standard, shadowed, place } = kit
  const disc = keep(new CircleGeometry(1, 24))
  disc.rotateX(-Math.PI / 2)
  const water = own(
    new MeshLambertMaterial({
      color: localScene.tidePool,
      map: textures.water,
      // Over the ground, which is pushed back in the depth buffer
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    }),
  )
  const pools = new InstancedMesh(disc, water, plan.pools.length)
  plan.pools.forEach((pool, index) => {
    place(pools, index, pool.x, 0.06, pool.z, [pool.size, 1, pool.size], pool.turn)
  })
  group.add(shadowed(pools, false))

  // Mangroves: a splay of stilt roots under a low, wide crown
  const roots = new InstancedMesh(
    keep(new ConeGeometry(0.9, 1.3, 6, 1, true)),
    standard(localScene.mangroveRoot),
    plan.clumps.length,
  )
  const crowns = new InstancedMesh(
    keep(new IcosahedronGeometry(1, 0)),
    // Each crown's own green (its instance colour) over white
    standard(localScene.glow),
    plan.clumps.length,
  )
  const light = new Color(localScene.mangroveLeafLight)
  const dark = new Color(localScene.mangroveLeaf)
  plan.clumps.forEach((clump, index) => {
    const s = clump.size
    place(roots, index, clump.x, 0.65 * (s / 2), clump.z, [s / 2, s / 2, s / 2], clump.turn)
    place(crowns, index, clump.x, 0.9 * s, clump.z, [s, s * 0.62, s], clump.turn)
    crowns.setColorAt(index, index % 3 === 0 ? light : dark)
  })
  group.add(shadowed(roots), shadowed(crowns))

  // Egrets: a white body on two thin legs, the neck up
  const bodies = new InstancedMesh(
    keep(new IcosahedronGeometry(0.34, 0)),
    standard(localScene.egret),
    plan.birds.length,
  )
  const necks = new InstancedMesh(
    keep(new CylinderGeometry(0.05, 0.09, 0.7, 5)),
    standard(localScene.egret),
    plan.birds.length,
  )
  const legs = new InstancedMesh(
    keep(new CylinderGeometry(0.03, 0.03, 0.7, 4)),
    standard(localScene.egretLeg),
    plan.birds.length,
  )
  plan.birds.forEach((bird, index) => {
    const s = bird.size
    place(legs, index, bird.x, 0.35 * s, bird.z, [s, s, s])
    place(bodies, index, bird.x, 0.86 * s, bird.z, [s * 1.5, s * 0.9, s], bird.turn)
    place(
      necks,
      index,
      bird.x + Math.cos(bird.turn) * 0.42 * s,
      1.25 * s,
      bird.z - Math.sin(bird.turn) * 0.42 * s,
      [s, s, s],
    )
  })
  group.add(shadowed(bodies), necks, legs)

  // The boardwalk: a deck on short posts and a rail on its far side
  const deck = new InstancedMesh(
    keep(new BoxGeometry(3.2, 0.2, 1)),
    standard(localScene.boardwalk),
    plan.planks.length,
  )
  const posts = new InstancedMesh(
    keep(new BoxGeometry(0.22, 1.9, 0.22)),
    standard(localScene.boardwalkRail),
    plan.planks.length,
  )
  const rails = new InstancedMesh(
    keep(new BoxGeometry(0.12, 0.12, 1)),
    standard(localScene.boardwalkRail),
    plan.planks.length,
  )
  plan.planks.forEach((plank, index) => {
    // The rail is on the side away from the road: the deck's own left, facing along it
    const outX = -Math.cos(plank.turn) * 1.5
    const outZ = Math.sin(plank.turn) * 1.5
    place(deck, index, plank.x, 0.7, plank.z, [1, 1, plank.size + 0.1], plank.turn)
    place(posts, index, plank.x + outX, 0.95, plank.z + outZ, [1, 1, 1], plank.turn)
    place(rails, index, plank.x + outX, 1.8, plank.z + outZ, [1, 1, plank.size + 0.1], plank.turn)
  })
  group.add(shadowed(deck), shadowed(posts), rails)

  return {
    update(seconds) {
      textures.water.offset.set(seconds * 0.01, seconds * 0.018)
    },
  }
}

// ── The fort on the hilltop: brick walls and bastions, a keep, guns over the river, a flag ──
function buildFort(
  kit: ArtKit,
  plan: LocalPlan,
  groundAt: (x: number, z: number) => number,
): LocalArt {
  const { fort } = plan
  if (!fort) return STILL
  const { group, textures, keep, own, standard, shadowed } = kit
  const half = fort.size
  // On a platform as high as the road beside it (the ground falls away from the road): it stands
  // over the crest, and its walls go down into the hill
  let nearest = Infinity
  let roadHeight = 0
  for (const point of kit.track.road) {
    const distance = Math.hypot(point.x - fort.x, point.z - fort.z)
    if (distance < nearest) {
      nearest = distance
      roadHeight = point.y ?? 0
    }
  }
  const base = Math.max(groundAt(fort.x, fort.z), roadHeight - 1)
  const brick = standard(localScene.fortBrick, textures.brick)
  const stone = standard(localScene.fortStone)
  const whole = new Group()
  whole.position.set(fort.x, base, fort.z)

  // Four walls, standing well into the ground (the hilltop is not level), a stone coping on each
  const WALL = 10
  const SUNK = 16
  for (const [dx, dz, turn] of [
    [0, -1, 0],
    [0, 1, 0],
    [-1, 0, Math.PI / 2],
    [1, 0, Math.PI / 2],
  ] as const) {
    const wall = new Mesh(keep(new BoxGeometry(half * 2, WALL + SUNK, 2.4)), brick)
    wall.position.set(dx * half, (WALL - SUNK) / 2, dz * half)
    wall.rotation.y = turn
    const coping = new Mesh(keep(new BoxGeometry(half * 2 + 0.6, 0.5, 3)), stone)
    coping.position.set(dx * half, WALL + 0.25, dz * half)
    coping.rotation.y = turn
    whole.add(shadowed(wall), shadowed(coping))
  }
  // A bastion on each corner
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const bastion = new Mesh(keep(new CylinderGeometry(4.6, 5.4, WALL + 2 + SUNK, 8)), brick)
    bastion.position.set(dx * half, (WALL + 2 - SUNK) / 2, dz * half)
    const cap = new Mesh(keep(new CylinderGeometry(5, 5, 0.6, 8)), stone)
    cap.position.set(dx * half, WALL + 2.3, dz * half)
    whole.add(shadowed(bastion), shadowed(cap))
  }
  // The gate, in the south wall
  const gate = new Mesh(
    keep(new BoxGeometry(6, 7, 2.6)),
    own(new MeshLambertMaterial({ color: localScene.fortGate })),
  )
  gate.position.set(0, 3.5, half)
  whole.add(gate)
  // The keep: a square brick house, a dark hipped roof
  const house = new Mesh(
    keep(new BoxGeometry(20, 16 + SUNK, 16)),
    standard(localScene.fortBrickDark, textures.brick),
  )
  house.position.set(0, (16 - SUNK) / 2, 0)
  const roof = new Mesh(keep(new ConeGeometry(15, 6, 4)), standard(localScene.fortRoof))
  roof.position.set(0, 19, 0)
  roof.rotation.y = Math.PI / 4
  whole.add(shadowed(house), shadowed(roof))
  // Four guns on the west wall, over the river
  const gun = keep(new CylinderGeometry(0.42, 0.55, 3.6, 8))
  const iron = standard(localScene.cannon)
  for (let index = 0; index < 4; index++) {
    const barrel = new Mesh(gun, iron)
    barrel.position.set(-half - 0.6, WALL + 1.1, -half * 0.6 + index * half * 0.4)
    barrel.rotation.z = Math.PI / 2 - 0.12
    whole.add(shadowed(barrel))
  }
  // The flag: a plain pennant of our own, no emblem
  const pole = new Mesh(keep(new CylinderGeometry(0.12, 0.16, 12, 6)), standard(localScene.fortStone))
  pole.position.set(0, 27, 0)
  const flag = new Mesh(
    keep(new PlaneGeometry(4.2, 2.4, 6, 1)),
    own(new MeshLambertMaterial({ color: localScene.fortFlag, side: DoubleSide })),
  )
  flag.position.set(2.2, 31.4, 0)
  whole.add(shadowed(pole), flag)
  group.add(whole)

  // The old parapet along the crest: a low brick wall, a stone block on every other length
  const parapet = new InstancedMesh(
    keep(new BoxGeometry(1.1, 1.5, 1)),
    brick,
    plan.planks.length,
  )
  const blocks = new InstancedMesh(
    keep(new BoxGeometry(1.3, 0.5, 1.6)),
    stone,
    Math.ceil(plan.planks.length / 2),
  )
  plan.planks.forEach((length, index) => {
    const y = groundAt(length.x, length.z)
    kit.place(parapet, index, length.x, y + 0.6, length.z, [1, 1, length.size + 0.1], length.turn)
    if (index % 2 === 0) {
      kit.place(blocks, index / 2, length.x, y + 1.55, length.z, [1, 1, 1], length.turn)
    }
  })
  group.add(shadowed(parapet), shadowed(blocks))

  const cloth = flag.geometry.getAttribute('position')
  const rest = Array.from({ length: cloth.count }, (_, index) => cloth.getX(index))
  return {
    update(seconds) {
      // The pennant flutters: a wave that grows towards its free end
      for (let index = 0; index < cloth.count; index++) {
        const along = (rest[index]! + 2.1) / 4.2
        cloth.setZ(index, Math.sin(seconds * 5 - along * 5) * 0.35 * along)
      }
      cloth.needsUpdate = true
    },
  }
}

// ── The new town at night: towers with lit windows and neon roof lines, a ring of light ──
function buildNightTown(kit: ArtKit, plan: LocalPlan): LocalArt {
  const { group, level, keep, own, ownTexture, shadowed, place } = kit
  // A tower's face: rows of windows, some lit warm, a few cool, most dark
  const windows = ownTexture(
    painted(
      256,
      83,
      (context, size, random) => {
        context.fillStyle = localScene.towerWall
        context.fillRect(0, 0, size, size)
        const columns = 8
        const rows = 16
        const w = size / columns
        const h = size / rows
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) {
            const lit = random()
            context.fillStyle =
              lit < 0.34
                ? localScene.towerWindowLit
                : lit < 0.42
                  ? localScene.towerWindowCool
                  : localScene.towerWindow
            context.fillRect(column * w + w * 0.18, row * h + h * 0.22, w * 0.64, h * 0.5)
          }
        }
      },
      level.anisotropy,
    ),
  )
  // The same picture lights itself: only the lit windows are bright enough to glow
  const face = own(
    new MeshLambertMaterial({
      map: windows,
      emissive: new Color(localScene.glow),
      emissiveMap: windows,
      emissiveIntensity: 0.85,
    }),
  )
  const top = own(new MeshLambertMaterial({ color: localScene.towerRoof }))
  const towers = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    // A box's faces: +x, -x, +y, -y, +z, -z
    [face, face, top, top, face, face],
    plan.towers.length,
  )
  // The neon round each roof: four bars, in one of three colours
  const bars = new InstancedMesh(
    keep(new BoxGeometry(1, 0.4, 0.4)),
    own(new MeshBasicMaterial({ color: localScene.glow })),
    plan.towers.length * 4,
  )
  const neons = localScene.neons.map((colour) => new Color(colour))
  plan.towers.forEach((tower, index) => {
    const { x, z, size: width, depth, height } = tower
    place(towers, index, x, height / 2, z, [width, height, depth])
    const y = height + 0.2
    const colour = neons[tower.neon % neons.length]!
    place(bars, index * 4, x, y, z - depth / 2, [width, 1, 1])
    place(bars, index * 4 + 1, x, y, z + depth / 2, [width, 1, 1])
    place(bars, index * 4 + 2, x - width / 2, y, z, [depth, 1, 1], Math.PI / 2)
    place(bars, index * 4 + 3, x + width / 2, y, z, [depth, 1, 1], Math.PI / 2)
    for (let bar = 0; bar < 4; bar++) bars.setColorAt(index * 4 + bar, colour)
  })
  group.add(shadowed(towers), bars)

  // The ring of light inside the roundabout: two hoops on a plinth, turning slowly
  const { ring } = plan
  if (!ring) return STILL
  const plinth = new Mesh(
    keep(new CylinderGeometry(ring.size * 0.5, ring.size * 0.62, 1.6, 12)),
    own(new MeshLambertMaterial({ color: localScene.ringBase })),
  )
  plinth.position.set(ring.x, 0.8, ring.z)
  group.add(shadowed(plinth))
  const hoops = [0, 1].map((index) => {
    const hoop = new Mesh(
      keep(new TorusGeometry(ring.size * (index === 0 ? 1 : 0.72), 0.32, 8, 40)),
      own(new MeshBasicMaterial({ color: localScene.neons[index]! })),
    )
    hoop.position.set(ring.x, ring.size + 2.2, ring.z)
    group.add(hoop)
    return hoop
  })
  return {
    update(seconds) {
      hoops[0]!.rotation.y = seconds * 0.4
      hoops[1]!.rotation.y = -seconds * 0.65
    },
  }
}

// ── The ridge: silver grass, rocks, a weather dome, steam vents ──
function buildRidge(
  kit: ArtKit,
  plan: LocalPlan,
  groundAt: (x: number, z: number) => number,
): LocalArt {
  const { group, keep, own, standard, shadowed, place } = kit
  // Silver grass: a pale plume on a thin stem
  const plumes = new InstancedMesh(
    keep(new ConeGeometry(0.34, 1.5, 4)),
    standard(localScene.silverGrass),
    plan.grass.length,
  )
  const stems = new InstancedMesh(
    keep(new ConeGeometry(0.5, 0.9, 4, 1, true)),
    standard(localScene.silverGrassStem),
    plan.grass.length,
  )
  plan.grass.forEach((tuft, index) => {
    const s = tuft.size
    const y = groundAt(tuft.x, tuft.z)
    place(stems, index, tuft.x, y + 0.45 * s, tuft.z, [s, s, s], tuft.turn)
    place(plumes, index, tuft.x, y + 1.5 * s, tuft.z, [s, s, s], tuft.turn)
  })
  group.add(plumes, stems)

  const rocks = new InstancedMesh(
    keep(new IcosahedronGeometry(1, 0)),
    standard(localScene.rock),
    plan.rocks.length,
  )
  plan.rocks.forEach((rock, index) => {
    const s = rock.size
    place(rocks, index, rock.x, groundAt(rock.x, rock.z) + 0.3 * s, rock.z, [s, s * 0.7, s * 1.2], rock.turn)
  })
  group.add(shadowed(rocks))

  if (plan.dome) {
    const { x, z, size } = plan.dome
    const y = groundAt(x, z)
    const tower = new Mesh(
      keep(new CylinderGeometry(size * 0.5, size * 0.62, 14, 10)),
      standard(localScene.domeTower),
    )
    tower.position.set(x, y + 5, z)
    const dome = new Mesh(keep(new IcosahedronGeometry(size, 1)), standard(localScene.dome))
    dome.position.set(x, y + 12 + size * 0.7, z)
    group.add(shadowed(tower), shadowed(dome))
  }

  // Vents: a low mound, and three puffs of steam that rise and thin out in turn
  const mound = keep(new ConeGeometry(2.2, 1.1, 7))
  const moundMaterial = standard(localScene.ventMound)
  const puff = keep(new IcosahedronGeometry(1, 1))
  const puffs: { mesh: Mesh; material: MeshBasicMaterial; x: number; y: number; z: number; size: number; phase: number }[] =
    []
  plan.vents.forEach((vent, at) => {
    const y = groundAt(vent.x, vent.z)
    const hill = new Mesh(mound, moundMaterial)
    hill.position.set(vent.x, y + 0.5, vent.z)
    hill.scale.setScalar(vent.size)
    group.add(shadowed(hill))
    for (let index = 0; index < 3; index++) {
      const material = own(
        new MeshBasicMaterial({
          color: localScene.steam,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      )
      const mesh = new Mesh(puff, material)
      group.add(mesh)
      puffs.push({ mesh, material, x: vent.x, y, z: vent.z, size: vent.size, phase: index / 3 + at * 0.17 })
    }
  })
  const drift = (seconds: number) => {
    for (const one of puffs) {
      const t = (seconds * 0.16 + one.phase) % 1
      one.mesh.position.set(one.x + t * 3, one.y + 1 + t * 13, one.z + t * 1.5)
      one.mesh.scale.setScalar(one.size * (0.9 + t * 3.2))
      one.material.opacity = 0.34 * (1 - t)
    }
  }
  drift(0)
  return { update: drift }
}
