// Everything an English page says before a room opens: the site's strings and the lobby's names. Its
// own chunk, loaded before the first render (src/i18n/t.ts); a Chinese page never fetches it.
import { lobbyEn } from '../../shared/games/lobby.en.ts'
import { en } from './en.ts'

export const messages: Record<string, string> = { ...en, ...lobbyEn }
