// 2026-11-20 (§4.46): the soundtrack, played. The sequencer (sequencer.ts) says what falls on each
// sixteenth of a song (songs.ts); here a handful of synthesisers made from oscillators and noise play
// it, scheduled a fifth of a second ahead on the audio clock, so that the beat holds whatever the
// frame rate. Cheap on purpose (a phone): a few short-lived nodes a step, three filters and an echo
// that stay. Whoever wants music `claimMusic`s it and says what to play; a race's claim is heard over
// a menu's, else the newest, and when it lets go the one before comes back (a race over the room's
// menu).
import { isSoundOn } from '../../lib/sound.ts'
import { kartBus, madeKartBus, refreshKartBus, type KartBus } from './bus.ts'
import { loadVolumes } from './volumes.ts'
import {
  chordAt,
  chordDegrees,
  degreeMidi,
  drumsAt,
  dueSteps,
  midiHz,
  mixFor,
  notesAt,
  restartsOn,
  stepSeconds,
  type DrumHit,
  type MusicSection,
  type SongNote,
  type StepClock,
} from './sequencer.ts'
import { loadedSong, loadSong, type Song, type SongId } from './songs.ts'

export interface MusicRequest {
  readonly song: SongId
  readonly section: MusicSection
  /** A boost (N2O) runs: the filter opens */
  readonly boosting?: boolean
}

export interface MusicClaim {
  set(request: MusicRequest): void
  release(): void
}

/** How far ahead the steps are scheduled, s, and how often the scheduler wakes, ms */
const AHEAD = 0.2
const WAKE_MS = 50

interface Playing {
  readonly id: SongId
  readonly song: Song
  readonly out: GainNode
  readonly bassFilter: BiquadFilterNode
  readonly padFilter: BiquadFilterNode
  readonly lead: GainNode
  section: MusicSection
  clock: StepClock
  /** The ending has been scheduled */
  ended: boolean
}

const claims: { request: MusicRequest | null; race: boolean }[] = []
let timer: ReturnType<typeof setInterval> | null = null
let playing: Playing | null = null

function startSong(bus: KartBus, id: SongId, song: Song, section: MusicSection): Playing {
  const { context } = bus
  const out = context.createGain()
  out.gain.value = 0.0001
  out.gain.setTargetAtTime(1, context.currentTime, 0.15)
  out.connect(bus.music)
  const bassFilter = context.createBiquadFilter()
  bassFilter.type = 'lowpass'
  bassFilter.frequency.value = song.sound.bassCutoff
  bassFilter.Q.value = 3
  bassFilter.connect(out)
  const padFilter = context.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = song.sound.padCutoff
  padFilter.connect(out)
  const lead = context.createGain()
  lead.connect(out)
  // The echo: a dotted eighth, fed back on itself a little
  const echo = song.sound.echo ?? 0
  if (echo > 0) {
    const delay = context.createDelay(1)
    delay.delayTime.value = stepSeconds(song.bpm) * 3
    const feedback = context.createGain()
    feedback.gain.value = echo
    const wet = context.createGain()
    wet.gain.value = echo
    lead.connect(delay)
    delay.connect(feedback).connect(delay)
    delay.connect(wet).connect(out)
  }
  return {
    id,
    song,
    out,
    bassFilter,
    padFilter,
    lead,
    section,
    clock: { step: 0, at: context.currentTime + 0.06 },
    ended: false,
  }
}

function fadeOut(old: Playing, context: AudioContext): void {
  old.out.gain.setTargetAtTime(0, context.currentTime, 0.25)
  setTimeout(() => old.out.disconnect(), 2500)
}

/** A gain that rises to `peak` at `at` and dies away over `ring` seconds */
function envelope(context: AudioContext, destination: AudioNode, at: number, peak: number, ring: number): GainNode {
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ring)
  gain.connect(destination)
  return gain
}

function tone(context: AudioContext, destination: AudioNode, type: OscillatorType, from: number, to: number, at: number, length: number): void {
  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, at)
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + length)
  oscillator.connect(destination)
  oscillator.start(at)
  oscillator.stop(at + length + 0.02)
}

function noise(bus: KartBus, destination: AudioNode, type: BiquadFilterType, hz: number, q: number, at: number, length: number): void {
  const source = bus.context.createBufferSource()
  source.buffer = bus.noise
  const filter = bus.context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = hz
  filter.Q.value = q
  source.connect(filter).connect(destination)
  source.start(at, Math.random() * 1.5)
  source.stop(at + length + 0.02)
}

