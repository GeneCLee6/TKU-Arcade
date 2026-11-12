// Each game's rules, two markdown files beside its module (docs/DESIGN.md §5). Each is a chunk of its
// own, fetched when someone asks to read it. The page and the room's "how to play" both read them here.
import { useEffect, useState } from 'react'
import type { Language } from '../i18n/t.ts'
import { useLanguage } from '../i18n/useT.ts'

// A game with a second edition (promotion's full one, C7) has a second pair, `rulesFull.*.md`
const DOCS = {
  ...import.meta.glob<string>('../../shared/games/*/rules.*.md', { query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../shared/games/*/rulesFull.*.md', {
    query: '?raw',
    import: 'default',
  }),
}

/** Which of a game's rules: its own, or its full edition's */
export type RulesEdition = 'simple' | 'full'

const docPath = (gameId: string, language: Language, edition: RulesEdition = 'simple') =>
  `../../shared/games/${gameId}/${edition === 'full' ? 'rulesFull' : 'rules'}.${language}.md`

/** English is where a game's rules start, so that one decides whether it has any */
export const hasRules = (gameId: string, edition: RulesEdition = 'simple'): boolean =>
  docPath(gameId, 'en', edition) in DOCS

export type RulesDoc =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; text: string }

type Loaded = { key: string; doc: RulesDoc }

/** The rules in the current language: a change of language loads the other file */
export function useRulesDoc(gameId: string, edition: RulesEdition = 'simple'): RulesDoc {
  const language = useLanguage()
  const key = `${gameId}:${edition}:${language}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const load = DOCS[docPath(gameId, language, edition)] ?? DOCS[docPath(gameId, 'en', edition)]
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
  }, [gameId, language, edition, key])

  if (!hasRules(gameId, edition)) return { status: 'failed' }
  return loaded?.key === key ? loaded.doc : { status: 'loading' }
}
