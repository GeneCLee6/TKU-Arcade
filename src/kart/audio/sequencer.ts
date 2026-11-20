// 2026-11-20 (§4.46): the soundtrack's logic, pure so that a test can read it: which part of a song
// plays when (the countdown's intro, the race, the final lap, the finish's ending, the menus' quiet
// song), what each part lets through, when each sixteenth falls, and the notes of the patterns in
// songs.ts. musicPlayer.ts turns it into sound.
import type { Song } from './songs.ts'

/**
 * - `intro`: the countdown and the fly round the grid: the pad, the bass on the beat, the hats, all
 *   behind a closed filter
 * - `race`: the whole band
 * - `final`: the last lap: faster, a second lead an octave up, the hats doubled
 * - `outro`: the finish's show: a last chord rings out, then nothing
 * - `menu`: the results and the menus: the quiet song
 */
export type MusicSection = 'silent' | 'intro' | 'race' | 'final' | 'outro' | 'menu'

/** What the race is doing, as the music cares */
export interface MusicCue {
  readonly phase: 'none' | 'countdown' | 'racing' | 'finished'
  /** On the last lap of more than one */
  readonly finalLap: boolean
  /** The finish's show still on (spikeLoop.ts's CELEBRATE_SECONDS) */
  readonly celebrating: boolean
}

export function sectionFor(cue: MusicCue): MusicSection {
  switch (cue.phase) {
    case 'countdown':
      return 'intro'
    case 'racing':
      return cue.finalLap ? 'final' : 'race'
    case 'finished':
      return cue.celebrating ? 'outro' : 'menu'
    case 'none':
      return 'menu'
  }
}

export interface MusicLayers {
  readonly kick: boolean
  /** Only the first beat of a bar (the intro's heartbeat) */
  readonly kickOnOne: boolean
  readonly snare: boolean
  readonly hat: boolean
  /** Every sixteenth a hat (the final lap) */
  readonly hatDoubled: boolean
  readonly perc: boolean
  readonly bass: boolean
  /** The bass only on each beat */
  readonly bassOnBeat: boolean
  readonly pad: boolean
  readonly arp: boolean
  readonly lead: boolean
  /** A second lead an octave up */
  readonly leadHigh: boolean
}

export interface MusicMix {
  readonly layers: MusicLayers
  /** The music bus's low-pass, Hz: closed in the intro, opened all the way by a boost */
  readonly cutoff: number
  /** The song's speed, times its own */
  readonly tempo: number
}

const NONE: MusicLayers = {
  kick: false,
  kickOnOne: false,
  snare: false,
  hat: false,
  hatDoubled: false,
  perc: false,
  bass: false,
  bassOnBeat: false,
  pad: false,
  arp: false,
  lead: false,
  leadHigh: false,
}
const BAND: MusicLayers = { ...NONE, kick: true, snare: true, hat: true, perc: true, bass: true, pad: true, arp: true, lead: true }

/** The filter wide open: a boost's rush (N2O) */
export const OPEN_CUTOFF = 18000
/** The race's usual filter: a little dark, so that a boost has somewhere to open to */
export const RACE_CUTOFF = 3600
export const INTRO_CUTOFF = 1100
/** The last lap's speed-up */
export const FINAL_TEMPO = 1.08

export function mixFor(section: MusicSection, boosting: boolean): MusicMix {
  switch (section) {
    case 'intro':
      return {
        layers: { ...NONE, kickOnOne: true, hat: true, bass: true, bassOnBeat: true, pad: true, arp: true },
        cutoff: INTRO_CUTOFF,
        tempo: 1,
      }
    case 'race':
      return { layers: BAND, cutoff: boosting ? OPEN_CUTOFF : RACE_CUTOFF, tempo: 1 }
    case 'final':
      return {
        layers: { ...BAND, hatDoubled: true, leadHigh: true },
        cutoff: boosting ? OPEN_CUTOFF : RACE_CUTOFF * 1.4,
        tempo: FINAL_TEMPO,
      }
    case 'menu':
      return { layers: BAND, cutoff: 6000, tempo: 1 }
    case 'outro':
    case 'silent':
      return { layers: NONE, cutoff: OPEN_CUTOFF, tempo: 1 }
  }
}

/** Whether going from one part to the next starts the song again from its first bar, on a crash */
export const restartsOn = (from: MusicSection, to: MusicSection): boolean =>
  (from === 'intro' && (to === 'race' || to === 'final')) ||
  (from !== 'menu' && to === 'menu') ||
  (from === 'race' && to === 'final')

/** One sixteenth at `bpm`, times `tempo`, in seconds */
export const stepSeconds = (bpm: number, tempo = 1): number => 60 / (bpm * tempo) / 4

/** The next sixteenth to schedule: its number from the song's start, and when its beat falls */
export interface StepClock {
  readonly step: number
  readonly at: number
}