function drum(bus: KartBus, now: Playing, hit: DrumHit, at: number): void {
  const { context } = bus
  const out = now.out
  switch (hit) {
    case 'kick':
      tone(context, envelope(context, out, at, 0.9, 0.28), 'sine', 140, 42, at, 0.28)
      return
    case 'snare':
      noise(bus, envelope(context, out, at, 0.32, 0.16), 'bandpass', 1800, 0.8, at, 0.16)
      tone(context, envelope(context, out, at, 0.22, 0.08), 'triangle', 210, 150, at, 0.08)
      return
    case 'hat':
      noise(bus, envelope(context, out, at, 0.1, 0.04), 'highpass', 7500, 0.7, at, 0.05)
      return
    case 'openHat':
      noise(bus, envelope(context, out, at, 0.08, 0.2), 'highpass', 7000, 0.7, at, 0.2)
      return
    case 'perc':
      switch (now.song.sound.perc) {
        case 'wood':
          tone(context, envelope(context, out, at, 0.28, 0.07), 'sine', 900, 860, at, 0.07)
          return
        case 'tom':
          tone(context, envelope(context, out, at, 0.5, 0.3), 'sine', 190, 90, at, 0.3)
          return
        case 'metal': {
          // Two out-of-tune squares through a narrow band: a struck girder
          const band = context.createBiquadFilter()
          band.type = 'bandpass'
          band.frequency.value = 2400
          band.Q.value = 5
          band.connect(envelope(context, out, at, 0.22, 0.14))
          tone(context, band, 'square', 423, 423, at, 0.14)
          tone(context, band, 'square', 589, 589, at, 0.14)
          return
        }
        case 'clap':
          for (const late of [0, 0.012, 0.024]) {
            noise(bus, envelope(context, out, at + late, 0.18, 0.09), 'bandpass', 1300, 1.2, at + late, 0.09)
          }
          return
        default:
          return
      }
  }
}

function note(bus: KartBus, now: Playing, played: SongNote, at: number, step: number): void {
  const { context } = bus
  const { sound } = now.song
  const hz = midiHz(played.midi)
  const length = played.steps * step
  switch (played.voice) {
    case 'bass': {
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.45, at + 0.01)
      gain.gain.setTargetAtTime(0.3, at + 0.02, 0.08)
      gain.gain.setTargetAtTime(0.0001, at + Math.max(0.03, length - 0.04), 0.02)
      gain.connect(now.bassFilter)
      tone(context, gain, sound.bass, hz, hz, at, length + 0.1)
      return
    }
    case 'arp':
      tone(context, envelope(context, now.padFilter, at, 0.09, 0.16), sound.arp ?? 'triangle', hz, hz, at, 0.16)
      return
    case 'lead':
    case 'leadHigh': {
      const peak = played.voice === 'lead' ? 0.13 : 0.06
      if (sound.leadRing > 0) {
        tone(context, envelope(context, now.lead, at, peak, sound.leadRing), sound.lead, hz, hz, at, sound.leadRing)
        return
      }
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02)
      gain.gain.setTargetAtTime(0.0001, at + Math.max(0.04, length - 0.03), 0.03)
      gain.connect(now.lead)
      // A lead holds a note with a slight waver, so that it sings
      const oscillator = context.createOscillator()
      oscillator.type = sound.lead
      oscillator.frequency.value = hz
      oscillator.detune.setValueAtTime(0, at)
      oscillator.detune.linearRampToValueAtTime(length > 0.3 ? 12 : 0, at + length)
      oscillator.connect(gain)
      oscillator.start(at)
      oscillator.stop(at + length + 0.15)
      return
    }
  }
}

/** A bar's chord on the pad: slow in, held to the bar's end, slow out */
function pad(bus: KartBus, now: Playing, barStep: number, at: number, bar: number, peak = 0.05): void {
  const { context } = bus
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.4, bar / 3))
  gain.gain.setTargetAtTime(0.0001, at + bar - 0.1, 0.18)
  gain.connect(now.padFilter)
  for (const degree of chordDegrees(chordAt(now.song, barStep), now.song.sound.chord)) {
    const hz = midiHz(degreeMidi(now.song, degree, 0))
    tone(context, gain, now.song.sound.pad, hz, hz, at, bar + 0.8)
  }
}

