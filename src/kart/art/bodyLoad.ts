// 2026-11-21 (docs/ARCHITECTURE.md §4.52): which family each vehicle's body is in, and fetching a
// family. The first six (kartBodies.ts) come with the engine; the others are a lazy chunk a family
// (vehicleBodies.ts). No three.js here at runtime, so that a loading screen or a waiting room can
// fetch the bodies alongside the engine rather than after it.
import type { Object3D } from 'three'
import type { KartId } from '../../../shared/kart/karts.ts'
import type { BodyFit, BodyKit } from './kartParts.ts'

export type BodyMaker = (kit: BodyKit, chassis: Object3D) => BodyFit
export type BodyFamily = 'first' | 'more' | 'bike' | 'item' | 'flagship'

/** Each vehicle's family (a test holds it to the files' own lists) */
export const BODY_FAMILY: Readonly<Record<KartId, BodyFamily>> = {
  tide: 'first',
  comet: 'first',
  ray: 'first',
  crab: 'first',
  heron: 'first',
  flyfish: 'first',
  dolphin: 'more',
  skipper: 'more',
  shrimp: 'more',
  marlin: 'more',
  eel: 'more',
  squid: 'more',
  hermit: 'more',
  whale: 'more',
  swift: 'bike',
  hornet: 'bike',
  petrel: 'bike',
  pelican: 'item',
  otter: 'item',
  cormorant: 'item',
  // 2026-11-21: the season flagships (flagshipBodies.ts)
  kite: 'flagship',
}

const LOADERS: Readonly<
  Record<Exclude<BodyFamily, 'first'>, () => Promise<Partial<Record<KartId, BodyMaker>>>>
> = {
  more: () => import('./moreBodies.ts').then((family) => family.MORE_BODIES),
  bike: () => import('./bikeBodies.ts').then((family) => family.BIKE_BODIES),
  item: () => import('./itemBodies.ts').then((family) => family.ITEM_BODIES),
  flagship: () => import('./flagshipBodies.ts').then((family) => family.FLAGSHIP_BODIES),
}

const makers = new Map<KartId, BodyMaker>()
const loading = new Map<BodyFamily, Promise<void>>()

/** The bodies that can be built now: vehicleBodies.ts adds the first six, a family adds its own */
export const bodyMakers = {
  get: (body: KartId): BodyMaker | undefined => makers.get(body),
  add(family: Partial<Record<KartId, BodyMaker>>): void {
    for (const [body, make] of Object.entries(family) as [KartId, BodyMaker][])
      makers.set(body, make)
  },
}

/** The families `bodies` need that the engine does not bring */
export const familiesOf = (bodies: readonly KartId[]): Exclude<BodyFamily, 'first'>[] => [
  ...new Set(
    bodies
      .map((body) => BODY_FAMILY[body])
      .filter(
        (family): family is Exclude<BodyFamily, 'first'> =>
          family !== 'first' && family !== undefined,
      ),
  ),
]

const firstOf = (family: BodyFamily): KartId =>
  (Object.keys(BODY_FAMILY) as KartId[]).find((body) => BODY_FAMILY[body] === family)!

/** Whether `family` is here */
export const familyLoaded = (family: BodyFamily): boolean => makers.has(firstOf(family))

/** Whether every one of `bodies` can be built without fetching anything but the engine */
export const bodiesLoaded = (bodies: readonly KartId[]): boolean =>
  familiesOf(bodies).every(familyLoaded)

/** Fetches one family, once; a failed fetch is forgotten, so that asking again tries again */
export function loadBodyFamily(family: Exclude<BodyFamily, 'first'>): Promise<void> {
  if (familyLoaded(family)) return Promise.resolve()
  let pending = loading.get(family)
  if (!pending) {
    pending = LOADERS[family]().then(
      (bodies) => {
        bodyMakers.add(bodies)
        loading.delete(family)
      },
      (error: unknown) => {
        loading.delete(family)
        throw error
      },
    )
    loading.set(family, pending)
  }
  return pending
}

/** Fetches the families `bodies` are in */
export const loadBodies = (bodies: readonly KartId[]): Promise<void> =>
  Promise.all(familiesOf(bodies).map(loadBodyFamily)).then(() => undefined)
