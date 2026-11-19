// 2026-11-19 (owner: "more kinds of vehicle"): eight more hover karts, in the look of the first six
// (kartBodies.ts: hulls cut in flat faces, satin black and carbon with one neon colour, lit lines, a
// livery) and from the same river mouth (docs/KART-WORLD.md §4.3). All our own shapes: no other
// game's kart, part or change of shape. Each has a silhouette that says what it is built for
// (shared/kart/karts.ts), and a second shape it opens into while a full boost runs:
//
// - `dolphin`, the all-rounder that likes a straight: one smooth hull with a brow, a tall dorsal
//   fin and tail flukes. Open: the fin stands taller, the flippers sweep out, the flukes lift.
// - `skipper`, off the line: a blunt head with two eyes on top and two fore pods like arms. Open:
//   the arms reach forward, the eyes rise, the back sail stands.
// - `shrimp`, all punch: a flat armoured back in overlapping plates and two folded strikers. Open:
//   the strikers punch forward, the plates lift one after another, the tail fan spreads.
// - `marlin`, a first taste of speed: a spear for a nose, a sail behind the driver, a crescent
//   tail. Open: the spear runs out, the sail stands to its full height, the crescent spreads.
// - `eel`, a first drift charger: long and low, a ribbon fin down each side. Open: the jaws part,
//   the ribbons lift and widen, the tail runs out.
// - `squid`, the loose charger: back to front, a mantle pointed at the tail with two fins, and
//   prongs ahead. Open: the prongs fan out, the fins flare, the mantle opens.
// - `hermit`, heavy and easy: a low wedge under a shell of three turns, one big claw. Open: the
//   shell's turns lift apart over a lit core, the claw gapes.
// - `whale`, the heaviest: a broad deep hull with long flippers folded back and wide flukes. Open:
//   the flippers swing out, the flukes lift and spread, the back opens.
//
// Same footprint and frame as the first six: about 1.5 m wide and 2.6 m long closed, -z forward.
import { CylinderGeometry, type Object3D } from 'three'
import { box, cockpit, coreHatch, SIDES, skirt, slit, thruster } from './kartBodies.ts'
import { blade, hinge, hoop, hull, plate, wedge, type BodyFit, type BodyKit } from './kartParts.ts'

/** The racing number on both faces of an upright fin at x = 0 */
function finNumbers(kit: BodyKit, fin: Object3D, y: number, z: number, thick = 0.03): void {
  for (const side of SIDES) {
    kit.decal(fin, 'number', 0.22, 0.11, side * (thick / 2 + 0.003), y, z, side > 0 ? 'right' : 'left')
  }
}

