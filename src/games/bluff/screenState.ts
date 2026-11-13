// What the screen makes of a view: whom to tell what, who reads now, who scored. Kept apart from the
// looks so that it can be tested without a browser. It only reads `view`: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffRole, BluffView } from '../../../shared/games/bluff/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type BluffScreenRole = BluffRole | 'spectator'

export const roleOf = (view: BluffView): BluffScreenRole => view.role ?? 'spectator'

/** The seat reading now, while the readings go on */
export const readerNow = (view: BluffView): SeatId | null =>
  view.phase === 'reading' ? (view.order[view.reader] ?? null) : null

/** Where a reader stands in the reading order */
export function readingStatus(view: BluffView, index: number): 'done' | 'now' | 'later' {
  if (view.phase === 'prepare') return 'later'
  if (view.phase !== 'reading') return 'done'
  if (index < view.reader) return 'done'
  return index === view.reader ? 'now' : 'later'
}

/** The dock's main line: what you should be doing now, and the name it needs */
export function promptOf(view: BluffView, nameOf: (seat: SeatId) => string): { key: TextKey; name?: string } {
  const role = roleOf(view)
  switch (view.phase) {
    case 'prepare':
      return role === 'judge'
        ? { key: 'games.bluff.ui.prompt.prepareJudge' }
        : { key: 'games.bluff.ui.prompt.prepare', name: nameOf(view.judge) }
    case 'reading': {
      const reader = readerNow(view)
      if (reader !== null && reader === view.you) return { key: 'games.bluff.ui.prompt.readYou' }
      return { key: 'games.bluff.ui.prompt.read', name: reader === null ? '' : nameOf(reader) }
    }
    case 'voting': {
      const decided = view.you !== null && view.decided.includes(view.you)
      if (role === 'judge' && !decided) return { key: 'games.bluff.ui.prompt.voteJudge' }
      if ((role === 'honest' || role === 'bluffer' || role === 'mole') && !decided) {
        return { key: 'games.bluff.ui.prompt.voteSticker' }
      }
      return { key: 'games.bluff.ui.prompt.voteWait' }
    }
    case 'reveal':
      return { key: 'games.bluff.ui.prompt.reveal' }
    default:
      return { key: 'games.bluff.ui.prompt.over' }
  }
}

/** Everyone who has something to decide at the vote: the judge and every reader */
export const deciders = (view: BluffView): SeatId[] => [view.judge, ...view.order]

/** A seat's role, once the round is revealed */
export function revealedRole(view: BluffView, seat: SeatId): BluffRole {
  if (seat === view.judge) return 'judge'
  if (seat === view.honest) return 'honest'
  if (seat === view.mole) return 'mole'
  return 'bluffer'
}

/** What each seat gained or lost this round, for the scoreboard; empty before the reveal */
export function gains(view: BluffView): Map<SeatId, number> {
  const out = new Map<SeatId, number>()
  if (!view.reveal) return out
  view.players.forEach((player, index) => {
    const points = view.reveal?.points[index] ?? 0
    if (points !== 0) out.set(player.seat, points)
  })
  return out
}

/** "+2", "−1": a true minus sign, so that it reads as one */
export const signed = (points: number): string => (points > 0 ? `+${points}` : `−${Math.abs(points)}`)

/** The scoreboard's order: most points first, then seat order */
export const byScore = (view: BluffView) => [...view.players].sort((a, b) => b.score - a.score || a.seat - b.seat)

/**
 * What a button press waits on: the room's answer changes one of these. Not `legal` alone, which
 * stays the same from one reader to the next for the judge ("end this reading") and would keep the
 * button waiting (the trap of #25)
 */
export const answerKey = (view: BluffView, legal: unknown): string =>
  JSON.stringify([view.phase, view.round, view.reader, view.decided.length, legal])
