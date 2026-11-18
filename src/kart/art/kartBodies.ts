// 2026-11-18 (owner: "the karts need designing again ... more striking; some karts change shape
// when they fire a boost"), and again later that day (owner: "the karts need to be more esports ...
// they look like a child's toy"): the six hover karts as a race team's machines, all our own shapes
// from the Tamsui river mouth (docs/KART-WORLD.md), made in code from kartParts.ts. No round, soft
// bodies: hulls cut in flat faces with a wedge nose, low to the road, blade skirts, a big wing,
// thrusters in the open. Satin black and carbon, with one neon colour a kart, lit lines, and a
// livery: the driver's racing number and the kart's own abstract sign (no real brand, no other
// game's kart, part or change of shape).
//
// Each still has a silhouette that says what it is good at (shared/kart/karts.ts), and a second
// shape it opens into while a full boost runs (boostFx.ts):
//
// - `tide`, the all-rounder: twin knife hulls either side of a wedge pod, a wing across both. Open:
//   the hulls slide apart, foils fold down, the wing rises.
// - `comet`, light and quick off the line: an arrowhead in front of one big thruster in an
//   eight-sided ring. Open: the ring slides back and grows, four tail vanes spread, the nose cap and
//   the side pods push out.
// - `ray`, planted and fast: a flat delta. Open: the drooped wing tips lift into winglets, the fins
//   splay, the spine opens and the tail whip runs out.
// - `crab`, heavy and slow to pull away: a wide armoured wedge with two rams, one bigger. Open: the
//   armour lifts, the rams gape, the outriggers spread and a second pair of thrusters slides out.
// - `heron`, the fastest and the twitchiest: a needle with a long bill and folded wings. Open: the
//   wings swing out, the tail fin splits into a V, the bill reaches forward and the crest stands.
// - `flyfish`, the drift charger: a dart with fan fins. Open: the fins fan out in two layers, the
//   dorsal blades stand, the forked tail spreads and the gills light.
//
// Same footprint for all (about 1.5 m wide and 2.6 m long closed, KART_RADIUS 1.2), same frame: -z
// forward, the chassis floating above the road. The driver sits low, hips inside the hull.
import { BoxGeometry, CylinderGeometry, type Group, type Material, type Object3D } from 'three'
import type { KartId } from '../../../shared/kart/karts.ts'
import { blade, hinge, hoop, hull, plate, wedge, type BodyFit, type BodyKit } from './kartParts.ts'

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

/**
 * Round the driver: a low dark screen on the cowl ahead, a carbon rim either side, and a fairing
 * behind the shoulders with an intake. `z` is the seat's, `y` the deck's height there, `half` the
 * rim's half width
 */
function cockpit(kit: BodyKit, parent: Object3D, z: number, y: number, half = 0.24): void {
  const { paint } = kit
  kit.put(
    parent,
    hull([
      { z: z - 0.84, w: 0.04, top: 0.01, bottom: 0.02, y: y - 0.04 },
      { z: z - 0.56, w: half * 0.86, top: 0.13, bottom: 0.03, y: y + 0.03, sw: 0.7 },
    ]),
    paint.glass,
  )
  for (const side of SIDES) {
    kit.put(parent, box(0.035, 0.05, 0.62), paint.carbon, side * half, y + 0.015, z - 0.14)
  }
  kit.put(parent, wedge(half * 1.5, 0.34, 0.15, 0.03), paint.carbon, 0, y - 0.01, z + 0.33)
  kit.put(parent, box(half * 1.1, 0.07, 0.02), paint.dark, 0, y + 0.085, z + 0.158)
}

/**
 * A rear wing as a part that moves by itself, at (0, `y`, `z`): a swept plane `half` wide each side
 * and `chord` deep, a neon lip and a lit line along its trailing edge, end plates with the racing
 * number, and two pylons `drop` long hanging from it `stance` apart
 */
function rearWing(
  kit: BodyKit,
  parent: Object3D,
  y: number,
  z: number,
  half: number,
  chord: number,
  drop: number,
  stance: number,
): Group {
  const { paint } = kit
  const wing = hinge(parent, 0, y, z)
  const front = -chord / 2
  const back = chord / 2
  kit.put(
    wing,
    plate(
      [
        [-half, front + chord * 0.3],
        [-half * 0.3, front],
        [half * 0.3, front],
        [half, front + chord * 0.3],
        [half, back],
        [-half, back],
      ],
      0.03,
    ),
    paint.carbon,
  )
  kit.put(wing, box(half * 2, 0.05, 0.022), paint.accent, 0, 0.05, back - 0.011)
  kit.strip(wing, 0, 0.036, back - 0.06, half * 1.86, Math.PI / 2)
  for (const side of SIDES) {
    kit.put(
      wing,
      blade(
        [
          [front - 0.02, -0.13],
          [back + 0.03, -0.13],
          [back + 0.1, 0.17],
          [front + chord * 0.45, 0.1],
        ],
        0.024,
      ),
      paint.main,
      side * half,
    )
    kit.decal(wing, 'number', 0.26, 0.13, side * (half + 0.016), 0, back - 0.1, side > 0 ? 'right' : 'left')
    kit.put(
      wing,
      blade(
        [
          [-0.1, -drop],
          [0.06, -drop],
          [0.1, 0.005],
          [-0.02, 0.005],
        ],
        0.028,
      ),
      paint.carbon,
      side * stance,
    )
  }
  return wing
}

