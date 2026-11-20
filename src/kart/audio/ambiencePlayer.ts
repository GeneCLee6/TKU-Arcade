// 2026-11-20 (§4.46): the world around the track, made from noise and a few oscillators (ambience.ts
// says which layers a track has). Beds that loop (waves, wind, insects, a murmur, a hum), sounds now
// and then on top (a gull, a bell, a car passing, a press), and a crowd at the start and finish whose
// loudness follows the kart's distance from the line. Into the effects bus (bus.ts): the effects
// volume and the site's sound switch cover it.
import { kartBus, type KartBus } from './bus.ts'
import { ambienceFor, crowdLevel, nextIn, type AmbienceLayer, type AmbienceRecipe } from './ambience.ts'
import type { TrackThemeName } from '../../../shared/kart/track.ts'

export interface Ambience {
  /** Every frame: where the kart is */
  update(x: number, z: number): void
  /** The crowd roars (crossing the line) */
  cheer(): void
  dispose(): void
}

const LEVEL = 0.55

interface Built {
  readonly bus: KartBus
  readonly out: GainNode
  readonly crowd: GainNode
  readonly sources: AudioScheduledSourceNode[]
  readonly next: Map<AmbienceLayer, number>
}

export function createAmbience(
  track: { readonly id: string; readonly theme?: TrackThemeName },
  line: { readonly x: number; readonly z: number },
  night: boolean,
): Ambience {
  const recipe: AmbienceRecipe = ambienceFor(track)
  let built: Built | null = null
  let disposed = false

  const build = (bus: KartBus): Built => {
    const { context } = bus
    const out = context.createGain()
    out.gain.value = 0.0001
    out.gain.setTargetAtTime(LEVEL, context.currentTime, 1.2)
    out.connect(bus.effects)
    const sources: AudioScheduledSourceNode[] = []
    const loop = (): AudioBufferSourceNode => {
      const source = context.createBufferSource()
      source.buffer = bus.noise
      source.loop = true
      source.start(0, Math.random() * 1.5)
      sources.push(source)
      return source
    }
    const lfo = (hz: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') => {
      const oscillator = context.createOscillator()
      oscillator.type = type
      oscillator.frequency.value = hz
      const amount = context.createGain()
      amount.gain.value = depth
      oscillator.connect(amount).connect(target)
      oscillator.start()
      sources.push(oscillator)
    }
    const filtered = (type: BiquadFilterType, hz: number, q: number, level: number): { filter: BiquadFilterNode; gain: GainNode } => {
      const filter = context.createBiquadFilter()
      filter.type = type
      filter.frequency.value = hz
      filter.Q.value = q
      const gain = context.createGain()
      gain.gain.value = level
      loop().connect(filter).connect(gain).connect(out)
      return { filter, gain }
    }
    for (const [layer, amount = 0] of Object.entries(recipe.layers) as [AmbienceLayer, number][]) {
      switch (layer) {
        case 'surf': {
          // A swell every seven seconds or so
          const { gain } = filtered('lowpass', 560, 0.6, 0.35 * amount)
          lfo(0.14, 0.28 * amount, gain.gain)
          break
        }
        case 'wind': {
          const { filter, gain } = filtered('bandpass', 380, 1.4, 0.4 * amount)
          lfo(0.07, 180, filter.frequency)
          lfo(0.11, 0.3 * amount, gain.gain)
          break
        }
        case 'insects': {
          // Cicadas by day; crickets at night, lower and slower
          const { gain } = filtered('bandpass', night ? 3900 : 5200, night ? 18 : 9, 0.0)
          gain.gain.value = 0.22 * amount
          lfo(night ? 17 : 41, 0.2 * amount, gain.gain, 'square')
          break
        }
        case 'market': {
          const { gain } = filtered('bandpass', 640, 0.9, 0.3 * amount)
          lfo(4.3, 0.1 * amount, gain.gain)
          lfo(6.9, 0.07 * amount, gain.gain)
          break
        }
        case 'traffic':
          filtered('lowpass', 210, 0.7, 0.4 * amount)
          break
        case 'machines': {
          const hum = context.createOscillator()
          hum.type = 'sawtooth'
          hum.frequency.value = 55
          const filter = context.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.value = 170
          const gain = context.createGain()
          gain.gain.value = 0.12 * amount
          hum.connect(filter).connect(gain).connect(out)
          hum.start()
          sources.push(hum)
          break
        }
        default:
          break
      }
    }
    // The crowd: a murmur with a waver, loud only near the line
    const crowdFilter = context.createBiquadFilter()
    crowdFilter.type = 'bandpass'
    crowdFilter.frequency.value = 1000
    crowdFilter.Q.value = 0.6
    const crowd = context.createGain()
    crowd.gain.value = 0
    const crowdBody = context.createGain()
    crowdBody.gain.value = 0.5
    loop().connect(crowdFilter).connect(crowdBody).connect(crowd).connect(out)
    lfo(0.4, 0.15, crowdBody.gain)
    lfo(3.1, 0.08, crowdBody.gain)
    const next = new Map<AmbienceLayer, number>()
    for (const layer of Object.keys(recipe.layers) as AmbienceLayer[]) {
      next.set(layer, context.currentTime + nextIn(layer, Math.random))
    }
    return { bus, out, crowd, sources, next }
  }

  /** A voice now and then, at `at` */
  const occasional = (b: Built, layer: AmbienceLayer, at: number, amount: number) => {
    const { context } = b.bus
    const envelope = (peak: number, attack: number, length: number) => {
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak * amount, at + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
      gain.connect(b.out)
      return gain
    }
    const tone = (type: OscillatorType, points: readonly (readonly [number, number])[], into: AudioNode) => {
      const oscillator = context.createOscillator()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(points[0]![1], at + points[0]![0])
      for (const [time, hz] of points.slice(1)) oscillator.frequency.exponentialRampToValueAtTime(hz, at + time)
      oscillator.connect(into)
      oscillator.start(at)
      oscillator.stop(at + points[points.length - 1]![0] + 0.05)
    }
    const hiss = (type: BiquadFilterType, hz: number, into: AudioNode, length: number) => {
      const source = context.createBufferSource()
      source.buffer = b.bus.noise
      const filter = context.createBiquadFilter()
      filter.type = type
      filter.frequency.value = hz
      source.connect(filter).connect(into)
      source.start(at, Math.random())
      source.stop(at + length)
    }
    switch (layer) {
      case 'gulls':
        // Two or three cries, each a rise and a fall
        for (let cry = 0; cry < 2 + Math.floor(Math.random() * 2); cry++) {
          const late = cry * 0.42
          const gain = context.createGain()
          gain.gain.setValueAtTime(0.0001, at + late)
          gain.gain.exponentialRampToValueAtTime(0.05 * amount, at + late + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + late + 0.36)
          gain.connect(b.out)
          const oscillator = context.createOscillator()
          oscillator.type = 'triangle'
          oscillator.frequency.setValueAtTime(1500, at + late)
          oscillator.frequency.exponentialRampToValueAtTime(2300, at + late + 0.08)
          oscillator.frequency.exponentialRampToValueAtTime(1150, at + late + 0.34)
          oscillator.connect(gain)
          oscillator.start(at + late)
          oscillator.stop(at + late + 0.4)
        }
        return
      case 'birds':
        for (let chirp = 0; chirp < 3; chirp++) {
          const late = chirp * 0.11
          const gain = context.createGain()
          gain.gain.setValueAtTime(0.0001, at + late)
          gain.gain.exponentialRampToValueAtTime(0.03 * amount, at + late + 0.01)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + late + 0.08)
          gain.connect(b.out)
          const oscillator = context.createOscillator()
          oscillator.frequency.setValueAtTime(3000 + Math.random() * 600, at + late)
          oscillator.frequency.exponentialRampToValueAtTime(4300, at + late + 0.07)
          oscillator.connect(gain)
          oscillator.start(at + late)
          oscillator.stop(at + late + 0.1)
        }
        return
      case 'market':
        if (Math.random() < 0.5) {
          // A stall's little bell
          const bell = envelope(0.05, 0.004, 0.7)
          tone('triangle', [[0, 1320], [0.7, 1310]], bell)
          tone('sine', [[0, 1985], [0.7, 1975]], bell)
        } else hiss('highpass', 3200, envelope(0.07, 0.15, 0.9), 0.95)
        return
      case 'traffic': {
        // A car passing: a low engine that swells and fades
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 380
        filter.connect(envelope(0.12, 1.1, 2.6))
        tone('sawtooth', [[0, 96], [1.1, 104], [2.6, 72]], filter)
        return
      }
      case 'machines': {
        // A press's thump, sometimes a hiss of steam after it
        const thump = envelope(0.3, 0.004, 0.22)
        tone('sine', [[0, 120], [0.2, 48]], thump)
        hiss('bandpass', 900, envelope(0.08, 0.004, 0.12), 0.14)
        if (Math.random() < 0.25) hiss('highpass', 2600, envelope(0.05, 0.3, 1.4), 1.5)
        return
      }
      default:
        return
    }
  }

  return {
    update(x, z) {
      if (disposed) return
      const bus = kartBus()
      if (!bus) return
      built ??= build(bus)
      const { context } = bus
      const now = context.currentTime
      const level = crowdLevel(Math.hypot(x - line.x, z - line.z)) * recipe.crowd * 0.5
      built.crowd.gain.setTargetAtTime(level, now, 0.4)
      for (const [layer, at] of built.next) {
        if (at > now + 0.1) continue
        occasional(built, layer, Math.max(at, now), recipe.layers[layer] ?? 0)
        built.next.set(layer, Math.max(at, now) + nextIn(layer, Math.random))
      }
    },
    cheer() {
      if (!built || disposed) return
      const { context } = built.bus
      const at = context.currentTime
      const source = context.createBufferSource()
      source.buffer = built.bus.noise
      const filter = context.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(900, at)
      filter.frequency.exponentialRampToValueAtTime(1700, at + 0.8)
      filter.Q.value = 0.7
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.45 * recipe.crowd, at + 0.35)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.2)
      source.connect(filter).connect(gain).connect(built.crowd)
      source.start(at, Math.random())
      source.stop(at + 2.3)
    },
    dispose() {
      disposed = true
      if (!built) return
      const b = built
      built = null
      const { context } = b.bus
      b.out.gain.setTargetAtTime(0, context.currentTime, 0.2)
      setTimeout(() => {
        for (const source of b.sources) {
          try {
            source.stop()
          } catch {
            // already stopped
          }
        }
        b.out.disconnect()
      }, 900)
    },
  }
}
