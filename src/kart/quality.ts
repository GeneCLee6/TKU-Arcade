// e8-t06 (AC-8.1): the graphics quality option. Low is for an old phone or a laptop on battery; high
// draws everything. Kept in this browser; a change restarts the scene (antialiasing is chosen when
// the WebGL context is made).
import { readStored, writeStored } from '../lib/storage.ts'

export type Quality = 'low' | 'medium' | 'high'
export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high']

export interface QualitySettings {
  /** The most device pixels per CSS pixel to draw */
  readonly pixelRatio: number
  readonly antialias: boolean
  /** Shadow map size; 0 for no shadows */
  readonly shadowMap: number
  /** 0 to 1: how much scenery */
  readonly density: number
  readonly anisotropy: number
  /** Where the fog closes in, metres */
  readonly fogFar: number
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { pixelRatio: 1, antialias: false, shadowMap: 0, density: 0.35, anisotropy: 1, fogFar: 520 },
  medium: {
    pixelRatio: 1.5,
    antialias: true,
    shadowMap: 1024,
    density: 0.7,
    anisotropy: 4,
    fogFar: 760,
  },
  high: {
    pixelRatio: 2,
    antialias: true,
    shadowMap: 2048,
    density: 1,
    anisotropy: 8,
    fogFar: 1000,
  },
}

const KEY = 'tku-arcade.kart.quality'

/** A phone gets medium to start with, anything else high, until someone picks */
export function loadQuality(): Quality {
  const stored = readStored(KEY)
  if (stored === 'low' || stored === 'medium' || stored === 'high') return stored
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return coarse ? 'medium' : 'high'
}

export const saveQuality = (quality: Quality): void => writeStored(KEY, quality)
