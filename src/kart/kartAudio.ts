// e8-t13 (AC-8.7): the kart's sounds, synthesised with WebAudio like the rest of the site's (no
// sound files): an engine whose pitch follows the speed, tyres squealing in a drift, the rush of a
// boost and a thump on a wall. 2026-11-17 (owner: "a perfect start has to feel like a launch; a
// drift needs the tyres' squeal"; docs/KART-FEEL.md §7): the engine climbs through gears, the wind
// rises with the speed, the squeal is a wavering howl whose loudness and pitch follow how hard and
// how fast the tyres slide (feelFx.ts), and a boost bangs, whooshes and roars for as long as it
// lasts. All of it made here from oscillators and noise. Muted with the site's own sound switch (src/lib/sound.ts). A browser
// only lets a page make sound after a gesture: `unlock` is called from the first key or tap.
// 2026-11-20 (§4.46): through the kart's one AudioContext (audio/bus.ts), into its effects bus, so
// that the effects volume sets it apart from the music.
import { isSoundOn } from '../lib/sound.ts'
import { refreshKartBus, unlockKartAudio } from './audio/bus.ts'
import { audioTier, voiceBudget, type AudioTier } from './audio/tiers.ts'
import type { Quality } from './quality.ts'
import { squealVoice } from './feelFx.ts'
import type { ItemCue } from './hitFx.ts'
import { voicesOf, type Voice } from './itemSounds.ts'

export interface KartSound {
  readonly speed: number
  readonly throttle: boolean
  readonly drifting: boolean
  readonly boosting: boolean
  /**
   * How hard the tyres slide, 0 to 1 (feelFx.ts's skidStrength): the squeal's loudness and pitch.
   * Left out, a drift squeals at a middling strength
   */
  readonly skid?: number
}

export interface KartAudio {
  unlock(): void
  /** Every frame */
  update(sound: KartSound): void
  /** A wall hit, 0 to 1 */
  hit(strength: number): void
  /** A boost fired, `power` hard (feelFx.ts's BURST_POWER): the bang and the whoosh */
  burst(power: number): void
  /**
   * The kart's shape changing (2026-11-18, boostFx.ts): a servo's whirr rising and a latch as it
   * opens, falling as it closes
   */
  morph(open: boolean): void
  /** An item race's sound (2026-11-17, itemSounds.ts), `volume` 0 to 1 */
  cue(cue: ItemCue, volume?: number): void
  dispose(): void
}

/**
 * An engine's voice: its note through the gears, and what it is made of. 2026-11-22 (#108): the
 * bikes have their own, a high, thin rasp that revs further and changes up sooner, pulsing as it
 * fires, with the hover pad's turbine whining over it; the karts keep the deep twin saws they had
 */
export interface EngineVoice {
  /** The note at idle, Hz */
  readonly idleHz: number
  /**
   * The speeds it changes up at, m/s: within a gear the note climbs, and at each change it drops
   * back part of the way, so that pulling away sounds like going up through the gears
   */
  readonly gearSpeeds: readonly number[]
  /** Each gear starts this much higher than the last, and climbs this far, Hz */
  readonly gearStepHz: number
  readonly gearSpanHz: number
  /** Past the last gear the note still rises, Hz for each m/s */
  readonly overHzPerMps: number
  /** On the throttle the note is this much higher, Hz */
  readonly throttleHz: number
  /** The main oscillator, and the twin a hair apart (`twinRatio`) */
  readonly wave: OscillatorType
  readonly twinWave: OscillatorType
  readonly twinRatio: number
  /** The third voice, at this ratio of the note: an octave down for a kart's body, the note for a bike */
  readonly lowWave: OscillatorType
  readonly lowRatio: number
  /** The filter: where it opens from, how far with the revs and with the speed, and its Q */
  readonly filterHz: number
  readonly filterRevHz: number
  readonly filterSpeedHz: number
  readonly filterQ: number
  /** The firing pulse: a tremolo at this ratio of the note, this deep (0 for none) */
  readonly pulseRatio: number
  readonly pulseDepth: number
  /** The turbine's whine: a sine at this ratio of the note, this loud (0 for none) */
  readonly whineRatio: number
  readonly whineGain: number
}