export interface DueStep {
  readonly step: number
  /** When it sounds: on the beat, or late by the swing on every second sixteenth */
  readonly at: number
}

/**
 * Every sixteenth whose beat falls before `until`, from `clock`, each `seconds` long, and the clock
 * for the next. A clock left far behind (a tab in the background) skips to now instead of playing
 * everything it missed at once
 */
export function dueSteps(
  clock: StepClock,
  until: number,
  seconds: number,
  swing = 0,
  now = until,
): { steps: DueStep[]; next: StepClock } {
  let { step, at } = clock
  if (at < now - 0.5) at = now
  const steps: DueStep[] = []
  while (at < until) {
    steps.push({ step, at: at + (step % 2 === 1 ? swing * seconds : 0) })
    step += 1
    at += seconds
  }
  return { steps, next: { step, at } }
}

/** A pattern's character at `step` (its length loops) */
export const charAt = (pattern: string, step: number): string =>
  pattern.length === 0 ? '.' : pattern[step % pattern.length]!

/** `0`-`9` and `a`-`f` as 0-15; anything else (a rest, a hold) null */
export function degreeOf(char: string): number | null {
  const code = char.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 97 && code <= 102) return code - 87
  return null
}

/** How many steps a note starting at `index` of `pattern` lasts: itself and the holds after it */
export function lengthAt(pattern: string, index: number): number {
  let length = 1
  while (index + length < pattern.length && pattern[index + length] === '-') length++
  return length
}

/** The MIDI note of a degree of the song's scale, `octaves` up from its root */
export function degreeMidi(song: Pick<Song, 'root' | 'scale'>, degree: number, octaves = 0): number {
  const size = song.scale.length
  const within = ((degree % size) + size) % size
  return song.root + song.scale[within]! + 12 * (Math.floor(degree / size) + octaves)
}

export const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

/** The chord of the bar `step` is in */
export const chordAt = (song: Pick<Song, 'chords'>, step: number): number =>
  song.chords[Math.floor(step / 16) % song.chords.length]!

/** The degrees of a chord's notes: a triad, root-fifth-octave, or a seventh chord */
export function chordDegrees(root: number, kind?: 'power' | 'seventh'): number[] {
  if (kind === 'power') return [root, root + 4, root + 7]
  if (kind === 'seventh') return [root, root + 2, root + 4, root + 6]
  return [root, root + 2, root + 4]
}

/** A note the sequencer plays: which voice, which MIDI note, how many steps long */
export interface SongNote {
  readonly voice: 'bass' | 'arp' | 'lead' | 'leadHigh'
  readonly midi: number
  readonly steps: number
}

/** The pitched notes that start on `step` of `song` with these layers on */
export function notesAt(song: Song, step: number, layers: MusicLayers): SongNote[] {
  const notes: SongNote[] = []
  const inBar = step % 16
  const chord = chordAt(song, step)
  if (layers.bass && (!layers.bassOnBeat || inBar % 4 === 0)) {
    const pattern = layers.bassOnBeat ? '0---0---0---0---' : song.bass
    const degree = degreeOf(charAt(pattern, inBar))
    if (degree !== null) {
      notes.push({
        voice: 'bass',
        midi: degreeMidi(song, chord + degree, -song.bassOctave),
        steps: lengthAt(pattern, inBar),
      })
    }
  }
  if (layers.arp && song.arp) {
    const degree = degreeOf(charAt(song.arp, inBar))
    if (degree !== null) notes.push({ voice: 'arp', midi: degreeMidi(song, chord + degree, 1), steps: 1 })
  }
  if (layers.lead && song.lead.length > 0) {
    const bar = song.lead[Math.floor(step / 16) % song.lead.length]!
    const degree = degreeOf(charAt(bar, inBar))
    if (degree !== null) {
      const midi = degreeMidi(song, degree, song.leadOctave)
      const steps = lengthAt(bar, inBar)
      notes.push({ voice: 'lead', midi, steps })
      if (layers.leadHigh) notes.push({ voice: 'leadHigh', midi: midi + 12, steps })
    }
  }
  return notes
}

export type DrumHit = 'kick' | 'snare' | 'hat' | 'openHat' | 'perc'

/** The drums that sound on `step` with these layers on */
export function drumsAt(song: Song, step: number, layers: MusicLayers): DrumHit[] {
  const inBar = step % 16
  const hits: DrumHit[] = []
  if ((layers.kick && charAt(song.kick, inBar) === 'x') || (layers.kickOnOne && inBar === 0)) {
    hits.push('kick')
  }
  if (layers.snare && charAt(song.snare, inBar) === 'x') hits.push('snare')
  if (layers.hat) {
    const hat = charAt(song.hat, inBar)
    if (hat === 'o') hits.push('openHat')
    else if (hat === 'x' || (layers.hatDoubled && hat === '.')) hits.push('hat')
  }
  if (layers.perc && song.perc && charAt(song.perc, inBar) === 'x') hits.push('perc')
  return hits
}
