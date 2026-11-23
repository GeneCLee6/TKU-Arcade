// 2026-11-23 (docs/KART-WORLD.md §3.2, shared/kart/outfits.ts): what each outfit adds to the driver
// beyond its colours (kartTokens.ts's kartOutfits): a coat's tails and lapels, a hoodie's hood and
// pocket, a vest's pockets, a tracksuit's stripes, a club jacket's bands and patch, a blazer's lapels
// and tie, a jersey's number. The race suit's own parts (harness, armour, knee pads) stay in
// driverModel.ts. All ours, made in code.
import { BoxGeometry, Object3D, TorusGeometry, type Material } from 'three'
import { hull, wedge, type BodyKit } from './kartParts.ts'
import { rod } from './driverHelmets.ts'
import type { OutfitCut } from './driverLooks.ts'

export interface OutfitPaint {
  readonly body: Material
  readonly panel: Material
  readonly trim: Material
  readonly accent: Material
}

export interface OutfitFrame {
  /** The torso's outer parts (scaled to the driver's build) */
  readonly torso: Object3D
  /** Each upper arm's and forearm's bone, left then right, and each thigh's and shin's */
  readonly arms: readonly Object3D[]
  readonly elbows: readonly Object3D[]
  readonly hips: readonly Object3D[]
  readonly knees: readonly Object3D[]
  readonly upperArm: number
  readonly forearm: number
  readonly thigh: number
  readonly shin: number
}

const box = (w: number, h: number, l: number) => new BoxGeometry(w, h, l)

/** A ribbed band round the trunk at `y`, `w` across and `d` deep */
function band(
  kit: BodyKit,
  parent: Object3D,
  material: Material,
  y: number,
  w: number,
  d: number,
  h = 0.04,
): void {
  kit.put(
    parent,
    hull([
      { z: y - h / 2, w, top: d, bottom: d },
      { z: y + h / 2, w, top: d, bottom: d },
    ]).rotateX(-Math.PI / 2),
    material,
  )
}

/**
 * What `cut` adds, on `frame`'s torso and limbs. `full` the detail beyond the outline (pockets,
 * strings, buttons); `decal` the racing number, for a jersey's front
 */