export const ENGINE_VOICES: Readonly<Record<'kart' | 'bike', EngineVoice>> = {
  kart: {
    idleHz: 52,
    gearSpeeds: [0, 14, 28, 42, 56, 72],
    gearStepHz: 16,
    gearSpanHz: 78,
    overHzPerMps: 2.2,
    throttleHz: 6,
    wave: 'sawtooth',
    twinWave: 'sawtooth',
    twinRatio: 1.007,
    lowWave: 'square',
    lowRatio: 0.5,
    filterHz: 420,
    filterRevHz: 1300,
    filterSpeedHz: 14,
    filterQ: 1.2,
    pulseRatio: 0,
    pulseDepth: 0,
    whineRatio: 0,
    whineGain: 0,
  },
  bike: {
    idleHz: 78,
    gearSpeeds: [0, 10, 21, 33, 46, 60, 74],
    gearStepHz: 22,
    gearSpanHz: 118,
    overHzPerMps: 3.4,
    throttleHz: 12,
    wave: 'square',
    twinWave: 'sawtooth',
    twinRatio: 1.013,
    lowWave: 'triangle',
    lowRatio: 1,
    filterHz: 780,
    filterRevHz: 2100,
    filterSpeedHz: 18,
    filterQ: 3.2,
    pulseRatio: 0.25,
    pulseDepth: 0.35,
    whineRatio: 6,
    whineGain: 0.05,
  },
}

/** The kart's gears (the bikes' are in ENGINE_VOICES.bike) */
export const GEAR_SPEEDS: readonly number[] = ENGINE_VOICES.kart.gearSpeeds
const MASTER = 0.35

/** Which gear the engine is in at `speed`, from 0, and how far through it, 0 to 1 */
export function gearAt(
  speed: number,
  gears: readonly number[] = GEAR_SPEEDS,
): { gear: number; rev: number } {
  const pace = Math.abs(speed)
  const last = gears.length - 1
  for (let gear = 0; gear < last; gear++) {
    const low = gears[gear]!
    const high = gears[gear + 1]!
    if (pace < high) return { gear, rev: (pace - low) / (high - low) }
  }
  return { gear: last - 1, rev: 1 }
}

/** The engine's note: idle at a standstill, climbing through each gear, a little higher on the throttle */
export function engineFrequency(
  speed: number,
  throttle: boolean,
  voice: EngineVoice = ENGINE_VOICES.kart,
): number {
  const pace = Math.abs(speed)
  const { gear, rev } = gearAt(pace, voice.gearSpeeds)
  const over = Math.max(0, pace - voice.gearSpeeds[voice.gearSpeeds.length - 1]!)
  return (
    voice.idleHz +
    gear * voice.gearStepHz +
    rev * voice.gearSpanHz +
    over * voice.overHzPerMps +
    (throttle && pace > 0 ? voice.throttleHz : 0)
  )
}

/** How long a cue's voices sound, seconds: what it holds of the voice budget */
const cueLength = (voices: readonly Voice[]): number =>
  Math.max(0, ...voices.map((voice) => (voice.delay ?? 0) + voice.seconds))

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

export function createCuePlayer(quality?: Quality): CuePlayer {
  const budget = voiceBudget(audioTier(quality).maxVoices)
  let audio: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  return {
    unlock() {
      const bus = unlockKartAudio()
      if (!bus || audio) return
      audio = bus.context
      master = audio.createGain()
      master.gain.value = MASTER
      master.connect(bus.effects)
      noise = bus.noise
    },
    cue(cue, volume) {
      if (!audio || !master || !noise || !isSoundOn() || audio.state !== 'running') return
      refreshKartBus()
      const voices = voicesOf(cue)
      if (!budget.claim(audio.currentTime, cueLength(voices))) return
      playVoices(audio, master, noise, voices, volume)
    },
    dispose() {
      master?.disconnect()
      audio = null
      master = null
      noise = null
    },
  }
}

export interface KartAudioOptions {
  /** The graphics quality: how much sound (audio/tiers.ts) */
  readonly quality?: Quality
  /** Whose engine: a kart's, or a bike's (2026-11-22, #108) */
  readonly kind?: 'kart' | 'bike'
}

