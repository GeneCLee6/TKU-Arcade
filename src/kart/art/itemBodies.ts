// 2026-11-20 (docs/ARCHITECTURE.md §4.45): the item series' three karts (shared/kart/karts.ts), in the
// look of the rest (kartBodies.ts: hulls cut in flat faces, satin black and carbon with one neon
// colour, lit lines, a livery) and from the same river mouth: three birds and a beast that gather
// things. All our own shapes: no other game's kart, part or change of shape.
//
// - `pelican`, the bubble that stops two: a broad hull under a long flat beak, a pale pouch slung
//   beneath it, wings folded along the flanks. Open: the pouch fills, the wings spread, the beak
//   lifts.
// - `otter`, the lucky one whose items last: a low round hull, a small round head with whiskers, two
//   fore paws holding a stone on the nose, a thick flat tail. Open: the paws hold the stone up, the
//   tail lifts and widens.
// - `cormorant`, the luckiest: a slim dark hull, a low hooked head on a short neck, long wings laid
//   back. Open: the wings stand out wide to dry, as the bird does, the head stretches forward.
//
// Same footprint and frame as the others: about 1.5 m wide and 2.6 m long closed, -z forward.
import { IcosahedronGeometry, type Object3D } from 'three'
import { box, cockpit, coreHatch, SIDES, skirt, slit, thruster } from './kartBodies.ts'
import { blade, hinge, hull, plate, wedge, type BodyFit, type BodyKit } from './kartParts.ts'

function pelican(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A broad hull, flat on top
  kit.put(
    chassis,
    hull([
      { z: -0.9, w: 0.3, top: 0.16, bottom: 0.08, sw: 0.6 },
      { z: -0.4, w: 0.46, top: 0.28, bottom: 0.11, sw: 0.55 },
      { z: 0.3, w: 0.5, top: 0.28, bottom: 0.12, sw: 0.55 },
      { z: 0.9, w: 0.38, top: 0.24, bottom: 0.1 },
      { z: 1.18, w: 0.2, top: 0.15, bottom: 0.07, y: 0.02 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.3, 0.27)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.29, 0.75, 'up')
  // The beak: long and flat, a neon ridge down it; it lifts a little when open
  const beak = hinge(chassis, 0, 0.13, -0.86)
  kit.put(
    beak,
    plate(
      [
        [-0.12, 0],
        [0.12, 0],
        [0.05, -0.62],
        [0, -0.68],
        [-0.05, -0.62],
      ],
      0.04,
    ),
    paint.second,
  )
  kit.put(beak, box(0.025, 0.03, 0.6), paint.accent, 0, 0.03, -0.32)
  kit.morph(beak, { rx: 0.12, from: 0.1 })
  // The pouch slung under the beak: it fills
  const pouch = hinge(chassis, 0, -0.02, -1.0)
  kit.put(
    pouch,
    hull([
      { z: -0.36, w: 0.03, top: 0.02, bottom: 0.02 },
      { z: -0.18, w: 0.12, top: 0.04, bottom: 0.1, sw: 0.4 },
      { z: 0.12, w: 0.14, top: 0.04, bottom: 0.12, sw: 0.4 },
    ]),
    paint.accent,
  )
  kit.morph(pouch, { sy: 1.7, sx: 1.3, y: -0.05, from: 0.05, until: 0.6 })
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.16, side * 0.2, 0.12, -0.9, side * -0.3)
    skirt(kit, chassis, side, side * 0.52, -0.02, -0.5, 0.9)
    kit.strip(chassis, side * 0.34, 0.27, 0.3, 0.9, side * -0.04)
    // A wing folded along the flank: it spreads level and out
    const wing = hinge(chassis, side * 0.46, 0.16, -0.1)
    kit.put(
      wing,
      plate(
        [
          [0, -0.3],
          [side * 0.22, -0.1],
          [side * 0.3, 0.6],
          [0, 0.4],
        ],
        0.026,
      ),
      paint.second,
    )
    kit.put(wing, box(0.03, 0.03, 0.62), paint.accent, side * 0.22, 0.03, 0.24).rotation.y =
      side * 0.12
    kit.decal(wing, 'mark', 0.15, 0.15, side * 0.14, 0.03, 0.12)
    wing.rotation.z = side * -0.9
    kit.morph(wing, { rz: side * 0.05, x: side * 0.62, sx: 1.6, from: 0.15 })
    kit.put(chassis, box(0.16, 0.03, 0.03), paint.tailLamp, side * 0.2, 0.2, 1.1)
    thruster(kit, chassis, side * 0.22, 0.02, 1.34, 0.15, 0.26)
  }
  coreHatch(kit, chassis, 0.285, 0.82, 1.1, 0.08)
  return {
    seat: { y: 0, z: 0.3 },
    rearContacts: [
      [-0.52, 1.08],
      [0.52, 1.08],
    ],
  }
}

