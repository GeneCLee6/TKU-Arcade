// 2026-11-23 (docs/ARCHITECTURE.md §4.98): what this person chose for their player card, kept in this
// browser: whether rooms see it, which achievement it shows as a title, and whether emotes float
// during a race. "My profile" sets the first two, the room's emote panel the third. Small, with no
// import but storage, so the profile page and the room's social layer can both carry it.
import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../lib/storage.ts'

const SHARE_KEY = 'tku-arcade.social.share'
const TITLE_KEY = 'tku-arcade.social.title'
const RACE_KEY = 'tku-arcade.social.raceEmotes'

/** `auto`: the best badge unlocked; `none`: no title; else a rule id */
export type TitleChoice = 'auto' | 'none' | (string & {})

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHARE_KEY || event.key === TITLE_KEY || event.key === RACE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Rooms see the card unless this person turned it off */
export const isCardShared = (): boolean => readStored(SHARE_KEY) !== 'off'
export function setCardShared(on: boolean): void {
  writeStored(SHARE_KEY, on ? 'on' : 'off')
  notify()
}
export const useCardShared = (): boolean => useSyncExternalStore(subscribe, isCardShared, () => true)

export const titleChoice = (): TitleChoice => readStored(TITLE_KEY) ?? 'auto'
export function setTitleChoice(choice: TitleChoice): void {
  writeStored(TITLE_KEY, choice)
  notify()
}
export const useTitleChoice = (): TitleChoice => useSyncExternalStore(subscribe, titleChoice, () => 'auto')

/** Emotes float over the race unless turned off */
export const raceEmotesShown = (): boolean => readStored(RACE_KEY) !== 'off'
export function setRaceEmotesShown(on: boolean): void {
  writeStored(RACE_KEY, on ? 'on' : 'off')
  notify()
}
export const useRaceEmotesShown = (): boolean => useSyncExternalStore(subscribe, raceEmotesShown, () => true)
