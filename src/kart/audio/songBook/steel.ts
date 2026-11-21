// The steel song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// The viaduct works, the wharf: an industrial beat, a phrygian growl, a clank on the off-beats
import type { Song } from '../songs.ts'
import { PHRYGIAN } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'square',
    bassCutoff: 420,
    lead: 'square',
    leadRing: 0,
    pad: 'sawtooth',
    padCutoff: 700,
    perc: 'metal',
    echo: 0.3,
  },
}
