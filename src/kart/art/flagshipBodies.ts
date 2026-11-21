// 2026-11-21 (docs/KART-META.md, docs/KART-WORLD.md §4.4): the season flagships' bodies, a lazy
// chunk of their own (bodyLoad.ts). The first season's is `kite`, the black kite that circles the
// river mouth and the harbour: in the look of the rest (kartBodies.ts: hulls cut in flat faces, satin
// black and carbon with one neon colour, lit lines, a livery), only more of it. All our own shapes:
// no other game's kart, part or change of shape.
//
// - `kite`: a long arrowhead hull with a hooked nose, a raised canopy spine, long cranked wings laid
//   back along the flanks, a forked tail (the bird's own sign) over twin thrusters, and a glowing
//   keel. Open (a full boost): the wings swing out and level, their tips kick up, the forked tail
//   splays wide, the spine's crest stands, the nose drops and stretches, and the keel's core blazes.
//
// Same footprint and frame as the others: about 1.5 m wide and 2.6 m long closed, -z forward.
import type { Object3D } from 'three'
import { box, cockpit, coreHatch, SIDES, skirt, slit, thruster } from './kartBodies.ts'
import { blade, hinge, hull, plate, wedge, type BodyFit, type BodyKit } from './kartParts.ts'

function kite(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The arrowhead: narrow at the nose, broad shoulders, tapering into the tail
  kit.put(
    chassis,
    hull([
      { z: -1.12, w: 0.08, top: 0.06, bottom: 0.04, y: -0.01, sw: 0.5 },
      { z: -0.8, w: 0.22, top: 0.17, bottom: 0.08, sw: 0.55 },
      { z: -0.3, w: 0.36, top: 0.27, bottom: 0.1, sw: 0.5 },
      { z: 0.22, w: 0.4, top: 0.27, bottom: 0.11, sw: 0.5 },
      { z: 0.78, w: 0.3, top: 0.24, bottom: 0.1, sw: 0.45 },
      { z: 1.14, w: 0.16, top: 0.15, bottom: 0.07, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.25, 0.22)
  kit.decal(chassis, 'number', 0.2, 0.1, 0, 0.21, -0.62, 'up', 0.36)
  // The hooked nose: a neon beak that drops and reaches when open
  const beak = hinge(chassis, 0, 0.02, -1.08)
  kit.put(
    beak,
    hull([
      { z: -0.3, w: 0.01, top: 0.01, bottom: 0.02, y: -0.06 },
      { z: -0.18, w: 0.05, top: 0.05, bottom: 0.03, y: -0.03, sw: 0.5 },
      { z: 0.02, w: 0.1, top: 0.07, bottom: 0.05, sw: 0.5 },
    ]),
    paint.accent,
  )
  kit.morph(beak, { z: -1.16, rx: 0.1, sz: 1.25, until: 0.6 })
  // The spine down the canopy, and the crest on it that stands
  kit.put(chassis, wedge(0.06, 0.9, 0.03, 0.12), paint.carbon, 0, 0.27, -0.2)
  kit.strip(chassis, 0, 0.31, -0.25, 0.8, 0, paint.glow)
  const crest = hinge(chassis, 0, 0.3, 0.6)
  kit.put(
    crest,
    blade(
      [
        [-0.16, 0],
        [0.16, 0],
        [0.5, 0.12],
        [0.44, 0.18],
      ],
      0.024,
    ),
    paint.accent,
  )
  kit.morph(crest, { rx: -0.55, from: 0.25 })
  // A low front wing: two carbon planes with neon end plates
  for (const side of SIDES) {
    kit.put(
      chassis,
      plate(
        [
          [0, -0.12],
          [side * 0.46, 0.02],
          [side * 0.46, 0.16],
          [0, 0.1],
        ],
        0.02,
      ),
      paint.carbon,
      side * 0.06,
      -0.08,
      -0.94,
    )
    kit.put(chassis, blade([[-0.06, -0.02], [0.18, -0.02], [0.18, 0.09], [0.04, 0.06]], 0.02), paint.accent, side * 0.52, -0.06, -0.94)
    slit(kit, chassis, paint.headLamp, 0.11, side * 0.14, 0.07, -0.98, side * -0.55)
    skirt(kit, chassis, side, side * 0.42, -0.02, -0.6, 0.8)
    kit.strip(chassis, side * 0.3, 0.25, 0.1, 1.1, side * -0.03)
    // An intake on each shoulder
    kit.put(chassis, wedge(0.08, 0.34, 0.1, 0.005), paint.dark, side * 0.24, 0.18, -0.08)
    // A long cranked wing laid back along the flank: it swings out level, its tip kicking up
    const wing = hinge(chassis, side * 0.34, 0.1, -0.2)
    kit.put(
      wing,
      plate(
        [
          [0, -0.3],
          [side * 0.26, -0.12],
          [side * 0.62, 0.56],
          [side * 0.56, 0.86],
          [side * 0.3, 0.6],
          [0, 0.5],
        ],
        0.032,
      ),
      paint.second,
    )
    kit.put(wing, box(0.1, 0.04, 0.32), paint.accent, side * 0.58, 0.02, 0.72).rotation.y =
      side * 0.4
    kit.strip(wing, side * 0.34, 0.036, 0.2, 0.86, side * Math.atan2(0.62, 0.86))
    kit.decal(wing, 'mark', 0.17, 0.17, side * 0.26, 0.034, 0.3)
    wing.rotation.z = side * -0.32
    wing.rotation.y = side * -0.22
    kit.morph(wing, { ry: side * 0.5, rz: side * 0.12, y: 0.16, from: 0.1 })
    // The forked tail: two long blades that sit close and splay into a wide V
    const fork = hinge(chassis, side * 0.04, 0.2, 0.86)
    kit.put(
      fork,
      blade(
        [
          [-0.3, 0],
          [0.34, 0],
          [0.62, 0.5],
          [0.42, 0.5],
          [0.24, 0.2],
        ],
        0.034,
      ),
      paint.carbon,
    )
    kit.put(fork, box(0.04, 0.03, 0.26), paint.accent, 0, 0.5, 0.52)
    kit.decal(fork, 'number', 0.26, 0.13, side * 0.02, 0.24, 0.12, side > 0 ? 'right' : 'left')
    fork.rotation.z = side * -0.12
    kit.morph(fork, { rz: side * -0.72, x: side * 0.12, ry: side * 0.18, from: 0.2 })
    kit.put(chassis, box(0.14, 0.03, 0.03), paint.tailLamp, side * 0.16, 0.17, 1.13)
    thruster(kit, chassis, side * 0.16, 0.06, 1.34, 0.15, 0.26)
  }
  // The glowing keel under the hull: its core blazes when open
  const keel = hinge(chassis, 0, -0.06, 0.1)
  kit.put(keel, box(0.12, 0.04, 1.2), paint.core)
  kit.morph(keel, { sx: 1.8, sy: 1.3 })
  coreHatch(kit, chassis, 0.265, 0.84, 1.0, 0.08)
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.5, 1.08],
      [0.5, 1.08],
    ],
  }
}

export const FLAGSHIP_BODIES = { kite }
