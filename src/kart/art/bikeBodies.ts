// 2026-11-19 (owner: "... and motorbikes"): three hover bikes, in the karts' look (kartBodies.ts:
// flat-faced hulls, satin black and carbon, one neon colour, lit lines, a livery) and from the same
// river mouth, birds and insects this time (docs/KART-WORLD.md §4.3). All our own shapes: no other
// game's bike, part or change of shape, and no real maker's.
//
// A bike is one slim spine a rider sits astride (driverModel.ts's `astride`), about half a metre
// wide and 2.4 m long: a pointed fairing with a low screen, a tank the rider lies along, a seat, a
// raised tail over one thruster. No wheels, like the karts: it rides on a hover pad under the nose
// (on a fork blade) and one under the tail, each with a lit line. The model leans it deep into a
// turn (kartModel.ts), and its numbers are a bike's (shared/kart/karts.ts's KIND_TRAITS).
//
// - `swift`, the bike to learn on: a forked swallow tail and small winglets on the fairing. Open:
//   the fork spreads into a wide V, the winglets sweep forward, the fairing's beak runs out.
// - `hornet`, fast and sharp: a striped, ringed tail to a sting, and two pairs of wings laid flat
//   along its back. Open: the wings fan out, the rings slide apart over a lit core, the sting runs out.
// - `petrel`, the lightest and the twitchiest: a needle beak and long cranked wings folded back along its
//   flanks. Open: the wings swing out level, the tail fans.
import { CylinderGeometry, type Object3D } from 'three'
import { box, SIDES, slit, thruster } from './kartBodies.ts'
import { blade, hinge, hoop, hull, plate, wedge, type BodyFit, type BodyKit, type Facet } from './kartParts.ts'

/** Where the rider sits on every bike, and where the bars are */
const SEAT = { y: 0.17, z: 0.14 }
const BIKE_FIT: BodyFit = {
  seat: SEAT,
  // One line down the middle: a bike leaves a single trail
  rearContacts: [[0, 1.0]],
  bike: { bar: { y: SEAT.y + 0.05, z: SEAT.z - 0.54 }, crouch: -0.68 },
}

/**
 * What the three share: the spine (the fairing to the seat; each bike adds its own tail), the
 * screen, the engine under the tank, the pegs, and the two hover pads. `nose` is how far forward
 * the fairing's point is
 */
function frame(kit: BodyKit, chassis: Object3D, nose: number, tail: readonly Facet[]): void {
  const { paint } = kit
  kit.put(
    chassis,
    hull([
      { z: nose, w: 0.02, top: 0.02, bottom: 0.02, y: 0.08 },
      { z: -0.86, w: 0.15, top: 0.17, bottom: 0.13, y: 0.08, sw: 0.55 },
      { z: -0.56, w: 0.19, top: 0.14, bottom: 0.2, y: 0.07, sw: 0.5 },
      { z: -0.2, w: 0.2, top: 0.15, bottom: 0.2, y: 0.05, sw: 0.55 },
      { z: 0.06, w: 0.15, top: 0.14, bottom: 0.16, y: 0.04 },
      { z: 0.36, w: 0.14, top: 0.12, bottom: 0.12, y: 0.06 },
      ...tail,
    ]),
    paint.main,
  )
  // The screen: low, dark, raked back from the fairing's point
  kit.put(
    chassis,
    hull([
      { z: -0.96, w: 0.04, top: 0.02, bottom: 0.02, y: 0.19 },
      { z: -0.7, w: 0.12, top: 0.12, bottom: 0.02, y: 0.23, sw: 0.7 },
    ]),
    paint.glass,
  )
  // The engine, bare metal and carbon under the tank, and the pegs
  kit.put(
    chassis,
    hull([
      { z: -0.52, w: 0.12, top: 0.06, bottom: 0.1, y: -0.14 },
      { z: -0.1, w: 0.14, top: 0.06, bottom: 0.12, y: -0.14 },
      { z: 0.3, w: 0.1, top: 0.06, bottom: 0.08, y: -0.1 },
    ]),
    paint.carbon,
  )
  for (const side of SIDES) {
    kit.put(chassis, box(0.022, 0.1, 0.34), paint.core, side * 0.135, -0.14, -0.14)
    kit.put(chassis, box(0.12, 0.03, 0.07), paint.metal, side * 0.2, SEAT.y - 0.27, SEAT.z - 0.06)
    kit.strip(chassis, side * 0.19, 0.1, -0.4, 0.5, side * -0.06)
    slit(kit, chassis, paint.headLamp, 0.09, side * 0.07, 0.13, -0.97, side * -0.9)
  }
  // The pads it rides on: a fork blade under the nose, a strut under the tail, a lit pad on each
  for (const [z, length] of [
    [-0.74, 0.5],
    [0.62, 0.42],
  ] as const) {
    kit.put(
      chassis,
      blade(
        [
          [z - 0.12, 0],
          [z + 0.12, 0],
          [z + 0.06, -0.2],
          [z - 0.04, -0.2],
        ],
        0.05,
      ),
      paint.carbon,
    )
    kit.put(
      chassis,
      hull([
        { z: z - length / 2, w: 0.02, top: 0.02, bottom: 0.02 },
        { z: z - length / 4, w: 0.075, top: 0.04, bottom: 0.03 },
        { z: z + length / 4, w: 0.075, top: 0.04, bottom: 0.03 },
        { z: z + length / 2, w: 0.03, top: 0.02, bottom: 0.02 },
      ]),
      paint.second,
      0,
      -0.21,
      0,
    )
    for (const side of SIDES) kit.strip(chassis, side * 0.08, -0.215, z, length * 0.6)
  }
}

