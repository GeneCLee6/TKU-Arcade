// How a member's name shows (2026-11-17): a person's as they typed it; a computer member's
// (shared/protocol.ts 14.) through its game's strings, `games.<id>.bot.name.<name>` and the tag that
// marks it as the computer, `games.<id>.bot.tag`, so it reads in the page's language. Until the
// game's strings have loaded, its name id. The table games' computer players (2026-11-20) have no
// strings of their own game: theirs are the room's, `room.bot.*`, which `botKey` falls back to.
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { hasMessage, t, type TextKey } from '../i18n/t.ts'

/** The game's own key for a computer member's string if it has one, else the room's */
export function botKey(gameId: string, rest: string): TextKey {
  const own = `games.${gameId}.bot.${rest}` as const
  // `room.bot.*` are room strings (room.en.ts); the rest of the key is data, checked by hasMessage
  return hasMessage(own) ? own : (`room.bot.${rest}` as TextKey)
}

export function memberName(member: Pick<RoomMember, 'name' | 'bot'>, gameId: string): string {
  const bot = member.bot
  if (!bot) return member.name
  // The game's own strings, else the room's when the name is one of the room's, else the bare id
  for (const prefix of [`games.${gameId}.bot`, 'room.bot']) {
    const nameKey = `${prefix}.name.${bot.name}` as TextKey
    if (!hasMessage(nameKey)) continue
    const tagKey = `${prefix}.tag` as TextKey
    const name = t(nameKey)
    return hasMessage(tagKey) ? t(tagKey, { name }) : name
  }
  return member.name
}

/**
 * The room as a game's screen gets it: computer members named as people read them, since the
 * screens show `member.name` as it is. People's names are left as they are
 */
export function withBotNames(view: RoomView): RoomView {
  const members = Object.values(view.members)
  if (!members.some((member) => member.bot)) return view
  const named: RoomView['members'] = {}
  for (const member of members) {
    named[member.id] = member.bot ? { ...member, name: memberName(member, view.room.gameId) } : member
  }
  return { ...view, members: named }
}
