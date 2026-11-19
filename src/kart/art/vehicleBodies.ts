// 2026-11-19: every vehicle's body, by its id (shared/kart/karts.ts): the six karts of e10-t05
// (kartBodies.ts), the eight karts added with the series (moreBodies.ts) and the three bikes
// (bikeBodies.ts). All our own shapes, made in code from kartParts.ts.
import type { Object3D } from 'three'
import type { KartId } from '../../../shared/kart/karts.ts'
import { BIKE_BODIES } from './bikeBodies.ts'
import { FIRST_BODIES } from './kartBodies.ts'
import type { BodyFit, BodyKit } from './kartParts.ts'
import { MORE_BODIES } from './moreBodies.ts'

const BODIES: Readonly<Record<KartId, (kit: BodyKit, chassis: Object3D) => BodyFit>> = {
  ...FIRST_BODIES,
  ...MORE_BODIES,
  ...BIKE_BODIES,
}

/** Builds `body` onto `chassis` */
export const buildKartBody = (body: KartId, kit: BodyKit, chassis: Object3D): BodyFit =>
  BODIES[body](kit, chassis)