/** The finish: a crash and the first chord, ringing out */
function ending(bus: KartBus, now: Playing, at: number): void {
  const { context } = bus
  noise(bus, envelope(context, now.out, at, 0.22, 2.2), 'highpass', 5000, 0.6, at, 2.2)
  tone(context, envelope(context, now.out, at, 0.8, 0.5), 'sine', 120, 40, at, 0.5)
  pad(bus, now, 0, at, 2.4, 0.08)
  const root = midiHz(degreeMidi(now.song, 7, now.song.leadOctave))
  tone(context, envelope(context, now.lead, at, 0.12, 2.6), now.song.sound.lead, root, root, at, 2.6)
}

function crash(bus: KartBus, now: Playing, at: number): void {
  noise(bus, envelope(bus.context, now.out, at, 0.16, 1.4), 'highpass', 5200, 0.6, at, 1.4)
}

function current(): MusicRequest | null {
  for (const race of [true, false]) {
    for (let index = claims.length - 1; index >= 0; index--) {
      const claim = claims[index]!
      if (claim.race === race && claim.request) return claim.request
    }
  }
  return null
}

function tick(): void {
  refreshKartBus()
  const bus = kartBus()
  if (!bus) {
    if (claims.length === 0) stopTimer()
    return
  }
  const wanted = current()
  const { context } = bus
  const nowTime = context.currentTime
  if (!wanted || wanted.section === 'silent') {
    if (playing) fadeOut(playing, context)
    playing = null
    if (claims.length === 0) stopTimer()
    return
  }
  if (!playing || playing.id !== wanted.song) {
    if (playing) fadeOut(playing, context)
    // 2026-11-21 (songs.ts): a song still on its way (the loading screen fetches it first) starts
    // when it comes
    const song = loadedSong(wanted.song)
    if (!song) {
      playing = null
      void loadSong(wanted.song).then(tick, () => {})
      return
    }
    playing = startSong(bus, wanted.song, song, wanted.section)
    if (wanted.section !== 'intro' && wanted.section !== 'menu' && wanted.section !== 'outro') crash(bus, playing, playing.clock.at)
  }
  const now = playing
  if (wanted.section !== now.section) {
    if (restartsOn(now.section, wanted.section)) {
      now.clock = { step: 0, at: nowTime + 0.04 }
      if (wanted.section !== 'menu') crash(bus, now, now.clock.at)
    }
    if (wanted.section === 'outro') {
      now.ended = true
      ending(bus, now, nowTime + 0.03)
    } else now.ended = false
    now.section = wanted.section
  }
  const mix = mixFor(now.section, wanted.boosting === true)
  bus.musicFilter.frequency.setTargetAtTime(mix.cutoff, nowTime, mix.cutoff > 8000 ? 0.06 : 0.25)
  if (now.ended || now.section === 'outro') return
  const seconds = stepSeconds(now.song.bpm, mix.tempo)
  const { steps, next } = dueSteps(now.clock, nowTime + AHEAD, seconds, now.song.sound.swing ?? 0, nowTime)
  now.clock = next
  // Silenced (the site's switch, or the music's volume at 0): the clock runs on, nothing is made
  if (!isSoundOn() || loadVolumes().music <= 0) return
  for (const { step, at } of steps) {
    if (step % 16 === 0 && mix.layers.pad) pad(bus, now, step, at, seconds * 16)
    for (const hit of drumsAt(now.song, step, mix.layers)) drum(bus, now, hit, at)
    for (const played of notesAt(now.song, step, mix.layers)) note(bus, now, played, at, seconds)
  }
}

function startTimer(): void {
  timer ??= setInterval(tick, WAKE_MS)
}

function stopTimer(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
}

/**
 * Asks for music: a race's (`race`) is heard over a menu's, else the newest claim. Nothing sounds
 * before a gesture (bus.ts)
 */
export function claimMusic(race = false): MusicClaim {
  const claim: { request: MusicRequest | null; race: boolean } = { request: null, race }
  claims.push(claim)
  startTimer()
  return {
    set(request) {
      const last = claim.request
      claim.request = request
      // A change heard at once, not at the next wake
      if (
        madeKartBus() &&
        (!last || last.song !== request.song || last.section !== request.section || last.boosting !== request.boosting)
      ) {
        tick()
      }
    },
    release() {
      const index = claims.indexOf(claim)
      if (index >= 0) claims.splice(index, 1)
      tick()
    },
  }
}
