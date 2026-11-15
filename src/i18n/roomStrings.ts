// The room's own words (room.en.ts, room.zh-TW.ts), in the page's language only: out of the lobby's
// first load, and fetched alongside the room's code (src/App.tsx) so that a room never shows without them
import { registerLanguageParts } from './t.ts'

export const loadRoomStrings = (): Promise<void> =>
  registerLanguageParts('room', {
    en: () => import('./room.en.ts').then((module) => module.roomEn),
    'zh-TW': () => import('./room.zh-TW.ts').then((module) => module.roomZhTW),
  })