function dolphin(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // One hull: a short beak, a high brow, a long taper to the tail
  kit.put(
    chassis,
    hull([
      { z: -1.3, w: 0.03, top: 0.02, bottom: 0.02, y: -0.03 },
      { z: -1.04, w: 0.11, top: 0.06, bottom: 0.05, y: -0.02, sw: 0.5 },
      { z: -0.88, w: 0.25, top: 0.2, bottom: 0.09, sw: 0.5 },
      { z: -0.3, w: 0.4, top: 0.3, bottom: 0.11, sw: 0.5 },
      { z: 0.3, w: 0.43, top: 0.27, bottom: 0.11, sw: 0.5 },
      { z: 0.82, w: 0.3, top: 0.24, bottom: 0.1 },
      { z: 1.14, w: 0.14, top: 0.13, bottom: 0.07, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.25)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.22, -0.72, 'up', 0.36)
  // A pale belly, wider than the hull at the waist
  kit.put(
    chassis,
    plate(
      [
        [-0.2, -1.0],
        [0.2, -1.0],
        [0.5, -0.1],
        [0.48, 0.8],
        [-0.48, 0.8],
        [-0.5, -0.1],
      ],
      0.04,
    ),
    paint.second,
    0,
    -0.13,
    0,
  )
  // The neon stripe from the beak back over the brow
  kit.put(chassis, wedge(0.05, 0.5, 0.02, 0.02), paint.accent, 0, 0.14, -1.0).rotation.x = -0.52
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.14, side * 0.17, 0.07, -0.95, side * -0.5)
    skirt(kit, chassis, side, side * 0.47, -0.03, -0.5, 0.8)
    kit.strip(chassis, side * 0.3, 0.225, 0.3, 0.8, side * -0.06)
    // A flipper, drooped along the flank: it sweeps out level
    const flipper = hinge(chassis, side * 0.4, 0.03, -0.24)
    kit.put(
      flipper,
      plate(
        [
          [0, -0.2],
          [side * 0.44, 0.18],
          [side * 0.38, 0.42],
          [0, 0.2],
        ],
        0.026,
      ),
      paint.accent,
    )
    kit.decal(flipper, 'mark', 0.14, 0.14, side * 0.19, 0.029, 0.14)
    flipper.rotation.z = side * -0.55
    kit.morph(flipper, { rz: side * 0.1, x: side * 0.46, sx: 1.25, from: 0.1 })
    // A tail fluke: it lifts and spreads
    const fluke = hinge(chassis, side * 0.05, 0.11, 1.06)
    kit.put(
      fluke,
      plate(
        [
          [0, -0.16],
          [side * 0.54, 0.14],
          [side * 0.5, 0.3],
          [0, 0.12],
        ],
        0.026,
      ),
      paint.carbon,
    )
    kit.put(fluke, box(0.5, 0.03, 0.022), paint.accent, side * 0.27, 0.03, 0.2).rotation.y = side * -0.3
    kit.morph(fluke, { rz: side * 0.4, y: 0.2, sx: 1.2, from: 0.25 })
    kit.put(chassis, box(0.14, 0.03, 0.03), paint.tailLamp, side * 0.16, 0.2, 1.0)
    thruster(kit, chassis, side * 0.18, 0.02, 1.3, 0.14, 0.24)
  }
  // The dorsal fin behind the driver: it stands taller and rakes back
  const dorsal = hinge(chassis, 0, 0.25, 0.6)
  kit.put(
    dorsal,
    blade(
      [
        [-0.2, 0],
        [0.24, 0],
        [0.4, 0.46],
        [0.2, 0.42],
      ],
      0.03,
    ),
    paint.accent,
  )
  finNumbers(kit, dorsal, 0.16, 0.12)
  kit.morph(dorsal, { sy: 1.45, rx: 0.14, from: 0.2 })
  coreHatch(kit, chassis, 0.235, 0.86, 1.1, 0.07)
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.47, 1.05],
      [0.47, 1.05],
    ],
  }
}

function skipper(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A blunt, wide head and a body that narrows all the way to the tail
  kit.put(
    chassis,
    hull([
      { z: -1.04, w: 0.3, top: 0.08, bottom: 0.06, y: -0.02, sw: 0.7 },
      { z: -0.8, w: 0.42, top: 0.22, bottom: 0.09, sw: 0.6 },
      { z: -0.2, w: 0.44, top: 0.3, bottom: 0.11, sw: 0.5 },
      { z: 0.4, w: 0.36, top: 0.26, bottom: 0.1, sw: 0.5 },
      { z: 0.9, w: 0.22, top: 0.2, bottom: 0.09 },
      { z: 1.16, w: 0.1, top: 0.12, bottom: 0.06, y: 0.02 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.25)
  kit.put(chassis, box(0.5, 0.045, 0.03), paint.dark, 0, -0.01, -1.05)
  kit.decal(chassis, 'number', 0.24, 0.12, 0, 0.2, -0.78, 'up', 0.5)
  for (const side of SIDES) {
    // An eye on top of the head: a lamp in a pod. It rises
    const eye = hinge(chassis, side * 0.2, 0.2, -0.74)
    kit.put(
      eye,
      hull([
        { z: -0.14, w: 0.05, top: 0.04, bottom: 0.03 },
        { z: -0.04, w: 0.085, top: 0.09, bottom: 0.04, sw: 0.6 },
        { z: 0.14, w: 0.06, top: 0.05, bottom: 0.03 },
      ]),
      paint.second,
    )
    slit(kit, eye, paint.headLamp, 0.11, 0, 0.045, -0.115)
    kit.morph(eye, { y: 0.29, z: -0.8, from: 0.1, until: 0.7 })
    // A fore pod like an arm, tucked beside the head: it reaches forward and out
    const arm = hinge(chassis, side * 0.56, -0.01, -0.5)
    kit.put(
      arm,
      hull([
        { z: -0.42, w: 0.03, top: 0.03, bottom: 0.03 },
        { z: -0.22, w: 0.11, top: 0.1, bottom: 0.07, sw: 0.5 },
        { z: 0.24, w: 0.12, top: 0.11, bottom: 0.07, sw: 0.5 },
        { z: 0.4, w: 0.06, top: 0.05, bottom: 0.04 },
      ]),
      paint.second,
    )
    kit.put(
      arm,
      plate(
        [
          [0, -0.3],
          [side * 0.2, -0.1],
          [side * 0.2, 0.16],
          [0, 0.22],
        ],
        0.022,
      ),
      paint.accent,
      side * 0.08,
      -0.02,
      0,
    )
    kit.decal(arm, 'mark', 0.14, 0.14, 0, 0.102, 0.04)
    kit.strip(arm, side * 0.1, 0.03, 0, 0.5)
    kit.morph(arm, { x: side * 0.7, z: -0.82, ry: side * -0.14, from: 0.05, until: 0.75 })
    skirt(kit, chassis, side, side * 0.42, -0.02, -0.1, 0.7)
    kit.strip(chassis, side * 0.27, 0.215, 0.36, 0.7, side * -0.16)
    kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, side * 0.13, 0.19, 1.02)
  }
  // The back sail: two blades laid back along the spine. They stand
  for (const [z, size, from] of [
    [0.56, 1, 0.15],
    [0.9, 0.72, 0.3],
  ] as const) {
    const sail = hinge(chassis, 0, 0.23, z)
    sail.scale.setScalar(size)
    kit.put(
      sail,
      blade(
        [
          [-0.1, 0],
          [0.12, 0],
          [0.2, 0.46],
          [-0.02, 0.4],
        ],
        0.028,
      ),
      paint.accent,
    )
    kit.put(sail, box(0.034, 0.03, 0.2), paint.carbon, 0, 0.44, 0.09).rotation.x = -0.26
    sail.rotation.x = 1.15
    kit.morph(sail, { rx: 0.12, from })
  }
  // One wide thruster, and a low tail fin under a hoop
  thruster(kit, chassis, 0, 0.09, 1.34, 0.24, 0.26)
  const ring = hinge(chassis, 0, 0.09, 1.14)
  kit.put(ring, hoop(0.34, 0.03, 8), paint.carbon)
  kit.put(ring, hoop(0.34, 0.011, 8), paint.glow, 0, 0, 0.032)
  kit.morph(ring, { z: 1.4, s: 1.2, from: 0.25 })
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.42, 1.08],
      [0.42, 1.08],
    ],
  }
}

