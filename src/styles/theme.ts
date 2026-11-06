import { useSyncExternalStore } from 'react'
import { readStored, removeStored, writeStored } from '../lib/storage.ts'

// Light and dark follow the system unless the user pins one (DESIGN §1)
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'tku-arcade.theme'
const listeners = new Set<() => void>()
let current: ThemePreference = 'system'

function apply(preference: ThemePreference): void {
  current = preference
  if (preference === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = preference
}

// Applies the stored preference; called once before the first render
export function initTheme(): void {
  const stored = readStored(STORAGE_KEY)
  apply(stored === 'light' || stored === 'dark' ? stored : 'system')
}

export function setThemePreference(preference: ThemePreference): void {
  if (preference === 'system') removeStored(STORAGE_KEY)
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
