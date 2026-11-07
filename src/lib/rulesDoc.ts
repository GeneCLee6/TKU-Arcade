// Each game's rules, two markdown files beside its module (docs/DESIGN.md §5). Each is a chunk of its
// own, fetched when someone asks to read it. The page and the room's "how to play" both read them here.
import { useEffect, useState } from 'react'
import type { Language } from '../i18n/t.ts'
import { useLanguage } from '../i18n/useT.ts'

const DOCS = import.meta.glob<string>('../../shared/games/*/rules.*.md', {
  query: '?raw',
  import: 'default',
})

const docPath = (gameId: string, language: Language) =>
  `../../shared/games/${gameId}/rules.${language}.md`

/** English is where a game's rules start, so that one decides whether it has any */
export const hasRules = (gameId: string): boolean => docPath(gameId, 'en') in DOCS

export type RulesDoc =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; text: string }

type Loaded = { key: string; doc: RulesDoc }

/** The rules in the current language: a change of language loads the other file */
export function useRulesDoc(gameId: string): RulesDoc {
  const language = useLanguage()
  const key = `${gameId}:${language}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const load = DOCS[docPath(gameId, language)] ?? DOCS[docPath(gameId, 'en')]
    if (!load) return undefined
    let stale = false
    load().then(
      (text) => {
        if (!stale) setLoaded({ key, doc: { status: 'ready', text } })
      },
      () => {
        if (!stale) setLoaded({ key, doc: { status: 'failed' } })
      },
    )
    return () => {
      stale = true
    }
  }, [gameId, language, key])

  if (!hasRules(gameId)) return { status: 'failed' }
  return loaded?.key === key ? loaded.doc : { status: 'loading' }
}
