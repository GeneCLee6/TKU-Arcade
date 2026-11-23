// 2026-11-23 (docs/KART-WORLD.md §3.1; owner: "each one's looks ... every one different"): each
// driver's own helmet and the one thing of their own besides it (driverLooks.ts), so that the four tell
// apart by their outline alone, from behind (the chase camera) as from in front. All made in code, all
// ours: Spade's long blade with a fin down its crown, Hartie's round bubble and a ponytail out of its
// back, Dee's helmet cut in flat faces with a narrow visor and a headset over it, Clover's big moto
// helmet with a peak, goggles on it and a towel round the neck.
import {
  BoxGeometry,
  CylinderGeometry,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three'
import { hull, wedge, type BodyKit } from './kartParts.ts'
import type { DriverFeature, HelmetStyle } from './driverLooks.ts'

export interface HelmetPaint {
  readonly shell: Material
  readonly visor: Material
  readonly crest: Material
  readonly band: Material
  readonly carbon: Material
  readonly glint: Material
}

type Point = readonly [number, number, number]
const UP = new Vector3(0, 1, 0)
const box3 = (w: number, h: number, l: number) => new BoxGeometry(w, h, l)

/** A rod from `a` to `b`, `r0` thick at `a` and `r1` at `b` */
export function rod(
  kit: BodyKit,
  parent: Object3D,
  material: Material,
  a: Point,
  b: Point,
  r0: number,
  r1: number,
  around = 6,
): void {
  const from = new Vector3(...a)
  const along = new Vector3(...b).sub(from)
  const length = along.length()
  const mesh = kit.put(
    parent,
    new CylinderGeometry(r1, r0, length, around, 1),
    material,
    from.x + along.x / 2,
    from.y + along.y / 2,
    from.z + along.z / 2,
  )
  mesh.quaternion.setFromUnitVectors(UP, along.normalize())
}

/** Where the team's logo lies on the back of each helmet: y, z, and its tilt back */
export const LOGO_AT: { readonly [H in HelmetStyle]: readonly [number, number, number] } = {
  blade: [0.07, 0.25, -1.05],
  bubble: [0.08, 0.17, -0.85],
  facet: [0.08, 0.19, -0.7],
  moto: [0.085, 0.2, -0.9],
}

/**
 * The helmet on `head` (its middle at the origin, the face -z): its shell, visor and what is cut into
 * it; `full` the detail (vents, glint, hinges), `finest` the most
 */
export function buildHelmet(
  kit: BodyKit,
  head: Object3D,
  style: HelmetStyle,
  paint: HelmetPaint,
  full: boolean,
  finest: boolean,
): void {
  const { shell, visor, crest, band, carbon, glint } = paint
  switch (style) {
    case 'blade': {
      // Long and low, drawn out into a tail; a fin down the crown in the crest's colour
      kit.put(
        head,
        hull([
          { z: -0.21, w: 0.048, top: 0.028, bottom: 0.1, y: -0.035, sh: 0.6 },
          { z: -0.16, w: 0.11, top: 0.11, bottom: 0.13, y: -0.02 },
          { z: -0.04, w: 0.15, top: 0.165, bottom: 0.14, y: 0 },
          { z: 0.1, w: 0.145, top: 0.15, bottom: 0.12, y: 0.01 },
          { z: 0.22, w: 0.08, top: 0.08, bottom: 0.06, y: 0.04 },
          { z: 0.3, w: 0.02, top: 0.02, bottom: 0.015, y: 0.07 },
        ]),
        shell,
      )
      kit.put(
        head,
        hull([
          { z: -0.205, w: 0.07, top: 0.05, bottom: 0.03, y: 0.035, sw: 0.75, sh: 0.9 },
          { z: -0.15, w: 0.13, top: 0.07, bottom: 0.05, y: 0.035, sw: 0.8, sh: 0.9 },
          { z: -0.02, w: 0.158, top: 0.055, bottom: 0.05, y: 0.035, sw: 0.85, sh: 0.9 },
        ]),
        visor,
      )
      // The fin: from over the brow back past the tail, rising
      kit.put(head, wedge(0.012, 0.32, 0.008, 0.055), crest, 0, 0.152, 0.08).rotation.x = -0.1
      break
    }
    case 'bubble': {
      // Round and full, no tail; a big visor; a stripe over the crown and a lip at the back
      kit.put(
        head,
        hull([
          { z: -0.19, w: 0.07, top: 0.06, bottom: 0.1, y: -0.03, sh: 0.7 },
          { z: -0.15, w: 0.14, top: 0.15, bottom: 0.13, y: -0.015, sw: 0.75, sh: 0.9 },
          { z: -0.03, w: 0.168, top: 0.185, bottom: 0.14, y: 0, sw: 0.75, sh: 0.92 },
          { z: 0.1, w: 0.16, top: 0.17, bottom: 0.13, y: 0, sw: 0.75, sh: 0.9 },
          { z: 0.165, w: 0.1, top: 0.1, bottom: 0.1, y: 0 },
        ]),
        shell,
      )
      kit.put(
        head,
        hull([
          { z: -0.2, w: 0.09, top: 0.075, bottom: 0.035, y: 0.035, sw: 0.8, sh: 0.92 },
          { z: -0.15, w: 0.15, top: 0.09, bottom: 0.05, y: 0.035, sw: 0.82, sh: 0.92 },
          { z: -0.03, w: 0.176, top: 0.075, bottom: 0.05, y: 0.035, sw: 0.86, sh: 0.92 },
        ]),
        visor,
      )
      kit.put(head, wedge(0.075, 0.3, 0.012, 0.012), crest, 0, 0.18, 0).rotation.x = -0.02
      kit.put(head, wedge(0.18, 0.05, 0.01, 0.03), crest, 0, 0.06, 0.17).rotation.x = -0.5
      break
    }
    case 'facet': {
      // Square-shouldered and cut in flat faces, a flat brow, a ridge down the back; the visor a
      // narrow band across the eyes, like a pair of glasses
      kit.put(
        head,
        hull([
          { z: -0.2, w: 0.1, top: 0.06, bottom: 0.1, y: -0.035, sw: 0.9, sh: 1, kw: 0.9 },
          { z: -0.17, w: 0.15, top: 0.15, bottom: 0.13, y: -0.02, sw: 0.9, sh: 1, kw: 0.9 },
          { z: 0.0, w: 0.158, top: 0.165, bottom: 0.14, y: 0, sw: 0.9, sh: 1, kw: 0.9 },
          { z: 0.13, w: 0.15, top: 0.15, bottom: 0.13, y: 0, sw: 0.9, sh: 1, kw: 0.9 },
          { z: 0.18, w: 0.11, top: 0.1, bottom: 0.1, y: 0, sw: 0.9, sh: 1, kw: 0.9 },
        ]),
        shell,
      )
      kit.put(head, box3(0.27, 0.05, 0.03), visor, 0, 0.04, -0.183)
      for (const side of [-1, 1]) {
        kit.put(head, box3(0.03, 0.05, 0.12), visor, side * 0.14, 0.04, -0.13).rotation.y =
          side * -0.35
      }
      // The visor's frame, and a ridge down the back
      kit.put(head, box3(0.29, 0.012, 0.035), carbon, 0, 0.07, -0.183)
      kit.put(head, wedge(0.04, 0.3, 0.02, 0.03), carbon, 0, 0.16, 0.04)
      break
    }
    case 'moto': {
      // Big and round, a long chin out in front, a peak over the visor, goggles resting on the peak
      kit.put(
        head,
        hull([
          { z: -0.27, w: 0.06, top: 0.02, bottom: 0.05, y: -0.1, sh: 0.6 },
          { z: -0.2, w: 0.13, top: 0.09, bottom: 0.13, y: -0.04 },
          { z: -0.05, w: 0.175, top: 0.19, bottom: 0.15, y: 0 },
          { z: 0.1, w: 0.17, top: 0.18, bottom: 0.14, y: 0 },
          { z: 0.19, w: 0.11, top: 0.1, bottom: 0.1, y: 0 },
        ]),
        shell,
      )
      kit.put(
        head,
        hull([
          { z: -0.19, w: 0.1, top: 0.05, bottom: 0.03, y: 0.04, sw: 0.8, sh: 0.9 },
          { z: -0.1, w: 0.16, top: 0.06, bottom: 0.04, y: 0.04, sw: 0.85, sh: 0.9 },
        ]),
        visor,
      )
      // The peak, out over the brow, in the shell's colour with the crest's edge
      kit.put(head, wedge(0.22, 0.15, 0.01, 0.022), shell, 0, 0.155, -0.19).rotation.x = 0.16
      kit.put(head, box3(0.2, 0.008, 0.012), crest, 0, 0.152, -0.262)
      // The goggles on it, their strap round the helmet
      for (const side of [-1, 1]) {
        const lens = kit.put(
          head,
          new CylinderGeometry(0.035, 0.035, 0.025, 10),
          glint,
          side * 0.05,
          0.19,
          -0.14,
        )
        lens.rotation.x = Math.PI / 2 - 0.4
      }
      kit.put(head, new TorusGeometry(0.176, 0.01, 4, 20), band, 0, 0.17, 0).rotation.x =
        Math.PI / 2
      break
    }
  }
  // A band round the helmet's base, in every style
  kit.put(head, new TorusGeometry(0.14, 0.014, 4, 16), band, 0, -0.135, 0.01).rotation.x =
    Math.PI / 2
  // Vents on the chin
  if (style !== 'facet') {
    for (const side of [-1, 1]) {
      kit.put(
        head,
        wedge(0.03, 0.07, 0.012, 0.012),
        carbon,
        side * 0.06,
        -0.1,
        style === 'moto' ? -0.21 : -0.165,
      )
    }
  }
  if (full) {
    // The visor's glint and its hinges
    if (style !== 'facet') {
      kit
        .put(head, box3(0.2, 0.008, 0.012), glint, 0.01, 0.075, -0.16)
        .rotation.set(-0.3, 0.12, -0.12)
    }
    for (const side of [-1, 1]) {
      kit.put(
        head,
        new CylinderGeometry(0.03, 0.03, 0.022, 8),
        carbon,
        side * 0.165,
        0.03,
        -0.06,
      ).rotation.z = Math.PI / 2
    }
    if (style === 'blade' || style === 'bubble') {
      for (const x of finest ? [-0.05, 0.05] : [0]) {
        kit.put(
          head,
          wedge(0.03, 0.09, 0.018, 0.026),
          carbon,
          x,
          style === 'bubble' ? 0.178 : 0.158,
          -0.09,
        ).rotation.x = -0.12
      }
    }
  }
}

/** What a feature hands back to be moved: pivots that swing with the drive (kartModel.ts) */
export interface FeatureParts {
  /** Hanging pieces that stream back with the speed and sway (a scarf's tails, a ponytail) */
  readonly swings: readonly Object3D[]
}

/**
 * The driver's own thing (driverLooks.ts): on the head (a ponytail, a headset) or round the neck on
 * the torso (a scarf, a towel). `main` and `second` its colours
 */
export function buildFeature(
  kit: BodyKit,
  head: Object3D,
  torso: Object3D,
  feature: DriverFeature,
  main: Material,
  second: Material,
  full: boolean,
): FeatureParts {
  const swings: Object3D[] = []
  const pivot = (parent: Object3D, x: number, y: number, z: number) => {
    const one = new Object3D()
    one.position.set(x, y, z)
    parent.add(one)
    return one
  }
  switch (feature) {
    case 'scarf': {
      // Wound round the neck, two long tails behind, streaming back
      kit.put(torso, new TorusGeometry(0.085, 0.032, 6, 14), main, 0, 0.58, 0.01).rotation.x =
        Math.PI / 2
      kit.put(torso, new TorusGeometry(0.08, 0.012, 4, 14), second, 0, 0.6, 0.01).rotation.x =
        Math.PI / 2
      const tails = pivot(torso, 0, 0.57, 0.1)
      kit
        .put(tails, wedge(0.06, 0.014, 0.4, 0.38), main, -0.035, -0.2, 0.02)
        .rotation.set(0, 0, 0.08)
      kit
        .put(tails, wedge(0.055, 0.014, 0.3, 0.28), main, 0.04, -0.15, 0.03)
        .rotation.set(0, 0, -0.1)
      if (full) kit.put(tails, box3(0.062, 0.03, 0.018), second, -0.035, -0.37, 0.02)
      swings.push(tails)
      break
    }
    case 'ponytail': {
      // Out of the helmet's back under its lip, tied with a ribbon, a bow
      const tail = pivot(head, 0, -0.04, 0.16)
      rod(kit, tail, main, [0, 0, 0], [0, -0.1, 0.07], 0.04, 0.05, full ? 8 : 6)
      rod(kit, tail, main, [0, -0.1, 0.07], [0, -0.22, 0.08], 0.05, 0.04, full ? 8 : 6)
      rod(kit, tail, main, [0, -0.22, 0.08], [0, -0.32, 0.05], 0.04, 0.012, full ? 8 : 6)
      kit.put(tail, new TorusGeometry(0.042, 0.012, 4, 10), second, 0, -0.005, 0.005).rotation.x =
        Math.PI / 2 - 0.6
      for (const side of [-1, 1]) {
        kit.put(tail, wedge(0.02, 0.07, 0.05, 0.015), second, side * 0.04, 0.01, 0).rotation.y =
          (side * Math.PI) / 2
      }
      swings.push(tail)
      break
    }
    case 'headset': {
      // Big cups over the helmet's ears, a band over its crown, a boom mic round to the chin
      for (const side of [-1, 1]) {
        kit.put(
          head,
          new CylinderGeometry(0.065, 0.065, 0.045, 14),
          main,
          side * 0.18,
          -0.01,
          0.0,
        ).rotation.z = Math.PI / 2
        kit.put(
          head,
          new TorusGeometry(0.052, 0.008, 4, 14),
          second,
          side * 0.204,
          -0.01,
          0,
        ).rotation.y = Math.PI / 2
      }
      kit.put(head, new TorusGeometry(0.19, 0.014, 4, 18, Math.PI), main, 0, -0.01, 0.0)
      rod(kit, head, main, [-0.19, -0.04, -0.02], [-0.13, -0.11, -0.19], 0.008, 0.007, 4)
      kit.put(head, new SphereGeometry(0.018, 8, 6), second, -0.12, -0.115, -0.2)
      break
    }
    case 'towel': {
      // A gym towel round the neck, its ends down the chest, a stripe near each end
      kit.put(torso, new TorusGeometry(0.115, 0.038, 6, 14), main, 0, 0.53, 0.0).rotation.x =
        Math.PI / 2 - 0.15
      for (const side of [-1, 1]) {
        const end = kit.put(torso, box3(0.075, 0.2, 0.028), main, side * 0.07, 0.42, -0.135)
        end.rotation.set(-0.15, 0, side * 0.05)
        kit
          .put(torso, box3(0.077, 0.022, 0.03), second, side * 0.072, 0.36, -0.145)
          .rotation.set(-0.15, 0, side * 0.05)
      }
      break
    }
  }
  return { swings }
}
