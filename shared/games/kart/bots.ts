// Computer karts' levels and names (docs/ARCHITECTURE.md §4.20, §4.21): shared by the race against
// the computer on /kart and by the race room, where the host adds computer karts to free seats and
// the room picks each one's name from this list. The names are our own
// (`kart.bots.name.<id>` and `games.kart.bot.name.<id>`), settled with every name in the kart's
// world in KART-WORLD.md (2026-11-22). Pure: no strings to show, only ids.

// 2026-11-20: 'expert', the fourth (src/kart/bots/expert.ts)
export const BOT_LEVELS = ['easy', 'normal', 'hard', 'expert'] as const
export type BotLevel = (typeof BOT_LEVELS)[number]

export const BOT_NAMES = [
  'pepper',
  'mochi',
  'typhoon',
  'boba',
  'scooter',
  'sunset',
  'ferry',
  'kite',
] as const
export type BotName = (typeof BOT_NAMES)[number]

export const isBotName = (value: unknown): value is BotName =>
  BOT_NAMES.some((one) => one === value)
