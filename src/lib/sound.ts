// The game's sounds, synthesised here with WebAudio: there are no sound files to host or license.
// A browser only lets a page make sound after the person has touched it, so the AudioContext is made
// on the first gesture; until then, and while muted, every cue is silently skipped.
import { useEffect, useSyncExternalStore } from 'react'
import { readStored, writeStored } from './storage.ts'

export type SoundCue = 'roll' | 'move' | 'land' | 'demote' | 'turn' | 'win'

const STORAGE_KEY = 'tku-arcade.sound'
const listeners = new Set<() => void>()
let context: AudioContext | null = null

export const isSoundOn = (): boolean => readStored(STORAGE_KEY) !== 'off'

export function setSoundOn(on: boolean): void {
  writeStored(STORAGE_KEY, on ? 'on' : 'off')
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSoundOn = (): boolean => useSyncExternalStore(subscribe, isSoundOn)

/** Call from a gesture: makes the context, or wakes one the browser has suspended */
export function unlockSound(): void {
  if (typeof window.AudioContext !== 'function') return
  context ??= new window.AudioContext()
  if (context.state === 'suspended') void context.resume()
}

/** Keeps sound unlocked while mounted. Every gesture counts: iOS suspends it in the background */
export function useSoundUnlock(): void {
  useEffect(() => {
    window.addEventListener('pointerdown', unlockSound)
    window.addEventListener('keydown', unlockSound)
    return () => {
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
    }
  }, [])
}

interface Tone {
  at: number
  frequency: number
  /** Glides to this frequency over the tone */
  to?: number
  length: number
  gain: number
  wave: OscillatorType
}

function play(audio: AudioContext, { at, frequency, to, length, gain, wave }: Tone): void {
  const start = audio.currentTime + at
  const oscillator = audio.createOscillator()
  const envelope = audio.createGain()
  oscillator.type = wave
  oscillator.frequency.setValueAtTime(frequency, start)
  if (to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(to, start + length)
  envelope.gain.setValueAtTime(gain, start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
  oscillator.connect(envelope)
  envelope.connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(start + length)
}

/** The ticks of something spinning down: further and further apart */
function rollTicks(): Tone[] {
  const ticks: Tone[] = []
  let at = 0
  for (let tick = 0; tick < 12; tick++) {
    ticks.push({ at, frequency: 1100 - tick * 40, length: 0.03, gain: 0.08, wave: 'triangle' })
    at += 0.035 + tick * 0.009
  }
  return ticks
}

const note = (at: number, frequency: number, length = 0.18): Tone => ({
  at,
  frequency,
  length,
  gain: 0.1,
  wave: 'sine',
})

const CUES: Record<SoundCue, () => Tone[]> = {
  roll: rollTicks,
  move: () => [{ at: 0, frequency: 280, to: 640, length: 0.3, gain: 0.06, wave: 'sine' }],
  land: () => [{ at: 0, frequency: 190, to: 90, length: 0.13, gain: 0.16, wave: 'triangle' }],
  demote: () => [{ at: 0, frequency: 420, to: 150, length: 0.45, gain: 0.07, wave: 'sawtooth' }],
  turn: () => [note(0, 660), note(0.13, 880, 0.24)],
  win: () => [note(0, 523), note(0.14, 659), note(0.28, 784), note(0.42, 1047, 0.4)],
}

export function playCue(cue: SoundCue): void {
  if (context?.state !== 'running' || !isSoundOn()) return
  for (const tone of CUES[cue]()) play(context, tone)
}

/** Tests only: forgets the context, so that the next test starts from no gesture */
export function resetSoundForTest(): void {
  context = null
}
