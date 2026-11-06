import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isSoundOn,
  playCue,
  resetSoundForTest,
  setSoundOn,
  unlockSound,
  type SoundCue,
} from '../../src/lib/sound.ts'

let oscillators: number
let resumed: number
let state: AudioContextState

class FakeAudioContext {
  currentTime = 0
  destination = {}
  get state() {
    return state
  }
  resume() {
    resumed++
    return Promise.resolve()
  }
  createOscillator() {
    oscillators++
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }
  }
}

beforeEach(() => {
  oscillators = 0
  resumed = 0
  state = 'running'
  localStorage.clear()
  resetSoundForTest()
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sound', () => {
  it('stays silent until a gesture has unlocked it', () => {
    playCue('land')
    expect(oscillators).toBe(0)
    unlockSound()
    playCue('land')
    expect(oscillators).toBe(1)
  })

  it.each<SoundCue>(['roll', 'move', 'land', 'demote', 'turn', 'win'])(
    'can play %s without a sound file',
    (cue) => {
      unlockSound()
      playCue(cue)
      expect(oscillators).toBeGreaterThan(0)
    },
  )

  it('is on by default; muting silences it and is remembered', () => {
    expect(isSoundOn()).toBe(true)
    unlockSound()
    setSoundOn(false)
    expect(isSoundOn()).toBe(false)
    playCue('land')
    expect(oscillators).toBe(0)
    expect(localStorage.getItem('tku-arcade.sound')).toBe('off')

    setSoundOn(true)
    playCue('land')
    expect(oscillators).toBe(1)
  })

  it('wakes a context the browser has suspended, and is silent until it wakes', () => {
    state = 'suspended'
    unlockSound()
    expect(resumed).toBe(1)
    playCue('land')
    expect(oscillators).toBe(0)
  })

  it('does nothing in a browser with no WebAudio', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => {
      unlockSound()
      playCue('land')
    }).not.toThrow()
  })
})
