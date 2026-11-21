// The sunset song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// The harbour, the fort: a sunset groove, laid back, with a lilt
import type { Song } from '../songs.ts'
import { MAJOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'sine',
    bassCutoff: 700,
    lead: 'square',
    leadRing: 0,
    pad: 'triangle',
    padCutoff: 1800,
    chord: 'seventh',
    swing: 0.14,
    echo: 0.3,
  },
}
