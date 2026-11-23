import { readStored, writeStored } from '../lib/storage.ts'
import type { MessageKey } from './en.ts'
import type { RoomMessageKey } from './room.en.ts'

export type Language = 'en' | 'zh-TW'
export type MessageParams = Record<string, string | number>
/** A site or room string, or a game's (shared/games/<id>/i18n.ts): `${game.meta.i18nKey}.name` */
export type TextKey =
  | MessageKey
  | RoomMessageKey
  | `games.${string}`
  | `kart.${string}`
  | `room.extra.${string}`
  // 2026-11-23: the achievements' (shared/achievements/i18n.ts), registered by their lazy chunks
  | `ach.${string}`
export type Translate = (key: TextKey, params?: MessageParams) => string

// One language in the first load, not two (docs/ARCHITECTURE.md §5): each language's site strings and
// lobby names are a chunk of their own, and the page renders once the one it shows has arrived
// (src/main.tsx; index.html starts fetching it alongside the entry). Partial: a catalog fills in as
// chunks load, and can still come up short at runtime
const catalogs: Record<Language, Partial<Record<string, string>>> = { en: {}, 'zh-TW': {} }

const LOADERS: Record<Language, () => Promise<{ messages: Record<string, string> }>> = {
  en: () => import('./messages.en.ts'),
  'zh-TW': () => import('./messages.zh-TW.ts'),
}

const loading = new Map<Language, Promise<void>>()
const loaded = new Set<Language>()

/** Fetches a language's site strings once; switching back and forth after that is instant */
export function loadLanguage(language: Language): Promise<void> {
  let promise = loading.get(language)
  if (promise === undefined) {
    promise = LOADERS[language]().then(({ messages }) => {
      Object.assign(catalogs[language], messages)
      loaded.add(language)
    })
    // A failed fetch (offline, a newer deployment) is tried again next time
    promise.catch(() => loading.delete(language))
    loading.set(language, promise)
  }
  return promise
}

type PartLoaders = Record<Language, () => Promise<Record<string, string>>>

// A lazy chunk's strings in one language at a time (the full board's, the biggest table there is):
// the page's language before its screen shows, the other one on a switch
const parts = new Map<string, PartLoaders>()
const partLoads = new Map<string, Promise<void>>()
const partsLoaded = new Set<string>()

function loadPart(name: string, language: Language): Promise<void> {
  const key = `${name}:${language}`
  let promise = partLoads.get(key)
  const loaders = parts.get(name)
  if (promise === undefined && loaders !== undefined) {
    promise = loaders[language]().then((messages) => {
      Object.assign(catalogs[language], messages)
      partsLoaded.add(key)
    })
    promise.catch(() => partLoads.delete(key))
    partLoads.set(key, promise)
  }
  return promise ?? Promise.resolve()
}

/**
 * Registers a lazy chunk's strings by language and loads the page's; a later switch loads the other
 * before the page changes. Rejects when they cannot load, as a chunk that cannot load would
 */
export function registerLanguageParts(name: string, loaders: PartLoaders): Promise<void> {
  if (!parts.has(name)) parts.set(name, loaders)
  // A switch under way gets them too
  if (wanted !== current) void loadPart(name, wanted).catch(() => {})
  return loadPart(name, current)
}

const isReady = (language: Language): boolean =>
  loaded.has(language) && [...parts.keys()].every((name) => partsLoaded.has(`${name}:${language}`))

const loadEverything = (language: Language): Promise<unknown> =>
  Promise.all([loadLanguage(language), ...[...parts.keys()].map((name) => loadPart(name, language))])

/** A language's strings, every registered part's included, without switching to it (the tests) */
export const preloadLanguage = (language: Language): Promise<void> =>
  loadEverything(language).then(() => undefined)

/** Adds a lazy chunk's own catalog, so that its strings stay out of the first load */
export function registerMessages(messages: Record<Language, Record<string, string>>): void {
  Object.assign(catalogs.en, messages.en)
  Object.assign(catalogs['zh-TW'], messages['zh-TW'])
}

/** Whether a string with this key has arrived: for keys from the network (useRoom's error codes) */
export const hasMessage = (key: string): boolean =>
  catalogs[current][key] !== undefined || catalogs.en[key] !== undefined

const STORAGE_KEY = 'tku-arcade.language'
const listeners = new Set<() => void>()
let current: Language = 'en'
// The language last asked for: a switch that finishes loading after a newer one must not win
let wanted: Language = 'en'

// The browser's top preference decides: zh, zh-TW, zh-Hant, zh-CN and so on get Traditional Chinese.
// index.html decides the same way to start fetching the chunk early: change both together
function detectLanguage(): Language {
  const preferred = navigator.languages?.[0] ?? navigator.language ?? ''
  return /^zh(-|$)/i.test(preferred) ? 'zh-TW' : 'en'
}

function apply(language: Language): void {
  current = language
  wanted = language
  document.documentElement.lang = language
}

// A stored choice always wins. Detection is not stored, so it runs again until the user chooses.
export function initLanguage(): void {
  const stored = readStored(STORAGE_KEY)
  apply(stored === 'en' || stored === 'zh-TW' ? stored : detectLanguage())
}

/**
 * Before the first render: the strings of the language the page starts in. Never rejects: when the
 * chunk cannot load the page tries English, and renders either way
 */
export async function loadStartLanguage(): Promise<void> {
  try {
    await loadLanguage(current)
  } catch {
    if (current === 'en') return
    try {
      await loadLanguage('en')
      apply('en')
    } catch {
      // Keys rather than nothing; the error boundary's reload is a click away
    }
  }
}

export const getLanguage = (): Language => current

function switchTo(language: Language): void {
  apply(language)
  for (const listener of listeners) listener()
}

// The choice is kept at once; the page changes when the language's chunk is there, at once after the
// first time
export function setLanguage(language: Language): void {
  writeStored(STORAGE_KEY, language)
  wanted = language
  if (isReady(language)) {
    switchTo(language)
    return
  }
  loadEverything(language).then(
    () => {
      if (wanted === language) switchTo(language)
    },
    () => {
      // Offline: the page stays as it is, and the next click tries again
    },
  )
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function format(template: string, language: Language, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    if (value === undefined) return placeholder
    return typeof value === 'number' ? new Intl.NumberFormat(language).format(value) : value
  })
}

export function translate(language: Language, key: TextKey, params?: MessageParams): string {
  const message = catalogs[language][key]
  if (message === undefined && import.meta.env.DEV) {
    console.warn(`Missing ${language} translation: ${key}`)
  }
  return format(message ?? catalogs.en[key] ?? key, language, params)
}

// For code outside React; components use useT() so they re-render when the language changes
export const t: Translate = (key, params) => translate(current, key, params)

initLanguage()
