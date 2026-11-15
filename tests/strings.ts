// The site's and the room's strings as one table per language, as a room page has them by the time
// it shows (src/i18n/t.ts loads them as separate chunks)
import { en as siteEn } from '../src/i18n/en.ts'
import { roomEn } from '../src/i18n/room.en.ts'
import { roomZhTW } from '../src/i18n/room.zh-TW.ts'
import { zhTW as siteZhTW } from '../src/i18n/zh-TW.ts'

export const en = { ...siteEn, ...roomEn }
export const zhTW: Record<keyof typeof en, string> = { ...siteZhTW, ...roomZhTW }
