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

/** The engine's note at idle, Hz */
const IDLE_HZ = 52
/**
 * The speeds the engine changes up at, m/s: within a gear the note climbs, and at each change it
 * drops back part of the way, so that pulling away sounds like going up through the gears
 */
export const GEAR_SPEEDS: readonly number[] = [0, 14, 28, 42, 56, 72]
/** Each gear starts this much higher than the last, and climbs this far, Hz */
const GEAR_STEP_HZ = 16
const GEAR_SPAN_HZ = 78
/** Past the last gear the note still rises, Hz for each m/s */
const OVER_HZ_PER_MPS = 2.2
const MASTER = 0.35

/** Which gear the engine is in at `speed`, from 0, and how far through it, 0 to 1 */
export function gearAt(speed: number): { gear: number; rev: number } {
  const pace = Math.abs(speed)
  const last = GEAR_SPEEDS.length - 1
  for (let gear = 0; gear < last; gear++) {
    const low = GEAR_SPEEDS[gear]!
    const high = GEAR_SPEEDS[gear + 1]!
    if (pace < high) return { gear, rev: (pace - low) / (high - low) }
  }
  return { gear: last - 1, rev: 1 }
}

/** The engine's note: idle at a standstill, climbing through each gear, a little higher on the throttle */
export function engineFrequency(speed: number, throttle: boolean): number {
  const pace = Math.abs(speed)
  const { gear, rev } = gearAt(pace)
  const over = Math.max(0, pace - GEAR_SPEEDS[GEAR_SPEEDS.length - 1]!)
  return (
    IDLE_HZ +
    gear * GEAR_STEP_HZ +
    rev * GEAR_SPAN_HZ +
    over * OVER_HZ_PER_MPS +
    (throttle && pace > 0 ? 6 : 0)
  )
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
      playVoices(audio, master, noise, voicesOf(cue), volume)
    },
    dispose() {
      master?.disconnect()
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
    engineTwin: OscillatorNode
    engineLow: OscillatorNode
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

    // The engine: two saws a hair apart and a square an octave down, through a filter that opens
    // with the revs
    const engineFilter = context.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 600
    engineFilter.Q.value = 1.2
    const engineGain = context.createGain()
    engineGain.gain.value = 0.2
    engineFilter.connect(engineGain).connect(master)
    const engine = context.createOscillator()
    engine.type = 'sawtooth'
    const engineTwin = context.createOscillator()
    engineTwin.type = 'sawtooth'
    const twinGain = context.createGain()
    twinGain.gain.value = 0.6
    const engineLow = context.createOscillator()
    engineLow.type = 'square'
    const lowGain = context.createGain()
    lowGain.gain.value = 0.5
    engine.connect(engineFilter)
    engineTwin.connect(twinGain).connect(engineFilter)
    engineLow.connect(lowGain).connect(engineFilter)
    engine.start()
    engineTwin.start()
    engineLow.start()

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
    running.push(engine, engineTwin, engineLow, squealTone, squealHigh, waver)

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
      refreshKartBus()
      const now = audio.currentTime
      const glide = (param: AudioParam, value: number, seconds = 0.06) =>
        param.setTargetAtTime(value, now, seconds)
      glide(nodes.master.gain, isSoundOn() ? MASTER : 0, 0.05)
      const pace = Math.abs(sound.speed)
      // A boost winds the engine up a little higher
      const frequency = engineFrequency(sound.speed, sound.throttle) * (sound.boosting ? 1.12 : 1)
      const { rev } = gearAt(pace)
      // Quick, so that a gear change is heard as a drop
      glide(nodes.engine.frequency, frequency, 0.035)
      glide(nodes.engineTwin.frequency, frequency * 1.007, 0.035)
      glide(nodes.engineLow.frequency, frequency / 2, 0.035)
      glide(
        nodes.engineFilter.frequency,
        420 + rev * 1300 + Math.min(pace, 80) * 14 + (sound.throttle ? 320 : 0),
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
      playVoices(audio, nodes.master, nodes.noise, voicesOf(cue), volume)
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