function swift(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  frame(kit, chassis, -1.14, [
    { z: 0.7, w: 0.13, top: 0.14, bottom: 0.06, y: 0.12, sw: 0.5 },
    { z: 1.02, w: 0.06, top: 0.06, bottom: 0.04, y: 0.2 },
  ])
  kit.decal(chassis, 'number', 0.16, 0.08, 0, 0.225, -0.3, 'up')
  // The beak: it runs out
  const beak = hinge(chassis, 0, 0.08, -1.08)
  kit.put(
    beak,
    hull([
      { z: -0.26, w: 0.008, top: 0.008, bottom: 0.008 },
      { z: 0.02, w: 0.045, top: 0.04, bottom: 0.035 },
    ]),
    paint.accent,
  )
  kit.morph(beak, { z: -1.2, until: 0.6 })
  for (const side of SIDES) {
    // A winglet on the fairing, swept back: it sweeps forward and out
    const winglet = hinge(chassis, side * 0.17, 0.1, -0.64)
    kit.put(
      winglet,
      plate(
        [
          [0, -0.12],
          [side * 0.28, 0.1],
          [side * 0.26, 0.22],
          [0, 0.1],
        ],
        0.02,
      ),
      paint.accent,
    )
    winglet.rotation.z = side * -0.28
    kit.morph(winglet, { ry: side * 0.5, rz: side * 0.08, sx: 1.4, from: 0.1 })
    // One side of the forked tail: a long blade. They spread into a V
    const fork = hinge(chassis, side * 0.05, 0.2, 0.74)
    kit.put(
      fork,
      blade(
        [
          [0, -0.05],
          [0.3, -0.04],
          [0.86, 0.1],
          [0.82, 0.15],
          [0.28, 0.07],
          [0, 0.06],
        ],
        0.026,
      ),
      paint.accent,
    )
    kit.decal(fork, 'number', 0.2, 0.1, side * 0.016, 0.02, 0.24, side > 0 ? 'right' : 'left')
    kit.put(fork, box(0.03, 0.022, 0.3), paint.glow, 0, 0.125, 0.68).rotation.x = -0.24
    fork.rotation.y = side * -0.1
    kit.morph(fork, { ry: side * -0.46, rz: side * -0.3, from: 0.2 })
    kit.decal(chassis, 'mark', 0.13, 0.13, side * 0.2, 0.06, -0.38, side > 0 ? 'right' : 'left')
  }
  kit.put(chassis, box(0.14, 0.03, 0.03), paint.tailLamp, 0, 0.21, 1.03)
  thruster(kit, chassis, 0, 0.05, 1.2, 0.15, 0.3)
  return BIKE_FIT
}

