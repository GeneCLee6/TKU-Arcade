// A computer kart's look when the host adds one to a race room: any kart, any driver (2026-11-23:
// in any of their outfits, shared/kart/outfits.ts)
import { DRIVER_IDS, KART_IDS, lookOf } from '../../../shared/kart/karts.ts'
import { OUTFIT_IDS } from '../../../shared/kart/outfits.ts'

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T

export const randomLook = (): string => lookOf(pick(KART_IDS), pick(DRIVER_IDS), pick(OUTFIT_IDS))