function otter(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A low, rounded hull that runs back into the tail
  kit.put(
    chassis,
    hull([
      { z: -1.1, w: 0.18, top: 0.14, bottom: 0.07, y: 0.0, sw: 0.8 },
      { z: -0.82, w: 0.3, top: 0.22, bottom: 0.09, sw: 0.8 },
      { z: -0.2, w: 0.44, top: 0.26, bottom: 0.11, sw: 0.75 },
      { z: 0.5, w: 0.42, top: 0.24, bottom: 0.1, sw: 0.7 },
      { z: 1.0, w: 0.24, top: 0.16, bottom: 0.08, sw: 0.6 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.26, 0.25)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.255, 0.72, 'up')
  // A pale chin and two lamps for eyes
  kit.put(chassis, wedge(0.4, 0.4, 0.05, 0.02), paint.second, 0, 0.05, -0.92)
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.1, side * 0.13, 0.2, -0.86, side * -0.6)
    // Whiskers
    for (const [y, turn] of [
      [0.13, 0.3],
      [0.1, 0.1],
    ] as const) {
      kit.put(chassis, box(0.26, 0.012, 0.012), paint.metal, side * 0.24, y, -1.0).rotation.y =
        side * turn
    }
    skirt(kit, chassis, side, side * 0.46, -0.03, -0.4, 0.8)
    kit.strip(chassis, side * 0.3, 0.25, 0.25, 0.7, side * -0.05)
    kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, side * 0.14, 0.15, 0.98)
    thruster(kit, chassis, side * 0.2, 0.0, 1.22, 0.13, 0.24)
  }
  // Two fore paws holding a stone on the nose: they hold it up
  const paws = hinge(chassis, 0, 0.18, -0.66)
  for (const side of SIDES) {
    kit.put(
      paws,
      blade(
        [
          [0.12, 0],
          [-0.12, 0],
          [-0.2, 0.1],
          [0.02, 0.12],
        ],
        0.06,
      ),
      paint.accent,
      side * 0.1,
    )
  }
  kit.put(paws, new IcosahedronGeometry(0.1, 0), paint.glow, 0, 0.13, -0.14)
  kit.morph(paws, { y: 0.32, rx: -0.5, from: 0.1, until: 0.7 })
  // The tail: thick, flat, a neon edge; it lifts and widens
  const tail = hinge(chassis, 0, 0.06, 1.0)
  kit.put(
    tail,
    plate(
      [
        [-0.14, 0],
        [0.14, 0],
        [0.2, 0.4],
        [0, 0.56],
        [-0.2, 0.4],
      ],
      0.05,
    ),
    paint.second,
  )
  kit.put(tail, box(0.34, 0.03, 0.03), paint.accent, 0, 0.03, 0.42)
  kit.decal(tail, 'mark', 0.16, 0.16, 0, 0.03, 0.26)
  kit.morph(tail, { rx: -0.35, y: 0.18, sx: 1.4, from: 0.2 })
  coreHatch(kit, chassis, 0.245, 0.62, 0.92, 0.07)
  return {
    seat: { y: 0, z: 0.26 },
    rearContacts: [
      [-0.46, 1.0],
      [0.46, 1.0],
    ],
  }
}

function cormorant(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A slim, deep hull
  kit.put(
    chassis,
    hull([
      { z: -0.9, w: 0.16, top: 0.14, bottom: 0.08, sw: 0.5 },
      { z: -0.4, w: 0.34, top: 0.27, bottom: 0.11, sw: 0.5 },
      { z: 0.3, w: 0.38, top: 0.27, bottom: 0.11, sw: 0.5 },
      { z: 0.9, w: 0.26, top: 0.22, bottom: 0.09 },
      { z: 1.2, w: 0.12, top: 0.14, bottom: 0.06, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.3, 0.27, 0.22)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.275, 0.8, 'up')
  // A short neck and a low hooked head ahead: it stretches forward
  const head = hinge(chassis, 0, 0.12, -0.88)
  kit.put(head, box(0.12, 0.1, 0.3), paint.second, 0, 0.02, -0.08)
  kit.put(
    head,
    blade(
      [
        [-0.24, 0],
        [-0.56, -0.02],
        [-0.6, -0.08],
        [-0.5, -0.04],
        [-0.22, -0.06],
      ],
      0.05,
    ),
    paint.accent,
  ).rotation.y = Math.PI / 2
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.12, side * 0.09, 0.2, -0.95, side * -0.4)
  }
  kit.morph(head, { z: -1.04, y: 0.16, from: 0.1, until: 0.6 })
  for (const side of SIDES) {
    skirt(kit, chassis, side, side * 0.4, -0.03, -0.4, 0.9)
    kit.strip(chassis, side * 0.28, 0.27, 0.35, 0.8, side * -0.04)
    // A long wing laid back along the hull: it stands out wide, as the bird holds its wings to dry
    const wing = hinge(chassis, side * 0.34, 0.24, 0.0)
    kit.put(
      wing,
      plate(
        [
          [0, -0.2],
          [side * 0.16, -0.24],
          [side * 0.52, 0.5],
          [side * 0.3, 0.86],
          [0, 0.5],
        ],
        0.024,
      ),
      paint.carbon,
    )
    kit.put(wing, box(0.03, 0.03, 0.7), paint.accent, side * 0.3, 0.025, 0.3).rotation.y =
      side * -0.38
    kit.decal(wing, 'mark', 0.14, 0.14, side * 0.2, 0.026, 0.24)
    wing.rotation.z = side * -0.25
    wing.rotation.y = side * 0.2
    kit.morph(wing, { rz: side * 0.75, ry: side * -0.25, from: 0.15 })
    kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, side * 0.14, 0.2, 1.12)
    thruster(kit, chassis, side * 0.17, 0.02, 1.36, 0.13, 0.26)
  }
  coreHatch(kit, chassis, 0.265, 0.9, 1.14, 0.065)
  return {
    seat: { y: 0, z: 0.3 },
    rearContacts: [
      [-0.42, 1.1],
      [0.42, 1.1],
    ],
  }
}

/** The item series' three karts (2026-11-20) */
export const ITEM_BODIES = { pelican, otter, cormorant }