function hornet(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  frame(kit, chassis, -1.08, [{ z: 0.56, w: 0.15, top: 0.13, bottom: 0.08, y: 0.1, sw: 0.5 }])
  kit.decal(chassis, 'number', 0.16, 0.08, 0, 0.225, -0.3, 'up')
  // Two feelers on the fairing
  for (const side of SIDES) {
    const feeler = kit.put(chassis, box(0.016, 0.016, 0.3), paint.accent, side * 0.06, 0.26, -1.0)
    feeler.rotation.set(0.5, side * 0.3, 0)
    kit.decal(chassis, 'mark', 0.13, 0.13, side * 0.2, 0.06, -0.38, side > 0 ? 'right' : 'left')
  }
  // The tail in rings, neon and black by turns, to a sting. They slide apart over a lit core
  kit.put(chassis, new CylinderGeometry(0.07, 0.11, 0.62, 8), paint.core, 0, 0.14, 0.84).rotation.x =
    -Math.PI / 2
  const rings = [
    [0.6, 0.19, 0.17, 0.6],
    [0.78, 0.2, 0.15, 0.82],
    [0.94, 0.17, 0.12, 1.02],
    [1.07, 0.12, 0.08, 1.2],
  ] as const
  rings.forEach(([z, radius, back, to], index) => {
    const ring = hinge(chassis, 0, 0.14, z)
    const drum = kit.put(
      ring,
      new CylinderGeometry(back, radius, 0.16, 8),
      index % 2 === 0 ? paint.accent : paint.main,
    )
    drum.rotation.x = Math.PI / 2
    kit.morph(ring, { z: to, from: 0.1 + index * 0.08 })
  })
  kit.put(chassis, box(0.2, 0.03, 0.03), paint.tailLamp, 0, 0.31, 0.6)
  // The sting: the thruster's own spike above it. It runs out
  const sting = hinge(chassis, 0, 0.2, 1.1)
  kit.put(
    sting,
    hull([
      { z: 0, w: 0.04, top: 0.03, bottom: 0.03 },
      { z: 0.36, w: 0.006, top: 0.006, bottom: 0.006 },
    ]),
    paint.metal,
  )
  kit.morph(sting, { z: 1.34, from: 0.3 })
  // Two pairs of wings, laid back flat over the tail: they fan out
  for (const side of SIDES) {
    for (const [length, laid, open, lift] of [
      [0.86, 1.34, 0.5, 0.34],
      [0.6, 1.46, 0.95, 0.2],
    ] as const) {
      const wing = hinge(chassis, side * 0.1, 0.27, 0.36)
      kit.put(
        wing,
        plate(
          [
            [0, -0.06],
            [side * length * 0.5, -0.12],
            [side * length, -0.02],
            [side * length * 0.9, 0.1],
            [side * length * 0.4, 0.12],
            [0, 0.05],
          ],
          0.014,
        ),
        length > 0.7 ? paint.glass : paint.second,
      )
      kit.put(wing, box(length * 0.9, 0.018, 0.02), paint.glow, side * length * 0.48, 0.016, -0.03)
      wing.rotation.y = side * -laid
      kit.morph(wing, { ry: side * -open, rz: side * lift, from: 0.15 })
    }
  }
  thruster(kit, chassis, 0, 0.0, 1.2, 0.14, 0.3)
  return BIKE_FIT
}

function petrel(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  frame(kit, chassis, -1.36, [
    { z: 0.7, w: 0.12, top: 0.12, bottom: 0.06, y: 0.12, sw: 0.5 },
    { z: 1.0, w: 0.05, top: 0.05, bottom: 0.04, y: 0.19 },
  ])
  kit.decal(chassis, 'number', 0.16, 0.08, 0, 0.225, -0.3, 'up')
  // The neon line down the needle beak
  kit.put(chassis, wedge(0.03, 0.5, 0.012, 0.012), paint.accent, 0, 0.11, -1.1).rotation.x = -0.24
  for (const side of SIDES) {
    // A long wing in two parts, cranked like a sea bird's and folded back along the flank: it swings out
    // level, and the outer part unfolds
    const wing = hinge(chassis, side * 0.18, 0.12, -0.3)
    kit.put(
      wing,
      plate(
        [
          [0, -0.14],
          [side * 0.46, -0.2],
          [side * 0.5, 0.0],
          [0, 0.14],
        ],
        0.024,
      ),
      paint.accent,
    )
    kit.decal(wing, 'mark', 0.12, 0.12, side * 0.24, 0.027, -0.05)
    const outer = hinge(wing, side * 0.48, 0.012, -0.1)
    kit.put(
      outer,
      plate(
        [
          [0, -0.1],
          [side * 0.56, 0.1],
          [side * 0.5, 0.2],
          [0, 0.1],
        ],
        0.02,
      ),
      paint.carbon,
    )
    kit.put(outer, box(0.5, 0.018, 0.02), paint.glow, side * 0.27, 0.022, 0.07).rotation.y = side * -0.3
    outer.rotation.y = side * -1.5
    kit.morph(outer, { ry: side * -0.3, from: 0.3 })
    wing.rotation.z = side * -0.5
    wing.rotation.y = side * -1.2
    kit.morph(wing, { rz: side * 0.1, ry: side * -0.1, until: 0.8 })
    // The tail fan: a blade each side of the middle one. It spreads
    const fan = hinge(chassis, side * 0.03, 0.2, 0.8)
    kit.put(
      fan,
      plate(
        [
          [0, -0.1],
          [side * 0.12, -0.06],
          [side * 0.16, 0.5],
          [0, 0.42],
        ],
        0.02,
      ),
      paint.second,
    )
    kit.put(fan, box(0.03, 0.022, 0.4), paint.accent, side * 0.13, 0.016, 0.24)
    kit.morph(fan, { ry: side * -0.6, rz: side * 0.22, from: 0.25 })
  }
  kit.put(chassis, hoop(0.19, 0.016, 8), paint.glow, 0, 0.05, 1.0)
  kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, 0, 0.2, 1.01)
  thruster(kit, chassis, 0, 0.05, 1.18, 0.15, 0.3)
  return BIKE_FIT
}

/** The three bikes of 2026-11-19 */
export const BIKE_BODIES = { swift, hornet, petrel }
