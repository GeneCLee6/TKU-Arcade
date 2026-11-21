// 2026-11-19: every vehicle's body, by its id (shared/kart/karts.ts): the six karts of e10-t05
// (kartBodies.ts), the eight karts added with the series (moreBodies.ts) and the three bikes
// (bikeBodies.ts), and (2026-11-20) the item series' three (itemBodies.ts). All our own shapes, made
// in code from kartParts.ts.
//
// 2026-11-21 (docs/ARCHITECTURE.md §4.52): the first six come with the engine (the default kart is
// one of them, and the others build on their parts); the other three families are each a lazy chunk,
// fetched for the vehicles a race has in it (bodyLoad.ts). A body asked for before its family is here
// is drawn as the default kart: Scene.ts draws it again once the family has come.
import type { Object3D } from 'three'
import { DEFAULT_KART, type KartId } from '../../../shared/kart/karts.ts'
import { bodyMakers } from './bodyLoad.ts'
import { FIRST_BODIES } from './kartBodies.ts'
import type { BodyFit, BodyKit } from './kartParts.ts'

bodyMakers.add(FIRST_BODIES)

/** Whether `body` can be built now (its family is here) */
export const bodyReady = (body: KartId): boolean => bodyMakers.get(body) !== undefined

/** Builds `body` onto `chassis`; the default kart while its family is still on the way */
export const buildKartBody = (body: KartId, kit: BodyKit, chassis: Object3D): BodyFit =>
  (bodyMakers.get(body) ?? bodyMakers.get(DEFAULT_KART)!)(kit, chassis)
