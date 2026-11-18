// 2026-11-18 (owner: "the karts need designing again ... more striking; some karts change shape
// when they fire a boost"): the six hover karts, drawn again, all our own shapes from the Tamsui
// river mouth (docs/KART-WORLD.md), made in code from kartParts.ts. Each has a silhouette that says
// what it is good at (shared/kart/karts.ts), and a second shape it opens into while a full boost
// runs (boostFx.ts): no kart, part or change of shape is taken from any other game.
//
// - `tide`, the all-rounder: a catamaran. Open: the hulls slide apart, foils fold down, the wing rises.
// - `comet`, light and quick off the line: a round pod with one big thruster in a ring. Open: the
//   ring slides back and grows, four tail petals spread, the nose cap and the side pods push out.
// - `ray`, planted and fast: a manta's flat delta. Open: the drooped wing tips lift into winglets,
//   the fins splay, the spine opens and the tail whip runs out.
// - `crab`, heavy and slow to pull away: a wide armoured shell with one big claw. Open: the shell's
//   plates lift, the claws gape, the legs spread and a second pair of thrusters slides out.
// - `heron`, the fastest and the twitchiest: an egret's needle with folded wings. Open: the wings
//   swing out, the tail fin splits into a V, the bill reaches forward and the crest stands.
// - `flyfish`, the drift charger: a flying fish. Open: the fins fan out in two layers, the dorsal
//   spines stand, the forked tail spreads and the gills light.
//
// Same footprint for all (about 1.5 m wide and 2.6 m long closed, KART_RADIUS 1.2), same frame: -z
// forward, the chassis floating above the road.
import { BoxGeometry, CylinderGeometry, SphereGeometry, type Object3D } from 'three'
import type { KartId } from '../../../shared/kart/karts.ts'
import { blade, hinge, hoop, loft, plate, type BodyFit, type BodyKit } from './kartParts.ts'

const SIDES = [-1, 1] as const

/** A box `w` across, `h` high and `l` along the kart */
const box = (w: number, h: number, l: number) => new BoxGeometry(w, h, l)

/**
 * A hatch on the kart's back: a lit core under two covers that slide apart while a full boost runs.
 * From `z0` back to `z1`, `half` wide each side, its top at `y`
 */
function coreHatch(
  kit: BodyKit,
  parent: Object3D,
  y: number,
  z0: number,
  z1: number,
  half: number,
): void {
  const { paint } = kit
  const length = z1 - z0
  const middle = (z0 + z1) / 2
  kit.put(parent, box(half * 1.5, 0.05, length * 0.94), paint.core, 0, y - 0.035, middle)
  kit.put(parent, box(half * 2.3, 0.03, length), paint.dark, 0, y - 0.07, middle)
  for (const side of SIDES) {
    const cover = hinge(parent, side * half * 0.5, y, middle)
    kit.put(cover, box(half, 0.035, length), paint.carbon)
    kit.put(cover, box(0.02, 0.04, length * 0.9), paint.metal, side * (half / 2 - 0.02), 0.004, 0)
    kit.morph(cover, { x: side * half * 1.45, y: y + 0.02, rz: side * -0.22, from: 0.15 })
  }
}

