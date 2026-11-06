import { useMemo, useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage, translate, type Language, type Translate } from './t.ts'

export const useLanguage = (): Language => useSyncExternalStore(subscribeLanguage, getLanguage)

export function useT(): Translate {
  const language = useLanguage()
  return useMemo(() => (key, params) => translate(language, key, params), [language])
}