function shrimp(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // Flat and long, square across the shoulders
  kit.put(
    chassis,
    hull([
      { z: -1.08, w: 0.14, top: 0.05, bottom: 0.05, y: -0.02, sw: 0.6 },
      { z: -0.72, w: 0.3, top: 0.2, bottom: 0.08, sw: 0.55 },
      { z: -0.12, w: 0.41, top: 0.28, bottom: 0.1, sw: 0.5 },
      { z: 0.5, w: 0.42, top: 0.24, bottom: 0.1, sw: 0.6 },
      { z: 1.0, w: 0.32, top: 0.19, bottom: 0.09, sw: 0.6 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.2, -0.7, 'up', 0.42)
  kit.put(chassis, box(0.18, 0.04, 0.03), paint.core, 0, -0.01, -1.07)
  // The armoured back: three plates, each over the next. They lift one after another
  for (const [z, from] of [
    [0.5, 0.1],
    [0.72, 0.22],
    [0.94, 0.34],
  ] as const) {
    kit.put(chassis, box(0.56, 0.025, 0.16), paint.core, 0, 0.235, z + 0.06)
    const segment = hinge(chassis, 0, 0.24, z)
    kit.put(segment, wedge(0.74, 0.3, 0.025, 0.075), paint.second, 0, 0, 0.1)
    kit.put(segment, box(0.74, 0.024, 0.024), paint.accent, 0, 0.075, 0.24)
    kit.morph(segment, { y: 0.31, rx: -0.3, from, until: Math.min(1, from + 0.5) })
  }
  for (const side of SIDES) {
    // An eye on a stalk
    kit.put(chassis, box(0.03, 0.12, 0.03), paint.carbon, side * 0.16, 0.2, -0.86).rotation.z = side * -0.3
    slit(kit, chassis, paint.headLamp, 0.1, side * 0.19, 0.27, -0.87, side * -0.3)
    // A striker, folded back beside the shoulders: it punches forward
    const striker = hinge(chassis, side * 0.52, 0.03, -0.3)
    kit.put(
      striker,
      hull([
        { z: -0.44, w: 0.09, top: 0.09, bottom: 0.07, sw: 0.7 },
        { z: -0.3, w: 0.13, top: 0.13, bottom: 0.08, sw: 0.6 },
        { z: -0.1, w: 0.08, top: 0.08, bottom: 0.06 },
        { z: 0.34, w: 0.075, top: 0.07, bottom: 0.06 },
        { z: 0.44, w: 0.04, top: 0.04, bottom: 0.04 },
      ]),
      paint.accent,
    )
    kit.put(striker, box(0.2, 0.05, 0.03), paint.core, 0, 0.01, -0.45)
    kit.put(striker, box(0.03, 0.05, 0.4), paint.carbon, side * 0.085, 0.01, 0.12)
    kit.decal(striker, 'mark', 0.13, 0.13, 0, 0.133, -0.28)
    kit.morph(striker, { z: -0.84, x: side * 0.58, s: 1.14, until: 0.45 })
    skirt(kit, chassis, side, side * 0.44, -0.02, 0.0, 0.94)
    kit.strip(chassis, side * 0.31, 0.2, -0.36, 0.5, side * 0.2)
    // A blade of the tail fan: it spreads
    const fan = hinge(chassis, side * 0.14, 0.1, 1.0)
    kit.put(
      fan,
      plate(
        [
          [side * -0.06, 0],
          [side * 0.2, 0],
          [side * 0.26, 0.34],
          [side * 0.08, 0.4],
        ],
        0.024,
      ),
      paint.carbon,
    )
    kit.put(fan, box(0.17, 0.026, 0.024), paint.accent, side * 0.17, 0.014, 0.37).rotation.y = side * 0.32
    kit.morph(fan, { ry: side * -0.55, rz: side * 0.18, y: 0.16, from: 0.3 })
    kit.put(chassis, box(0.16, 0.03, 0.03), paint.tailLamp, side * 0.2, 0.2, 1.0)
    thruster(kit, chassis, side * 0.19, 0.0, 1.3, 0.14, 0.2)
  }
  // The middle blade of the fan
  kit.put(
    chassis,
    plate(
      [
        [-0.1, 0],
        [0.1, 0],
        [0.07, 0.4],
        [-0.07, 0.4],
      ],
      0.024,
    ),
    paint.second,
    0,
    0.13,
    1.0,
  )
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.44, 1.08],
      [0.44, 1.08],
    ],
  }
}