function tide(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The deck between the hulls, carbon, and a splitter between the bows
  kit.put(
    chassis,
    plate(
      [
        [-0.5, -0.72],
        [0.5, -0.72],
        [0.58, 0.95],
        [-0.58, 0.95],
      ],
      0.07,
    ),
    paint.carbon,
    0,
    -0.02,
    0,
  )
  kit.put(
    chassis,
    plate(
      [
        [-0.46, -1.02],
        [0.46, -1.02],
        [0.5, -0.74],
        [-0.5, -0.74],
      ],
      0.03,
    ),
    paint.accent,
    0,
    -0.06,
    0,
  )
  // The cockpit tub down the middle
  kit.put(
    chassis,
    loft([
      { z: -1.0, w: 0.04, top: 0.03, bottom: 0.03, y: 0.06 },
      { z: -0.72, w: 0.22, top: 0.12, bottom: 0.07, y: 0.08 },
      { z: -0.1, w: 0.32, top: 0.2, bottom: 0.08, y: 0.1, n: 3 },
      { z: 0.6, w: 0.33, top: 0.19, bottom: 0.08, y: 0.1, n: 3.4 },
      { z: 1.0, w: 0.26, top: 0.13, bottom: 0.07, y: 0.1, n: 3.4 },
    ]),
    paint.main,
  )
  const screen = kit.put(chassis, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint.glass, 0, 0.24, -0.34)
  screen.scale.set(0.24, 0.2, 0.34)
  coreHatch(kit, chassis, 0.3, 0.52, 0.98, 0.17)
  for (const side of SIDES) {
    // A hull: a sharp bow, a square stern, a stripe, a lit strip and a thruster
    const hull = hinge(chassis, side * 0.58, 0, 0)
    kit.put(
      hull,
      loft([
        { z: -1.32, w: 0.015, top: 0.02, bottom: 0.02, y: 0.02 },
        { z: -1.05, w: 0.11, top: 0.1, bottom: 0.09, y: 0.02 },
        { z: -0.5, w: 0.19, top: 0.17, bottom: 0.13, y: 0.02, n: 3 },
        { z: 0.45, w: 0.21, top: 0.19, bottom: 0.13, y: 0.02, n: 3.4 },
        { z: 1.02, w: 0.19, top: 0.17, bottom: 0.12, y: 0.02, n: 3.6 },
      ]),
      paint.main,
    )
    kit.put(hull, box(0.09, 0.02, 1.3), paint.second, 0, 0.205, 0.1)
    kit.strip(hull, side * 0.13, 0.16, 0.05, 1.5)
    kit.put(hull, box(0.14, 0.035, 0.03), paint.headLamp, 0, 0.1, -1.02).rotation.x = -0.5
    kit.put(hull, box(0.2, 0.04, 0.03), paint.tailLamp, 0, 0.22, 1.0)
    // An intake on the hull's shoulder
    kit.put(hull, box(0.12, 0.05, 0.2), paint.dark, side * -0.04, 0.17, -0.42).rotation.x = 0.16
    kit.nozzle(hull, 0, 0.03, 1.2, 0.16)
    kit.morph(hull, { x: side * 0.69 })
    // A foil under the hull, folded up against its side; it swings down and out
    const foil = hinge(hull, side * 0.2, -0.04, 0.25)
    kit.put(
      foil,
      plate(
        [
          [0, -0.22],
          [side * 0.34, -0.02],
          [side * 0.3, 0.2],
          [0, 0.24],
        ],
        0.025,
      ),
      paint.accent,
    )
    foil.rotation.z = side * 1.35
    kit.morph(foil, { rz: side * -0.3, from: 0.25 })
    // The wing's pylon
    kit.put(
      hull,
      blade(
        [
          [0.62, 0.16],
          [0.98, 0.16],
          [1.1, 0.5],
          [0.94, 0.5],
        ],
        0.035,
      ),
      paint.carbon,
    )
  }
  // The wing across both hulls, with end plates
  const wing = hinge(chassis, 0, 0.5, 1.02)
  kit.put(
    wing,
    plate(
      [
        [-0.84, -0.13],
        [0.84, -0.13],
        [0.84, 0.13],
        [-0.84, 0.13],
      ],
      0.035,
      0.012,
    ),
    paint.accent,
  )
  kit.strip(wing, 0, 0.04, 0.12, 1.5, Math.PI / 2)
  for (const side of SIDES) {
    kit.put(
      wing,
      blade(
        [
          [-0.2, -0.08],
          [0.18, -0.08],
          [0.22, 0.14],
          [-0.1, 0.1],
        ],
        0.03,
      ),
      paint.main,
      side * 0.84,
    )
  }
  kit.morph(wing, { y: 0.66, z: 1.1, rx: -0.3, sx: 1.12, from: 0.2 })
  return {
    seat: { y: 0.2, z: 0.24 },
    rearContacts: [
      [-0.58, 1.05],
      [0.58, 1.05],
    ],
  }
}