/** A blade skirt along a side, from `z0` back to `z1`, its top at `y`, a lit line along its foot */
function skirt(
  kit: BodyKit,
  parent: Object3D,
  side: number,
  x: number,
  y: number,
  z0: number,
  z1: number,
): void {
  const { paint } = kit
  kit.put(
    parent,
    blade(
      [
        [z0, y],
        [z1, y],
        [z1 + 0.06, y - 0.1],
        [z0 + 0.22, y - 0.1],
      ],
      0.022,
    ),
    paint.carbon,
    x,
  )
  kit.strip(parent, x + side * 0.014, y - 0.075, (z0 + z1) / 2 + 0.12, z1 - z0 - 0.24)
}

/** A thruster in the open: a ribbed turbine housing ahead of the bell, then the bell itself */
function thruster(
  kit: BodyKit,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  housing = 0.34,
): void {
  const { paint } = kit
  const turbine = kit.put(
    parent,
    new CylinderGeometry(radius * 0.74, radius * 0.6, housing, 8),
    paint.metal,
    x,
    y,
    z - 0.4 - housing / 2 + 0.06,
  )
  turbine.rotation.x = Math.PI / 2
  for (const at of [0.25, 0.6]) {
    kit.put(parent, hoop(radius * 0.74, 0.016, 8), paint.dark, x, y, z - 0.4 - housing * at + 0.06)
  }
  kit.nozzle(parent, x, y, z, radius)
}

/** A head lamp: a thin lit slit, `w` wide, turned `turn` about the upright */
function slit(
  kit: BodyKit,
  parent: Object3D,
  material: Material,
  w: number,
  x: number,
  y: number,
  z: number,
  turn = 0,
): void {
  kit.put(parent, box(w, 0.022, 0.03), material, x, y, z).rotation.y = turn
}

function tide(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The pod down the middle: a wedge nose, a cowl ahead of the driver, a fairing behind
  kit.put(
    chassis,
    hull([
      { z: -1.12, w: 0.03, top: 0.02, bottom: 0.02, y: -0.04 },
      { z: -0.7, w: 0.2, top: 0.19, bottom: 0.08, sw: 0.5 },
      { z: -0.22, w: 0.27, top: 0.29, bottom: 0.1, sw: 0.55 },
      { z: 0.14, w: 0.3, top: 0.25, bottom: 0.1 },
      { z: 0.62, w: 0.3, top: 0.27, bottom: 0.1, sw: 0.5 },
      { z: 1.02, w: 0.2, top: 0.19, bottom: 0.08, y: 0.02 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.2, -0.74, 'up', 0.38)
  coreHatch(kit, chassis, 0.27, 0.66, 1.0, 0.13)
  // The deck between the hulls, carbon, and a splitter between the bows with a neon edge
  kit.put(
    chassis,
    plate(
      [
        [-0.5, -0.66],
        [0.5, -0.66],
        [0.56, 0.9],
        [-0.56, 0.9],
      ],
      0.05,
    ),
    paint.carbon,
    0,
    -0.06,
    0,
  )
  kit.put(
    chassis,
    plate(
      [
        [-0.44, -1.0],
        [0, -1.16],
        [0.44, -1.0],
        [0.5, -0.68],
        [-0.5, -0.68],
      ],
      0.025,
    ),
    paint.carbon,
    0,
    -0.09,
    0,
  )
  for (const side of SIDES) {
    kit.put(chassis, box(0.03, 0.03, 0.36), paint.accent, side * 0.2, -0.075, -1.06).rotation.y = side * 0.36
    // A hull: a knife bow, a square stern, a neon blade along its crest, a thruster in the open
    const pontoon = hinge(chassis, side * 0.58, 0, 0)
    kit.put(
      pontoon,
      hull([
        { z: -1.32, w: 0.012, top: 0.015, bottom: 0.015, y: -0.03 },
        { z: -0.78, w: 0.13, top: 0.13, bottom: 0.08, sw: 0.4 },
        { z: 0.1, w: 0.17, top: 0.19, bottom: 0.09, sw: 0.4 },
        { z: 0.74, w: 0.165, top: 0.18, bottom: 0.08, sw: 0.45 },
      ]),
      paint.main,
    )
    kit.put(pontoon, wedge(0.03, 1.3, 0.01, 0.07), paint.accent, 0, 0.14, -0.1).rotation.x = -0.02
    kit.decal(pontoon, 'mark', 0.16, 0.16, side * 0.085, 0.12, 0.42)
    skirt(kit, pontoon, side, side * 0.17, -0.01, -0.7, 0.72)
    slit(kit, pontoon, paint.headLamp, 0.12, 0, 0.07, -1.0)
    kit.put(pontoon, box(0.22, 0.03, 0.03), paint.tailLamp, 0, 0.2, 0.75)
    // An intake on the hull's shoulder
    kit.put(pontoon, wedge(0.1, 0.24, 0.05, 0.005), paint.dark, side * -0.07, 0.13, -0.3)
    thruster(kit, pontoon, 0, 0.04, 1.22, 0.16)
    kit.morph(pontoon, { x: side * 0.69 })
    // A foil under the hull, folded up against its side; it swings down and out
    const foil = hinge(pontoon, side * 0.18, -0.04, 0.25)
    kit.put(
      foil,
      plate(
        [
          [0, -0.22],
          [side * 0.34, 0.02],
          [side * 0.3, 0.2],
          [0, 0.24],
        ],
        0.02,
      ),
      paint.accent,
    )
    foil.rotation.z = side * 1.4
    kit.morph(foil, { rz: side * -0.3, from: 0.25 })
  }
  // The wing across both hulls
  const wing = rearWing(kit, chassis, 0.56, 1.02, 0.84, 0.3, 0.4, 0.58)
  kit.morph(wing, { y: 0.7, z: 1.1, rx: -0.3, sx: 1.1, from: 0.2 })
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.58, 1.05],
      [0.58, 1.05],
    ],
  }
}

