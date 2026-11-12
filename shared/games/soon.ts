// The lobby's "Coming soon" cards (E3, e7-t16): the tag, and the name and summary of the games that
// are not built yet. Registered by the cards' lazy chunk (src/components/ComingSoon.tsx), so they
// stay out of everyone's first load; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'games.soon': 'Coming soon',
  // Working titles (PRD e6, e8)
  'games.bluff-reader.name': 'Bluff Reader',
  'games.bluff-reader.summary':
    'Everyone hears the same word. One player reads its real meaning, the rest make one up; the judge finds the honest reader.',
  'games.kart.name': 'Kart',
  'games.kart.summary':
    'Drift through the corners to fill your boost gauge, then race your friends.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.soon': '即將推出',
  'games.bluff-reader.name': '真假朗讀',
  'games.bluff-reader.summary':
    '大家聽到同一個名詞，一人照念真正的解釋，其他人瞎掰，裁判要找出老實人。',
  'games.kart.name': '卡丁車',
  'games.kart.summary': '過彎甩尾集滿加速條，再和朋友一起比賽。',
}

export const soonMessages = { en, 'zh-TW': zhTW }
