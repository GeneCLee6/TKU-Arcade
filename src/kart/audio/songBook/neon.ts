// The neon song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// The old street's night market, Danhai's night town: an electronic city, an arpeggio racing on
import type { Song } from '../songs.ts'
import { MINOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'sawtooth',
    bassCutoff: 520,
    lead: 'sawtooth',
    leadRing: 0,
    pad: 'sawtooth',
    padCutoff: 900,
    arp: 'square',
    perc: 'clap',
    echo: 0.35,
  },
}
