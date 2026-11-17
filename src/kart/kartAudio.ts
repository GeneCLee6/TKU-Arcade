// e8-t13 (AC-8.7): the kart's sounds, synthesised with WebAudio like the rest of the site's (no
// sound files): an engine whose pitch follows the speed, tyres squealing in a drift, the rush of a
// boost and a thump on a wall. Muted with the site's own sound switch (src/lib/sound.ts). A browser
// only lets a page make sound after a gesture: `unlock` is called from the first key or tap.
import { isSoundOn } from '../lib/sound.ts'
import type { ItemCue } from './hitFx.ts'
import { voicesOf, type Voice } from './itemSounds.ts'

export interface KartSound {
  readonly speed: number
  readonly throttle: boolean
  readonly drifting: boolean
  readonly boosting: boolean
}

export interface KartAudio {
  unlock(): void
  /** Every frame */
  update(sound: KartSound): void
  /** A wall hit, 0 to 1 */
  hit(strength: number): void
  /** An item race's sound (2026-11-17, itemSounds.ts), `volume` 0 to 1 */
  cue(cue: ItemCue, volume?: number): void
  dispose(): void
}

/** The engine's pitch: idle, and how much each m/s adds */
const IDLE_HZ = 52
const HZ_PER_MPS = 4.4
const MASTER = 0.35

export function engineFrequency(speed: number, throttle: boolean): number {
  return IDLE_HZ + Math.abs(speed) * HZ_PER_MPS + (throttle ? 6 : 0)
}

function noiseBuffer(audio: AudioContext, seconds: number): AudioBuffer {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  return buffer
}

/** One cue's voices, into `destination` now, at `volume` */
function playVoices(
  audio: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  voices: readonly Voice[],
  volume: number,
): void {
  const start = audio.currentTime
  const loudness = Math.max(0, Math.min(1, volume))
  if (loudness <= 0) return
  for (const voice of voices) {
    const at = start + (voice.delay ?? 0)
    const end = at + voice.seconds
    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.setValueAtTime(Math.max(0.0002, voice.gain * loudness), at)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(destination)
    if (voice.kind === 'tone') {
      const oscillator = audio.createOscillator()
      oscillator.type = voice.wave
      oscillator.frequency.setValueAtTime(voice.from, at)
      oscillator.frequency.exponentialRampToValueAtTime(voice.to, end)
      oscillator.connect(gain)
      oscillator.start(at)
      oscillator.stop(end + 0.02)
    } else {
      const source = audio.createBufferSource()
      source.buffer = noise
      const filter = audio.createBiquadFilter()
      filter.type = voice.filter
      filter.Q.value = voice.q ?? 1
      filter.frequency.setValueAtTime(voice.from, at)
      filter.frequency.exponentialRampToValueAtTime(voice.to, end)
      source.connect(filter).connect(gain)
      source.start(at, Math.random())
      source.stop(end + 0.02)
    }
  }
}

/**
 * #86: the item sounds alone, for someone watching (no engine of their own): each cue at a volume
 * (watchSounds.ts). Like the race's, it can only start after a gesture: `unlock` from a key or tap
 */
export interface CuePlayer {
  unlock(): void
  cue(cue: ItemCue, volume: number): void
  dispose(): void
}

export function createCuePlayer(): CuePlayer {
  let audio: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  return {
    unlock() {
      if (typeof window.AudioContext !== 'function') return
      if (!audio) {
        audio = new window.AudioContext()
        master = audio.createGain()
        master.gain.value = MASTER
        master.connect(audio.destination)
        noise = noiseBuffer(audio, 2)
      }
      if (audio.state === 'suspended') void audio.resume()
    },
    cue(cue, volume) {
      if (!audio || !master || !noise || !isSoundOn() || audio.state !== 'running') return
      playVoices(audio, master, noise, voicesOf(cue), volume)
    },
    dispose() {
      void audio?.close()
      audio = null
      master = null
      noise = null
    },
  }
}

