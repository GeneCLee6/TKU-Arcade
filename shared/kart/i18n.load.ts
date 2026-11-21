// 2026-11-21 (docs/ARCHITECTURE.md §4.52): the loading screen before a race (src/kart/load/). Merged
// into KART_MESSAGES (i18n.ts), so the same check covers them; the loading screen also registers them
// itself, since watching a race (the room's chunk) shows it without the rest of the kart's strings.
// `en` is the source.
const en = {
  'kart.load.next': 'Up next',
  'kart.load.progress': 'Loading… {percent}%',
  'kart.load.failed': 'The race could not load. Check the connection and try again.',
  'kart.load.retry': 'Try again',
  'kart.load.reload': 'Reload the page',
} as const

export type KartLoadKey = keyof typeof en

const zhTW: Record<KartLoadKey, string> = {
  'kart.load.next': '下一場',
  'kart.load.progress': '載入中… {percent}%',
  'kart.load.failed': '比賽載入失敗。請檢查網路再試一次。',
  'kart.load.retry': '重試',
  'kart.load.reload': '重新整理頁面',
}

export const KART_LOAD_MESSAGES = { en, 'zh-TW': zhTW }
