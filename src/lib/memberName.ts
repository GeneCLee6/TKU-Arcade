// How a member's name shows (2026-11-17): a person's as they typed it; a computer member's
// (shared/protocol.ts 14.) through its game's strings, `games.<id>.bot.name.<name>` and the tag that
// marks it as the computer, `games.<id>.bot.tag`, so it reads in the page's language. Until the
// game's strings have loaded, its name id.
import type { RoomMember } from '../../shared/protocol.ts'
import { hasMessage, t } from '../i18n/t.ts'

export function memberName(member: Pick<RoomMember, 'name' | 'bot'>, gameId: string): string {
  const bot = member.bot
  if (!bot) return member.name
  const nameKey = `games.${gameId}.bot.name.${bot.name}` as const
  const tagKey = `games.${gameId}.bot.tag` as const
  const name = hasMessage(nameKey) ? t(nameKey) : member.name
  return hasMessage(tagKey) ? t(tagKey, { name }) : name
}
