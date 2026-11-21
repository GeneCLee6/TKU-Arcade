// 2026-11-20 (§4.46): the kart's soundtrack, as data: a song per kind of track and a quiet one for the
// menus, each a few bars of patterns that a small sequencer (sequencer.ts) loops and a few
// synthesisers (musicPlayer.ts) play. All of it written here, for this game: no melody, beat or sound
// is taken from any game's music (CLAUDE.md rule 1, docs/IP-CHECKLIST.md). A few hundred bytes each.
//
// The patterns are 16 steps to a bar (sixteenth notes), one character a step:
// - drums: `x` a hit, `o` an open hi-hat (in `hat`), `.` nothing
// - `bass` and `arp`: a degree of the scale counted from the bar's chord (`0` its root, `2` its
//   third, `4` its fifth, `7` its octave), `-` holds the note before, `.` rests
// - `lead`: a degree of the scale from the key's root, `0`-`9` then `a`-`f` for 10-15, a bar a string
import type { RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import type { TrackThemeName } from '../../../shared/kart/track.ts'

export type SongId = 'breeze' | 'sunset' | 'neon' | 'folk' | 'steel' | 'ridge' | 'lounge'
export type PercKind = 'wood' | 'tom' | 'metal' | 'clap'

export interface SongSound {
  readonly bass: OscillatorType
  /** The bass's low-pass, Hz */
  readonly bassCutoff: number
  readonly lead: OscillatorType
  /** How long a lead note rings, s: a pluck; 0 holds it for its length */
  readonly leadRing: number
  readonly pad: OscillatorType
  /** The pad's low-pass, Hz */
  readonly padCutoff: number
  /** The pad plays root, fifth and octave (rock), or adds the seventh (lounge); a triad otherwise */
  readonly chord?: 'power' | 'seventh'
  readonly arp?: OscillatorType
  readonly perc?: PercKind
  /** How late every second sixteenth comes, as a share of a step: a lilt */
  readonly swing?: number
  /** How much of the lead comes back off the echo, 0 to 1 */
  readonly echo?: number
}

export interface Song {
  readonly bpm: number
  /** The key's root as a MIDI note */
  readonly root: number
  /** Semitones of each degree above the root */
  readonly scale: readonly number[]
  /** Each bar's chord as a degree of the scale, round and round */
  readonly chords: readonly number[]
  readonly kick: string
  readonly snare: string
  readonly hat: string
  readonly perc?: string
  readonly bass: string
  readonly arp?: string
  /** One string a bar; bars loop with the chords */
  readonly lead: readonly string[]
  /** The lead sounds this many octaves above the root */
  readonly leadOctave: number
  /** The bass this many octaves below it */
  readonly bassOctave: number
  readonly sound: SongSound
}

/** Every song, the menus' quiet one last */
export const SONG_IDS: readonly SongId[] = ['breeze', 'sunset', 'neon', 'folk', 'steel', 'ridge', 'lounge']

// 2026-11-21 (docs/ARCHITECTURE.md §4.52): each song is a lazy chunk of its own (songBook/), fetched
// for the track that plays it (the loading screen, useMenuMusic.ts); musicPlayer.ts starts a song once
// it is here
const LOADERS: Readonly<Record<SongId, () => Promise<{ readonly SONG: Song }>>> = {
  breeze: () => import('./songBook/breeze.ts'),
  sunset: () => import('./songBook/sunset.ts'),
  neon: () => import('./songBook/neon.ts'),
  folk: () => import('./songBook/folk.ts'),
  steel: () => import('./songBook/steel.ts'),
  ridge: () => import('./songBook/ridge.ts'),
  lounge: () => import('./songBook/lounge.ts'),
}
const loadedSongs = new Map<SongId, Song>()
const loadingSongs = new Map<SongId, Promise<Song>>()

/** `id` if it is here; null while it is not */
export const loadedSong = (id: SongId): Song | null => loadedSongs.get(id) ?? null

/** Fetches `id`, once; a failed fetch is forgotten, so that asking again tries again */
export function loadSong(id: SongId): Promise<Song> {
  const done = loadedSongs.get(id)
  if (done) return Promise.resolve(done)
  let pending = loadingSongs.get(id)
  if (!pending) {
    pending = LOADERS[id]().then(
      ({ SONG }) => {
        loadedSongs.set(id, SONG)
        loadingSongs.delete(id)
        return SONG
      },
      (error: unknown) => {
        loadingSongs.delete(id)
        throw error
      },
    )
    loadingSongs.set(id, pending)
  }
  return pending
}

/** Each race track's song (docs/KART-WORLD.md §6.3) */
export const TRACK_SONGS: Record<RaceTrackId, SongId> = {
  riverside: 'breeze',
  mangrove: 'breeze',
  harbour: 'sunset',
  fort: 'sunset',
  oldstreet: 'neon',
  danhai: 'neon',
  tamkang: 'folk',
  lanes: 'folk',
  wharf: 'steel',
  works: 'steel',
  guanyin: 'ridge',
  datun: 'ridge',
}

/** A track made in the editor, or a test one, goes by its sky */
const THEME_SONGS: Record<TrackThemeName, SongId> = {
  day: 'breeze',
  sunset: 'sunset',
  campus: 'folk',
  night: 'neon',
}

export function songFor(track: { readonly id: string; readonly theme?: TrackThemeName } | null): SongId {
  if (!track) return 'lounge'
  const own = (TRACK_SONGS as Record<string, SongId | undefined>)[track.id]
  return own ?? THEME_SONGS[track.theme ?? 'day']
}
