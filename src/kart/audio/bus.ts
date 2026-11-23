// 2026-11-20 (§4.46): one AudioContext for everything the kart plays, and three buses through it:
// the music, the effects (engine, tyres, items, the world around the track) and, after both, the
// site's sound switch. One context instead of one per sound source costs a phone less, and lets the
// music and the effects be set apart (volumes.ts). A browser only lets a page make sound after a
// gesture: `unlockKartAudio` from a key or a tap makes the context, or wakes a suspended one.
//
// 2026-11-23 (docs/ARCHITECTURE.md §4.97; #176's known limit, iOS): a context is not only
// 'suspended' before a gesture. Safari puts it in 'interrupted' (a call, Siri, another app's sound,
// the page sent to the background) and does not always give it back by itself; any browser may
// suspend it in the background. So: the page going to the background suspends it here (nothing
// plays to a pocket), coming back wakes it, and so does any state change while the page is shown
// (`watchContext`). Where the browser will not let it wake without a gesture the race screen's "Tap
// for sound" shows (unlock.ts listens through `onKartBusChange`). And iOS's silent switch mutes
// WebAudio unless the page says it plays like a video: where Safari has the Audio Session API the
// session is 'playback' while the site's sound is on (`applyAudioSession`).
import { isSoundOn } from '../../lib/sound.ts'
import { loadVolumes } from './volumes.ts'

export interface KartBus {
  readonly context: AudioContext
  /** The soundtrack goes in here: a low-pass the music player opens and closes, then its volume */
  readonly music: AudioNode
  /** The music's filter (musicPlayer.ts opens it in a boost) */
  readonly musicFilter: BiquadFilterNode
  /** Everything else goes in here */
  readonly effects: AudioNode
  /** 2026-11-22: the world around the track (ambiencePlayer.ts), with its own volume */
  readonly ambience: AudioNode
  /** A second of white noise, shared by every noise voice */
  readonly noise: AudioBuffer
}

/** The music sits under the effects: this loud at a volume of 1 */
const MUSIC_LEVEL = 0.32

let bus: (KartBus & {
  musicGain: GainNode
  effectsGain: GainNode
  ambienceGain: GainNode
  root: GainNode
}) | null = null
let applied = ''
/**
 * 2026-11-22 (the pause menu, docs/ARCHITECTURE.md §4.73): while paused the music drops to this
 * share and the effects and the ambience fall silent (the engine would idle on otherwise)
 */
export const PAUSED_MUSIC = 0.3
let paused = false

/** The pause menu is open on a race that stopped (or not) */
export function duckKartBus(on: boolean): void {
  paused = on
  refreshKartBus()
}

function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  return buffer
}

const changeListeners = new Set<() => void>()

/** Told when the context's state may have changed (made, woken, suspended, interrupted); returns a stop */
export function onKartBusChange(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

const tellChange = () => {
  for (const listener of changeListeners) listener()
}

/** Whether a context in `state` should be asked to resume: anything but running or closed */
export const wantsWaking = (state: string): boolean => state !== 'running' && state !== 'closed'

const pageShown = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/** Asks the context to run again; a refusal (no gesture yet) is left for the race's "Tap for sound" */
function wake(context: AudioContext): void {
  if (!wantsWaking(context.state)) return
  try {
    void context.resume().then(tellChange, tellChange)
  } catch {
    tellChange()
  }
}

/** iOS (Safari 16.4+): sound that plays with the silent switch on, while the site's sound is on */
export function applyAudioSession(on = isSoundOn()): void {
  if (typeof navigator === 'undefined') return
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = on ? 'playback' : 'auto'
  } catch {
    // An older session that will not change: the switch decides
  }
}

/** The context followed: woken on any change while the page is shown; suspended in the background */
function watchContext(context: AudioContext): void {
  context.addEventListener?.('statechange', () => {
    if (pageShown()) wake(context)
    tellChange()
  })
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (bus?.context !== context) return
    if (!pageShown()) {
      if (context.state === 'running') void context.suspend().catch(() => undefined)
    } else wake(context)
    tellChange()
  })
  // Safari's pages kept in memory (back and forward) come back with 'pageshow'
  window.addEventListener?.('pageshow', () => {
    if (bus?.context === context && pageShown()) wake(context)
  })
}

/** Call from a gesture. Nothing where the browser has no WebAudio */
export function unlockKartAudio(): KartBus | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
  if (!bus) {
    const context = new window.AudioContext()
    const root = context.createGain()
    root.connect(context.destination)
    const musicGain = context.createGain()
    const musicFilter = context.createBiquadFilter()
    musicFilter.type = 'lowpass'
    musicFilter.frequency.value = 18000
    musicFilter.Q.value = 0.7
    musicFilter.connect(musicGain).connect(root)
    const effectsGain = context.createGain()
    effectsGain.connect(root)
    const ambienceGain = context.createGain()
    ambienceGain.connect(root)
    bus = {
      context,
      root,
      music: musicFilter,
      musicFilter,
      musicGain,
      effects: effectsGain,
      effectsGain,
      ambience: ambienceGain,
      ambienceGain,
      noise: noiseBuffer(context, 2),
    }
    applied = ''
    refreshKartBus()
    applyAudioSession()
    watchContext(context)
    tellChange()
  }
  // 'suspended' before a gesture or in the background; 'interrupted' on iOS after a call or the
  // background (2026-11-23: only 'suspended' was woken, and Safari stayed silent)
  if (wantsWaking(bus.context.state)) wake(bus.context)
  return bus
}

/** The bus, if a gesture has made it, and only while it can play */
export function kartBus(): KartBus | null {
  return bus && bus.context.state === 'running' ? bus : null
}

/** The bus as made, running or not (to build on before the first gesture's resume lands) */
export function madeKartBus(): KartBus | null {
  return bus
}

/** The volumes and the site's switch onto the buses; cheap to call often (only changes are sent) */
export function refreshKartBus(): void {
  if (!bus) return
  const on = isSoundOn()
  const { music, effects, ambience } = loadVolumes()
  const key = `${on}|${music}|${effects}|${ambience}|${paused}`
  if (key === applied) return
  if (!applied.startsWith(`${on}|`)) applyAudioSession(on)
  applied = key
  const now = bus.context.currentTime
  bus.root.gain.setTargetAtTime(on ? 1 : 0, now, 0.05)
  // Squared: a slider's middle sounds like the middle
  const duck = paused ? PAUSED_MUSIC : 1
  const quiet = paused ? 0 : 1
  bus.musicGain.gain.setTargetAtTime(MUSIC_LEVEL * music * music * duck, now, 0.08)
  bus.effectsGain.gain.setTargetAtTime(effects * effects * quiet, now, 0.08)
  bus.ambienceGain.gain.setTargetAtTime(ambience * ambience * quiet, now, 0.08)
}

/** Tests only */
export function resetKartBusForTest(): void {
  bus = null
  applied = ''
  paused = false
}