function comet(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  kit.put(
    chassis,
    loft(
      [
        { z: -1.2, w: 0.05, top: 0.04, bottom: 0.03, y: 0.1 },
        { z: -0.98, w: 0.32, top: 0.16, bottom: 0.1, y: 0.1, n: 2.3 },
        { z: -0.5, w: 0.57, top: 0.26, bottom: 0.15, y: 0.1, n: 2.3 },
        { z: 0.1, w: 0.67, top: 0.3, bottom: 0.16, y: 0.1, n: 2.3 },
        { z: 0.65, w: 0.57, top: 0.27, bottom: 0.15, y: 0.1, n: 2.3 },
        { z: 1.0, w: 0.38, top: 0.22, bottom: 0.14, y: 0.12, n: 2.2 },
      ],
      24,
    ),
    paint.main,
  )
  // A dark skirt round the waist
  kit.put(
    chassis,
    loft(
      [
        { z: -1.0, w: 0.35, top: 0.03, bottom: 0.06, y: 0.04, n: 2.3 },
        { z: -0.5, w: 0.61, top: 0.03, bottom: 0.08, y: 0.03, n: 2.3 },
        { z: 0.1, w: 0.71, top: 0.03, bottom: 0.09, y: 0.03, n: 2.3 },
        { z: 0.65, w: 0.61, top: 0.03, bottom: 0.08, y: 0.03, n: 2.3 },
        { z: 0.98, w: 0.42, top: 0.03, bottom: 0.06, y: 0.05, n: 2.3 },
      ],
      24,
    ),
    paint.carbon,
  )
  // The pale nose cap: it pushes forward
  const cap = hinge(chassis, 0, 0, 0)
  kit.put(
    cap,
    loft(
      [
        { z: -1.3, w: 0.04, top: 0.035, bottom: 0.03, y: 0.1 },
        { z: -1.06, w: 0.3, top: 0.15, bottom: 0.1, y: 0.1, n: 2.3 },
        { z: -0.8, w: 0.455, top: 0.215, bottom: 0.14, y: 0.1, n: 2.3 },
      ],
      24,
    ),
    paint.second,
  )
  kit.put(cap, box(0.34, 0.04, 0.03), paint.headLamp, 0, 0.19, -1.12).rotation.x = -0.9
  kit.morph(cap, { z: -0.13, until: 0.7 })
  kit.put(chassis, hoop(0.4, 0.03, 20), paint.core, 0, 0.12, -0.84).scale.y = 0.42
  const screen = kit.put(chassis, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint.glass, 0, 0.3, -0.3)
  screen.scale.set(0.3, 0.2, 0.4)
  for (const side of SIDES) {
    kit.strip(chassis, side * 0.4, 0.375, 0.2, 0.8, side * -0.1)
    // A side pod with a lit intake: it pushes out
    const pod = hinge(chassis, side * 0.62, 0.1, 0.32)
    kit.put(
      pod,
      loft(
        [
          { z: -0.42, w: 0.03, top: 0.03, bottom: 0.03 },
          { z: -0.25, w: 0.1, top: 0.09, bottom: 0.08, n: 3 },
          { z: 0.3, w: 0.11, top: 0.1, bottom: 0.08, n: 3 },
          { z: 0.42, w: 0.07, top: 0.06, bottom: 0.05, n: 3 },
        ],
        12,
      ),
      paint.accent,
    )
    kit.put(pod, box(0.03, 0.09, 0.3), paint.core, side * 0.1, 0, 0.02)
    kit.morph(pod, { x: side * 0.76, z: 0.42, from: 0.1 })
    kit.put(chassis, box(0.14, 0.04, 0.03), paint.tailLamp, side * 0.3, 0.3, 0.93).rotation.x = 0.5
  }
  // A small fin on the back
  kit.put(
    chassis,
    blade(
      [
        [0.3, 0.33],
        [0.92, 0.28],
        [1.02, 0.56],
        [0.82, 0.56],
      ],
      0.04,
    ),
    paint.second,
  )
  // One wide thruster, and the ring round it that slides back and grows
  kit.nozzle(chassis, 0, 0.14, 1.26, 0.3)
  const ring = hinge(chassis, 0, 0.14, 1.04)
  kit.put(ring, hoop(0.44, 0.035, 28), paint.metal)
  kit.put(ring, hoop(0.44, 0.012, 28), paint.glow, 0, 0, 0.035)
  kit.morph(ring, { z: 1.36, s: 1.28, from: 0.2 })
  // Four petals round the tail: they spread
  for (const turn of [0.25, 0.75, 1.25, 1.75]) {
    const spoke = hinge(chassis, 0, 0.14, 0.96)
    spoke.rotation.z = turn * Math.PI
    const petal = hinge(spoke, 0, 0.3, 0)
    kit.put(
      petal,
      blade(
        [
          [-0.2, 0],
          [0.3, 0],
          [0.44, 0.1],
          [0.1, 0.12],
        ],
        0.04,
      ),
      paint.accent,
    )
    kit.morph(petal, { rx: -0.6, y: 0.36, from: 0.3 })
  }
  return {
    seat: { y: 0.27, z: 0.2 },
    rearContacts: [
      [-0.5, 1.1],
      [0.5, 1.1],
    ],
  }
}

