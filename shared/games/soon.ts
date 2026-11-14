// The lobby's "Coming soon" cards (E3, e7-t16): the tag, and the name and summary of the games that
// are not built yet. Registered by the cards' lazy chunk (src/components/ComingSoon.tsx), so they
// stay out of everyone's first load; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'games.soon': 'Coming soon',
  // Working title (PRD e8)
  'games.kart.name': 'Kart',
  'games.kart.summary':
    'Drift through the corners to fill your boost gauge, then race your friends.',
  // The time trial is open for trying the feel (owner, 2026-11-14); racing friends comes later
  'games.kart.tryNow': 'Try it alone',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.soon': '即將推出',
  'games.kart.name': '卡丁車',
  'games.kart.summary': '過彎甩尾集滿加速條，再和朋友一起比賽。',
  'games.kart.tryNow': '單人試跑',
}

export const soonMessages = { en, 'zh-TW': zhTW }
