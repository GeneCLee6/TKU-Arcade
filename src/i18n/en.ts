// The source language (docs/DESIGN.md §5): write here first, then translate in zh-TW.ts.
// Keys name the meaning, not the sentence.
export const en = {
  'common.close': 'Close',
  'home.tagline': 'Pick a game and play with friends.',
  'language.label': 'Language',
  // Each language's own name, so it reads the same in both catalogs
  'language.en': 'EN',
  'language.zhTW': '繁中',
  'theme.label': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