function comet(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // An arrowhead: all nose, widest behind the driver
  kit.put(
    chassis,
    hull([
      { z: -1.04, w: 0.1, top: 0.05, bottom: 0.04, y: -0.03, sw: 0.5 },
      { z: -0.66, w: 0.24, top: 0.2, bottom: 0.08, sw: 0.5 },
      { z: -0.2, w: 0.38, top: 0.29, bottom: 0.1, sw: 0.45 },
      { z: 0.3, w: 0.52, top: 0.26, bottom: 0.1, sw: 0.5 },
      { z: 0.72, w: 0.46, top: 0.28, bottom: 0.1, sw: 0.5 },
      { z: 0.96, w: 0.3, top: 0.24, bottom: 0.1, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.26, 0.24)
  // The neon nose cap: it pushes forward
  const cap = hinge(chassis, 0, 0, 0)
  kit.put(
    cap,
    hull([
      { z: -1.34, w: 0.012, top: 0.012, bottom: 0.012, y: -0.04 },
      { z: -1.0, w: 0.115, top: 0.07, bottom: 0.05, y: -0.03, sw: 0.5 },
    ]),
    paint.accent,
  )
  slit(kit, cap, paint.headLamp, 0.16, 0, 0.035, -1.02)
  kit.morph(cap, { z: -0.13, until: 0.7 })
  kit.put(chassis, box(0.2, 0.05, 0.03), paint.core, 0, -0.01, -1.02)
  kit.decal(chassis, 'number', 0.24, 0.12, 0, 0.215, -0.62, 'up', 0.4)
  // A splitter under the nose, and a canard each side
  kit.put(
    chassis,
    plate(
      [
        [0, -1.22],
        [0.34, -0.72],
        [0.4, -0.5],
        [-0.4, -0.5],
        [-0.34, -0.72],
      ],
      0.022,
    ),
    paint.carbon,
    0,
    -0.1,
    0,
  )
  for (const side of SIDES) {
    kit.put(
      chassis,
      plate(
        [
          [0, -0.12],
          [side * 0.2, 0.04],
          [side * 0.2, 0.12],
          [0, 0.1],
        ],
        0.018,
      ),
      paint.accent,
      side * 0.24,
      0.06,
      -0.62,
    ).rotation.z = side * 0.3
    kit.strip(chassis, side * 0.34, 0.215, 0.3, 0.8, side * -0.12)
    skirt(kit, chassis, side, side * 0.5, -0.01, -0.2, 0.8)
    // A side pod with a lit intake: it pushes out
    const pod = hinge(chassis, side * 0.6, 0.06, 0.4)
    kit.put(
      pod,
      hull([
        { z: -0.46, w: 0.02, top: 0.02, bottom: 0.02 },
        { z: -0.2, w: 0.1, top: 0.1, bottom: 0.07, sw: 0.5 },
        { z: 0.34, w: 0.11, top: 0.1, bottom: 0.07, sw: 0.5 },
        { z: 0.46, w: 0.07, top: 0.05, bottom: 0.04 },
      ]),
      paint.second,
    )
    kit.put(pod, box(0.03, 0.08, 0.3), paint.core, side * 0.095, 0, 0.06)
    kit.decal(pod, 'mark', 0.14, 0.14, 0, 0.092, 0.1)
    kit.morph(pod, { x: side * 0.74, z: 0.5, from: 0.1 })
    kit.put(chassis, box(0.16, 0.03, 0.03), paint.tailLamp, side * 0.22, 0.27, 0.94)
  }
  // One wide thruster in the open, and the eight-sided ring round it that slides back and grows
  thruster(kit, chassis, 0, 0.14, 1.3, 0.3, 0.3)
  const ring = hinge(chassis, 0, 0.14, 1.08)
  kit.put(ring, hoop(0.44, 0.035, 8), paint.carbon)
  kit.put(ring, hoop(0.44, 0.012, 8), paint.glow, 0, 0, 0.036)
  kit.morph(ring, { z: 1.4, s: 1.26, from: 0.2 })
  // Four vanes round the tail, in a cross: they spread
  for (const turn of [0.25, 0.75, 1.25, 1.75]) {
    const spoke = hinge(chassis, 0, 0.14, 0.92)
    spoke.rotation.z = turn * Math.PI
    const vane = hinge(spoke, 0, 0.3, 0)
    kit.put(
      vane,
      blade(
        [
          [-0.3, 0],
          [0.3, 0],
          [0.52, 0.2],
          [0.3, 0.22],
        ],
        0.03,
      ),
      turn < 1 ? paint.accent : paint.carbon,
    )
    kit.morph(vane, { rx: -0.5, y: 0.36, from: 0.3 })
  }
  return {
    seat: { y: 0, z: 0.26 },
    rearContacts: [
      [-0.5, 1.1],
      [0.5, 1.1],
    ],
  }
}

function ray(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The flat delta, cut square at the tips
  kit.put(
    chassis,
    plate(
      [
        [0, -1.32],
        [0.26, -0.98],
        [0.72, 0.28],
        [0.72, 0.96],
        [0.46, 1.1],
        [-0.46, 1.1],
        [-0.72, 0.96],
        [-0.72, 0.28],
        [-0.26, -0.98],
      ],
      0.13,
      0.02,
    ),
    paint.main,
    0,
    -0.09,
    0,
  )
  // The spine, from the nose to the tail
  kit.put(
    chassis,
    hull([
      { z: -1.22, w: 0.03, top: 0.02, bottom: 0.02, y: 0.02 },
      { z: -0.7, w: 0.2, top: 0.18, bottom: 0.02, y: 0.03, sw: 0.5 },
      { z: -0.22, w: 0.28, top: 0.27, bottom: 0.02, y: 0.03, sw: 0.5 },
      { z: 0.14, w: 0.31, top: 0.23, bottom: 0.02, y: 0.03 },
      { z: 0.66, w: 0.3, top: 0.25, bottom: 0.02, y: 0.03, sw: 0.5 },
      { z: 1.08, w: 0.2, top: 0.13, bottom: 0.02, y: 0.03 },
    ]),
    paint.second,
  )
  cockpit(kit, chassis, 0.28, 0.25)
  kit.decal(chassis, 'number', 0.2, 0.1, 0, 0.2, -0.78, 'up', 0.36)
  coreHatch(kit, chassis, 0.275, 0.68, 1.02, 0.12)
  const edge = Math.hypot(0.46, 1.26)
  const sweep = Math.atan2(0.46, 1.26)
  for (const side of SIDES) {
    // The leading edges, lit, and a neon blade along each
    kit.strip(chassis, side * 0.5, 0.045, -0.34, edge * 0.92, side * sweep)
    kit.put(chassis, box(0.05, 0.02, edge * 0.7), paint.accent, side * 0.43, 0.045, -0.3).rotation.y = side * sweep
    slit(kit, chassis, paint.headLamp, 0.14, side * 0.15, 0.0, -1.08, side * -0.6)
    kit.decal(chassis, 'mark', 0.2, 0.2, side * 0.5, 0.045, 0.52)
    // Gills on the wing
    for (const z of [-0.12, 0.02, 0.16]) {
      kit.put(chassis, box(0.18, 0.012, 0.04), paint.dark, side * 0.5, 0.045, z).rotation.y = side * 0.5
    }
    // A wing tip: drooped, it lifts into a winglet
    const tip = hinge(chassis, side * 0.72, -0.02, 0.64)
    kit.put(
      tip,
      plate(
        [
          [0, -0.38],
          [side * 0.26, 0.06],
          [side * 0.24, 0.36],
          [0, 0.33],
        ],
        0.03,
      ),
      paint.accent,
    )
    kit.strip(tip, side * 0.2, 0.035, 0.2, 0.3)
    tip.rotation.z = side * -0.42
    kit.morph(tip, { rz: side * 0.6, x: side * 0.8, y: 0.03, sx: 1.25, from: 0.15 })
    // A tail fin, canted out: it splays
    const fin = hinge(chassis, side * 0.42, 0.04, 0.82)
    kit.put(
      fin,
      blade(
        [
          [-0.34, 0],
          [0.28, 0],
          [0.44, 0.5],
          [0.2, 0.5],
        ],
        0.03,
      ),
      paint.carbon,
    )
    kit.put(fin, box(0.034, 0.03, 0.26), paint.accent, 0, 0.5, 0.32)
    kit.decal(fin, 'number', 0.26, 0.13, side * 0.017, 0.24, 0.14, side > 0 ? 'right' : 'left')
    fin.rotation.z = side * -0.2
    kit.morph(fin, { rz: side * -0.7, sy: 1.15, from: 0.3 })
    thruster(kit, chassis, side * 0.3, 0.05, 1.24, 0.15, 0.26)
  }
  kit.put(chassis, box(0.4, 0.03, 0.03), paint.tailLamp, 0, 0.13, 1.1)
  // The tail whip: it runs out
  const whip = hinge(chassis, 0, 0.06, 1.1)
  kit.put(whip, box(0.03, 0.03, 0.36), paint.metal, 0, 0, 0.18)
  kit.put(whip, box(0.05, 0.05, 0.06), paint.glow, 0, 0, 0.38)
  kit.morph(whip, { sz: 2.6, from: 0.4 })
  return {
    seat: { y: 0, z: 0.28 },
    rearContacts: [
      [-0.7, 1.05],
      [0.7, 1.05],
    ],
  }
}

function crab(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // The shell: a wide, low wedge, blunt at the front, a carbon belly under it
  kit.put(
    chassis,
    hull([
      { z: -1.0, w: 0.34, top: 0.06, bottom: 0.06, y: -0.02, sw: 0.7 },
      { z: -0.66, w: 0.62, top: 0.2, bottom: 0.08, sw: 0.55 },
      { z: -0.2, w: 0.74, top: 0.29, bottom: 0.09, sw: 0.45 },
      { z: 0.2, w: 0.76, top: 0.25, bottom: 0.09, sw: 0.5 },
      { z: 0.7, w: 0.72, top: 0.27, bottom: 0.09, sw: 0.5 },
      { z: 1.08, w: 0.5, top: 0.17, bottom: 0.08 },
    ]),
    paint.main,
  )
  kit.put(
    chassis,
    plate(
      [
        [-0.36, -1.04],
        [0.36, -1.04],
        [0.66, -0.66],
        [0.8, 0.0],
        [0.76, 0.9],
        [-0.76, 0.9],
        [-0.8, 0.0],
        [-0.66, -0.66],
      ],
      0.03,
    ),
    paint.carbon,
    0,
    -0.11,
    0,
  )
  cockpit(kit, chassis, 0.28, 0.24, 0.26)
  // A grille across the front, lit slits for eyes above it, the number on the bonnet
  kit.put(chassis, box(0.56, 0.05, 0.03), paint.dark, 0, -0.01, -1.01)
  kit.decal(chassis, 'number', 0.3, 0.15, 0, 0.165, -0.72, 'up', 0.42)
  // A roll hoop behind the driver with a light bar on it
  for (const side of SIDES) {
    kit.put(chassis, box(0.04, 0.34, 0.05), paint.carbon, side * 0.24, 0.36, 0.52).rotation.z = side * 0.25
  }
  kit.put(chassis, box(0.44, 0.04, 0.05), paint.carbon, 0, 0.52, 0.52)
  kit.put(chassis, box(0.34, 0.022, 0.02), paint.glow, 0, 0.52, 0.548)
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.2, side * 0.3, 0.085, -0.93, side * -0.42)
    // The armour either side of the driver: it lifts and slides out over the lit core
    kit.put(chassis, box(0.2, 0.03, 0.6), paint.core, side * 0.46, 0.2, 0.36).rotation.z = side * -0.3
    const armour = hinge(chassis, side * 0.47, 0.225, 0.36)
    kit.put(
      armour,
      plate(
        [
          [-0.17, -0.44],
          [0.17, -0.34],
          [0.2, 0.3],
          [0.1, 0.42],
          [-0.1, 0.42],
          [-0.2, 0.3],
        ],
        0.045,
      ),
      paint.second,
    )
    kit.put(armour, box(0.03, 0.03, 0.62), paint.accent, 0, 0.05, 0)
    kit.decal(armour, 'mark', 0.15, 0.15, side * 0.1, 0.048, 0.18)
    armour.rotation.z = side * -0.3
    kit.morph(armour, { x: side * 0.62, y: 0.4, rz: side * -0.68, from: 0.1 })
    // Three outriggers a side, folded along the shell: they spread
    const legs = hinge(chassis, side * 0.76, -0.02, 0.14)
    for (const z of [-0.36, 0, 0.36]) {
      const leg = kit.put(legs, wedge(0.3, 0.09, 0.04, 0.04), paint.carbon, side * 0.1, 0, z)
      leg.rotation.z = side * -0.5
      kit.put(legs, box(0.035, 0.13, 0.1), paint.accent, side * 0.25, -0.06, z)
    }
    kit.morph(legs, { x: side * 0.86, rz: side * 0.32, from: 0.2 })
    kit.strip(chassis, side * 0.68, 0.045, 0.2, 1.1)
    kit.put(chassis, box(0.22, 0.03, 0.03), paint.tailLamp, side * 0.34, 0.2, 1.07)
    thruster(kit, chassis, side * 0.34, 0.04, 1.26, 0.17, 0.2)
    // A second, smaller thruster under the shell: it slides out
    const spare = hinge(chassis, side * 0.5, 0.06, 0.66)
    kit.put(spare, new CylinderGeometry(0.085, 0.1, 0.34, 8), paint.metal).rotation.x = Math.PI / 2
    kit.put(spare, hoop(0.085, 0.014, 8), paint.glow, 0, 0, 0.17)
    kit.put(spare, new CylinderGeometry(0.07, 0.07, 0.02, 8), paint.core, 0, 0, 0.165).rotation.x = Math.PI / 2
    kit.morph(spare, { z: 1.12, x: side * 0.62, y: 0.02, from: 0.35 })
  }
  // The rams: a big one on the right, a small one on the left. Their jaws gape
  for (const [side, size] of [
    [1, 1],
    [-1, 0.64],
  ] as const) {
    const ram = hinge(chassis, side * 0.56, 0.02, -0.8)
    ram.scale.setScalar(size)
    kit.put(
      ram,
      hull([
        { z: -0.3, w: 0.1, top: 0.07, bottom: 0.06, sw: 0.5 },
        { z: -0.06, w: 0.17, top: 0.12, bottom: 0.08, sw: 0.5 },
        { z: 0.26, w: 0.12, top: 0.09, bottom: 0.07, sw: 0.5 },
        { z: 0.36, w: 0.06, top: 0.04, bottom: 0.04 },
      ]),
      paint.second,
    )
    for (const jawSide of SIDES) {
      const jaw = hinge(ram, jawSide * 0.03, 0, -0.26)
      kit.put(
        jaw,
        plate(
          [
            [0, 0],
            [jawSide * 0.14, -0.04],
            [jawSide * 0.1, -0.34],
            [0, -0.5],
          ],
          0.07,
        ),
        paint.accent,
        0,
        -0.035,
        0,
      )
      kit.put(jaw, box(0.012, 0.03, 0.3), paint.core, jawSide * -0.004, 0, -0.2)
      kit.morph(jaw, { ry: jawSide * -0.5, from: 0.25 })
    }
    kit.morph(ram, { z: -0.9, y: 0.08, rx: 0.16, from: 0.1 })
  }
  // A wide, low wing across the tail
  const wing = rearWing(kit, chassis, 0.44, 1.02, 0.74, 0.26, 0.26, 0.5)
  kit.morph(wing, { y: 0.56, rx: -0.26, from: 0.2 })
  return {
    seat: { y: 0, z: 0.28 },
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
    hull([
      { z: -1.0, w: 0.1, top: 0.07, bottom: 0.05, y: 0.0, sw: 0.5 },
      { z: -0.66, w: 0.2, top: 0.2, bottom: 0.08, sw: 0.5 },
      { z: -0.2, w: 0.27, top: 0.29, bottom: 0.1, sw: 0.5 },
      { z: 0.16, w: 0.3, top: 0.25, bottom: 0.1 },
      { z: 0.66, w: 0.28, top: 0.28, bottom: 0.1, sw: 0.45 },
      { z: 1.1, w: 0.17, top: 0.16, bottom: 0.08, y: 0.03 },
    ]),
    paint.main,
  )
  cockpit(kit, chassis, 0.3, 0.24, 0.22)
  kit.decal(chassis, 'number', 0.2, 0.1, 0, 0.2, -0.7, 'up', 0.42)
  // The neon bill: it reaches forward
  const bill = hinge(chassis, 0, 0.0, -0.98)
  kit.put(
    bill,
    hull([
      { z: -0.42, w: 0.008, top: 0.008, bottom: 0.008, y: -0.03 },
      { z: -0.2, w: 0.06, top: 0.04, bottom: 0.03, y: -0.01, sw: 0.5 },
      { z: 0.02, w: 0.112, top: 0.078, bottom: 0.056, sw: 0.5 },
    ]),
    paint.accent,
  )
  kit.morph(bill, { z: -1.1, sz: 1.2, until: 0.7 })
  kit.put(chassis, box(0.18, 0.08, 0.03), paint.core, 0, 0.01, -0.99)
  // A front wing under the bill: two small planes
  for (const side of SIDES) {
    kit.put(
      chassis,
      plate(
        [
          [0, -0.14],
          [side * 0.4, 0.0],
          [side * 0.4, 0.16],
          [0, 0.1],
        ],
        0.02,
      ),
      paint.carbon,
      side * 0.08,
      -0.07,
      -0.92,
    )
    kit.put(chassis, blade([[-0.06, -0.02], [0.2, -0.02], [0.2, 0.09], [0.04, 0.06]], 0.02), paint.accent, side * 0.48, -0.05, -0.92)
  }
  // The crest behind the driver, which stands up
  const crest = hinge(chassis, 0, 0.3, 0.66)
  kit.put(
    crest,
    blade(
      [
        [-0.12, 0],
        [0.12, 0],
        [0.64, 0.1],
        [0.6, 0.15],
      ],
      0.026,
    ),
    paint.accent,
  )
  kit.morph(crest, { rx: -0.5, from: 0.3 })
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.09, side * 0.13, 0.06, -0.94, side * -0.5)
    kit.strip(chassis, side * 0.265, 0.02, 0.2, 1.3)
    // An intake on the shoulder
    kit.put(chassis, wedge(0.07, 0.3, 0.09, 0.005), paint.dark, side * 0.2, 0.17, -0.02)
    // A wing, folded back along the body: it swings out
    const wing = hinge(chassis, side * 0.24, 0.02, -0.12)
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
        0.035,
      ),
      paint.second,
    )
    // The neon tip, the lit leading edge and the kart's sign
    kit.put(wing, box(0.12, 0.04, 0.26), paint.accent, side * 0.44, 0.018, 0.82).rotation.y = side * 0.32
    kit.strip(wing, side * 0.36, 0.04, 0.27, 0.92, side * Math.atan2(0.3, 0.94))
    kit.decal(wing, 'mark', 0.16, 0.16, side * 0.2, 0.038, 0.36)
    kit.morph(wing, { ry: side * 0.62, rz: side * 0.14, y: 0.06, from: 0.1 })
    // The tail: two fins that stand as one and split into a V
    const fin = hinge(chassis, side * 0.02, 0.2, 0.84)
    kit.put(
      fin,
      blade(
        [
          [-0.34, 0],
          [0.3, 0],
          [0.46, 0.62],
          [0.22, 0.62],
        ],
        0.036,
      ),
      paint.carbon,
    )
    kit.put(fin, box(0.012, 0.36, 0.03), paint.core, side * -0.016, 0.3, 0.26).rotation.x = 0.26
    kit.put(fin, box(0.04, 0.03, 0.25), paint.accent, 0, 0.62, 0.34)
    kit.decal(fin, 'number', 0.28, 0.14, side * 0.02, 0.3, 0.12, side > 0 ? 'right' : 'left')
    kit.morph(fin, { rz: side * -0.6, x: side * 0.07, from: 0.25 })
  }
  kit.put(chassis, box(0.26, 0.03, 0.03), paint.tailLamp, 0, 0.17, 1.1)
  thruster(kit, chassis, 0, 0.07, 1.3, 0.2, 0.2)
  return {
    seat: { y: 0, z: 0.3 },
    rearContacts: [
      [-0.6, 1.05],
      [0.6, 1.05],
    ],
  }
}