function ray(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The flat delta
  kit.put(
    chassis,
    plate(
      [
        [0, -1.32],
        [0.3, -0.95],
        [0.72, 0.3],
        [0.72, 0.98],
        [0.42, 1.12],
        [-0.42, 1.12],
        [-0.72, 0.98],
        [-0.72, 0.3],
        [-0.3, -0.95],
      ],
      0.17,
      0.055,
    ),
    paint.main,
    0,
    -0.05,
    0,
  )
  // The spine, dark, from the nose to the tail
  kit.put(
    chassis,
    loft([
      { z: -1.2, w: 0.03, top: 0.03, bottom: 0.02, y: 0.1 },
      { z: -0.85, w: 0.2, top: 0.12, bottom: 0.02, y: 0.1, n: 3 },
      { z: -0.1, w: 0.33, top: 0.2, bottom: 0.02, y: 0.1, n: 3 },
      { z: 0.7, w: 0.31, top: 0.18, bottom: 0.02, y: 0.1, n: 3.4 },
      { z: 1.08, w: 0.2, top: 0.1, bottom: 0.02, y: 0.1, n: 3.4 },
    ]),
    paint.second,
  )
  const hump = kit.put(chassis, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint.glass, 0, 0.22, -0.42)
  hump.scale.set(0.24, 0.17, 0.4)
  coreHatch(kit, chassis, 0.29, 0.5, 1.0, 0.15)
  const edge = Math.hypot(0.42, 1.25)
  const sweep = Math.atan2(0.42, 1.25)
  for (const side of SIDES) {
    // The leading edges, lit, and gold along the trailing edge
    kit.strip(chassis, side * 0.5, 0.125, -0.325, edge * 0.9, side * sweep)
    kit.put(chassis, box(0.07, 0.03, 0.6), paint.accent, side * 0.7, 0.115, 0.64)
    kit.put(chassis, box(0.14, 0.04, 0.03), paint.headLamp, side * 0.17, 0.08, -1.04).rotation.y = side * -0.5
    // Gills on the wing
    for (const z of [-0.2, -0.05, 0.1]) {
      kit.put(chassis, box(0.16, 0.012, 0.045), paint.dark, side * 0.5, 0.125, z).rotation.y = side * 0.5
    }
    // A wing tip: drooped, it lifts into a winglet
    const tip = hinge(chassis, side * 0.72, 0.03, 0.66)
    kit.put(
      tip,
      plate(
        [
          [0, -0.38],
          [side * 0.26, 0.02],
          [side * 0.24, 0.36],
          [0, 0.33],
        ],
        0.045,
      ),
      paint.accent,
    )
    kit.strip(tip, side * 0.2, 0.05, 0.19, 0.3)
    tip.rotation.z = side * -0.42
    kit.morph(tip, { rz: side * 0.6, x: side * 0.8, y: 0.07, sx: 1.25, from: 0.15 })
    // A tail fin: it splays out
    const fin = hinge(chassis, side * 0.4, 0.1, 0.84)
    kit.put(
      fin,
      blade(
        [
          [-0.28, 0],
          [0.28, 0],
          [0.3, 0.16],
          [0.12, 0.44],
          [-0.02, 0.44],
        ],
        0.045,
      ),
      paint.accent,
    )
    fin.rotation.z = side * -0.16
    kit.morph(fin, { rz: side * -0.7, sy: 1.15, from: 0.3 })
    kit.nozzle(chassis, side * 0.3, 0.08, 1.2, 0.15)
  }
  kit.put(chassis, box(0.36, 0.035, 0.03), paint.tailLamp, 0, 0.2, 1.1)
  // The tail whip: it runs out
  const whip = hinge(chassis, 0, 0.1, 1.1)
  kit.put(whip, box(0.035, 0.035, 0.36), paint.metal, 0, 0, 0.18)
  kit.put(whip, box(0.05, 0.05, 0.06), paint.glow, 0, 0, 0.38)
  kit.morph(whip, { sz: 2.6, from: 0.4 })
  return {
    seat: { y: 0.2, z: 0.26 },
    rearContacts: [
      [-0.7, 1.05],
      [0.7, 1.05],
    ],
  }
}