function marlin(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  kit.put(
    chassis,
    hull([
      { z: -0.98, w: 0.08, top: 0.06, bottom: 0.05, y: -0.01, sw: 0.5 },
      { z: -0.62, w: 0.23, top: 0.2, bottom: 0.08, sw: 0.5 },
      { z: -0.1, w: 0.33, top: 0.29, bottom: 0.1, sw: 0.5 },
      { z: 0.4, w: 0.35, top: 0.26, bottom: 0.1, sw: 0.5 },
      { z: 0.9, w: 0.22, top: 0.2, bottom: 0.09 },
      { z: 1.18, w: 0.07, top: 0.09, bottom: 0.05, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.2, 0.1, 0, 0.205, -0.6, 'up', 0.42)
  // The spear: it runs out
  const spear = hinge(chassis, 0, 0, 0)
  kit.put(
    spear,
    hull([
      { z: -1.62, w: 0.008, top: 0.008, bottom: 0.008, y: -0.01 },
      { z: -1.2, w: 0.035, top: 0.03, bottom: 0.025, y: -0.01 },
      { z: -0.92, w: 0.085, top: 0.065, bottom: 0.05, y: -0.01, sw: 0.5 },
    ]),
    paint.accent,
  )
  kit.strip(spear, 0, 0.022, -1.24, 0.5)
  kit.morph(spear, { z: -0.13, until: 0.6 })
  kit.put(chassis, box(0.14, 0.04, 0.03), paint.core, 0, 0, -0.97)
  // A deck under the hull, cut to a point
  kit.put(
    chassis,
    plate(
      [
        [0, -1.0],
        [0.4, -0.2],
        [0.44, 0.84],
        [-0.44, 0.84],
        [-0.4, -0.2],
      ],
      0.03,
    ),
    paint.carbon,
    0,
    -0.11,
    0,
  )
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.13, side * 0.14, 0.08, -0.75, side * -0.62)
    skirt(kit, chassis, side, side * 0.43, -0.02, -0.3, 0.82)
    kit.strip(chassis, side * 0.25, 0.22, 0.3, 0.8, side * -0.1)
    // A side fin, swept hard back
    const fin = hinge(chassis, side * 0.34, 0.04, -0.1)
    kit.put(
      fin,
      plate(
        [
          [0, -0.16],
          [side * 0.3, 0.3],
          [side * 0.26, 0.5],
          [0, 0.16],
        ],
        0.024,
      ),
      paint.accent,
    )
    kit.decal(fin, 'mark', 0.13, 0.13, side * 0.13, 0.027, 0.2)
    fin.rotation.z = side * -0.3
    kit.morph(fin, { rz: side * 0.16, sx: 1.3, from: 0.15 })
    kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, side * 0.13, 0.19, 1.0)
    thruster(kit, chassis, side * 0.17, 0.02, 1.32, 0.13, 0.22)
  }
  // The sail behind the driver, half down: it stands to its full height
  kit.put(chassis, box(0.05, 0.03, 0.6), paint.core, 0, 0.245, 0.76)
  const sail = hinge(chassis, 0, 0.24, 0.46)
  kit.put(
    sail,
    blade(
      [
        [0, 0],
        [0.62, 0],
        [0.74, 0.34],
        [0.5, 0.62],
        [0.16, 0.56],
      ],
      0.026,
    ),
    paint.accent,
  )
  for (const z of [0.2, 0.36, 0.52]) {
    kit.put(sail, box(0.034, 0.5, 0.022), paint.carbon, 0, 0.27, z).rotation.x = 0.2
  }
  finNumbers(kit, sail, 0.2, 0.36, 0.026)
  sail.scale.y = 0.55
  kit.morph(sail, { sy: 1.1, from: 0.15 })
  // The crescent tail, a blade up and a shorter one down: it spreads
  for (const [up, size] of [
    [1, 1],
    [-1, 0.5],
  ] as const) {
    const horn = hinge(chassis, 0, 0.1, 1.1)
    kit.put(
      horn,
      blade(
        [
          [-0.08, 0],
          [0.1, 0],
          [0.44, 0.52 * size],
          [0.3, 0.52 * size],
        ],
        0.026,
      ),
      paint.carbon,
    )
    horn.scale.y = up
    kit.morph(horn, { rx: up * 0.3, s: 1.18, sy: up * 1.18, from: 0.3 })
  }
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.43, 1.05],
      [0.43, 1.05],
    ],
  }
}

