// The breeze song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// Golden Riverbank, the mangroves: light and bright. D major, a skipping bass, off-beat hats
import type { Song } from '../songs.ts'
import { MAJOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'triangle',
    bassCutoff: 900,
    lead: 'triangle',
    leadRing: 0.32,
    pad: 'sawtooth',
    padCutoff: 1400,
    perc: 'clap',
    echo: 0.25,
  },
}
