// The race room's pick of kart and driver (e10-t05; a hook of its own since 2026-11-21, when the
// waiting room's garage became a dialog, so that the room hears the pick whether it is open or not)
import { useEffect, useState } from 'react'
import { isKartId, lookOf, parseLook, type DriverId, type KartId } from '../../../shared/kart/karts.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import type { OutfitId } from '../../../shared/kart/outfits.ts'
import { loadBody, loadDriver, loadOutfit, saveBody, saveDriver, saveOutfit } from '../bodies.ts'
import { prefetchKart, RACE_ENGINE } from '../load/kartLoad.ts'

export interface RoomLook {
  kart: KartId
  driver: DriverId
  /** 2026-11-23 (shared/kart/outfits.ts): what the driver wears, kept per driver */
  outfit: OutfitId
  setKart(kart: KartId): void
  setDriver(driver: DriverId): void
  setOutfit(outfit: OutfitId): void
}

/**
 * This browser's pick, told to the room on arrival and after every change (and again after a
 * reconnect, should the room have missed it). `track`, once picked (docs/ARCHITECTURE.md §4.52):
 * its race (the engine, the track's scenery, the karts picked, the song) is fetched in the
 * background meanwhile
 */
export function useRoomLook(
  members: Record<string, RoomMember>,
  you: string,
  onSetLook: (look: string | null) => void,
  track?: string,
): RoomLook {
  const [kart, setKart] = useState<KartId>(loadBody)
  const [driver, setDriver] = useState<DriverId>(loadDriver)
  const [outfit, setOutfit] = useState<OutfitId>(() => loadOutfit(loadDriver()))
  const mine = members[you]?.look
  const look = lookOf(kart, driver, outfit)
  useEffect(() => {
    if (members[you] && mine !== look) onSetLook(look)
  }, [members, you, mine, look, onSetLook])

  const seated = Object.values(members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const grid = [kart, ...seated.map((member) => parseLook(member.look)?.kart)].join()
  useEffect(() => {
    if (!track) return
    const bodies = grid.split(',').filter(isKartId)
    prefetchKart({ engine: RACE_ENGINE, track: { id: track }, bodies, music: true })
  }, [track, grid])

  return {
    kart,
    driver,
    outfit,
    setKart(next) {
      saveBody(next)
      setKart(next)
    },
    setDriver(next) {
      saveDriver(next)
      setDriver(next)
      // Each driver in what they wore last
      setOutfit(loadOutfit(next))
    },
    setOutfit(next) {
      saveOutfit(driver, next)
      setOutfit(next)
    },
  }
}

