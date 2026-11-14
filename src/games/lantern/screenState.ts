// What the screen makes of a view: whom to tell what. Kept apart from the looks so that it can be
// tested without a browser. It only reads `view`: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { LanternNews, LanternView } from '../../../shared/games/lantern/types.ts'
import type { TextKey, Translate } from '../../i18n/t.ts'

type Prompt = { key: TextKey; count?: number }

/** The dock's main line: what you should be doing now */
export function promptOf(view: LanternView): Prompt {
  if (view.phase === 'over') return { key: 'games.lantern.ui.prompt.over' }
  const me = view.players.find((player) => player.seat === view.you)
  if (view.phase === 'focus') {
    const waiting = view.players.filter((player) => !player.ready).length
    if (me === undefined || me.ready) return { key: 'games.lantern.ui.prompt.waiting', count: waiting }
    return { key: 'games.lantern.ui.prompt.focus' }
  }
  if (me === undefined) return { key: 'games.lantern.ui.prompt.watch' }
  return { key: me.count > 0 ? 'games.lantern.ui.prompt.play' : 'games.lantern.ui.prompt.empty' }
}

/** Lanterns still in anyone's hand */
export const unlit = (view: LanternView): number => view.players.reduce((sum, player) => sum + player.count, 0)

/** How many agree to moonlight right now */
export const moonVotes = (view: LanternView): number => view.players.filter((player) => player.moonVote).length

/** A list of lanterns with whose they were: "12 (Ann), 30 (Bob)" */
function cardList(t: Translate, entries: readonly { seat: SeatId; card: number }[], nameOf: (seat: SeatId) => string) {
  return entries
    .map((entry) => t('games.lantern.ui.cardOf', { card: entry.card, name: nameOf(entry.seat) }))
    .join(t('games.lantern.ui.separator'))
}

/** The sentences for what the last action did */
export function newsLines(t: Translate, news: readonly LanternNews[], nameOf: (seat: SeatId) => string): string[] {
  return news.flatMap((item): string[] => {
    switch (item.kind) {
      case 'early':
        return [
          t('games.lantern.news.early', { name: nameOf(item.seat), card: item.card }),
          t('games.lantern.news.burned', { cards: cardList(t, item.burned, nameOf) }),
        ]
      case 'moon':
        return [t('games.lantern.news.moon', { cards: cardList(t, item.shown, nameOf) })]
      case 'cleared': {
        const lines = [t('games.lantern.news.cleared', { level: item.level })]
        if (item.reward !== null) {
          lines.push(
            t(
              item.capped
                ? 'games.lantern.news.reward.capped'
                : item.reward === 'life'
                  ? 'games.lantern.news.reward.life'
                  : 'games.lantern.news.reward.moon',
            ),
          )
        }
        return [lines.join(' ')]
      }
    }
  })
}

/**
 * What a button press waits on: the room's answer changes one of these. Only your own side: another
 * player's lantern landing first must not bring the button back before yours is answered
 */
export const answerKey = (view: LanternView): string => {
  const me = view.players.find((player) => player.seat === view.you)
  return JSON.stringify([view.phase, view.level, view.hand, me?.ready ?? null, me?.moonVote ?? null, view.moons])
}
