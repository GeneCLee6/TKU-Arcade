// The ridge song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// Guanyin's hill road, the Datun ridge: a mountain-road rock, power chords and a driving bass
import type { Song } from '../songs.ts'
import { MINOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'sawtooth',
    bassCutoff: 650,
    lead: 'sawtooth',
    leadRing: 0,
    pad: 'sawtooth',
    padCutoff: 1600,
    chord: 'power',
    perc: 'tom',
    echo: 0.2,
  },
}
