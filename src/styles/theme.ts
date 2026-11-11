import { useSyncExternalStore } from 'react'
import { readStored, removeStored, writeStored } from '../lib/storage.ts'

// The esports night look is the default (E1); light, or following the system, is a choice the user
// makes and the next visit remembers (DESIGN §1)
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'tku-arcade.theme'
const DEFAULT: ThemePreference = 'dark'
const listeners = new Set<() => void>()
let current: ThemePreference = DEFAULT

// <html data-theme> pins light or dark; without it the page follows the system
function apply(preference: ThemePreference): void {
  current = preference
  if (preference === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = preference
}

const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark'

// Applies the stored preference; called once before the first render
export function initTheme(): void {
  const stored = readStored(STORAGE_KEY)
  apply(isPreference(stored) ? stored : DEFAULT)
}

export function setThemePreference(preference: ThemePreference): void {
  if (preference === DEFAULT) removeStored(STORAGE_KEY)
  else writeStored(STORAGE_KEY, preference)
  apply(preference)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useThemePreference = (): ThemePreference =>
  useSyncExternalStore(subscribe, () => current)
