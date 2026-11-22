// A game screen's own words (shared/games/<id>/i18n.screen.en.ts and .zh-TW.ts), in the page's
// language only (src/i18n/t.ts, registerLanguageParts): screens.ts starts them alongside the screen's
// chunk, so the screen shows with them and no later; a switch fetches the other language first.
// A game with no such pair (promotion's simple board, the kart) registers its strings itself.
import { registerLanguageParts, type Language } from '../i18n/t.ts'

type Table = { messages: Record<string, string> }

// One chunk per game and language. The whole module, not `import: 'messages'`: each entry here is in
// the room's chunk, and a `.then()` apiece costs it bytes
const TABLES = import.meta.glob<Table>('./*/i18n.screen.{en,zh-TW}.ts', { base: '../../shared/games' })

const loader = (gameId: string, language: Language) => {
  const load = TABLES[`./${gameId}/i18n.screen.${language}.ts`]
  return load && (() => load().then((table) => table.messages))
}

/** Loads a game screen's words in the page's language; resolves at once for a game without them */
export function loadScreenStrings(gameId: string): Promise<void> {
  const en = loader(gameId, 'en')
  const zhTW = loader(gameId, 'zh-TW')
  if (en === undefined || zhTW === undefined) return Promise.resolve()
  return registerLanguageParts(`${gameId}-screen`, { en, 'zh-TW': zhTW })
}
