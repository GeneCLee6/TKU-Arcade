// The lounge song (songs.ts): a lazy chunk of its own, fetched for a track that plays it
// The menus and the results: quiet, slow, seventh chords and a soft arpeggio
import type { Song } from '../songs.ts'
import { MAJOR } from './scales.ts'

export const SONG: Song = {
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
  sound: {
    bass: 'sine',
    bassCutoff: 600,
    lead: 'triangle',
    leadRing: 0.9,
    pad: 'triangle',
    padCutoff: 1100,
    chord: 'seventh',
    arp: 'triangle',
    swing: 0.12,
    echo: 0.4,
  },
}
