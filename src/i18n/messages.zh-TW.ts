// Everything a Chinese page says before a room opens: the site's strings and the lobby's names. Its
// own chunk, loaded before the first render or on a switch (src/i18n/t.ts).
import { lobbyZhTW } from '../../shared/games/lobby.zh-TW.ts'
import { zhTW } from './zh-TW.ts'

export const messages: Record<string, string> = { ...zhTW, ...lobbyZhTW }