function eel(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // Long and low
  kit.put(
    chassis,
    hull([
      { z: -0.9, w: 0.2, top: 0.13, bottom: 0.07, sw: 0.6 },
      { z: -0.4, w: 0.3, top: 0.27, bottom: 0.1, sw: 0.5 },
      { z: 0.3, w: 0.33, top: 0.26, bottom: 0.1, sw: 0.5 },
      { z: 0.84, w: 0.25, top: 0.2, bottom: 0.09 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.2, 0.1, 0, 0.19, -0.66, 'up', 0.3)
  // The jaws: the upper lifts, the lower drops, over a lit throat
  kit.put(chassis, box(0.24, 0.07, 0.04), paint.core, 0, 0.02, -0.9)
  const upper = hinge(chassis, 0, 0.04, -0.9)
  kit.put(
    upper,
    hull([
      { z: -0.42, w: 0.03, top: 0.02, bottom: 0.012, y: 0.0 },
      { z: -0.18, w: 0.14, top: 0.07, bottom: 0.012, sw: 0.6 },
      { z: 0, w: 0.2, top: 0.1, bottom: 0.012, sw: 0.6 },
    ]),
    paint.main,
  )
  kit.put(upper, wedge(0.04, 0.4, 0.012, 0.02), paint.accent, 0, 0.055, -0.2).rotation.x = -0.2
  for (const side of SIDES) slit(kit, upper, paint.headLamp, 0.1, side * 0.1, 0.05, -0.19, side * -0.6)
  kit.morph(upper, { rx: 0.28, until: 0.6 })
  const lower = hinge(chassis, 0, 0.0, -0.9)
  kit.put(
    lower,
    hull([
      { z: -0.36, w: 0.03, top: 0.012, bottom: 0.02 },
      { z: -0.16, w: 0.13, top: 0.012, bottom: 0.05, kw: 0.6 },
      { z: 0, w: 0.19, top: 0.012, bottom: 0.07, kw: 0.6 },
    ]),
    paint.second,
  )
  kit.morph(lower, { rx: -0.2, until: 0.6 })
  for (const side of SIDES) {
    // The ribbon down the side, hanging: it lifts level and widens
    const ribbon = hinge(chassis, side * 0.3, 0.02, 0.1)
    kit.put(
      ribbon,
      plate(
        [
          [0, -0.74],
          [side * 0.14, -0.5],
          [side * 0.19, 0.1],
          [side * 0.16, 0.74],
          [0, 0.86],
        ],
        0.022,
      ),
      paint.accent,
    )
    kit.strip(ribbon, side * 0.15, 0.026, 0.1, 1.1)
    kit.decal(ribbon, 'mark', 0.13, 0.13, side * 0.09, 0.025, 0.3)
    ribbon.rotation.z = side * -0.85
    kit.morph(ribbon, { rz: side * 0.08, sx: 1.6, from: 0.1 })
    kit.strip(chassis, side * 0.22, 0.225, 0.3, 0.8, side * -0.08)
  }
  // The tail, a part of its own with the thruster in it: it runs out over a lit joint
  kit.put(chassis, new CylinderGeometry(0.15, 0.15, 0.3, 8), paint.core, 0, 0.05, 0.9).rotation.x = Math.PI / 2
  const tail = hinge(chassis, 0, 0, 0.82)
  kit.put(
    tail,
    hull([
      { z: 0, w: 0.25, top: 0.2, bottom: 0.09 },
      { z: 0.3, w: 0.2, top: 0.17, bottom: 0.08, y: 0.02 },
      { z: 0.5, w: 0.14, top: 0.1, bottom: 0.06, y: 0.04 },
    ]),
    paint.second,
  )
  // A low fin down its back
  kit.put(
    tail,
    blade(
      [
        [-0.04, 0],
        [0.46, 0],
        [0.62, 0.24],
        [0.3, 0.18],
      ],
      0.026,
    ),
    paint.accent,
    0,
    0.16,
    0,
  )
  for (const side of SIDES) {
    kit.put(tail, box(0.1, 0.03, 0.03), paint.tailLamp, side * 0.1, 0.17, 0.44)
  }
  thruster(kit, tail, 0, 0.05, 0.7, 0.2, 0.2)
  kit.morph(tail, { z: 1.0, from: 0.2 })
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.36, 1.1],
      [0.36, 1.1],
    ],
  }
}

