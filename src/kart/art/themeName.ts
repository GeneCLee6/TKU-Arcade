// Which sky and light a track is drawn in, by name (trackArt.ts's `themeOf` reads it; so does the
// race room's waiting room for its backdrop, 2026-11-21, which must not bring three.js with it).
// A track from the editor names its own; the harbour is a sunset, the campus a clear morning, the
// old street a night market and every other track a sunny afternoon.
import type { Track, TrackThemeName } from '../../../shared/kart/track.ts'
import { forwardId } from '../../../shared/kart/tracks/reverseId.ts'

export const themeNameOf = (track: Pick<Track, 'id' | 'theme'>): TrackThemeName =>
  track.theme ??
  // A reversed track (2026-11-23) is drawn as its original is
  (forwardId(track.id) === 'harbour'
    ? 'sunset'
    : forwardId(track.id) === 'tamkang'
      ? 'campus'
      : forwardId(track.id) === 'oldstreet'
        ? 'night'
        : 'day')