export function dressCut(
  kit: BodyKit,
  frame: OutfitFrame,
  cut: OutfitCut,
  paint: OutfitPaint,
  full: boolean,
): void {
  const { torso } = frame
  switch (cut) {
    case 'suit':
      return
    case 'coat': {
      // A long coat: its tails down over the seat behind, its lapels open on the chest
      for (const side of [-1, 1]) {
        const tail = kit.put(torso, box(0.15, 0.3, 0.025), paint.body, side * 0.08, -0.06, 0.11)
        tail.rotation.set(0.28, 0, side * 0.06)
        kit
          .put(torso, wedge(0.03, 0.2, 0.012, 0.03), paint.panel, side * 0.06, 0.43, -0.118)
          .rotation.set(-0.3, 0, side * 0.35)
      }
      band(kit, torso, paint.body, 0.06, 0.18, 0.12, 0.08)
      if (full)
        for (const y of [0.18, 0.28])
          kit.put(torso, box(0.018, 0.018, 0.01), paint.trim, 0.03, y, -0.12)
      return
    }
    case 'hoodie': {
      // The hood bunched behind the neck, a pocket across the front, the strings hanging
      kit.put(
        torso,
        hull([
          { z: 0.04, w: 0.06, top: 0.05, bottom: 0.03 },
          { z: 0.12, w: 0.13, top: 0.08, bottom: 0.05 },
          { z: 0.19, w: 0.1, top: 0.06, bottom: 0.04 },
        ]),
        paint.body,
        0,
        0.52,
        0,
      ).rotation.x = -0.25
      kit.put(torso, box(0.2, 0.09, 0.02), paint.panel, 0, 0.17, -0.112)
      band(kit, torso, paint.panel, 0.04, 0.176, 0.118)
      if (full) {
        for (const side of [-1, 1])
          rod(
            kit,
            torso,
            paint.trim,
            [side * 0.035, 0.52, -0.1],
            [side * 0.04, 0.38, -0.13],
            0.006,
            0.006,
            4,
          )
      }
      return
    }
    case 'vest': {
      // A vest over the long sleeve: a shell over the chest, pockets on it
      kit.put(
        torso,
        hull([
          { z: 0.06, w: 0.18, top: 0.12, bottom: 0.12 },
          { z: 0.22, w: 0.16, top: 0.108, bottom: 0.1 },
          { z: 0.4, w: 0.185, top: 0.128, bottom: 0.108 },
          { z: 0.48, w: 0.16, top: 0.1, bottom: 0.1 },
        ]).rotateX(-Math.PI / 2),
        paint.body,
      )
      for (const side of [-1, 1]) {
        for (const y of full ? [0.17, 0.33] : [0.25]) {
          kit.put(torso, box(0.07, 0.07, 0.02), paint.panel, side * 0.07, y, -0.13)
        }
      }
      return
    }
    case 'tracksuit': {
      // Two stripes down the outside of each arm and leg, a zip up the front
      for (const [index, arm] of frame.arms.entries()) {
        const side = index === 0 ? -1 : 1
        rod(
          kit,
          arm,
          paint.trim,
          [side * 0.055, -0.1, 0],
          [side * 0.05, -frame.upperArm, 0],
          0.008,
          0.008,
          4,
        )
        rod(
          kit,
          frame.elbows[index]!,
          paint.trim,
          [side * 0.048, 0, 0],
          [side * 0.042, -frame.forearm + 0.1, 0],
          0.008,
          0.008,
          4,
        )
      }
      for (const [index, hip] of frame.hips.entries()) {
        const side = index === 0 ? -1 : 1
        rod(
          kit,
          hip,
          paint.trim,
          [side * 0.082, -0.02, 0],
          [side * 0.066, -frame.thigh, 0],
          0.009,
          0.009,
          4,
        )
        rod(
          kit,
          frame.knees[index]!,
          paint.trim,
          [side * 0.062, 0, 0],
          [side * 0.048, -frame.shin + 0.05, 0],
          0.009,
          0.009,
          4,
        )
      }
      rod(kit, torso, paint.trim, [0, 0.1, -0.118], [0, 0.5, -0.1], 0.005, 0.005, 4)
      band(kit, torso, paint.panel, 0.04, 0.176, 0.118)
      return
    }
    case 'varsity':
    case 'jersey': {
      // A club jacket or a sports top: ribbed bands at the neck and the hem, the cuffs; a jacket a
      // patch on the chest, a top its number big on the front
      band(kit, torso, paint.panel, 0.05, 0.178, 0.12, 0.06)
      kit.put(torso, new TorusGeometry(0.075, 0.02, 4, 14), paint.panel, 0, 0.53, 0).rotation.x =
        Math.PI / 2
      for (const elbow of frame.elbows) {
        kit.put(
          elbow,
          new TorusGeometry(0.044, 0.014, 4, 10),
          paint.panel,
          0,
          -frame.forearm + 0.12,
          0,
        ).rotation.x = Math.PI / 2
      }
      if (cut === 'varsity') {
        kit.put(torso, box(0.08, 0.09, 0.012), paint.accent, 0.07, 0.36, -0.124)
        if (full)
          for (const y of [0.15, 0.25, 0.35])
            kit.put(torso, box(0.016, 0.016, 0.01), paint.trim, 0, y, -0.121)
      } else {
        const front = kit.decal(torso, 'number', 0.2, 0.1, 0, 0.27, -0.121, 'back')
        if (front) front.rotation.set(0, Math.PI, 0)
        kit.put(torso, wedge(0.07, 0.02, 0.08, 0.01), paint.accent, 0, 0.5, -0.11).rotation.x =
          Math.PI / 2
      }
      return
    }
    case 'blazer': {
      // Lapels piped in the panel's colour, a tie, a breast pocket, buttons
      for (const side of [-1, 1]) {
        kit
          .put(torso, wedge(0.035, 0.22, 0.012, 0.035), paint.body, side * 0.055, 0.4, -0.12)
          .rotation.set(-0.25, 0, side * 0.3)
        rod(
          kit,
          torso,
          paint.panel,
          [side * 0.02, 0.29, -0.125],
          [side * 0.09, 0.5, -0.1],
          0.005,
          0.005,
          3,
        )
      }
      kit.put(torso, wedge(0.03, 0.02, 0.2, 0.08), paint.accent, 0, 0.3, -0.12).rotation.x =
        -Math.PI / 2
      kit.put(torso, box(0.065, 0.012, 0.012), paint.panel, -0.08, 0.38, -0.123)
      band(kit, torso, paint.body, 0.05, 0.18, 0.12, 0.06)
      if (full)
        for (const y of [0.13, 0.21])
          kit.put(torso, box(0.016, 0.016, 0.01), paint.panel, 0.03, y, -0.122)
      return
    }
  }
}