function squid(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The mantle: square in front, drawn to a point at the tail
  kit.put(
    chassis,
    hull([
      { z: -0.86, w: 0.33, top: 0.17, bottom: 0.08, sw: 0.65 },
      { z: -0.3, w: 0.41, top: 0.29, bottom: 0.1, sw: 0.5 },
      { z: 0.3, w: 0.36, top: 0.27, bottom: 0.1, sw: 0.5 },
      { z: 0.9, w: 0.17, top: 0.17, bottom: 0.08, y: 0.02 },
      { z: 1.36, w: 0.02, top: 0.02, bottom: 0.02, y: 0.06 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.2, -0.7, 'up', 0.36)
  kit.put(chassis, box(0.5, 0.06, 0.03), paint.core, 0, 0.02, -0.865)
  coreHatch(kit, chassis, 0.245, 0.56, 0.86, 0.09)
  // The prongs ahead, two long and two short: they fan out
  for (const [x, length, spread] of [
    [-0.26, 0.52, -0.46],
    [-0.09, 0.66, -0.16],
    [0.09, 0.66, 0.16],
    [0.26, 0.52, 0.46],
  ] as const) {
    const prong = hinge(chassis, x, 0.02, -0.84)
    kit.put(
      prong,
      hull([
        { z: -length, w: 0.012, top: 0.012, bottom: 0.012 },
        { z: -length * 0.5, w: 0.045, top: 0.04, bottom: 0.035 },
        { z: 0, w: 0.07, top: 0.06, bottom: 0.05 },
      ]),
      paint.carbon,
    )
    kit.put(prong, box(0.03, 0.022, length * 0.36), paint.accent, 0, 0.04, -length * 0.62)
    kit.morph(prong, { ry: -spread, z: -0.9, from: 0.1, until: 0.8 })
  }
  for (const side of SIDES) {
    // A wide eye on the corner of the mantle
    slit(kit, chassis, paint.headLamp, 0.16, side * 0.34, 0.09, -0.8, side * -0.9)
    skirt(kit, chassis, side, side * 0.4, -0.02, -0.5, 0.5)
    kit.strip(chassis, side * 0.27, 0.215, 0.1, 0.8, side * -0.1)
    // A fin on the tail: it flares
    const fin = hinge(chassis, side * 0.12, 0.08, 0.92)
    kit.put(
      fin,
      plate(
        [
          [0, -0.34],
          [side * 0.46, 0.06],
          [side * 0.34, 0.3],
          [0, 0.4],
        ],
        0.026,
      ),
      paint.accent,
    )
    kit.decal(fin, 'mark', 0.14, 0.14, side * 0.19, 0.029, 0.06)
    fin.rotation.z = side * -0.2
    kit.morph(fin, { rz: side * 0.42, sx: 1.3, y: 0.14, from: 0.2 })
    kit.put(chassis, box(0.1, 0.03, 0.03), paint.tailLamp, side * 0.1, 0.18, 1.0)
    // The siphons under the tail
    thruster(kit, chassis, side * 0.27, -0.01, 1.2, 0.14, 0.22)
  }
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.42, 1.05],
      [0.42, 1.05],
    ],
  }
}

