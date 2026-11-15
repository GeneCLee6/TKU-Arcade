// The lobby's "Coming soon" cards (E3, e7-t16): the tag, and the name and summary of the games that
// are not built yet. Registered by the cards' lazy chunk (src/components/ComingSoon.tsx), so they
// stay out of everyone's first load; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'games.soon': 'Coming soon',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.soon': '即將推出',
}

export const soonMessages = { en, 'zh-TW': zhTW }
