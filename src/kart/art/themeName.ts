// Which sky and light a track is drawn in, by name (trackArt.ts's `themeOf` reads it; so does the
// race room's waiting room for its backdrop, 2026-11-21, which must not bring three.js with it).
// A track from the editor names its own; the harbour is a sunset, the campus a clear morning, the
// old street a night market and every other track a sunny afternoon.
import type { Track, TrackThemeName } from '../../../shared/kart/track.ts'

export const themeNameOf = (track: Pick<Track, 'id' | 'theme'>): TrackThemeName =>
  track.theme ??
  (track.id === 'harbour'
    ? 'sunset'
    : track.id === 'tamkang'
      ? 'campus'
      : track.id === 'oldstreet'
        ? 'night'
        : 'day')