function hermit(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A wide, low wedge
  kit.put(
    chassis,
    hull([
      { z: -1.06, w: 0.22, top: 0.07, bottom: 0.06, y: -0.02, sw: 0.7 },
      { z: -0.72, w: 0.42, top: 0.19, bottom: 0.08, sw: 0.55 },
      { z: -0.1, w: 0.5, top: 0.28, bottom: 0.1, sw: 0.5 },
      { z: 0.5, w: 0.52, top: 0.25, bottom: 0.1, sw: 0.55 },
      { z: 1.0, w: 0.44, top: 0.19, bottom: 0.09, sw: 0.6 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.2, 0.24, 0.25)
  kit.put(chassis, box(0.36, 0.045, 0.03), paint.dark, 0, -0.01, -1.07)
  kit.decal(chassis, 'number', 0.26, 0.13, 0, 0.17, -0.76, 'up', 0.36)
  // The shell behind the driver: three turns, each smaller and a little off the last. They lift
  // apart over a lit core
  kit.put(chassis, new CylinderGeometry(0.1, 0.16, 0.5, 8), paint.core, 0.04, 0.5, 0.7)
  for (const [radius, height, x, y, lift, from] of [
    [0.4, 0.17, 0, 0.33, 0.37, 0.1],
    [0.3, 0.15, 0.05, 0.49, 0.6, 0.2],
    [0.19, 0.13, 0.1, 0.63, 0.82, 0.3],
  ] as const) {
    const turn = hinge(chassis, x, y, 0.7)
    kit.put(turn, new CylinderGeometry(radius * 0.8, radius, height, 8), y < 0.4 ? paint.second : paint.main)
    kit.put(turn, new CylinderGeometry(radius * 1.02, radius * 1.02, 0.024, 8), paint.accent, 0, -height / 2 + 0.012, 0)
    turn.rotation.y = from * 2
    kit.morph(turn, { y: lift, ry: from * 2 + 0.5, from })
  }
  const tip = hinge(chassis, 0.1, 0.74, 0.7)
  kit.put(tip, new CylinderGeometry(0.02, 0.13, 0.12, 8), paint.accent)
  kit.morph(tip, { y: 1.0, from: 0.35 })
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.18, side * 0.28, 0.08, -0.95, side * -0.5)
    skirt(kit, chassis, side, side * 0.52, -0.02, -0.4, 0.94)
    kit.strip(chassis, side * 0.4, 0.2, 0.0, 0.9, side * -0.04)
    kit.decal(chassis, 'mark', 0.15, 0.15, side * 0.38, 0.215, -0.2)
    kit.put(chassis, box(0.2, 0.03, 0.03), paint.tailLamp, side * 0.28, 0.19, 1.0)
    thruster(kit, chassis, side * 0.28, 0.02, 1.26, 0.16, 0.2)
  }
  // The claws: a big one on the left, a small one on the right. Their jaws gape
  for (const [side, size] of [
    [-1, 1],
    [1, 0.6],
  ] as const) {
    const claw = hinge(chassis, side * 0.5, 0.0, -0.72)
    claw.scale.setScalar(size)
    kit.put(
      claw,
      hull([
        { z: -0.2, w: 0.14, top: 0.1, bottom: 0.08, sw: 0.6 },
        { z: 0.1, w: 0.16, top: 0.12, bottom: 0.08, sw: 0.5 },
        { z: 0.4, w: 0.08, top: 0.06, bottom: 0.05 },
      ]),
      paint.second,
    )
    kit.put(claw, box(0.2, 0.08, 0.03), paint.core, 0, 0, -0.2)
    for (const jawSide of SIDES) {
      const jaw = hinge(claw, jawSide * 0.05, 0, -0.18)
      kit.put(
        jaw,
        plate(
          [
            [jawSide * -0.03, 0],
            [jawSide * 0.11, -0.02],
            [jawSide * 0.09, -0.3],
            [jawSide * -0.03, -0.42],
          ],
          0.1,
        ),
        jawSide === side ? paint.accent : paint.carbon,
        0,
        -0.05,
        0,
      )
      kit.morph(jaw, { ry: jawSide * -0.55, from: 0.2 })
    }
    kit.morph(claw, { z: -0.86, x: side * 0.56, from: 0.1 })
  }
  return {
    seat: { y: 0, z: 0.2 },
    rearContacts: [
      [-0.52, 1.08],
      [0.52, 1.08],
    ],
  }
}

function whale(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // Broad and deep, a blunt head, a long taper
  kit.put(
    chassis,
    hull([
      { z: -1.16, w: 0.22, top: 0.1, bottom: 0.08, y: -0.01, sw: 0.7 },
      { z: -0.86, w: 0.44, top: 0.22, bottom: 0.14, sw: 0.6 },
      { z: -0.2, w: 0.54, top: 0.31, bottom: 0.14, sw: 0.5 },
      { z: 0.4, w: 0.52, top: 0.28, bottom: 0.13, sw: 0.5 },
      { z: 0.92, w: 0.33, top: 0.2, bottom: 0.1 },
      { z: 1.22, w: 0.14, top: 0.1, bottom: 0.06, y: 0.04 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.25, 0.26)
  kit.decal(chassis, 'number', 0.28, 0.14, 0, 0.215, -0.82, 'up', 0.4)
  coreHatch(kit, chassis, 0.25, 0.66, 1.0, 0.11)
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.2, side * 0.3, 0.1, -1.03, side * -0.6)
    // The throat: pale panels low on the head, with three lit grooves
    kit.put(
      chassis,
      blade(
        [
          [-1.02, -0.1],
          [-0.2, -0.13],
          [-0.2, 0.0],
          [-0.9, 0.02],
        ],
        0.02,
      ),
      paint.second,
      side * 0.5,
      0,
      0,
    ).rotation.y = side * 0.18
    for (const y of [-0.1, -0.06, -0.02]) {
      kit.strip(chassis, side * 0.46, y, -0.56, 0.62, side * -0.2)
    }
    skirt(kit, chassis, side, side * 0.53, -0.04, -0.1, 0.84)
    kit.strip(chassis, side * 0.4, 0.235, 0.2, 0.9, side * -0.06)
    // A long flipper, folded back along the flank: it swings out
    const flipper = hinge(chassis, side * 0.52, 0.0, -0.4)
    kit.put(
      flipper,
      plate(
        [
          [0, -0.12],
          [side * 0.5, -0.1],
          [side * 0.9, 0.02],
          [side * 0.86, 0.12],
          [side * 0.4, 0.14],
          [0, 0.12],
        ],
        0.03,
      ),
      paint.accent,
    )
    kit.put(flipper, box(0.8, 0.022, 0.022), paint.glow, side * 0.44, 0.036, -0.02).rotation.y = side * -0.1
    kit.decal(flipper, 'mark', 0.14, 0.14, side * 0.3, 0.033, 0.02)
    flipper.rotation.y = side * -1.28
    flipper.rotation.z = side * -0.12
    kit.morph(flipper, { ry: side * -0.4, rz: side * 0.16, from: 0.1 })
    // A fluke: it lifts and spreads
    const fluke = hinge(chassis, side * 0.06, 0.1, 1.14)
    kit.put(
      fluke,
      plate(
        [
          [0, -0.18],
          [side * 0.4, -0.02],
          [side * 0.7, 0.26],
          [side * 0.3, 0.2],
          [0, 0.14],
        ],
        0.03,
      ),
      paint.carbon,
    )
    kit.put(fluke, box(0.44, 0.03, 0.022), paint.accent, side * 0.48, 0.03, 0.2).rotation.y = side * -0.2
    kit.morph(fluke, { rz: side * 0.38, ry: side * -0.2, y: 0.22, s: 1.2, from: 0.25 })
    kit.put(chassis, box(0.18, 0.03, 0.03), paint.tailLamp, side * 0.2, 0.19, 1.06)
    thruster(kit, chassis, side * 0.22, 0.0, 1.32, 0.17, 0.24)
  }
  // A low hump on the back
  kit.put(
    chassis,
    blade(
      [
        [0.4, 0],
        [0.76, 0],
        [0.8, 0.14],
        [0.62, 0.12],
      ],
      0.04,
    ),
    paint.second,
    0,
    0.27,
    0,
  )
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.53, 1.1],
      [0.53, 1.1],
    ],
  }
}

/** The eight karts of 2026-11-19 */
export const MORE_BODIES = { dolphin, skipper, shrimp, marlin, eel, squid, hermit, whale }