export function createKartAudio(): KartAudio {
  let audio: AudioContext | null = null
  let nodes: {
    master: GainNode
    engine: OscillatorNode
    engineLow: OscillatorNode
    engineFilter: BiquadFilterNode
    engineGain: GainNode
    skidGain: GainNode
    boostGain: GainNode
    noise: AudioBuffer
  } | null = null
  let wasBoosting = false

  const build = (context: AudioContext) => {
    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)

    const engineFilter = context.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 600
    const engineGain = context.createGain()
    engineGain.gain.value = 0.22
    engineFilter.connect(engineGain).connect(master)
    const engine = context.createOscillator()
    engine.type = 'sawtooth'
    const engineLow = context.createOscillator()
    engineLow.type = 'square'
    const lowGain = context.createGain()
    lowGain.gain.value = 0.5
    engine.connect(engineFilter)
    engineLow.connect(lowGain).connect(engineFilter)
    engine.start()
    engineLow.start()

    const noise = noiseBuffer(context, 2)
    const skid = context.createBufferSource()
    skid.buffer = noise
    skid.loop = true
    const skidFilter = context.createBiquadFilter()
    skidFilter.type = 'bandpass'
    skidFilter.frequency.value = 1700
    skidFilter.Q.value = 1.4
    const skidGain = context.createGain()
    skidGain.gain.value = 0
    skid.connect(skidFilter).connect(skidGain).connect(master)
    skid.start()

    const rush = context.createBufferSource()
    rush.buffer = noise
    rush.loop = true
    const rushFilter = context.createBiquadFilter()
    rushFilter.type = 'highpass'
    rushFilter.frequency.value = 900
    const boostGain = context.createGain()
    boostGain.gain.value = 0
    rush.connect(rushFilter).connect(boostGain).connect(master)
    rush.start()

    nodes = { master, engine, engineLow, engineFilter, engineGain, skidGain, boostGain, noise }
  }

  return {
    unlock() {
      if (typeof window.AudioContext !== 'function') return
      if (!audio) {
        audio = new window.AudioContext()
        build(audio)
      }
      if (audio.state === 'suspended') void audio.resume()
    },
    update(sound) {
      if (!audio || !nodes) return
      const now = audio.currentTime
      const glide = (param: AudioParam, value: number, seconds = 0.06) =>
        param.setTargetAtTime(value, now, seconds)
      glide(nodes.master.gain, isSoundOn() ? MASTER : 0, 0.05)
      const frequency = engineFrequency(sound.speed, sound.throttle)
      glide(nodes.engine.frequency, frequency)
      glide(nodes.engineLow.frequency, frequency / 2)
      glide(
        nodes.engineFilter.frequency,
        380 + Math.abs(sound.speed) * 55 + (sound.throttle ? 250 : 0),
      )
      glide(nodes.engineGain.gain, sound.throttle ? 0.26 : 0.16)
      glide(nodes.skidGain.gain, sound.drifting && Math.abs(sound.speed) > 6 ? 0.2 : 0, 0.04)
      // A rush when the boost fires, settling to a hiss while it lasts
      if (sound.boosting && !wasBoosting) {
        nodes.boostGain.gain.cancelScheduledValues(now)
        nodes.boostGain.gain.setValueAtTime(0.5, now)
      }
      glide(nodes.boostGain.gain, sound.boosting ? 0.12 : 0, sound.boosting ? 0.25 : 0.08)
      wasBoosting = sound.boosting
    },
    hit(strength) {
      if (!audio || !nodes || !isSoundOn()) return
      const now = audio.currentTime
      const source = audio.createBufferSource()
      source.buffer = nodes.noise
      const filter = audio.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 260
      const gain = audio.createGain()
      gain.gain.setValueAtTime(0.9 * Math.max(0.2, Math.min(1, strength)), now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      source.connect(filter).connect(gain).connect(nodes.master)
      source.start(now)
      source.stop(now + 0.4)
    },
    cue(cue, volume = 1) {
      if (!audio || !nodes || !isSoundOn()) return
      playVoices(audio, nodes.master, nodes.noise, voicesOf(cue), volume)
    },
    dispose() {
      void audio?.close()
      audio = null
      nodes = null
    },
  }
}
