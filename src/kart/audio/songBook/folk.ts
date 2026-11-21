// The folk song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// The hillside lanes, the campus: a folk tune on the pentatonic notes, a woodblock and a big drum
import type { Song } from '../songs.ts'
import { MAJOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'triangle',
    bassCutoff: 800,
    lead: 'triangle',
    leadRing: 0.4,
    pad: 'triangle',
    padCutoff: 1200,
    perc: 'wood',
    echo: 0.2,
  },
}