function crab(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The shell: wide and low, a dark belly under it
  kit.put(
    chassis,
    loft(
      [
        { z: -0.98, w: 0.3, top: 0.1, bottom: 0.07, y: 0.08, n: 3 },
        { z: -0.7, w: 0.64, top: 0.2, bottom: 0.1, y: 0.08, n: 3 },
        { z: -0.1, w: 0.76, top: 0.27, bottom: 0.11, y: 0.08, n: 3.2 },
        { z: 0.6, w: 0.73, top: 0.25, bottom: 0.11, y: 0.08, n: 3.2 },
        { z: 1.0, w: 0.56, top: 0.18, bottom: 0.1, y: 0.08, n: 3.2 },
        { z: 1.1, w: 0.42, top: 0.12, bottom: 0.08, y: 0.08, n: 3.2 },
      ],
      24,
    ),
    paint.main,
  )
  kit.put(
    chassis,
    loft(
      [
        { z: -0.94, w: 0.33, top: 0.02, bottom: 0.08, y: -0.01, n: 3 },
        { z: -0.1, w: 0.8, top: 0.02, bottom: 0.1, y: -0.02, n: 3.2 },
        { z: 0.6, w: 0.77, top: 0.02, bottom: 0.1, y: -0.02, n: 3.2 },
        { z: 1.06, w: 0.46, top: 0.02, bottom: 0.08, y: -0.01, n: 3.2 },
      ],
      24,
    ),
    paint.carbon,
  )
  // A grille across the front
  kit.put(chassis, box(0.5, 0.06, 0.04), paint.dark, 0, 0.1, -0.97)
  for (const side of SIDES) {
    // Eyes on stalks: they are the head lamps
    kit.put(chassis, new CylinderGeometry(0.022, 0.03, 0.26, 8), paint.metal, side * 0.2, 0.38, -0.66)
    kit.put(chassis, new SphereGeometry(0.075, 12, 8), paint.headLamp, side * 0.2, 0.54, -0.66)
    kit.put(chassis, new SphereGeometry(0.04, 8, 6), paint.dark, side * 0.2, 0.54, -0.73)
    // The shell's plates either side of the driver: they lift and slide out over the lit core
    kit.put(chassis, box(0.2, 0.03, 0.62), paint.core, side * 0.44, 0.305, 0.38).rotation.z = side * -0.2
    const armour = hinge(chassis, side * 0.44, 0.33, 0.38)
    kit.put(
      armour,
      plate(
        [
          [-0.17, -0.42],
          [0.17, -0.42],
          [0.2, 0.3],
          [0.1, 0.42],
          [-0.1, 0.42],
          [-0.2, 0.3],
        ],
        0.06,
        0.02,
      ),
      paint.second,
    )
    kit.put(armour, box(0.03, 0.03, 0.6), paint.accent, 0, 0.06, 0)
    armour.rotation.z = side * -0.2
    kit.morph(armour, { x: side * 0.6, y: 0.47, rz: side * -0.62, from: 0.1 })
    // Three legs a side, folded along the shell: they spread
    const legs = hinge(chassis, side * 0.76, 0.02, 0.1)
    for (const z of [-0.36, 0, 0.36]) {
      const leg = kit.put(legs, box(0.3, 0.05, 0.08), paint.carbon, side * 0.1, 0, z)
      leg.rotation.z = side * -0.5
      kit.put(legs, box(0.05, 0.14, 0.07), paint.accent, side * 0.25, -0.09, z)
    }
    kit.morph(legs, { x: side * 0.86, rz: side * 0.32, from: 0.2 })
    kit.strip(chassis, side * 0.62, 0.22, 0.2, 1.0)
    kit.put(chassis, box(0.2, 0.04, 0.03), paint.tailLamp, side * 0.34, 0.24, 1.07)
    kit.nozzle(chassis, side * 0.34, 0.07, 1.22, 0.17)
    // A second, smaller thruster under the shell: it slides out
    const spare = hinge(chassis, side * 0.48, 0.1, 0.62)
    kit.put(spare, new CylinderGeometry(0.085, 0.1, 0.34, 12), paint.metal).rotation.x = Math.PI / 2
    kit.put(spare, hoop(0.085, 0.014, 14), paint.glow, 0, 0, 0.17)
    kit.put(spare, new CylinderGeometry(0.07, 0.07, 0.02, 12), paint.core, 0, 0, 0.165).rotation.x = Math.PI / 2
    kit.morph(spare, { z: 1.1, x: side * 0.6, y: 0.05, from: 0.35 })
  }
  // The claws: a big one on the right, a small one on the left. Their jaws gape
  for (const [side, size] of [
    [1, 1],
    [-1, 0.62],
  ] as const) {
    const claw = hinge(chassis, side * 0.6, 0.1, -0.74)
    claw.scale.setScalar(size)
    kit.put(
      claw,
      loft(
        [
          { z: -0.32, w: 0.1, top: 0.08, bottom: 0.07, n: 3 },
          { z: -0.1, w: 0.17, top: 0.12, bottom: 0.1, n: 3 },
          { z: 0.2, w: 0.13, top: 0.1, bottom: 0.08, n: 3 },
          { z: 0.34, w: 0.07, top: 0.05, bottom: 0.05, n: 3 },
        ],
        12,
      ),
      paint.accent,
    )
    for (const jawSide of SIDES) {
      const jaw = hinge(claw, jawSide * 0.03, 0, -0.28)
      kit.put(
        jaw,
        plate(
          [
            [0, 0],
            [jawSide * 0.13, -0.06],
            [jawSide * 0.1, -0.34],
            [0, -0.46],
          ],
          0.09,
          0.02,
        ),
        paint.accent,
        0,
        -0.045,
        0,
      )
      kit.put(jaw, box(0.012, 0.03, 0.3), paint.core, jawSide * -0.004, 0, -0.2)
      kit.morph(jaw, { ry: jawSide * -0.5, from: 0.25 })
    }
    kit.morph(claw, { z: -0.84, y: 0.16, rx: 0.16, from: 0.1 })
  }
  return {
    seat: { y: 0.27, z: 0.22 },
    rearContacts: [
      [-0.7, 1.1],
      [0.7, 1.1],
    ],
  }
}