export function createKartAudio(options: KartAudioOptions = {}): KartAudio {
  const tier: AudioTier = audioTier(options.quality)
  const voice = ENGINE_VOICES[options.kind ?? 'kart']
  const budget = voiceBudget(tier.maxVoices)
  /** Frames since the parameters last moved (a lower tier moves them every few frames) */
  let frames = 0
  let audio: AudioContext | null = null
  let nodes: {
    master: GainNode
    engine: OscillatorNode
    engineTwin: OscillatorNode | null
    engineLow: OscillatorNode
    pulse: OscillatorNode | null
    whine: OscillatorNode | null
    engineFilter: BiquadFilterNode
    engineGain: GainNode
    windGain: GainNode
    squealTone: OscillatorNode
    squealHigh: OscillatorNode
    squealFilter: BiquadFilterNode
    squealGain: GainNode
    jetGain: GainNode
    rumbleGain: GainNode
    noise: AudioBuffer
  } | null = null
  let wasBoosting = false
  /** When the last announced burst sounded, on the audio clock */
  let lastBurst = -Infinity
  const burstAt = (now: number) => now - lastBurst < 0.25

  /** Everything that runs for as long as the kart does: stopped when it goes */
  let running: AudioScheduledSourceNode[] = []
  const build = (context: AudioContext, effects: AudioNode, noise: AudioBuffer) => {
    const master = context.createGain()
    master.gain.value = 0
    master.connect(effects)
    const loop = () => {
      const source = context.createBufferSource()
      source.buffer = noise
      source.loop = true
      source.start(0, Math.random())
      running.push(source)
      return source
    }

    // The engine (its voice, ENGINE_VOICES): a kart's two saws a hair apart and a square an octave
    // down, a bike's rasp and its own note again, through a filter that opens with the revs; a bike
    // pulses as it fires, and its turbine whines over it. On low the twin is left out
    const engineFilter = context.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 600
    engineFilter.Q.value = voice.filterQ
    const engineGain = context.createGain()
    engineGain.gain.value = 0.2
    const pulseGain = context.createGain()
    pulseGain.gain.value = 1
    engineFilter.connect(pulseGain).connect(engineGain).connect(master)
    const engine = context.createOscillator()
    engine.type = voice.wave
    engine.connect(engineFilter)
    engine.start()
    let engineTwin: OscillatorNode | null = null
    if (tier.engineTwin) {
      engineTwin = context.createOscillator()
      engineTwin.type = voice.twinWave
      const twinGain = context.createGain()
      twinGain.gain.value = 0.6
      engineTwin.connect(twinGain).connect(engineFilter)
      engineTwin.start()
      running.push(engineTwin)
    }
    const engineLow = context.createOscillator()
    engineLow.type = voice.lowWave
    const lowGain = context.createGain()
    lowGain.gain.value = 0.5
    engineLow.connect(lowGain).connect(engineFilter)
    engineLow.start()
    let pulse: OscillatorNode | null = null
    if (voice.pulseDepth > 0) {
      pulse = context.createOscillator()
      const depth = context.createGain()
      depth.gain.value = voice.pulseDepth
      pulse.connect(depth).connect(pulseGain.gain)
      pulse.start()
      running.push(pulse)
    }
    let whine: OscillatorNode | null = null
    if (voice.whineGain > 0) {
      whine = context.createOscillator()
      whine.type = 'sine'
      const whineLevel = context.createGain()
      whineLevel.gain.value = voice.whineGain
      whine.connect(whineLevel).connect(master)
      whine.start()
      running.push(whine)
    }

    // The wind: a broad hiss that grows with the square of the speed
    const windFilter = context.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 520
    windFilter.Q.value = 0.4
    const windGain = context.createGain()
    windGain.gain.value = 0
    loop().connect(windFilter).connect(windGain).connect(master)

    // The tyres' squeal: two wavering tones and a narrow band of noise at the same pitch
    const squealFilter = context.createBiquadFilter()
    squealFilter.type = 'bandpass'
    squealFilter.frequency.value = 1000
    squealFilter.Q.value = 7
    const squealGain = context.createGain()
    squealGain.gain.value = 0
    squealFilter.connect(squealGain).connect(master)
    const squealTone = context.createOscillator()
    squealTone.type = 'sawtooth'
    const squealHigh = context.createOscillator()
    squealHigh.type = 'triangle'
    const toneGain = context.createGain()
    toneGain.gain.value = 0.35
    const highGain = context.createGain()
    highGain.gain.value = 0.2
    squealTone.connect(toneGain).connect(squealFilter)
    squealHigh.connect(highGain).connect(squealFilter)
    const squealNoise = context.createGain()
    squealNoise.gain.value = 2.6
    loop().connect(squealNoise).connect(squealFilter)
    // A slow waver, so that it howls instead of whistling
    const waver = context.createOscillator()
    waver.frequency.value = 17
    const waverDepth = context.createGain()
    waverDepth.gain.value = 28
    waver.connect(waverDepth)
    waverDepth.connect(squealTone.frequency)
    waverDepth.connect(squealHigh.frequency)
    waverDepth.connect(squealFilter.frequency)
    squealTone.start()
    squealHigh.start()
    waver.start()
    running.push(engine, engineLow, squealTone, squealHigh, waver)

    // The boost: a jet's roar and a low rumble under it
    const jetFilter = context.createBiquadFilter()
    jetFilter.type = 'bandpass'
    jetFilter.frequency.value = 950
    jetFilter.Q.value = 0.6
    const jetGain = context.createGain()
    jetGain.gain.value = 0
    loop().connect(jetFilter).connect(jetGain).connect(master)
    const rumbleFilter = context.createBiquadFilter()
    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 170
    const rumbleGain = context.createGain()
    rumbleGain.gain.value = 0
    loop().connect(rumbleFilter).connect(rumbleGain).connect(master)

    nodes = {
      master,
      engine,
      engineTwin,
      engineLow,
      pulse,
      whine,
      engineFilter,
      engineGain,
      windGain,
      squealTone,
      squealHigh,
      squealFilter,
      squealGain,
      jetGain,
      rumbleGain,
      noise,
    }
  }

  /** The bang and the whoosh of a boost that fires */
  const burst = (power: number) => {
    if (!audio || !nodes || !isSoundOn() || audio.state !== 'running') return
    const loud = Math.max(0.2, Math.min(1, power))
    const now = audio.currentTime
    if (!budget.claim(now, 0.9)) return
    // The whoosh: noise through a band that sweeps up
    const whoosh = audio.createBufferSource()
    whoosh.buffer = nodes.noise
    const band = audio.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.1
    band.frequency.setValueAtTime(320, now)
    band.frequency.exponentialRampToValueAtTime(3400, now + 0.32)
    const whooshGain = audio.createGain()
    whooshGain.gain.setValueAtTime(0.0001, now)
    whooshGain.gain.exponentialRampToValueAtTime(1.1 * loud, now + 0.04)
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5 + 0.3 * loud)
    whoosh.connect(band).connect(whooshGain).connect(nodes.master)
    whoosh.start(now, Math.random())
    whoosh.stop(now + 0.9)
    // The thump: a low tone that drops
    const thump = audio.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(170, now)
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.3)
    const thumpGain = audio.createGain()
    thumpGain.gain.setValueAtTime(1.2 * loud, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
    thump.connect(thumpGain).connect(nodes.master)
    thump.start(now)
    thump.stop(now + 0.45)
    // The whine of the thrusters spinning up
    const whine = audio.createOscillator()
    whine.type = 'sawtooth'
    whine.frequency.setValueAtTime(260, now)
    whine.frequency.exponentialRampToValueAtTime(1500 + 700 * loud, now + 0.3)
    const whineGain = audio.createGain()
    whineGain.gain.setValueAtTime(0.0001, now)
    whineGain.gain.exponentialRampToValueAtTime(0.12 * loud, now + 0.08)
    whineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36)
    whine.connect(whineGain).connect(nodes.master)
    whine.start(now)
    whine.stop(now + 0.4)
  }

  /** The whirr of the kart's parts moving and the click of them locking: made here, like the rest */
  const morph = (open: boolean) => {
    if (!audio || !nodes || !isSoundOn() || audio.state !== 'running') return
    const now = audio.currentTime
    const length = open ? 0.25 : 0.3
    if (!budget.claim(now, length + 0.12)) return
    const [from, to] = open ? [190, 620] : [540, 170]
    const servo = audio.createOscillator()
    servo.type = 'sawtooth'
    servo.frequency.setValueAtTime(from, now)
    servo.frequency.exponentialRampToValueAtTime(to, now + length)
    const tone = audio.createBiquadFilter()
    tone.type = 'bandpass'
    tone.Q.value = 3
    tone.frequency.setValueAtTime(from * 3, now)
    tone.frequency.exponentialRampToValueAtTime(to * 3, now + length)
    const servoGain = audio.createGain()
    servoGain.gain.setValueAtTime(0.0001, now)
    servoGain.gain.exponentialRampToValueAtTime(0.16, now + 0.03)
    servoGain.gain.exponentialRampToValueAtTime(0.0001, now + length + 0.05)
    servo.connect(tone).connect(servoGain).connect(nodes.master)
    servo.start(now)
    servo.stop(now + length + 0.1)
    // The latch: a short, bright knock as the parts lock home
    const latch = audio.createOscillator()
    latch.type = 'square'
    latch.frequency.setValueAtTime(open ? 1500 : 900, now + length)
    latch.frequency.exponentialRampToValueAtTime(open ? 420 : 260, now + length + 0.05)
    const latchGain = audio.createGain()
    latchGain.gain.setValueAtTime(0.0001, now + length)
    latchGain.gain.exponentialRampToValueAtTime(0.2, now + length + 0.005)
    latchGain.gain.exponentialRampToValueAtTime(0.0001, now + length + 0.09)
    latch.connect(latchGain).connect(nodes.master)
    latch.start(now + length)
    latch.stop(now + length + 0.12)
  }

  return {
    unlock() {
      const bus = unlockKartAudio()
      if (!bus || audio) return
      audio = bus.context
      build(audio, bus.effects, bus.noise)
    },
    update(sound) {
      if (!audio || !nodes) return
      // On a lower quality the parameters move every few frames (audio/tiers.ts): they glide anyway
      frames = (frames + 1) % tier.updateEvery
      if (frames !== 0) return
      refreshKartBus()
      const now = audio.currentTime
      const glide = (param: AudioParam, value: number, seconds = 0.06) =>
        param.setTargetAtTime(value, now, seconds)
      glide(nodes.master.gain, isSoundOn() ? MASTER : 0, 0.05)
      const pace = Math.abs(sound.speed)
      // A boost winds the engine up a little higher
      const frequency =
        engineFrequency(sound.speed, sound.throttle, voice) * (sound.boosting ? 1.12 : 1)
      const { rev } = gearAt(pace, voice.gearSpeeds)
      // Quick, so that a gear change is heard as a drop
      glide(nodes.engine.frequency, frequency, 0.035)
      if (nodes.engineTwin) glide(nodes.engineTwin.frequency, frequency * voice.twinRatio, 0.035)
      glide(nodes.engineLow.frequency, frequency * voice.lowRatio, 0.035)
      if (nodes.pulse) glide(nodes.pulse.frequency, frequency * voice.pulseRatio, 0.035)
      if (nodes.whine) glide(nodes.whine.frequency, frequency * voice.whineRatio, 0.05)
      glide(
        nodes.engineFilter.frequency,
        voice.filterHz +
          rev * voice.filterRevHz +
          Math.min(pace, 80) * voice.filterSpeedHz +
          (sound.throttle ? 320 : 0),
      )
      glide(nodes.engineGain.gain, sound.throttle ? 0.24 : 0.14)
      glide(nodes.windGain.gain, 0.16 * Math.min(1.6, (pace / 68) ** 2), 0.2)
      const squeal = squealVoice(sound.skid ?? (sound.drifting ? 0.7 : 0), sound.speed)
      glide(nodes.squealGain.gain, squeal.gain, squeal.gain > 0 ? 0.03 : 0.08)
      glide(nodes.squealTone.frequency, squeal.hz, 0.05)
      glide(nodes.squealHigh.frequency, squeal.hz * 1.52, 0.05)
      glide(nodes.squealFilter.frequency, squeal.hz, 0.05)
      // The roar lasts as long as the boost; the bang of its start is `burst`
      glide(nodes.jetGain.gain, sound.boosting ? 0.3 : 0, sound.boosting ? 0.05 : 0.18)
      glide(nodes.rumbleGain.gain, sound.boosting ? 0.5 : 0, sound.boosting ? 0.05 : 0.18)
      // A boost nobody announced (another kind of boost began): still a small whoosh
      if (sound.boosting && !wasBoosting && !burstAt(now)) burst(0.3)
      wasBoosting = sound.boosting
    },
    hit(strength) {
      if (!audio || !nodes || !isSoundOn()) return
      const now = audio.currentTime
      if (!budget.claim(now, 0.4)) return
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
    morph,
    burst(power) {
      if (audio) lastBurst = audio.currentTime
      burst(power)
    },
    cue(cue, volume = 1) {
      if (!audio || !nodes || !isSoundOn()) return
      const voices = voicesOf(cue)
      if (!budget.claim(audio.currentTime, cueLength(voices))) return
      playVoices(audio, nodes.master, nodes.noise, voices, volume)
    },
    dispose() {
      const master = nodes?.master
      const sources = running
      running = []
      audio = null
      nodes = null
      if (!master) return
      // Out quickly, then stopped: a context shared with the music lives on
      master.gain.setTargetAtTime(0, master.context.currentTime, 0.03)
      setTimeout(() => {
        for (const source of sources) {
          try {
            source.stop()
          } catch {
            // never started, or already stopped
          }
        }
        master.disconnect()
      }, 200)
    },
  }
}