function flyfish(kit: BodyKit, chassis: Object3D): BodyFit {
  const { paint } = kit
  // A dart, a paler belly pan under it
  kit.put(
    chassis,
    hull([
      { z: -1.3, w: 0.02, top: 0.015, bottom: 0.015, y: -0.03 },
      { z: -0.7, w: 0.24, top: 0.19, bottom: 0.08, sw: 0.5 },
      { z: -0.22, w: 0.38, top: 0.29, bottom: 0.1, sw: 0.45 },
      { z: 0.2, w: 0.44, top: 0.25, bottom: 0.1, sw: 0.5 },
      { z: 0.7, w: 0.36, top: 0.27, bottom: 0.1, sw: 0.45 },
      { z: 1.14, w: 0.16, top: 0.13, bottom: 0.07, y: 0.03 },
    ]),
    paint.main,
  )
  kit.put(
    chassis,
    plate(
      [
        [0, -1.24],
        [0.3, -0.66],
        [0.5, 0.1],
        [0.42, 0.8],
        [-0.42, 0.8],
        [-0.5, 0.1],
        [-0.3, -0.66],
      ],
      0.03,
    ),
    paint.second,
    0,
    -0.12,
    0,
  )
  cockpit(kit, chassis, 0.28, 0.24)
  kit.decal(chassis, 'number', 0.22, 0.11, 0, 0.19, -0.74, 'up', 0.36)
  // The dorsal blades, lying back: they stand
  const spines = hinge(chassis, 0, 0.3, 0.6)
  for (const [z, size] of [
    [0, 1],
    [0.2, 0.82],
    [0.38, 0.64],
  ] as const) {
    const spine = kit.put(
      spines,
      blade(
        [
          [-0.08, 0],
          [0.1, 0],
          [0.26, 0.36],
          [0.16, 0.36],
        ],
        0.024,
      ),
      paint.accent,
      0,
      0,
      z,
    )
    spine.scale.setScalar(size)
  }
  spines.rotation.x = 0.95
  kit.morph(spines, { rx: -0.1, y: 0.31, from: 0.3 })
  for (const side of SIDES) {
    slit(kit, chassis, paint.headLamp, 0.12, side * 0.14, 0.05, -1.0, side * -0.62)
    kit.strip(chassis, side * 0.37, 0.03, 0.14, 1.1, side * -0.03)
    skirt(kit, chassis, side, side * 0.45, -0.02, -0.3, 0.7)
    // Gills: three lit slits that blaze while a full boost runs
    for (const z of [-0.6, -0.5, -0.4]) {
      const gill = kit.put(chassis, box(0.02, 0.1, 0.035), paint.core, side * (0.275 + (z + 0.6) * 0.3), 0.06, z)
      gill.rotation.y = side * -0.3
    }
    // The fins: a second one under the first, which fans out further
    const under = hinge(chassis, side * 0.38, 0.0, -0.16)
    kit.put(
      under,
      plate(
        [
          [0, -0.26],
          [side * 0.44, 0.26],
          [side * 0.38, 0.54],
          [0, 0.26],
        ],
        0.02,
      ),
      paint.carbon,
    )
    kit.strip(under, side * 0.24, 0.026, 0.22, 0.5, side * Math.atan2(0.44, 0.52))
    under.rotation.y = side * -0.3
    kit.morph(under, { ry: side * 0.95, rz: side * 0.1, sx: 1.25, from: 0.3 })
    const fin = hinge(chassis, side * 0.38, 0.03, -0.2)
    kit.put(
      fin,
      plate(
        [
          [0, -0.3],
          [side * 0.5, 0.28],
          [side * 0.42, 0.6],
          [0, 0.3],
        ],
        0.028,
      ),
      paint.accent,
    )
    kit.decal(fin, 'mark', 0.15, 0.15, side * 0.24, 0.031, 0.3)
    fin.rotation.y = side * -0.28
    fin.rotation.z = side * 0.06
    kit.morph(fin, { ry: side * 0.3, rz: side * 0.26, sx: 1.3, y: 0.08, from: 0.1 })
    // The forked tail, one fin a side in a V: it spreads
    const fork = hinge(chassis, side * 0.07, 0.12, 1.0)
    kit.put(
      fork,
      blade(
        [
          [-0.3, 0],
          [0.2, 0],
          [0.42, 0.5],
          [0.2, 0.5],
        ],
        0.03,
      ),
      paint.carbon,
    )
    kit.put(fork, box(0.034, 0.03, 0.24), paint.accent, 0, 0.5, 0.31)
    kit.decal(fork, 'number', 0.24, 0.12, side * 0.017, 0.25, 0.1, side > 0 ? 'right' : 'left')
    fork.rotation.z = side * -0.5
    kit.morph(fork, { rz: side * -1.0, s: 1.2, from: 0.25 })
    kit.put(chassis, box(0.12, 0.03, 0.03), paint.tailLamp, side * 0.2, 0.2, 1.0)
    thruster(kit, chassis, side * 0.2, 0.05, 1.28, 0.14, 0.2)
  }
  return {
    seat: { y: 0, z: 0.28 },
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