function heron(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A long, slim needle
  kit.put(
    chassis,
    loft([
      { z: -1.04, w: 0.11, top: 0.08, bottom: 0.07, y: 0.12 },
      { z: -0.7, w: 0.24, top: 0.17, bottom: 0.12, y: 0.12, n: 2.8 },
      { z: 0, w: 0.31, top: 0.24, bottom: 0.14, y: 0.12, n: 2.8 },
      { z: 0.7, w: 0.27, top: 0.2, bottom: 0.13, y: 0.12, n: 2.8 },
      { z: 1.1, w: 0.2, top: 0.14, bottom: 0.1, y: 0.12, n: 2.8 },
    ]),
    paint.main,
  )
  // The yellow bill: it reaches forward
  const bill = hinge(chassis, 0, 0.11, -1.0)
  kit.put(
    bill,
    loft(
      [
        { z: -0.56, w: 0.008, top: 0.008, bottom: 0.008 },
        { z: -0.3, w: 0.065, top: 0.045, bottom: 0.04, n: 3 },
        { z: 0.02, w: 0.125, top: 0.09, bottom: 0.075, n: 3 },
      ],
      12,
    ),
    paint.accent,
  )
  kit.morph(bill, { z: -1.12, sz: 1.18, until: 0.7 })
  kit.put(chassis, hoop(0.12, 0.02, 14), paint.core, 0, 0.115, -1.02).scale.y = 0.72
  // The dark crown along the top, and the crest behind the driver, which stands up
  kit.put(
    chassis,
    loft(
      [
        { z: -0.62, w: 0.03, top: 0.02, bottom: 0.02, y: 0.29 },
        { z: -0.1, w: 0.09, top: 0.03, bottom: 0.03, y: 0.345 },
        { z: 0.8, w: 0.08, top: 0.03, bottom: 0.03, y: 0.31 },
        { z: 1.08, w: 0.04, top: 0.02, bottom: 0.02, y: 0.25 },
      ],
      10,
    ),
    paint.second,
  )
  const screen = kit.put(chassis, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint.glass, 0, 0.27, -0.36)
  screen.scale.set(0.2, 0.17, 0.36)
  const crest = hinge(chassis, 0, 0.36, 0.62)
  kit.put(
    crest,
    blade(
      [
        [-0.1, 0],
        [0.1, 0],
        [0.62, 0.1],
        [0.6, 0.14],
      ],
      0.03,
    ),
    paint.second,
  )
  kit.morph(crest, { rx: -0.5, from: 0.3 })
  for (const side of SIDES) {
    kit.put(chassis, box(0.09, 0.035, 0.03), paint.headLamp, side * 0.15, 0.15, -1.0).rotation.y = side * -0.4
    kit.strip(chassis, side * 0.29, 0.16, 0.1, 1.3)
    // An intake on the shoulder
    kit.put(chassis, box(0.05, 0.1, 0.24), paint.dark, side * 0.275, 0.18, -0.42).rotation.y = side * -0.18
    // A wing, folded back along the body: it swings out
    const wing = hinge(chassis, side * 0.24, 0.1, -0.12)
    kit.put(
      wing,
      plate(
        [
          [0, -0.26],
          [side * 0.2, -0.2],
          [side * 0.5, 0.74],
          [side * 0.4, 0.96],
          [0, 0.36],
        ],
        0.045,
        0.012,
      ),
      paint.main,
    )
    // The dark tip and the lit leading edge
    kit.put(wing, box(0.12, 0.05, 0.26), paint.second, side * 0.44, 0.022, 0.82).rotation.y = side * 0.32
    kit.strip(wing, side * 0.36, 0.05, 0.27, 0.92, side * Math.atan2(0.3, 0.94))
    kit.morph(wing, { ry: side * 0.62, rz: side * 0.14, y: 0.14, from: 0.1 })
    // The tail: two fins that stand as one and split into a V
    const fin = hinge(chassis, side * 0.022, 0.3, 0.84)
    kit.put(
      fin,
      blade(
        [
          [-0.3, 0],
          [0.3, 0],
          [0.34, 0.22],
          [0.14, 0.62],
          [0, 0.62],
        ],
        0.04,
      ),
      paint.second,
    )
    kit.put(fin, box(0.012, 0.36, 0.03), paint.core, side * -0.018, 0.3, 0.2).rotation.x = -0.35
    kit.morph(fin, { rz: side * -0.6, x: side * 0.07, from: 0.25 })
  }
  kit.put(chassis, box(0.26, 0.04, 0.03), paint.tailLamp, 0, 0.22, 1.1)
  kit.nozzle(chassis, 0, 0.11, 1.26, 0.2)
  return {
    seat: { y: 0.24, z: 0.3 },
    rearContacts: [
      [-0.6, 1.05],
      [0.6, 1.05],
    ],
  }
}

