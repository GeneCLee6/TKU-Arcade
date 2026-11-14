// What the screen makes of a view: the prompt and the round's story. Kept apart from the looks so
// that it can be tested without a browser. It only reads `view` and the legal moves.
import type { SeatId } from '../../../shared/games/types.ts'
import type { WasabiAction, WasabiView } from '../../../shared/games/wasabi/types.ts'
import type { MessageParams, TextKey } from '../../i18n/t.ts'

export type Line = { key: TextKey; params?: MessageParams }

const has = (legal: readonly WasabiAction[], type: WasabiAction['type']) => legal.some((action) => action.type === type)

/** The dock's main line */
export function promptOf(view: WasabiView, legal: readonly WasabiAction[], nameOf: (seat: SeatId) => string): Line {
  const name = nameOf(view.current)
  const done = view.bites.length
  switch (view.phase) {
    case 'opening': {
      const me = view.players.find((player) => player.seat === view.you)
      return me && !me.out && me.placed
        ? { key: 'games.wasabi.ui.prompt.openingDone' }
        : { key: 'games.wasabi.ui.prompt.opening' }
    }
    case 'adding':
      if (legal.length === 0) return { key: 'games.wasabi.ui.prompt.wait', params: { name } }
      return has(legal, 'place')
        ? { key: 'games.wasabi.ui.prompt.adding' }
        : { key: 'games.wasabi.ui.prompt.addingOnlyBid' }
    case 'bidding':
      return legal.length > 0
        ? { key: 'games.wasabi.ui.prompt.bidding' }
        : { key: 'games.wasabi.ui.prompt.wait', params: { name } }
    case 'eating': {
      if (legal.length === 0) {
        return { key: 'games.wasabi.ui.prompt.waitEating', params: { name, done, bid: view.bid } }
      }
      const own = legal.length === 1 && legal[0].type === 'eat' && legal[0].seat === view.you
      return {
        key: own ? 'games.wasabi.ui.prompt.eating' : 'games.wasabi.ui.prompt.eatingOthers',
        params: { left: view.bid - done },
      }
    }
    case 'losing': {
      const bidder = nameOf(view.bidder as SeatId)
      if (has(legal, 'take')) return { key: 'games.wasabi.ui.prompt.take', params: { name: bidder } }
      if (has(legal, 'discard')) return { key: 'games.wasabi.ui.prompt.discard' }
      return { key: 'games.wasabi.ui.prompt.waitTake', params: { name: bidder } }
    }
    case 'roundEnd':
      return { key: 'games.wasabi.ui.prompt.roundEnd' }
    default:
      return { key: 'games.wasabi.ui.prompt.over' }
  }
}

/** What happened in the round just finished, and what you lost if it was you */
export function roundLines(view: WasabiView, nameOf: (seat: SeatId) => string): Line[] {
  const last = view.lastRound
  if (last === null) return []
  const name = nameOf(last.bidder)
  if (last.success) return [{ key: 'games.wasabi.ui.round.success', params: { name, bid: last.bid } }]
  const lines: Line[] = [
    last.wasabiOf === last.bidder || last.wasabiOf === null
      ? { key: 'games.wasabi.ui.round.ownWasabi', params: { name } }
      : { key: 'games.wasabi.ui.round.wasabi', params: { name, owner: nameOf(last.wasabiOf) } },
  ]
  if (last.lost !== null) lines.push({ key: `games.wasabi.ui.round.lostYou.${last.lost}` })
  if (last.eliminated) lines.push({ key: 'games.wasabi.ui.round.eliminated', params: { name } })
  return lines
}
