// What each emote shows, by its number (shared/social.ts): the room only passes numbers on. The
// system's own emoji, so nothing to host or license (docs/IP-CHECKLIST.md); the first six are e7-t11's
import { EMOTE_COUNT } from '../../../shared/social.ts'

export const EMOTE_GLYPHS: readonly string[] = [
  '👏',
  '😂',
  '😮',
  '😱',
  '👍',
  '🔥',
  '🎉',
  '😭',
  '🤔',
  '💪',
  '🙏',
  '🏁',
]
if (EMOTE_GLYPHS.length !== EMOTE_COUNT) throw new Error('one glyph for each emote')