function flyfish(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A torpedo, a pale belly under it
  kit.put(
    chassis,
    loft(
      [
        { z: -1.3, w: 0.02, top: 0.02, bottom: 0.02, y: 0.12 },
        { z: -1.0, w: 0.24, top: 0.16, bottom: 0.11, y: 0.12, n: 2.3 },
        { z: -0.4, w: 0.44, top: 0.25, bottom: 0.14, y: 0.12, n: 2.3 },
        { z: 0.3, w: 0.46, top: 0.26, bottom: 0.14, y: 0.12, n: 2.3 },
        { z: 0.9, w: 0.3, top: 0.18, bottom: 0.11, y: 0.12, n: 2.3 },
        { z: 1.16, w: 0.16, top: 0.1, bottom: 0.07, y: 0.12, n: 2.3 },
      ],
      24,
    ),
    paint.main,
  )
  kit.put(
    chassis,
    loft(
      [
        { z: -1.24, w: 0.03, top: 0.01, bottom: 0.03, y: 0.07 },
        { z: -1.0, w: 0.22, top: 0.01, bottom: 0.15, y: 0.07, n: 2.3 },
        { z: -0.4, w: 0.41, top: 0.01, bottom: 0.2, y: 0.07, n: 2.3 },
        { z: 0.3, w: 0.43, top: 0.01, bottom: 0.2, y: 0.07, n: 2.3 },
        { z: 0.9, w: 0.27, top: 0.01, bottom: 0.15, y: 0.08, n: 2.3 },
        { z: 1.12, w: 0.14, top: 0.01, bottom: 0.09, y: 0.09, n: 2.3 },
      ],
      24,
    ),
    paint.second,
  )
  const hump = kit.put(chassis, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint.glass, 0, 0.3, -0.42)
  hump.scale.set(0.24, 0.18, 0.4)
  // The dorsal spines, lying back: they stand
  const spines = hinge(chassis, 0, 0.35, 0.5)
  for (const [z, size] of [
    [0, 1],
    [0.2, 0.82],
    [0.38, 0.64],
  ] as const) {
    const spine = kit.put(
      spines,
      blade(
        [
          [-0.07, 0],
          [0.09, 0],
          [0.2, 0.34],
          [0.14, 0.36],
        ],
        0.03,
      ),
      paint.accent,
      0,
      0,
      z,
    )
    spine.scale.setScalar(size)
  }
  spines.rotation.x = 0.95
  kit.morph(spines, { rx: -0.1, y: 0.36, from: 0.3 })
  for (const side of SIDES) {
    kit.put(chassis, box(0.1, 0.035, 0.03), paint.headLamp, side * 0.15, 0.2, -1.06).rotation.y = side * -0.5
    kit.strip(chassis, side * 0.4, 0.24, 0.1, 1.0, side * -0.04)
    // Gills: three lit slits that blaze while a full boost runs
    for (const z of [-0.72, -0.62, -0.52]) {
      const gill = kit.put(chassis, box(0.02, 0.12, 0.035), paint.core, side * (0.33 + (z + 0.72) * 0.34), 0.14, z)
      gill.rotation.y = side * -0.35
    }
    // The fins: a second one under the first, which fans out further
    const under = hinge(chassis, side * 0.4, 0.09, -0.2)
    kit.put(
      under,
      plate(
        [
          [0, -0.26],
          [side * 0.44, 0.22],
          [side * 0.38, 0.54],
          [0, 0.26],
        ],
        0.025,
      ),
      paint.second,
    )
    kit.strip(under, side * 0.24, 0.03, 0.2, 0.5, side * Math.atan2(0.44, 0.48), paint.glow)
    under.rotation.y = side * -0.3
    kit.morph(under, { ry: side * 0.95, rz: side * 0.1, sx: 1.25, from: 0.3 })
    const fin = hinge(chassis, side * 0.4, 0.12, -0.24)
    kit.put(
      fin,
      plate(
        [
          [0, -0.3],
          [side * 0.5, 0.24],
          [side * 0.42, 0.6],
          [0, 0.3],
        ],
        0.035,
        0.01,
      ),
      paint.accent,
    )
    fin.rotation.y = side * -0.28
    fin.rotation.z = side * 0.06
    kit.morph(fin, { ry: side * 0.3, rz: side * 0.26, sx: 1.3, y: 0.16, from: 0.1 })
    // The forked tail, one fin a side in a V: it spreads
    const fork = hinge(chassis, side * 0.08, 0.17, 1.02)
    kit.put(
      fork,
      blade(
        [
          [-0.24, 0],
          [0.2, 0],
          [0.3, 0.14],
          [0.2, 0.46],
          [0.08, 0.46],
        ],
        0.04,
      ),
      paint.accent,
    )
    fork.rotation.z = side * -0.5
    kit.morph(fork, { rz: side * -1.0, s: 1.22, from: 0.25 })
    kit.put(chassis, box(0.12, 0.035, 0.03), paint.tailLamp, side * 0.19, 0.26, 0.98).rotation.x = 0.4
    kit.nozzle(chassis, side * 0.2, 0.1, 1.24, 0.14)
  }
  return {
    seat: { y: 0.27, z: 0.24 },
    rearContacts: [
      [-0.65, 1.05],
      [0.65, 1.05],
    ],
  }
}

const BODIES: Readonly<Record<KartId, (kit: BodyKit, chassis: Object3D) => BodyFit>> = {
  tide,
  comet,
  ray,
  crab,
  heron,
  flyfish,
}

/** Builds `body` onto `chassis` */
export const buildKartBody = (body: KartId, kit: BodyKit, chassis: Object3D): BodyFit =>
  BODIES[body](kit, chassis)
