import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { readStored, writeStored } from '../lib/storage.ts'
import { en, type MessageKey } from './en.ts'
import { zhTW } from './zh-TW.ts'

export type Language = 'en' | 'zh-TW'
export type MessageParams = Record<string, string | number>
/** A site string, or a game's (shared/games/<id>/i18n.ts): `${game.meta.i18nKey}.name` */
export type TextKey = MessageKey | `games.${string}` | `kart.${string}`
export type Translate = (key: TextKey, params?: MessageParams) => string

// Partial: the types require every site key, but a catalog can still come up short at runtime
const catalogs: Record<Language, Partial<Record<string, string>>> = {
  en: { ...en, ...GAME_MESSAGES.en },
  'zh-TW': { ...zhTW, ...GAME_MESSAGES['zh-TW'] },
}

/** Adds a lazy chunk's own catalog, so that its strings stay out of the first load */
export function registerMessages(messages: Record<Language, Record<string, string>>): void {
  Object.assign(catalogs.en, messages.en)
  Object.assign(catalogs['zh-TW'], messages['zh-TW'])
}

const STORAGE_KEY = 'tku-arcade.language'
const listeners = new Set<() => void>()
let current: Language = 'en'

// The browser's top preference decides: zh, zh-TW, zh-Hant, zh-CN and so on get Traditional Chinese
function detectLanguage(): Language {
  const preferred = navigator.languages?.[0] ?? navigator.language ?? ''
  return /^zh(-|$)/i.test(preferred) ? 'zh-TW' : 'en'
}

function apply(language: Language): void {
  current = language
  document.documentElement.lang = language
}

// A stored choice always wins. Detection is not stored, so it runs again until the user chooses.
export function initLanguage(): void {
  const stored = readStored(STORAGE_KEY)
  apply(stored === 'en' || stored === 'zh-TW' ? stored : detectLanguage())
}

export const getLanguage = (): Language => current

export function setLanguage(language: Language): void {
  writeStored(STORAGE_KEY, language)
  apply(language)
  for (const listener of listeners) listener()
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
