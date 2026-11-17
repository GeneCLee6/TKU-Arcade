// The kart and driver a player races with (owner 2026-11-14; e10-t05): six karts and four drivers
// of our own (shared/kart/karts.ts), kept in this browser (storage.ts never throws) and used on
// /kart and in a room. Working names until KART-WORLD.md (e10-t01). Everything is open: unlocking
// (e10-t06) waits for F2.
import {
  DEFAULT_DRIVER,
  DEFAULT_KART,
  DRIVER_IDS,
  isDriverId,
  isKartId,
  KART_IDS,
  type DriverId,
  type KartId,
} from '../../shared/kart/karts.ts'
import { readStored, writeStored } from '../lib/storage.ts'

export type KartBody = KartId
export const KART_BODIES: readonly KartBody[] = KART_IDS
export const KART_DRIVERS: readonly DriverId[] = DRIVER_IDS

const BODY_KEY = 'tku-arcade.kart.body'
const DRIVER_KEY = 'tku-arcade.kart.driver'

export function loadBody(): KartBody {
  const stored = readStored(BODY_KEY)
  return isKartId(stored) ? stored : DEFAULT_KART
}

export const saveBody = (body: KartBody): void => writeStored(BODY_KEY, body)

export function loadDriver(): DriverId {
  const stored = readStored(DRIVER_KEY)
  return isDriverId(stored) ? stored : DEFAULT_DRIVER
}

export const saveDriver = (driver: DriverId): void => writeStored(DRIVER_KEY, driver)
