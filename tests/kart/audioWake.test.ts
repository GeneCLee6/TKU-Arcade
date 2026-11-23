import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyAudioSession,
  madeKartBus,
  onKartBusChange,
  refreshKartBus,
  resetKartBusForTest,
  unlockKartAudio,
  wantsWaking,
} from '../../src/kart/audio/bus.ts'
import { kartSoundState } from '../../src/kart/audio/unlock.ts'
import { setSoundOn } from '../../src/lib/sound.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.96; #176's known limit): the kart's sound on iOS. Safari's
// context goes 'interrupted' (a call, the background) as well as 'suspended', and the silent switch
// mutes WebAudio unless the page plays like a video. A context of our own stands in for the browser's.

type State = 'suspended' | 'running' | 'interrupted' | 'closed'

const param = () => ({ value: 0, setTargetAtTime: vi.fn() })
const node = () => {
  const one = { gain: param(), frequency: param(), Q: param(), type: '', connect: (next: unknown) => next }
  return one
}

class FakeContext extends EventTarget {
  static refuse = false
  static made: FakeContext[] = []
  state: State = 'suspended'
  currentTime = 0
  sampleRate = 8000
  destination = {}
  resumes = 0
  constructor() {
    super()
    FakeContext.made.push(this)
  }
  set(state: State) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
  resume() {
    this.resumes += 1
    if (FakeContext.refuse) return Promise.reject(new Error('not allowed'))
    this.set('running')
    return Promise.resolve()
  }
  suspend() {
    this.set('suspended')
    return Promise.resolve()
  }
  createGain = node
  createBiquadFilter = node
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })
}

let hidden = false
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  resetKartBusForTest()
  FakeContext.refuse = false
  FakeContext.made = []
  hidden = false
  vi.stubGlobal('AudioContext', FakeContext)
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'audioSession')
})

const goTo = (to: 'hidden' | 'visible') => {
  hidden = to === 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('the kart sound on iOS', () => {
  it('wakes anything but running or closed', () => {
    expect(['suspended', 'interrupted'].every(wantsWaking)).toBe(true)
    expect(wantsWaking('running')).toBe(false)
    expect(wantsWaking('closed')).toBe(false)
  })

  it('wakes an interrupted context with a gesture (only suspended ones were)', async () => {
    unlockKartAudio()
    const context = FakeContext.made[0]!
    await flush()
    expect(context.state).toBe('running')
    context.state = 'interrupted'
    unlockKartAudio()
    await flush()
    expect(context.state).toBe('running')
  })

  it('is suspended in the background and woken coming back', async () => {
    unlockKartAudio()
    const context = FakeContext.made[0]!
    await flush()
    goTo('hidden')
    await flush()
    expect(context.state).toBe('suspended')
    expect(kartSoundState()).toBe('suspended')
    goTo('visible')
    await flush()
    expect(context.state).toBe('running')
    expect(kartSoundState()).toBe('running')
  })

  it('wakes itself when the browser interrupts it while shown, not while hidden', async () => {
    unlockKartAudio()
    const context = FakeContext.made[0]!
    await flush()
    const before = context.resumes
    context.set('interrupted')
    await flush()
    expect(context.resumes).toBe(before + 1)
    expect(context.state).toBe('running')
    goTo('hidden')
    await flush()
    const hiddenResumes = context.resumes
    context.set('interrupted')
    await flush()
    expect(context.resumes).toBe(hiddenResumes)
  })

  it('tells the race screen when a wake is refused (its "Tap for sound" then shows)', async () => {
    unlockKartAudio()
    const context = FakeContext.made[0]!
    await flush()
    const told = vi.fn()
    const stop = onKartBusChange(told)
    FakeContext.refuse = true
    goTo('hidden')
    goTo('visible')
    await flush()
    expect(told).toHaveBeenCalled()
    expect(kartSoundState()).toBe('suspended')
    // The tap
    FakeContext.refuse = false
    unlockKartAudio()
    await flush()
    expect(context.state).toBe('running')
    stop()
    expect(madeKartBus()?.context).toBe(context)
  })

  it('plays through the silent switch while the site sound is on (Safari 16.4+)', () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session })
    unlockKartAudio()
    expect(session.type).toBe('playback')
    setSoundOn(false)
    refreshKartBus()
    expect(session.type).toBe('auto')
    setSoundOn(true)
    refreshKartBus()
    expect(session.type).toBe('playback')
    // A browser without it: nothing happens
    Reflect.deleteProperty(navigator, 'audioSession')
    expect(() => applyAudioSession(true)).not.toThrow()
  })
})
