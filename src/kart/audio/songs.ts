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

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]

export const SONGS: Record<SongId, Song> = {
  // Golden Riverbank, the mangroves: light and bright. D major, a skipping bass, off-beat hats
  breeze: {
    bpm: 124,
    root: 62,
    scale: MAJOR,
    chords: [0, 4, 5, 3],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...xx',
    bass: '0..0..4.0..7..4.',
    lead: ['7.9.b-9.7-4-....', '8.6.4-6.8-b-....', '9.7.5-7.9-c-b-9-', 'a-9-7-5-7-------'],
    leadOctave: 0,
    bassOctave: 1,
    sound: { bass: 'triangle', bassCutoff: 900, lead: 'triangle', leadRing: 0.32, pad: 'sawtooth', padCutoff: 1400, perc: 'clap', echo: 0.25 },
  },
  // The harbour, the fort: a sunset groove, laid back, with a lilt
  sunset: {
    bpm: 108,
    root: 55,
    scale: MAJOR,
    chords: [0, 3, 1, 4],
    kick: 'x.....x...x.....',
    snare: '....x.......x..x',
    hat: 'x.x.x.x.x.x.x.xo',
    bass: '0..0..4.7..4..2.',
    lead: ['....4-7-9---7-4-', '5-7-a---c-a-7---', '....8-5-3---5-8-', '6-8-b---8-6-4---'],
    leadOctave: 1,
    bassOctave: 1,
    sound: { bass: 'sine', bassCutoff: 700, lead: 'square', leadRing: 0, pad: 'triangle', padCutoff: 1800, chord: 'seventh', swing: 0.14, echo: 0.3 },
  },
  // The old street's night market, Danhai's night town: an electronic city, an arpeggio racing on
  neon: {
    bpm: 128,
    root: 57,
    scale: MINOR,
    chords: [0, 5, 2, 6],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'xxoxxxoxxxoxxxox',
    bass: '0.7.0.7.0.7.0.7.',
    arp: '0247024702470247',
    lead: ['7---9-b-9-7-4---', '9---7-5-7-------', '6---9-6-4-2-4---', '8---a-8-6-------'],
    leadOctave: 0,
    bassOctave: 1,
    sound: { bass: 'sawtooth', bassCutoff: 520, lead: 'sawtooth', leadRing: 0, pad: 'sawtooth', padCutoff: 900, arp: 'square', perc: 'clap', echo: 0.35 },
  },
  // The hillside lanes, the campus: a folk tune on the pentatonic notes, a woodblock and a big drum
  folk: {
    bpm: 100,
    root: 60,
    scale: MAJOR,
    chords: [0, 5, 3, 4],
    kick: 'x.......x.x.....',
    snare: '................',
    hat: '....x.......x...',
    perc: 'x..x..x.x..x..x.',
    bass: '0...4...0...4...',
    lead: ['7.9.7.4.2...4.2.', '5...7.9.c...9.7.', '5.7.5.2.0...2...', '4.5.4.1.4-------'],
    leadOctave: 0,
    bassOctave: 1,
    sound: { bass: 'triangle', bassCutoff: 800, lead: 'triangle', leadRing: 0.4, pad: 'triangle', padCutoff: 1200, perc: 'wood', echo: 0.2 },
  },
  // The viaduct works, the wharf: an industrial beat, a phrygian growl, a clank on the off-beats
  steel: {
    bpm: 116,
    root: 52,
    scale: PHRYGIAN,
    chords: [0, 0, 1, 6],
    kick: 'x..x..x.x..x....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    perc: '..x.......x..x..',
    bass: '0.00..0.00..0.1.',
    lead: ['7-------8---7---', '5-----3-1-------', '8-------a---8---', '6-----5-3-------'],
    leadOctave: 1,
    bassOctave: 1,
    sound: { bass: 'square', bassCutoff: 420, lead: 'square', leadRing: 0, pad: 'sawtooth', padCutoff: 700, perc: 'metal', echo: 0.3 },
  },
  // Guanyin's hill road, the Datun ridge: a mountain-road rock, power chords and a driving bass
  ridge: {
    bpm: 140,
    root: 52,
    scale: MINOR,
    chords: [0, 5, 6, 0],
    kick: 'x.x...x.x.x...x.',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    perc: '...............x',
    bass: '0.0.0.0.0.0.4.7.',
    lead: ['7-7-9-a-b---9-7-', '9---7-5-7-------', 'a---8-6-8-a-b-a-', '7-------9-7-4-2-'],
    leadOctave: 1,
    bassOctave: 1,
    sound: { bass: 'sawtooth', bassCutoff: 650, lead: 'sawtooth', leadRing: 0, pad: 'sawtooth', padCutoff: 1600, chord: 'power', perc: 'tom', echo: 0.2 },
  },
  // The menus and the results: quiet, slow, seventh chords and a soft arpeggio
  lounge: {
    bpm: 82,
    root: 53,
    scale: MAJOR,
    chords: [0, 3, 5, 4],
    kick: 'x.......x.......',
    snare: '................',
    hat: '..x...x...x...x.',
    bass: '0.......4.......',
    arp: '0.2.4.6.7.6.4.2.',
    lead: ['........9-----7-', '5---------------', '........b-----9-', '8-------........'],
    leadOctave: 1,
    bassOctave: 1,
    sound: { bass: 'sine', bassCutoff: 600, lead: 'triangle', leadRing: 0.9, pad: 'triangle', padCutoff: 1100, chord: 'seventh', arp: 'triangle', swing: 0.12, echo: 0.4 },
  },
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
