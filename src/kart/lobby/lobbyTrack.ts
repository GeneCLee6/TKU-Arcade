// 2026-11-21: the race room's track for its waiting room (KartLobby.tsx, TrackCard.tsx): the id the
// race is run on, and the track itself, from its own chunk (the race needs it a moment later anyway)
import { useEffect, useState } from 'react'
import { CUSTOM_TRACK } from '../../../shared/games/kart/info.ts'
import type { OptionValues } from '../../../shared/games/types.ts'
import type { Track } from '../../../shared/kart/track.ts'

/** The id the race is run on: a built-in track, or `custom:<code>` (shared/kart/tracks/registry.ts) */
export const raceTrackId = (options: OptionValues): string => {
  const track = String(options.track ?? '')
  return track === CUSTOM_TRACK ? `custom:${String(options.custom ?? '')}` : track
}

/** The room's track, once its chunk has come; null before, or for one that is not a track */
export function useLobbyTrack(id: string): Track | null {
  const [track, setTrack] = useState<{ id: string; track: Track | null } | null>(null)
  useEffect(() => {
    let live = true
    void import('../../../shared/kart/tracks/registry.ts').then(
      ({ raceTrack }) => {
        if (live) setTrack({ id, track: raceTrack(id) })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [id])
  return track?.id === id ? track.track : null
}

